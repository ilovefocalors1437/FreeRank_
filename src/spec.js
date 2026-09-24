// src/spec.js — the SearchSpec contract (design §3) + a rule-based query-understanding stub.
//
// The engine only ever consumes a SearchSpec. Who writes it is pluggable:
//   * understand() below: deterministic lexicon rules + a kNN style probe on the
//     reference image. Good enough to run offline, and the degraded-mode floor.
//   * an LLM (Claude / MiMo / a small fine-tuned model): produce the same JSON and
//     POST it as `spec`. validateSpec() is the gate either way.

import { tokens, gridVector, cosine } from "./embed.js";
import { STYLE_KEYS } from "./data-lib.js";

export const SPEC_VERSION = "1";
export const CATEGORIES = ["3d_character", "3d_props", "ui_design", "brand_design", "copywriting"];
export const VISUAL_CATEGORIES = new Set(["3d_character", "3d_props", "ui_design", "brand_design"]);
export const RELATED = { "3d_character": ["3d_props"], "3d_props": ["3d_character"], ui_design: ["brand_design"], brand_design: ["ui_design"], copywriting: [] };
export const TECH_REQS = ["game_ready", "rigged", "toon_shading", "pbr_texturing", "source_files", "design_system"];

// Lexicons. Thai entries are matched as substrings (Thai is written without spaces).
const CATEGORY_LEX = {
  "3d_character": ["character", "characters", "anime", "chibi", "heroine", "hero", "mascot", "npc", "avatar", "vtuber", "sculpt", "creature", "3d", "ตัวละคร", "อนิเมะ", "โมเดล", "สามมิติ", "คาแรคเตอร์"],
  "3d_props": ["prop", "props", "potion", "potions", "item", "items", "furniture", "environment", "พร็อพ", "ไอเทม", "ฉาก"],
  ui_design: ["ui", "ux", "app", "dashboard", "website", "landing", "web", "interface", "screen", "figma", "เว็บ", "แอป", "หน้าจอ"],
  brand_design: ["logo", "brand", "branding", "identity", "โลโก้", "แบรนด์"],
  copywriting: ["copy", "copywriting", "write", "writer", "writing", "dialogue", "quest", "quests", "story", "script", "blurb", "description", "เขียน", "บทพูด", "คำโฆษณา", "แคปชั่น", "เนื้อเรื่อง"],
};
const STYLE_LEX = {
  stylized_anime: ["anime", "manga", "chibi", "gacha", "vtuber", "stylized", "อนิเมะ", "การ์ตูน"],
  cel_shaded: ["cel", "toon", "shaded", "โทนแบน"],
  realistic: ["realistic", "photoreal", "realism", "cinematic", "film", "สมจริง"],
  painterly: ["painterly", "painted", "painting", "ภาพวาด"],
  minimal: ["minimal", "minimalist", "clean", "มินิมอล"],
  cozy: ["cozy", "cute", "warm", "wholesome", "น่ารัก"],
  neon: ["neon", "cyberpunk", "synthwave", "นีออน"],
};
const SKILL_LEX = {
  blender: ["blender", "เบลนเดอร์"],
  zbrush: ["zbrush"],
  maya: ["maya"],
  figma: ["figma"],
  character_design: ["character", "characters", "heroine", "mascot", "npc", "ตัวละคร", "คาแรคเตอร์"],
  rigging: ["rig", "rigging", "rigged", "animate", "animation", "ริก", "ขยับได้"],
  hard_surface: ["hard-surface", "hardsurface", "armor", "mech"],
  prop_art: ["prop", "props", "potion", "items", "พร็อพ"],
  ui_design: ["ui", "dashboard", "interface", "landing", "หน้าเว็บ"],
  brand_design: ["logo", "brand", "branding", "โลโก้"],
  copywriting: ["copy", "copywriting", "dialogue", "quest", "writing", "เขียน", "บทพูด"],
};
const TECH_LEX = {
  game_ready: ["game", "games", "unity", "unreal", "mobile", "engine", "rpg", "เกม"],
  rigged: ["rig", "rigged", "rigging", "animate", "animation", "ริก", "ขยับได้"],
  toon_shading: ["toon", "cel", "โทนแบน"],
  source_files: ["source", ".blend", "psd", "ไฟล์งาน"],
  design_system: ["system", "components", "component"],
};
const DIFF_LOW = ["simple", "quick", "cheap", "basic", "easy", "ง่าย", "ถูก", "ด่วน"];
const DIFF_HIGH = ["aaa", "professional", "detailed", "premium", "cinematic", "hero", "high-end", "ละเอียด", "คุณภาพสูง", "มือโปร"];
// Query-side translation to index vocabulary. Turning a Thai request into English
// index terms is exactly the job the QU layer exists for.
const THAI_TERMS = { ตัวละคร: "character", อนิเมะ: "anime", การ์ตูน: "stylized", เกม: "game", โมเดล: "model", เว็บ: "web", แอป: "app", โลโก้: "logo", เขียน: "writing", บทพูด: "dialogue", เนื้อเรื่อง: "quest", สมจริง: "realistic", น่ารัก: "cozy", ริก: "rigging", พร็อพ: "props" };
const INJECTION = /(ignore (all |any )?(previous|prior|above)[^.!\n]*|disregard[^.!\n]*instructions[^.!\n]*|rank (me|this|them) (first|higher|top)[^.!\n]*|system prompt[^.!\n]*|you are now[^.!\n]*)/gi;

const isThai = (w) => /[ก-๙]/.test(w);
function hits(lex, toks, raw) {
  return lex.filter((w) => (isThai(w) || w.includes(".") || w.includes("-") ? raw.includes(w) : toks.has(w)));
}
export const normTag = (t) => String(t).trim().toLowerCase().replace(/[\s-]+/g, "_");

// Style probe for the reference image: similarity-weighted vote over the style
// labels of the nearest indexed images (held/fraud images excluded). Stand-in for
// zero-shot style heads on a SigLIP embedding.
function probeStyle(image, index, k = 5) {
  const qv = gridVector(image);
  const nn = index.live
    .map((p) => ({ p, s: cosine(qv, p.images[0].vec) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .filter((x) => x.s > 0.5);
  const out = Object.fromEntries(STYLE_KEYS.map((k2) => [k2, 0]));
  const wsum = nn.reduce((a, x) => a + (x.s - 0.5), 0);
  if (!wsum) return { attrs: null, neighbours: [] };
  for (const { p, s } of nn) for (const key of STYLE_KEYS) out[key] += ((s - 0.5) / wsum) * (p.style?.[key] ?? 0);
  for (const key of STYLE_KEYS) out[key] = +out[key].toFixed(2);
  return { attrs: out, neighbours: nn.map((x) => ({ project: x.p.id, sim: +x.s.toFixed(3) })) };
}

export function understand(req, index) {
  const flags = [];
  const assumptions = [];
  const original = String(req.text || "");
  const raw = original.replace(INJECTION, " "); // replace(), not test(): a /g regex's test() is stateful
  if (raw !== original) flags.push("instruction_like_text_removed");
  const tags = (req.tags || []).map((t) => String(t).trim()).filter(Boolean);
  const rawAll = `${raw} ${tags.join(" ")}`.toLowerCase();
  const toks = new Set(tokens(rawAll));
  const hasImage = !!req.image;

  // 1. work type
  const catScores = Object.fromEntries(CATEGORIES.map((c) => [c, hits(CATEGORY_LEX[c], toks, rawAll).length]));
  const ranked = Object.entries(catScores).sort((a, b) => b[1] - a[1]);
  let [category, top] = ranked[0];
  const second = ranked[1][1];
  let confidence = top === 0 ? 0 : Math.min(0.95, 0.45 + 0.15 * top - 0.2 * second);
  if (top === 0 && hasImage) {
    category = "3d_character";
    confidence = 0.35;
    assumptions.push("no work type in text; assumed a 3D character from the reference image");
  }
  if (top === 0 && !hasImage) {
    category = null;
    flags.push("unknown_work_type");
  }
  if (top > 0 && top === second) flags.push("ambiguous_work_type");

  // 2. style: from the image when there is one, text words otherwise
  const textStyle = Object.fromEntries(STYLE_KEYS.map((k) => [k, hits(STYLE_LEX[k], toks, rawAll).length ? 0.8 : 0]));
  const probe = hasImage ? probeStyle(req.image, index) : { attrs: null, neighbours: [] };
  let style = textStyle;
  if (probe.attrs) {
    style = { ...probe.attrs };
    const textTop = STYLE_KEYS.filter((k) => textStyle[k] > 0);
    const imgTop = STYLE_KEYS.filter((k) => probe.attrs[k] >= 0.4);
    if (textTop.length && imgTop.length && !textTop.some((k) => imgTop.includes(k))) flags.push("modality_conflict: text style vs image style — image wins for style");
  }

  // 3. skills: explicit tags > text words > category prior
  const skills = new Map();
  const addSkill = (skill, weight, source) => {
    if (!skills.has(skill) || skills.get(skill).weight < weight) skills.set(skill, { skill, weight, source });
  };
  for (const t of tags) {
    const n = normTag(t);
    const mapped = Object.keys(SKILL_LEX).find((s) => s === n || SKILL_LEX[s].includes(n) || SKILL_LEX[s].includes(t.toLowerCase()));
    addSkill(mapped || n, 0.9, "tag");
  }
  for (const [s, lex] of Object.entries(SKILL_LEX)) if (hits(lex, toks, rawAll).length) addSkill(s, 0.7, "text");
  const gameish = hits(TECH_LEX.game_ready, toks, rawAll).length > 0;
  if (category === "3d_character") {
    addSkill("character_design", 0.6, "category_prior");
    if (gameish) addSkill("game_character_art", 0.5, "category_prior");
    if (style.stylized_anime >= 0.4 || style.cozy >= 0.4) addSkill("stylized_sculpting", 0.5, "style_prior");
    if (style.realistic >= 0.4) addSkill("realistic_sculpting", 0.5, "style_prior");
  }
  if (category === "3d_props") addSkill("prop_art", 0.6, "category_prior");
  if (category === "ui_design") addSkill("ui_design", 0.6, "category_prior");
  if (category === "brand_design") addSkill("brand_design", 0.6, "category_prior");
  if (category === "copywriting") addSkill("copywriting", 0.7, "category_prior");

  // 4. technical requirements
  // Technical requirements only mean something for the work types that have them:
  // "for my RPG" on a copywriting job is context, not a game-ready-mesh requirement.
  const TECH_FOR = { "3d_character": ["game_ready", "rigged", "toon_shading", "pbr_texturing", "source_files"], "3d_props": ["game_ready", "toon_shading", "pbr_texturing", "source_files"], ui_design: ["design_system", "source_files"], brand_design: ["source_files"], copywriting: [] };
  const allowedTech = new Set(category ? TECH_FOR[category] : Object.keys(TECH_LEX));
  const tech = [];
  for (const [req2, lex] of Object.entries(TECH_LEX)) if (allowedTech.has(req2) && hits(lex, toks, rawAll).length) tech.push({ req: req2, weight: req2 === "game_ready" ? 0.7 : 0.5, hard: false });
  if (category === "3d_character" && gameish && !tech.some((t) => t.req === "rigged")) assumptions.push("game use does not say rigged; rigging treated as a bonus, not required");

  // 5. difficulty
  let difficulty = category === "3d_character" && gameish ? 0.65 : 0.55;
  if (hits(DIFF_LOW, toks, rawAll).length) difficulty = 0.35;
  if (hits(DIFF_HIGH, toks, rawAll).length) difficulty = 0.85;

  const expanded = new Set([...toks].filter((t) => !isThai(t)));
  for (const [th, en] of Object.entries(THAI_TERMS)) if (rawAll.includes(th)) expanded.add(en);
  // Skill ids feed the lexical channel too, minus words too generic to mean anything
  // ("design" from character_design matched every UI and logo portfolio).
  const GENERIC = new Set(["design", "art", "character"]);
  for (const s of skills.keys()) for (const part of s.split("_")) if (!GENERIC.has(part) || toks.has(part)) expanded.add(part);

  const textQuality = toks.size < 6 ? "sparse" : "ok";
  if (textQuality === "sparse" && hasImage) assumptions.push("short text; style and subject taken from the reference image");

  const hard = { accepting_work: true };
  if (category && confidence >= 0.75) hard.categories = [category, ...RELATED[category]];

  return {
    spec_version: SPEC_VERSION,
    producer: "rule_stub",
    work_type: { category, confidence: +confidence.toFixed(2), visual: category ? VISUAL_CATEGORIES.has(category) : hasImage },
    modality: { has_image: hasImage, text_quality: textQuality, tags_provided: tags },
    style: { attributes: style, use_reference_image_for: hasImage ? ["style", "subject"] : [], probe_neighbours: probe.neighbours },
    technical_requirements: tech,
    skills: [...skills.values()].sort((a, b) => b.weight - a.weight),
    difficulty: { score: difficulty, band: difficulty >= 0.75 ? "high" : difficulty >= 0.5 ? "mid" : "low" },
    expanded_terms: [...expanded],
    hard_filters: hard,
    ambiguity: { flags, plan: flags.some((f) => f.includes("work_type")) ? "rank across categories; diversify" : "standard" },
    assumptions,
  };
}

// Hand-rolled JSON-schema check. A spec that fails it never reaches the engine;
// search() falls back to degraded tags+BM25 mode instead.
export function validateSpec(s) {
  const e = [];
  const num01 = (v) => typeof v === "number" && v >= 0 && v <= 1;
  if (!s || typeof s !== "object") return ["spec is not an object"];
  if (s.spec_version !== SPEC_VERSION) e.push(`spec_version must be "${SPEC_VERSION}"`);
  const c = s.work_type?.category;
  if (c !== null && c !== undefined && !CATEGORIES.includes(c)) e.push(`work_type.category must be one of ${CATEGORIES.join(", ")} or null`);
  if (s.work_type && s.work_type.confidence !== undefined && !num01(s.work_type.confidence)) e.push("work_type.confidence must be 0..1");
  const attrs = s.style?.attributes;
  if (attrs && typeof attrs !== "object") e.push("style.attributes must be an object");
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (!STYLE_KEYS.includes(k)) e.push(`unknown style attribute "${k}" (allowed: ${STYLE_KEYS.join(", ")})`);
    else if (!num01(v)) e.push(`style.attributes.${k} must be 0..1`);
  }
  if (!Array.isArray(s.skills)) e.push("skills must be an array");
  else s.skills.forEach((k, i) => {
    if (typeof k?.skill !== "string") e.push(`skills[${i}].skill must be a string`);
    if (!num01(k?.weight)) e.push(`skills[${i}].weight must be 0..1`);
  });
  if (s.technical_requirements !== undefined) {
    if (!Array.isArray(s.technical_requirements)) e.push("technical_requirements must be an array");
    else s.technical_requirements.forEach((t, i) => {
      if (!TECH_REQS.includes(t?.req)) e.push(`technical_requirements[${i}].req must be one of ${TECH_REQS.join(", ")}`);
      if (!num01(t?.weight)) e.push(`technical_requirements[${i}].weight must be 0..1`);
    });
  }
  if (s.difficulty !== undefined && !num01(s.difficulty?.score)) e.push("difficulty.score must be 0..1");
  if (s.expanded_terms !== undefined && !Array.isArray(s.expanded_terms)) e.push("expanded_terms must be an array");
  if (s.hard_filters?.categories !== undefined && (!Array.isArray(s.hard_filters.categories) || s.hard_filters.categories.some((x) => !CATEGORIES.includes(x)))) e.push("hard_filters.categories must list known categories");
  return e;
}

// Degraded mode: what search can do with no QU at all — tags + raw words.
export function degradedSpec(req) {
  const tags = (req.tags || []).map(normTag);
  const toks = tokens(`${req.text || ""} ${tags.join(" ")}`);
  return {
    spec_version: SPEC_VERSION,
    producer: "degraded",
    work_type: { category: null, confidence: 0, visual: false },
    modality: { has_image: !!req.image, text_quality: "unknown", tags_provided: req.tags || [] },
    style: { attributes: {}, use_reference_image_for: [] },
    technical_requirements: [],
    skills: tags.map((t) => ({ skill: t, weight: 0.8, source: "tag" })),
    difficulty: { score: 0.55, band: "mid" },
    expanded_terms: toks,
    hard_filters: { accepting_work: true },
    ambiguity: { flags: ["degraded_mode"], plan: "tags + lexical only" },
    assumptions: [],
  };
}
