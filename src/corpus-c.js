// src/corpus-c.js — demo freelancers (part 3): the attack cases + cold-start case.
//   max  = tag stuffer (25 claims, zero evidence)
//   king = image thief (recolors aoi's exact images, near-copies her text, uploads LATER)
//   vera = talented newcomer with verified source files (exploration slot)
import { makeGrid } from "./data-lib.js";

export const CORPUS_C = [
  {
    id: "max",
    name: "Max Skillsman",
    headline: "Expert in everything — 25 skills, trust me",
    category: "3d_character",
    availability: true,
    ts: 6000,
    claims: ["blender", "maya", "zbrush", "character_design", "stylized_sculpting", "realistic_sculpting", "game_character_art", "hard_surface", "rigging", "ui_design", "brand_design", "copywriting", "figma", "substance_painter", "unreal", "unity", "motion_graphics", "vfx", "illustration", "concept_art", "logo_design", "3ds_max", "houdini", "after_effects", "seo"],
    projects: [
      { id: "max-p1", title: "3d model work sample", description: "I do 3d model work and design work. Good quality fast cheap.", tools: [], tags: ["blender", "maya", "zbrush", "character_design", "rigging", "game_character_art"], style: { stylized_anime: 0.2, realistic: 0.2 }, difficulty: 0.3, img: makeGrid(61, "minimal") },
    ],
    workHistory: [],
    credentials: [],
    reviews: [],
  },
  {
    id: "king",
    name: "Sketch King",
    headline: "Top anime character artist (portfolio inside)",
    category: "3d_character",
    availability: true,
    ts: 9000,
    claims: ["blender", "character_design", "stylized_sculpting", "game_character_art"],
    projects: [
      { id: "king-p1", title: "Cel-shaded anime heroine for mobile RPG", description: "Stylized anime character sculpted and modeled in Blender. Game-ready topology, clean UVs, toon shader. Full character design concept to engine!!", tools: ["blender"], tags: ["character_design", "stylized_sculpting", "game_character_art"], style: { stylized_anime: 0.95, cel_shaded: 0.9 }, difficulty: 0.7, img: makeGrid(11, "anime", [35, -45, 30], 12) },
      { id: "king-p2", title: "Anime mage companion — rigged game asset", description: "Blender character with rigging and shape keys for a stylized anime game. Hand painted textures, cel shading, delivered as engine ready asset.", tools: ["blender"], tags: ["character_design", "rigging"], style: { stylized_anime: 0.9, cel_shaded: 0.85 }, difficulty: 0.7, img: makeGrid(12, "anime", [35, -45, 30], 12) },
      { id: "king-p3", title: "Chibi anime mascot for gacha game", description: "Cute stylized anime mascot, Blender sculpt with exaggerated proportions. Toon shader setup, turntable and expression sheets!!", tools: ["blender"], tags: ["character_design", "stylized_sculpting"], style: { stylized_anime: 0.92, cel_shaded: 0.8 }, difficulty: 0.55, img: makeGrid(13, "anime", [35, -45, 30], 12) },
    ],
    workHistory: [],
    credentials: [],
    reviews: [],
  },
  {
    id: "vera",
    name: "Vera L.",
    headline: "New account — verified Blender source files on request",
    category: "3d_character",
    availability: true,
    ts: 12000,
    claims: ["blender", "character_design", "stylized_sculpting", "game_character_art"],
    projects: [
      { id: "vera-p1", title: "Stylized anime elf ranger — game ready", description: "Anime-style elf ranger built in Blender. Toon shading, game-ready low poly with clean topology. Wireframes and .blend source on request.", tools: ["blender"], tags: ["character_design", "stylized_sculpting", "game_character_art"], style: { stylized_anime: 0.9, cel_shaded: 0.8 }, difficulty: 0.7, img: makeGrid(71, "anime", [-25, 25, -12]) },
      { id: "vera-p2", title: "Anime knight — stylized Blender character", description: "Stylized anime knight character in Blender with cel shading. Clean model, verified source files available.", tools: ["blender"], tags: ["character_design", "game_character_art"], style: { stylized_anime: 0.85, cel_shaded: 0.75 }, difficulty: 0.65, img: makeGrid(72, "anime", [30, 20, 25]) },
      { id: "vera-p3", title: "Stylized anime idol — mobile game character", description: "Anime idol character with cel shader, Blender pipeline. Stylized character design for mobile game.", tools: ["blender"], tags: ["character_design", "stylized_sculpting"], style: { stylized_anime: 0.93, cel_shaded: 0.85 }, difficulty: 0.6, img: makeGrid(73, "anime", [-8, -30, 18]) },
    ],
    workHistory: [],
    credentials: [{ skill: "game_character_art", type: "source_files", issuer: "manual_review", verified: true, note: "3/3 .blend files open and match renders" }],
    reviews: [],
  },
];
