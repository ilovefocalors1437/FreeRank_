// src/fraud.js — portfolio authenticity (design §8). Every signal is a feature with a
// versioned weight; the tier decides visibility, and only a human decides a takedown.
//
// Layer 1  256-bit structure hash (dHash on 64x64 luma, src/embed.js), LSH-banded
//          (32 bands x 8 bits: any pair within Hamming 31 is guaranteed to share a
//          band), confirmed by exact Hamming distance. Threshold measured on the real
//          renders (assets-src/measure-fp.mjs): recoloured thefts 17-18, closest honest
//          cross-account pair 21. The margin is narrow; the review queue absorbs it.
// Layer 1b colour signature on confirmed pairs: same structure + different hue
//          histogram = a recolour, i.e. deliberate laundering.
// Layer 3  own upload index across ALL accounts; earliest consistent uploader is the
//          presumed original, verified source files break ties.
// Text     SimHash near-copies of project descriptions across accounts.
// Profile  claim/evidence gap, missing process evidence, positive provenance.
// Out of reach for 8x8 toy images (documented, not faked): crop-robust ORB+RANSAC,
// patch-level embedding match, C2PA parsing, AI-provenance detectors.

import { hamming, cosine } from "./embed.js";

export const THRESH = { dhash: 19, identical: 4, simhash: 10, recolor: 0.9 };
export const TIERS = [
  { name: "pass", max: 0.25, trust: 1.0 },
  { name: "soft_flag", max: 0.6, trust: 0.3 },
  { name: "hard_hold", max: 1.01, trust: 0 },
];

const BANDS = 32;
const bandKeys = (h) => Array.from({ length: BANDS }, (_, i) => `${i}:${(h >> BigInt(i * 8)) & 0xffn}`);

// `cleared`: project ids a reviewer has approved as legitimately the uploader's
// (an appeal won — e.g. the same asset sold on several marketplaces).
export function scanImageDuplicates(images, provenance, cleared = new Set()) {
  const buckets = new Map();
  for (const im of images) {
    for (const k of bandKeys(im.fp.dhash256)) {
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(im);
    }
  }
  const tried = new Set();
  const edges = [];
  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.freelancerId === b.freelancerId) continue; // self-duplicates are padding, handled by evidence dedupe
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (tried.has(key)) continue;
        tried.add(key);
        const dist = hamming(a.fp.dhash256, b.fp.dhash256);
        const stable = hamming(a.fp.stable256, b.fp.stable256);
        if (dist > THRESH.dhash && stable > THRESH.identical) continue;
        const colorSim = cosine(a.color, b.color);
        const [orig, copy] = whoIsOriginal(a, b, provenance);
        if (cleared.has(copy.projectId)) continue;
        edges.push({
          original: orig.id,
          copy: copy.id,
          originalFreelancer: orig.freelancerId,
          copyFreelancer: copy.freelancerId,
          originalProject: orig.projectId,
          copyProject: copy.projectId,
          method: "dhash256_lsh",
          edgeDistance: hamming(a.fp.edge256, b.fp.edge256),
          hamming: dist,
          stableDistance: stable,
          colorSim: +colorSim.toFixed(3),
          kind: colorSim < THRESH.recolor ? "recolored_copy" : stable <= THRESH.identical ? "exact_or_recompressed" : "near_copy",
        });
      }
    }
  }
  return { edges, candidatePairs: tried.size };
}

function whoIsOriginal(a, b, provenance) {
  if (a.ts !== b.ts) return a.ts < b.ts ? [a, b] : [b, a];
  return (provenance.get(b.freelancerId) ?? 0) > (provenance.get(a.freelancerId) ?? 0) ? [b, a] : [a, b];
}

export function scanTextCopies(projects) {
  const edges = [];
  for (let i = 0; i < projects.length; i++) {
    for (let j = i + 1; j < projects.length; j++) {
      const a = projects[i];
      const b = projects[j];
      if (a.freelancerId === b.freelancerId) continue;
      const dist = hamming(a.descHash, b.descHash);
      if (dist > THRESH.simhash) continue;
      const [orig, copy] = a.ts <= b.ts ? [a, b] : [b, a];
      edges.push({ original: orig.id, copy: copy.id, originalFreelancer: orig.freelancerId, copyFreelancer: copy.freelancerId, method: "simhash", hamming: dist });
    }
  }
  return edges;
}

// Risk for one freelancer. `ev` comes from evidence.buildEvidence (for the claim gap).
export function assessFreelancer(f, imageEdges, textEdges, ev) {
  const signals = [];
  const push = (signal, value, detail) => signals.push({ signal, value: +value.toFixed(3), detail });
  const nImg = f.projects.length || 1;

  const copies = imageEdges.filter((e) => e.copyFreelancer === f.id);
  if (copies.length) {
    const frac = new Set(copies.map((e) => e.copyProject)).size / nImg;
    const victims = [...new Set(copies.map((e) => e.originalFreelancer))];
    push("copied_images", 0.6 * frac + (frac >= 0.5 ? 0.1 : 0), `${copies.length}/${nImg} portfolio images match earlier uploads by ${victims.join(", ")}`);
    const recolored = copies.filter((e) => e.kind === "recolored_copy").length;
    if (recolored) push("recolor_laundering", 0.15, `${recolored} copies were recoloured (same structure, hue histogram changed) — deliberate evasion`);
  }
  const textCopies = textEdges.filter((e) => e.copyFreelancer === f.id);
  if (textCopies.length) push("text_copy", Math.min(0.15, 0.05 * textCopies.length), `${textCopies.length} project descriptions are SimHash near-copies of earlier text`);

  if (ev.gapSignal > 0) push("claim_evidence_gap", 0.45 * ev.gapSignal, `claims ${f.claims.length} skills, independent evidence for ${f.claims.length - ev.unsupported.length}`);

  const liveCount = f.projects.filter((p) => p.status !== "held").length;
  const padding = liveCount >= 3 ? 1 - ev.clusterCount / liveCount : 0;
  if (padding >= 0.5) push("portfolio_padding", 0.1 * padding, `${liveCount} projects collapse to ${ev.clusterCount} distinct piece(s)`);

  const isNew = f.workHistory.length === 0 && f.reviews.length === 0;
  const verified = f.credentials.some((c) => c.verified && c.type === "source_files");
  if (isNew && !verified && !f.credentials.some((c) => c.verified)) push("no_process_evidence", 0.05, "new account, no work history, no verified credential or source files");
  if (verified) push("provenance_verified", -0.1, "source files reviewed and match the renders");

  const risk = Math.max(0, Math.min(1, signals.reduce((a, s) => a + s.value, 0)));
  const tier = TIERS.find((t) => risk < t.max);
  const originalOf = imageEdges.filter((e) => e.originalFreelancer === f.id);
  return {
    risk: +risk.toFixed(3),
    tier: tier.name,
    trust: tier.trust,
    signals,
    copiedBy: [...new Set(originalOf.map((e) => e.copyFreelancer))],
  };
}

export function reviewCase(f, trust, imageEdges, textEdges) {
  return {
    id: `case-${f.id}`,
    subject: { type: "freelancer", id: f.id, name: f.name },
    risk: trust.risk,
    tier: trust.tier,
    state: trust.tier === "hard_hold" ? "hidden_pending_review" : "visible_downranked",
    action_required: "human verdict (takedown / clear / request source files)",
    signals: trust.signals,
    evidence: {
      image_pairs: imageEdges.filter((e) => e.copyFreelancer === f.id),
      text_pairs: textEdges.filter((e) => e.copyFreelancer === f.id),
      upload_ts: f.ts,
      claims: f.claims.length,
    },
  };
}
