// src/scenarios.js — reference images + the golden query set. Shared by eval.js (graded
// judgments) and the server (one-click scenarios in the console).
import { GRIDS } from "./data.js";
import { REFERENCE_IMAGES } from "./corpus.js";

// A client's reference images: real renders that are in nobody's portfolio.
export const REF = Object.fromEntries(
  Object.entries(REFERENCE_IMAGES).map(([id, r]) => {
    const g = GRIDS[`ref-${id}`];
    return [id, { label: r.label, grid: g ? { w: 8, h: 8, rgb: g.rgb } : null, url: g ? `/assets/portfolio/ref-${id}-sm.webp` : null }];
  }),
);

// rel: graded relevance 0-3 ("would you shortlist this person for this exact request"),
// judged from the portfolios themselves, not from what the engine returned.
export const GOLDEN = [
  { id: "hero", label: "Anime game character (your example)", q: { text: "Need something like this for a game", tags: ["Blender", "character design"], ref: "anime" }, rel: { aoi: 3, vera: 3, kenta: 3, mira: 3, lucas: 2, noor: 2, rin: 2, ploy: 1, yui: 1, theo: 1, marco: 1 } },
  { id: "realistic", label: "Realistic creature, text only", q: { text: "realistic creature sculpt for film" }, rel: { ivan: 3, marco: 3, sofia: 2 } },
  { id: "realistic-img", label: "“Like this” + realistic image", q: { text: "character like this", ref: "realistic" }, rel: { ivan: 3, marco: 3, sofia: 2 } },
  { id: "ui", label: "Fintech dashboard UI", q: { text: "dashboard UI for fintech app" }, rel: { nina: 3, hana: 3, arun: 2, bea: 1 } },
  { id: "ui-img", label: "Dark dashboard + image", q: { text: "dark dashboard like this", ref: "neon" }, rel: { nina: 3, hana: 3, arun: 2 } },
  { id: "copy", label: "Quest dialogue (non-visual)", q: { text: "write quest dialogue for my RPG" }, rel: { dan: 3, maya: 2, tom: 1, pim: 1 } },
  { id: "cozy", label: "Cozy farm props", q: { text: "cozy props for farming game" }, rel: { yui: 3, ploy: 3, theo: 2, jun: 2 } },
  { id: "thai", label: "Thai request", q: { text: "อยากได้โมเดลตัวละครอนิเมะไว้ใช้ในเกม" }, rel: { aoi: 3, kenta: 3, vera: 3, mira: 3, lucas: 2, noor: 2, rin: 2 } },
  { id: "rare-term", label: "Rare term: “shape keys”", q: { text: "shape keys" }, rel: { aoi: 3, mira: 3 } },
  { id: "vague", label: "One vague word", q: { text: "logo" }, rel: { oskar: 3, lin: 3, nina: 1 } },
];

export const resolveQuery = (q) => {
  const { ref, ...rest } = q;
  return ref ? { ...rest, image: REF[ref].grid } : rest;
};
