// src/corpus-d.js — demo freelancers (part 4): the portfolio padder.
//   rin = one real anime character uploaded as five "projects" (same model, nudged
//         lighting). Honest work, dishonest count: evidence dedupe must score it as
//         roughly one project, not five.
import { makeGrid } from "./data-lib.js";

const angle = (n, tint) => ({
  id: `rin-p${n}`,
  title: `Anime girl character render v${n} — Blender`,
  description: "Stylized anime girl character in Blender, cel shaded render. Alternate angle and lighting of the same model.",
  tools: ["blender"],
  tags: ["character_design", "stylized_sculpting", "game_character_art"],
  style: { stylized_anime: 0.85, cel_shaded: 0.8 },
  difficulty: 0.5,
  img: makeGrid(81, "anime", tint),
});

export const CORPUS_D = [
  {
    id: "rin",
    name: "Rin M.",
    headline: "Anime character artist — 5 finished projects",
    category: "3d_character",
    availability: true,
    ts: 8000,
    claims: ["blender", "character_design", "stylized_sculpting", "game_character_art"],
    projects: [
      angle(1, [0, 0, 0]),
      angle(2, [3, -2, 2]),
      angle(3, [-3, 2, 0]),
      angle(4, [2, 2, -3]),
      angle(5, [-2, -3, 3]),
    ],
    workHistory: [{ category: "3d_character", tools: ["blender"], outcome: "completed", rehired: false }],
    credentials: [],
    reviews: [],
  },
];
