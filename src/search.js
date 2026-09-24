// src/search.js — the online query path (design §3, §5–§7):
//   request -> SearchSpec -> multi-channel recall (visual / lexical / semantic /
//   skill-evidence, all gated by hard filters) -> RRF fusion -> feature assembly ->
//   query-adaptive weighted score x trust -> MMR diversify -> exploration slot ->
//   deterministic explanations built only from the feature ledger.

import { cosine, gridVector, colorSignature, textVector, tokens, isGrid } from "./embed.js";
import { styleOverlap, STYLE_KEYS } from "./data-lib.js";
import { saturate } from "./evidence.js";
import { understand, validateSpec, degradedSpec, RELATED } from "./spec.js";
import { rankNorm } from "./rank.js";
import { mulberry32 } from "./data-lib.js";

const RRF_K = 60;
const CHANNEL_K = 50;
const MMR_LAMBDA = 0.92; // measured: 0.85 let a realistic sculptor jump an anime specialist on an anime query
const SCORE_FLOOR = 0.15;
const SIMILAR_AT = 0.55;
const RELEVANCE_GATE = 0.25; // needs SOME query-specific evidence; outcome/difficulty alone never qualify
const STOP = new Set(["for", "the", "and", "need", "something", "like", "this", "that", "with", "want", "some", "my", "our", "any", "can", "you"]);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// Opponent-colour cosine for unrelated images sits around 0.5 (measured median 0.48),
// so 0.5 maps to "no evidence of similarity" and 0.95 to "same look".
const calib = (c) => clamp01((c - 0.5) / 0.45);
const r3 = (x) => (x == null ? null : +x.toFixed(3));

const STYLE_NAMES = { stylized_anime: "stylized-anime", realistic: "realistic", minimal: "minimal", painterly: "painterly", cel_shaded: "cel-shaded", cozy: "cozy", neon: "neon" };
const CATEGORY_NOUN = { "3d_character": "character", "3d_props": "props", ui_design: "UI", brand_design: "brand", copywriting: "writing" };
const TOOL_NAMES = { blender: "Blender", zbrush: "ZBrush", figma: "Figma", maya: "Maya" };
const TECH_NAMES = { game_ready: "game-ready", rigged: "rigged", toon_shading: "toon-shaded", pbr_texturing: "textured", source_files: "source files", design_system: "design-system" };

// ---------------------------------------------------------------- recall channels

function bm25(index, terms, projects) {
  const { docs, df, N, avgdl } = index.bm25;
  const q = [...new Set(terms.flatMap((t) => tokens(t)))];
  const out = [];
  for (const p of projects) {
    const d = docs.get(p.id);
    if (!d) continue;
    let s = 0;
    for (const t of q) {
      const tf = d.tf.get(t);
      if (!tf) continue;
      const n = df.get(t) || 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += (idf * tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (d.len / avgdl)));
    }
    if (s > 0) out.push({ p, score: s });
  }
  return out;
}

function toFreelancerRanks(list) {
  const sorted = list.sort((a, b) => b.score - a.score).slice(0, CHANNEL_K);
  const ranks = new Map();
  sorted.forEach(({ p, score }, i) => {
    if (!ranks.has(p.freelancerId)) ranks.set(p.freelancerId, { rank: ranks.size + 1, project: p.id, score: r3(score) });
  });
  return ranks;
}

function skillEvidenceScore(f, specSkills) {
  if (!specSkills.length) return { score: null, detail: [] };
  let num = 0;
  let den = 0;
  const detail = [];
  for (const { skill, weight } of specSkills) {
    const ev = f.evidence.skills.get(skill);
    const e = ev?.score ?? 0;
    num += weight * saturate(e);
    den += weight;
    detail.push({
      skill,
      weight,
      evidence: r3(e),
      sources: ev ? [...ev.sources] : [],
      projects: ev ? [...ev.projects] : [],
      distinctProjects: ev ? ev.clusters.size : 0,
    });
  }
  return { score: num / den, detail };
}

// ---------------------------------------------------------------- weights

function weightsFor(spec, hasImage) {
  const visualJob = spec.work_type?.visual;
  let w;
  if (spec.work_type?.category == null && !(spec.skills || []).length) {
    // Nothing structured to match on (unknown work type, degraded mode): text relevance has to carry it.
    w = { visual: 0, text: 0.55, worktype: 0, skills: 0, tech: 0.1, difficulty: 0.05, outcome: 0.3 };
  } else if (!visualJob) {
    // No pictures to compare, so what the portfolio is *about* does the visual
    // channel's job. Measured: at text 0.1 a quest-dialogue writer lost a
    // quest-dialogue query to a marketing writer with a longer contract record.
    w = { visual: 0, text: 0.35, worktype: 0.15, skills: 0.25, tech: 0.05, difficulty: 0.05, outcome: 0.15 };
  }
  else if (hasImage) w = { visual: 0.4, text: 0.05, worktype: 0.1, skills: 0.25, tech: 0.1, difficulty: 0.05, outcome: 0.05 };
  else w = { visual: 0.15, text: 0.1, worktype: 0.15, skills: 0.3, tech: 0.15, difficulty: 0.05, outcome: 0.1 };
  if ((spec.technical_requirements || []).length >= 2 && w.visual > 0) {
    w.visual -= 0.05;
    w.tech += 0.05;
  }
  return w;
}

// ---------------------------------------------------------------- arenas
//
// casual       everyone whose work genuinely matches (the relevance gate) gets an
//              equal chance: the gated list is shuffled per rotation window, so over
//              time each qualified freelancer is shown in each position equally often.
// competitive  only ranked freelancers (3+ casual clients, clean portfolio, active);
//              relevance x rank, so the higher your rank the higher you land. Thieves
//              cannot reach here: rank needs real client reviews.
// open         the engine's own view (MMR + exploration slot) for the dev console.

const RANK_BOOST = 0.45;
const ROTATION_MS = 60 * 60 * 1000;
const strHash = (s) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 2166136261);

function fairShuffle(list, seed) {
  const rnd = mulberry32(seed);
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------- main entry

export function search(index, req = {}) {
  const t0 = performance.now();
  const arena = ["casual", "competitive"].includes(req.mode) ? req.mode : "open";
  const k = Math.max(1, Math.min(20, req.k ?? 8));
  const image = req.image && isGrid(req.image) ? req.image : null;
  const notes = [];
  if (req.image && !image) notes.push("reference image ignored: expected {w:8,h:8,rgb:[192 numbers 0..255]}");

  let spec;
  let mode = "full";
  let specErrors = [];
  if (req.spec) {
    specErrors = validateSpec(req.spec);
    spec = specErrors.length ? degradedSpec(req) : { ...req.spec, producer: req.spec.producer || "external" };
    if (specErrors.length) mode = "degraded";
  } else {
    spec = understand({ ...req, image }, index);
    specErrors = validateSpec(spec);
    if (specErrors.length) {
      spec = degradedSpec(req);
      mode = "degraded";
    }
  }
  const tSpec = performance.now();

  const specSkills = (spec.skills || []).filter((s) => s.weight > 0);
  const styleAttrs = spec.style?.attributes || {};
  const hasStyle = STYLE_KEYS.some((k2) => (styleAttrs[k2] ?? 0) > 0);
  const visualJob = !!spec.work_type?.visual;
  const useImage = !!image && visualJob;
  if (image && !visualJob) notes.push("non-visual work type: reference image not used for matching");
  const qv = useImage ? gridVector(image) : null;
  const qc = useImage ? colorSignature(image) : null;
  const terms = spec.expanded_terms?.length ? spec.expanded_terms : tokens(req.text || "");
  const qt = textVector(terms.join(" "));
  // Lexical relevance as IDF-weighted query-term coverage. Cosine over hashed bags of
  // words is structurally tiny for a 2-word query against a 30-word description
  // ("shape keys" scored below the gate on the one project that says exactly that).
  const { docs, df, N } = index.bm25;
  const qTerms = [...new Set(terms.flatMap((t) => tokens(t)))].filter((t) => !STOP.has(t));
  const idf = (t) => Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
  const idfSum = qTerms.reduce((a, t) => a + idf(t), 0) || 1;
  const coverage = (p) => {
    const d = docs.get(p.id);
    return d ? qTerms.reduce((a, t) => a + (d.tf.has(t) ? idf(t) : 0), 0) / idfSum : 0;
  };

  // hard filters gate every channel; they are never scored
  const hf = spec.hard_filters || {};
  const excluded = [];
  const eligible = new Set();
  let outsideArena = 0;
  for (const f of index.freelancers) {
    if (f.trust.tier === "hard_hold") continue;
    if (arena === "competitive" && !(f.ladder?.competitive && f.ladder.eligibility.active)) {
      outsideArena++;
      continue;
    }
    if (hf.accepting_work && !f.availability) excluded.push({ id: f.id, reason: "not accepting work" });
    else if (hf.categories && !hf.categories.includes(f.category)) continue;
    else eligible.add(f.id);
  }
  const pool = index.live.filter((p) => eligible.has(p.freelancerId));

  // ---- recall
  const channels = {};
  if (qv) channels.visual = toFreelancerRanks(pool.map((p) => ({ p, score: cosine(qv, p.images[0].vec) })).filter((x) => x.score > 0.5));
  channels.lexical = toFreelancerRanks(bm25(index, terms, pool));
  channels.semantic = toFreelancerRanks(pool.map((p) => ({ p, score: cosine(qt, p.textVec) })).filter((x) => x.score > 0.1));
  if (specSkills.length) {
    const skillList = [];
    for (const f of index.freelancers) {
      if (!eligible.has(f.id)) continue;
      const s = skillEvidenceScore(f, specSkills).score;
      const best = f.projects.find((p) => p.status !== "held");
      if (s > 0.05 && best) skillList.push({ p: best, score: s });
    }
    channels.skills = toFreelancerRanks(skillList);
  }
  const rrf = new Map();
  for (const [name, ranks] of Object.entries(channels)) {
    for (const [fid, r] of ranks) {
      const cur = rrf.get(fid) || { rrf: 0, via: {} };
      cur.rrf += 1 / (RRF_K + r.rank);
      cur.via[name] = r.rank;
      rrf.set(fid, cur);
    }
  }
  const tRecall = performance.now();

  // ---- features + score
  const w = weightsFor(spec, useImage);
  const target = spec.difficulty?.score ?? 0.55;
  const cat = spec.work_type?.category ?? null;
  const candidates = [];
  for (const [fid, fused] of rrf) {
    const f = index.byId.get(fid);
    const live = f.projects.filter((p) => p.status !== "held");
    const perProject = live.map((p) => {
      const content = qv ? calib(cosine(qv, p.images[0].vec)) : null;
      const color = qc ? cosine(qc, p.images[0].color) : null;
      const styleA = hasStyle ? styleOverlap(p.style, styleAttrs) : null;
      let visual = null;
      if (useImage) visual = 0.5 * content + 0.3 * (styleA ?? 0) + 0.2 * color;
      else if (visualJob && hasStyle) visual = styleA;
      // mostly exact-term coverage; the hashed-BoW cosine (unrelated text lands ~0.1 from
      // hash collisions) only adds a fuzzy 30%
      const semantic = clamp01((cosine(qt, p.textVec) - 0.1) / 0.5);
      return { p, content, color, styleA, visual, text: 0.7 * coverage(p) + 0.3 * semantic };
    });
    const byVisual = [...perProject].sort((a, b) => (b.visual ?? b.text) - (a.visual ?? a.text));
    const best = byVisual[0];
    const similar = perProject.filter((x) => (x.visual ?? 0) >= SIMILAR_AT);
    const similarClusters = new Set(similar.map((x) => f.evidence.clusters.get(x.p.id)));

    const sk = skillEvidenceScore(f, specSkills);
    const reqs = spec.technical_requirements || [];
    let tech = null;
    const techHit = [];
    if (reqs.length) {
      let num = 0;
      let den = 0;
      for (const r of reqs) {
        const hit = live.some((p) => p.facts.tech.includes(r.req));
        if (hit) techHit.push(r.req);
        num += r.weight * (hit ? 1 : 0);
        den += r.weight;
      }
      tech = num / den;
    }
    const relevant = similar.length ? similar.map((x) => x.p) : live;
    const capability = Math.max(0, ...relevant.map((p) => p.difficulty ?? 0));
    const difficulty = capability >= target - 0.05 ? 1 : clamp01(1 - (target - capability) * 2.5);
    const worktype = cat == null ? 0.5 : f.category === cat ? 1 : (RELATED[cat] || []).includes(f.category) ? 0.5 : 0;

    const bestText = perProject.reduce((a, x) => (x.text > a.text ? x : a), { text: 0, p: null });
    const features = {
      visual: w.visual > 0 && best?.visual != null ? best.visual : null,
      text: bestText.text,
      worktype,
      skills: sk.score,
      tech,
      difficulty,
      outcome: f.outcome.score,
    };
    let num = 0;
    let den = 0;
    const contributions = {};
    for (const [key, weight] of Object.entries(w)) {
      if (!weight || features[key] == null) continue;
      num += weight * features[key];
      den += weight;
    }
    const base = den ? num / den : 0;
    for (const [key, weight] of Object.entries(w)) {
      if (weight && features[key] != null) contributions[key] = r3((f.trust.trust * weight * features[key]) / den);
    }
    const gapPenalty = 0.12 * f.evidence.gapSignal;
    const score = Math.max(0, f.trust.trust * base - gapPenalty);

    candidates.push({
      f,
      score,
      fused,
      features,
      contributions,
      penalties: { claim_evidence_gap: r3(gapPenalty), trust_multiplier: f.trust.trust },
      best,
      bestText,
      similar,
      similarClusters: similarClusters.size,
      skillDetail: sk.detail,
      techHit,
    });
  }
  const tScore = performance.now();

  // ---- diversify (MMR) over a clean shortlist, then the exploration slot
  const queryEvidence = (c) => Math.max(c.features.skills ?? 0, c.features.visual ?? 0, c.features.text);
  // A different line of work only qualifies on evidence for the requested skills —
  // shared words or a vaguely similar palette are not enough.
  const crossCategory = (c) => c.features.worktype === 0 && (c.features.skills ?? 0) < RELEVANCE_GATE;
  const passes = (c) => c.score >= SCORE_FLOOR && queryEvidence(c) >= RELEVANCE_GATE && !crossCategory(c);
  const shortlist = candidates.filter(passes).sort((a, b) => b.score - a.score);
  const belowFloor = candidates
    .filter((c) => !passes(c))
    .map((c) => ({
      id: c.f.id,
      score: r3(c.score),
      why: c.score < SCORE_FLOOR ? "score below floor" : crossCategory(c) ? "different work type, no evidence for the requested skills" : "no query-specific evidence (only generic signals like contract record)",
    }));
  let page = [];
  const rest = arena === "open" ? shortlist.slice(0, 30) : [];
  const sim = (a, b) => styleOverlap(a.best?.p.style, b.best?.p.style) * (a.f.category === b.f.category ? 1 : 0.5);
  while (rest.length && page.length < k) {
    let bi = 0;
    let bv = -Infinity;
    rest.forEach((c, i) => {
      const maxSim = page.length ? Math.max(...page.map((x) => sim(c, x))) : 0;
      const v = MMR_LAMBDA * c.score - (1 - MMR_LAMBDA) * maxSim;
      if (v > bv) {
        bv = v;
        bi = i;
      }
    });
    page.push({ ...rest.splice(bi, 1)[0], slot: "ranked" });
  }
  const qualifiedNewcomer = (c) =>
    c.f.isNewcomer && c.f.trust.tier === "pass" && (c.features.skills ?? 0) >= 0.25 && c.features.worktype >= 0.5 && (c.features.visual == null || c.features.visual >= 0.5);
  // ~1 slot in 10 (at least one on pages of 3+) for a qualified newcomer the ranking
  // didn't surface on its own — the counterweight to rich-get-richer similarity ranking.
  if (k >= 3 && !page.some((c) => c.f.isNewcomer)) {
    const onPage = new Set(page.map((c) => c.f.id));
    const nc = shortlist.find((c) => !onPage.has(c.f.id) && qualifiedNewcomer(c));
    if (nc) {
      if (page.length >= k) page.pop();
      page.splice(Math.min(page.length, Math.max(2, Math.floor(k / 3))), 0, { ...nc, slot: "exploration" });
    }
  }

  let rotation = null;
  if (arena === "competitive") {
    for (const c of shortlist) c.arenaScore = c.score * (1 - RANK_BOOST + RANK_BOOST * rankNorm(c.f.ladder.rating));
    page = [...shortlist].sort((a, b) => b.arenaScore - a.arenaScore).slice(0, k).map((c) => ({ ...c, slot: "ranked" }));
  } else if (arena === "casual") {
    rotation = req.rotation ?? Math.floor(Date.now() / ROTATION_MS);
    page = fairShuffle(shortlist, strHash(`${rotation}|${qTerms.join(" ")}|${spec.work_type?.category}`)).slice(0, k).map((c) => ({ ...c, slot: "rotation" }));
  }

  const results = page.map((c, i) => formatResult(c, i + 1, spec, useImage, terms, arena));

  // Held accounts that recall would otherwise have surfaced — visible here for the demo;
  // in production this list is admin-only.
  const blocked = [];
  for (const f of index.freelancers) {
    if (f.trust.tier !== "hard_hold") continue;
    const would = f.projects.some((p) => (qv && calib(cosine(qv, p.images[0].vec)) >= 0.5) || tokens(p.text).some((t) => terms.includes(t) && t.length > 3));
    if (would) blocked.push({ id: f.id, name: f.name, risk: f.trust.risk, reasons: f.trust.signals.filter((s) => s.value > 0).map((s) => s.detail) });
  }

  const out = {
    arena,
    rotation,
    matched: shortlist.length,
    outside_arena: outsideArena,
    mode,
    spec,
    spec_errors: specErrors,
    notes,
    weights: w,
    channels: Object.fromEntries(Object.entries(channels).map(([n, m]) => [n, [...m].map(([fid, r]) => ({ freelancer: fid, ...r }))])),
    results,
    blocked,
    excluded,
    below_floor: belowFloor,
    timing_ms: { understand: r3(tSpec - t0), recall: r3(tRecall - tSpec), score: r3(tScore - tRecall), total: r3(performance.now() - t0) },
  };
  index.queryLog.unshift({ ts: new Date().toISOString(), text: req.text || "", tags: req.tags || [], image: !!image, producer: spec.producer, mode, top: results.map((r) => r.freelancer.id) });
  index.queryLog.length = Math.min(index.queryLog.length, 200);
  return out;
}

// ---------------------------------------------------------------- explanations

function formatResult(c, rank, spec, useImage, terms, arena) {
  const { f, features } = c;
  const reasons = [];
  const caveats = [];
  const reason = (text, feature, value) => reasons.push({ text, feature, value: r3(value) });

  if (features.visual != null && c.best) {
    const tools = c.similar.flatMap((x) => x.p.tools || []);
    const tool = tools.length ? tools.sort((a, b) => tools.filter((t) => t === b).length - tools.filter((t) => t === a).length)[0] : null;
    const noun = CATEGORY_NOUN[f.category] || "portfolio";
    const toolWord = tool ? (TOOL_NAMES[tool] || tool) + " " : "";
    if (c.similarClusters > 0) {
      const dup = c.similar.length > c.similarClusters ? ` (${c.similar.length} uploads of ${c.similarClusters === 1 ? "the same piece" : "fewer pieces"})` : "";
      reason(`${c.similarClusters} similar ${toolWord}${noun} project${c.similarClusters > 1 ? "s" : ""}${dup}`, "visual", features.visual);
    }
    const shared = Object.entries(c.best.p.style || {})
      .filter(([k2, v]) => v >= 0.5 && (spec.style?.attributes?.[k2] ?? 0) >= 0.4)
      .sort((a, b) => b[1] - a[1]);
    if (shared.length && features.visual >= 0.5) {
      const strength = features.visual >= 0.75 ? "strong" : "moderate";
      const what = useImage ? "your reference" : "the requested style";
      reason(`${strength} ${STYLE_NAMES[shared[0][0]]} similarity to ${what} (${features.visual.toFixed(2)}, best: "${c.best.p.title}")`, "visual", features.visual);
    }
  }
  if (c.bestText.p && features.text >= 0.3) {
    const words = new Set(tokens(c.bestText.p.text));
    const matched = [...new Set(terms.flatMap((t) => tokens(t)))].filter((t) => words.has(t) && !STOP.has(t) && t.length > 2);
    if (matched.length) reason(`project text matches "${matched.slice(0, 4).join(" ")}" in "${c.bestText.p.title}"`, "text", features.text);
  }
  const strongSkills = c.skillDetail.filter((s) => s.evidence >= 1).sort((a, b) => b.weight * b.evidence - a.weight * a.evidence).slice(0, 3);
  if (strongSkills.length) {
    const parts = strongSkills.map((s) => {
      const src = [];
      if (s.distinctProjects) src.push(`${s.distinctProjects} project${s.distinctProjects > 1 ? "s" : ""}`);
      if (s.sources.includes("work_history")) src.push("client jobs");
      if (s.sources.includes("credential")) src.push("verified credential");
      if (s.sources.includes("review_mention")) src.push("named in a client review");
      return `${s.skill.replace(/_/g, " ")} (${s.evidence.toFixed(1)}/6 from ${src.join(", ")})`;
    });
    reason(`evidence for ${parts.join("; ")}`, "skills", features.skills);
  }
  if (c.techHit.length) reason(`portfolio shows ${c.techHit.map((t) => TECH_NAMES[t] || t).join(", ")} work`, "tech", features.tech);
  if (f.outcome.jobs) reason(`${f.outcome.completed}/${f.outcome.jobs} contracts completed, ${f.outcome.rehired} rehire${f.outcome.rehired === 1 ? "" : "s"}`, "outcome", features.outcome);
  const cred = f.credentials.find((x) => x.verified);
  if (cred) reason(`verified: ${cred.type.replace(/_/g, " ")} (${cred.issuer}${cred.note ? " — " + cred.note : ""})`, "skills", features.skills);

  const unclaimedSkills = c.skillDetail.filter((s) => s.evidence < 0.5 && f.claims.includes(s.skill)).map((s) => s.skill);
  if (f.evidence.unsupported.length >= 5) caveats.push(`claims ${f.claims.length} skills, independent evidence for ${f.claims.length - f.evidence.unsupported.length} — claimed-only tags earn nothing${c.penalties.claim_evidence_gap ? ` and cost ${c.penalties.claim_evidence_gap}` : ""}`);
  else if (unclaimedSkills.length) caveats.push(`claims ${unclaimedSkills.join(", ").replace(/_/g, " ")} without portfolio evidence — not counted`);
  if (f.projects.filter((p) => p.status !== "held").length > f.evidence.clusterCount) caveats.push(`${f.projects.length} uploads are ${f.evidence.clusterCount} distinct piece${f.evidence.clusterCount > 1 ? "s" : ""} — duplicates counted at 10%`);
  if (f.trust.tier === "soft_flag") caveats.push(`under trust review (risk ${f.trust.risk}) — score multiplied by ${f.trust.trust}`);
  if (f.trust.copiedBy.length) caveats.push(`original work: copies found on ${f.trust.copiedBy.length} other account${f.trust.copiedBy.length > 1 ? "s" : ""} (held)`);
  if (c.slot === "exploration") caveats.push("new freelancer with no client history — shown in the exploration slot because the portfolio evidence qualifies");
  else if (f.isNewcomer) caveats.push("new freelancer, no client history yet");

  const summary = reasons.length ? `Matched because ${reasons.slice(0, 2).map((r) => r.text.replace(/ \(.*$/, "")).join(" and ")}.` : "Weak match: recalled, but little evidence lines up with this request.";

  const L = f.ladder;
  const live = f.projects.filter((p) => p.status !== "held");
  const ordered = c.best ? [c.best.p, ...live.filter((p) => p !== c.best.p)] : live;
  return {
    rank,
    slot: c.slot,
    arena_score: c.arenaScore != null ? r3(c.arenaScore) : null,
    freelancer: { id: f.id, name: f.name, headline: f.headline, category: f.category, location: f.location, newcomer: f.isNewcomer },
    ladder: L?.competitive ? { rating: L.rating, tier: L.rank.tier, division: L.rank.division, label: L.rank.label, masterSeat: L.rank.masterSeat ?? null } : null,
    stats: { jobs: f.outcome.jobs, rehired: f.outcome.rehired, clients: new Set(f.workHistory.map((j) => j.client)).size },
    portfolio: ordered.slice(0, 3).map((p) => ({ id: p.id, title: p.title, thumb: p.thumbUrl, image: p.imageUrl })),
    score: r3(c.score),
    trust: { tier: f.trust.tier, risk: f.trust.risk },
    features: Object.fromEntries(Object.entries(features).map(([k2, v]) => [k2, r3(v)])),
    contributions: c.contributions,
    penalties: c.penalties,
    recalled_via: c.fused.via,
    rrf: r3(c.fused.rrf),
    why: { summary, reasons, caveats },
    best_project: c.best ? { id: c.best.p.id, title: c.best.p.title, grid: c.best.p.images[0].grid, thumb: c.best.p.thumbUrl } : null,
    similar_projects: c.similar.map((x) => x.p.id),
    skill_evidence: c.skillDetail,
  };
}
