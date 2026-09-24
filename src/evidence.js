// src/evidence.js — fact extraction + the evidence graph (design §7, the anti-stuffing core).
//
// extractFacts() is the swap point for the index-time VLM extractor: it reads what
// the project actually says it is. A tag the project text never backs up stays a
// claim, and claims are worth ~0.
//
// buildEvidence() turns facts, work history, credentials and review text into
// per-skill evidence scores with corroboration bonuses, near-duplicate dedupe and a
// hard cap. Ranking reads these scores and never reads `claims`.

import { hamming } from "./embed.js";

const has = (re) => (t) => re.test(t);
const both = (a, b) => (t) => a.test(t) && b.test(t);

export const SKILL_RULES = {
  blender: has(/\bblender\b|\.blend\b/),
  zbrush: has(/\bzbrush\b/),
  maya: has(/\bmaya\b/),
  substance_painter: has(/\bsubstance\b/),
  marvelous_designer: has(/\bmarvelous designer\b/),
  figma: has(/\bfigma\b/),
  character_design: has(/\b(character|heroine|mascot|npc|knight|idol|ranger|warrior|companion|soldier|creature|bust|girl|mage)s?\b/),
  stylized_sculpting: both(/\bstylized\b/, /\b(sculpt\w*|model\w*|mesh\w*|blender|props?)\b/),
  realistic_sculpting: both(/\b(realistic|photoreal)\b/, /\b(sculpt\w*|zbrush|high-poly)\b/),
  game_character_art: both(/\b(game|rpg|gacha|engine)\b/, /\b(character|heroine|mascot|npc|knight|idol|ranger|companion)s?\b/),
  prop_art: has(/\b(props?|potion|bottles?)\b/),
  rigging: has(/\brig(ged|ging|s)?\b|\bshape keys\b/),
  hard_surface: has(/\bhard[- ]surface\b/),
  ui_design: has(/\b(ui|dashboard|landing page|web design|design system|components)\b/),
  brand_design: has(/\bbrand\b/),
  copywriting: has(/\b(copy|copywriting|dialogue|quest writing|store description|narrative)\b/),
};

export const TECH_RULES = {
  game_ready: has(/\bgame[- ]ready\b|\bengine[- ]ready\b|\bengine\b|\blow poly\b|\btopology\b/),
  rigged: has(/\brig(ged|ging)?\b|\bshape keys\b/),
  toon_shading: has(/\btoon\b|\bcel[- ]?shad\w*/),
  pbr_texturing: has(/\bpbr\b|\bhand[- ]painted textures?\b|\btextur\w*/),
  source_files: has(/\bsource files?\b|\.blend\b|\bwireframes?\b/),
  design_system: has(/\bdesign system\b|\bcomponents\b/),
};

export function extractFacts(p) {
  const t = `${p.title} ${p.description} ${(p.tools || []).join(" ")}`.toLowerCase();
  const skills = Object.keys(SKILL_RULES).filter((s) => SKILL_RULES[s](t));
  const tech = Object.keys(TECH_RULES).filter((k) => TECH_RULES[k](t));
  return { skills, tech };
}

const BASE = { project: 1.0, work_history: 1.4, credential: 1.5, review_mention: 0.3, claim_only: 0.05 };
export const SKILL_CAP = 6;
const DUP_REPEAT = 0.1; // design: "5 copies of one project ~= one project"

const CATEGORY_SKILL = {
  "3d_character": "character_design",
  "3d_props": "prop_art",
  copywriting: "copywriting",
  ui_design: "ui_design",
};

const REVIEW_TERMS = [
  ["rig", "rigging"],
  ["blender", "blender"],
  ["ui design", "ui_design"],
  ["copy", "copywriting"],
  ["quest", "copywriting"],
];

// Within one freelancer: projects whose images or descriptions are near-identical
// collapse into one cluster (union-find). Thresholds come from the measured corpus:
// true copies sit at dHash <= 2 / SimHash <= 6, unrelated work at >= 7 / >= 17.
export function selfClusters(projects) {
  const parent = projects.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < projects.length; i++) {
    for (let j = i + 1; j < projects.length; j++) {
      const a = projects[i];
      const b = projects[j];
      const img = hamming(a.images[0].dhashNorm, b.images[0].dhashNorm) <= 4;
      const txt = hamming(a.descHash, b.descHash) <= 10;
      if (img || txt) parent[find(i)] = find(j);
    }
  }
  const out = new Map();
  projects.forEach((p, i) => out.set(p.id, `c${find(i)}`));
  return out;
}

export function buildEvidence(f) {
  const skills = new Map();
  const live = f.projects.filter((p) => p.status !== "held");
  const clusters = selfClusters(live);
  const seen = new Map(); // skill -> Set(cluster)

  const add = (skill, type, amount, ref) => {
    if (!skill) return;
    const cur = skills.get(skill) || { score: 0, items: [], sources: new Set(), projects: new Set(), clusters: new Set() };
    cur.score += amount;
    cur.items.push({ type, ref, amount: +amount.toFixed(3) });
    cur.sources.add(type);
    if (ref?.project) cur.projects.add(ref.project);
    if (ref?.cluster) cur.clusters.add(ref.cluster);
    skills.set(skill, cur);
  };

  const corroboration = (s) =>
    1 +
    (f.workHistory.some((w) => w.tools.includes(s) || CATEGORY_SKILL[w.category] === s) ? 0.3 : 0) +
    (f.credentials.some((c) => c.skill === s && c.verified) ? 0.4 : 0);

  for (const p of live) {
    const cluster = clusters.get(p.id);
    const supported = new Set(p.facts.skills);
    for (const s of new Set([...p.facts.skills, ...(p.tools || []), ...(p.tags || [])])) {
      const kind = supported.has(s) ? "project" : "claim_only";
      const sSeen = seen.get(s) || new Set();
      const dedupe = sSeen.has(cluster) ? DUP_REPEAT : 1;
      sSeen.add(cluster);
      seen.set(s, sSeen);
      add(s, kind, BASE[kind] * corroboration(s) * dedupe * p.trustWeight, { project: p.id, cluster });
    }
  }
  for (const w of f.workHistory) {
    const outcome = w.outcome === "completed" ? 1 : 0.3;
    const k = (w.rehired ? 1.3 : 1) * outcome;
    for (const s of w.tools) add(s, "work_history", BASE.work_history * k, { job: w.category });
    add(CATEGORY_SKILL[w.category], "work_history", BASE.work_history * k, { job: w.category });
  }
  for (const c of f.credentials) {
    if (c.verified) add(c.skill, "credential", BASE.credential * 1.2, { credential: c.type, issuer: c.issuer });
  }
  for (const r of f.reviews) {
    const text = r.text.toLowerCase();
    for (const [term, skill] of REVIEW_TERMS) if (text.includes(term)) add(skill, "review_mention", BASE.review_mention, { review: r.text });
  }
  for (const v of skills.values()) v.score = Math.min(v.score, SKILL_CAP);

  // Claim/evidence gap: claims with no real evidence behind them. A few are normal
  // (people list tools they know); a wall of them is the stuffing signature.
  const unsupported = f.claims.filter((s) => (skills.get(s)?.score ?? 0) < 0.5);
  const gapSignal = Math.max(0, Math.min(1, (unsupported.length - 4) / 16));
  return { skills, clusters, clusterCount: new Set(clusters.values()).size, unsupported, gapSignal };
}

// Saturating map from raw evidence (0..SKILL_CAP) to 0..1.
export const saturate = (x) => 1 - Math.exp(-x / 2);
