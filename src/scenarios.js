// src/scenarios.js — reference images + the golden query set. Shared by eval.js (graded
// judgments) and the server (one-click scenarios in the console).
import { makeGrid } from "./data-lib.js";

export const REF = {
  anime: { label: "Stylized anime character", grid: makeGrid(101, "anime", [4, -4, 6]) },
  realistic: { label: "Realistic sculpt", grid: makeGrid(102, "realistic") },
  neon: { label: "Dark neon UI", grid: makeGrid(103, "neon") },
  cozy: { label: "Cozy props", grid: makeGrid(104, "cozy") },
};

// rel: graded relevance 0-3 ("would you shortlist this person for this exact request").
export const GOLDEN = [
  { id: "hero", label: "Anime game character (your example)", q: { text: "Need something like this for a game", tags: ["Blender", "character design"], ref: "anime" }, rel: { aoi: 3, vera: 3, rin: 2, yui: 1, marco: 1 } },
  { id: "realistic", label: "Realistic creature, text only", q: { text: "realistic creature sculpt for film" }, rel: { marco: 3, aoi: 1, rin: 1, vera: 1 } },
  { id: "realistic-img", label: "“Like this” + realistic image", q: { text: "character like this", ref: "realistic" }, rel: { marco: 3, aoi: 1, rin: 1, vera: 1 } },
  { id: "ui", label: "Fintech dashboard UI", q: { text: "dashboard UI for fintech app" }, rel: { nina: 3 } },
  { id: "ui-img", label: "Dark dashboard + image", q: { text: "dark dashboard like this", ref: "neon" }, rel: { nina: 3 } },
  { id: "copy", label: "Quest dialogue (non-visual)", q: { text: "write quest dialogue for my RPG" }, rel: { dan: 3 } },
  { id: "cozy", label: "Cozy farm props", q: { text: "cozy props for farming game" }, rel: { yui: 3 } },
  { id: "thai", label: "Thai request", q: { text: "อยากได้โมเดลตัวละครอนิเมะไว้ใช้ในเกม" }, rel: { aoi: 3, vera: 3, rin: 2, marco: 1, yui: 1 } },
  { id: "rare-term", label: "Rare term: “shape keys”", q: { text: "shape keys" }, rel: { aoi: 3 } },
  { id: "vague", label: "One vague word", q: { text: "logo" }, rel: { nina: 2 } },
];

export const resolveQuery = (q) => {
  const { ref, ...rest } = q;
  return ref ? { ...rest, image: REF[ref].grid } : rest;
};
