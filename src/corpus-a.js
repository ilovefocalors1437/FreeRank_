// src/corpus-a.js — demo freelancers (part 1): aoi = hero match, marco = realistic alternative.
import { makeGrid } from "./data-lib.js";

export const CORPUS_A = [
  {
    id: "aoi",
    name: "Aoi K.",
    headline: "Stylized 3D character artist for games (Blender)",
    category: "3d_character",
    availability: true,
    ts: 1000,
    claims: ["blender", "character_design", "stylized_sculpting", "game_character_art", "rigging", "substance_painter", "zbrush", "maya", "unreal", "unity"],
    projects: [
      { id: "aoi-p1", title: "Cel-shaded anime heroine for mobile RPG", description: "Stylized anime character sculpted and modeled in Blender. Game-ready topology, clean UVs, toon shader. Full character design from concept to engine.", tools: ["blender"], tags: ["character_design", "stylized_sculpting", "game_character_art"], style: { stylized_anime: 0.95, cel_shaded: 0.9 }, difficulty: 0.7, img: makeGrid(11, "anime") },
      { id: "aoi-p2", title: "Anime mage companion — rigged game asset", description: "Blender character with rigging and shape keys for a stylized anime game. Hand-painted textures, cel shading, delivered as engine-ready asset.", tools: ["blender"], tags: ["character_design", "rigging", "game_character_art"], style: { stylized_anime: 0.9, cel_shaded: 0.85 }, difficulty: 0.75, img: makeGrid(12, "anime", [8, -6, 14]) },
      { id: "aoi-p3", title: "Chibi anime mascot for gacha game", description: "Cute stylized anime mascot, Blender sculpt with exaggerated proportions. Toon shader setup, turntable and expression sheets.", tools: ["blender"], tags: ["character_design", "stylized_sculpting"], style: { stylized_anime: 0.92, cel_shaded: 0.8 }, difficulty: 0.55, img: makeGrid(13, "anime", [-10, 8, 0]) },
      { id: "aoi-p4", title: "Stylized anime NPC pack (3 characters)", description: "Three game-ready stylized characters in Blender for an indie RPG. Consistent anime style, hand-painted textures, simple rigging for locomotion.", tools: ["blender"], tags: ["character_design", "game_character_art", "rigging"], style: { stylized_anime: 0.88, cel_shaded: 0.75 }, difficulty: 0.7, img: makeGrid(14, "anime", [12, 4, -8]) },
      { id: "aoi-p5", title: "Painterly fantasy portrait study", description: "A painterly fantasy character portrait, digital painting study in soft colors.", tools: [], tags: ["character_design"], style: { painterly: 0.8, stylized_anime: 0.4 }, difficulty: 0.4, img: makeGrid(15, "cozy") },
    ],
    workHistory: [
      { category: "3d_character", tools: ["blender"], outcome: "completed", rehired: true },
      { category: "3d_character", tools: ["blender"], outcome: "completed", rehired: true },
      { category: "3d_character", tools: ["blender"], outcome: "completed", rehired: false },
      { category: "3d_character", tools: ["blender"], outcome: "completed", rehired: false },
    ],
    credentials: [{ skill: "blender", type: "blender_cert", issuer: "Blender Foundation", verified: true }],
    reviews: [{ text: "The rig she built worked perfectly in our engine. Would rehire." }],
  },
  {
    id: "marco",
    name: "Marco T.",
    headline: "Realistic 3D sculptor — creatures and characters (ZBrush)",
    category: "3d_character",
    availability: true,
    ts: 2000,
    claims: ["zbrush", "character_design", "realistic_sculpting", "hard_surface"],
    projects: [
      { id: "marco-p1", title: "Realistic warrior bust for cinematics", description: "Photoreal warrior bust sculpted in ZBrush, PBR texturing for cinematic render. Realistic anatomy and armor detail.", tools: ["zbrush"], tags: ["realistic_sculpting", "character_design"], style: { realistic: 0.9 }, difficulty: 0.8, img: makeGrid(21, "realistic") },
      { id: "marco-p2", title: "Creature concept — realistic fantasy beast", description: "Realistic creature sculpt with detailed skin, ZBrush high-poly for film pipeline.", tools: ["zbrush"], tags: ["realistic_sculpting"], style: { realistic: 0.85, painterly: 0.3 }, difficulty: 0.85, img: makeGrid(22, "realistic", [10, 0, -10]) },
      { id: "marco-p3", title: "Historical soldier — realistic uniform study", description: "Realistic soldier with cloth and hard surface accessories. ZBrush and Marvelous Designer workflow.", tools: ["zbrush"], tags: ["realistic_sculpting", "hard_surface"], style: { realistic: 0.88 }, difficulty: 0.7, img: makeGrid(23, "ink") },
    ],
    workHistory: [
      { category: "3d_character", tools: ["zbrush"], outcome: "completed", rehired: false },
      { category: "3d_character", tools: ["zbrush"], outcome: "completed", rehired: true },
    ],
    credentials: [],
    reviews: [],
  },
];
