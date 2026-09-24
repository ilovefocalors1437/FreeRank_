// src/corpus-b.js — demo freelancers (part 2): yui (props), nina (UI), dan (copywriter, non-visual).
import { makeGrid } from "./data-lib.js";

export const CORPUS_B = [
  {
    id: "yui",
    name: "Yui S.",
    headline: "Cozy stylized props & casual game assets (Blender)",
    category: "3d_props",
    availability: true,
    ts: 3000,
    claims: ["blender", "stylized_sculpting", "game_character_art"],
    projects: [
      { id: "yui-p1", title: "Cozy farm props pack for mobile game", description: "Stylized cozy props modeled in Blender for a farming game. Soft shapes, warm palette, game-ready meshes.", tools: ["blender"], tags: ["stylized_sculpting", "game_character_art"], style: { cozy: 0.9, stylized_anime: 0.3 }, difficulty: 0.4, img: makeGrid(31, "cozy") },
      { id: "yui-p2", title: "Stylized potion set — casual RPG", description: "Blender stylized potion bottles with hand-painted look. Cozy casual game style.", tools: ["blender"], tags: ["stylized_sculpting"], style: { cozy: 0.8, stylized_anime: 0.35 }, difficulty: 0.35, img: makeGrid(32, "cozy", [-8, 10, 4]) },
    ],
    workHistory: [{ category: "3d_props", tools: ["blender"], outcome: "completed", rehired: true }],
    credentials: [],
    reviews: [{ text: "Super cozy style, exactly the vibe." }],
  },
  {
    id: "nina",
    name: "Nina R.",
    headline: "Product & web UI designer (Figma)",
    category: "ui_design",
    availability: true,
    ts: 4000,
    claims: ["figma", "ui_design", "brand_design"],
    projects: [
      { id: "nina-p1", title: "Neon fintech dashboard UI", description: "Dark neon dashboard design in Figma, design system and components for a fintech web app.", tools: ["figma"], tags: ["ui_design"], style: { neon: 0.9, minimal: 0.3 }, difficulty: 0.5, img: makeGrid(41, "neon") },
      { id: "nina-p2", title: "Minimal landing page for SaaS", description: "Clean minimal landing page in Figma with brand guidelines. Web design for SaaS product.", tools: ["figma"], tags: ["ui_design", "brand_design"], style: { minimal: 0.9 }, difficulty: 0.4, img: makeGrid(42, "minimal") },
    ],
    workHistory: [{ category: "ui_design", tools: ["figma"], outcome: "completed", rehired: true }],
    credentials: [{ skill: "ui_design", type: "portfolio_review", issuer: "internal", verified: true }],
    reviews: [],
  },
  {
    id: "dan",
    name: "Dan P.",
    headline: "Game narrative & marketing copywriter",
    category: "copywriting",
    availability: true,
    ts: 5000,
    claims: ["copywriting", "brand_design"],
    projects: [
      { id: "dan-p1", title: "Steam page copy for indie RPG", description: "Marketing copy and store description for an indie RPG launch. Punchy game copywriting.", tools: [], tags: ["copywriting"], style: {}, difficulty: 0.3, img: makeGrid(51, "ink") },
      { id: "dan-p2", title: "In-game quest dialogue pack", description: "Quest writing and dialogue for a fantasy game. Narrative design and copywriting.", tools: [], tags: ["copywriting"], style: {}, difficulty: 0.4, img: makeGrid(52, "ink", [8, 8, 8]) },
    ],
    workHistory: [
      { category: "copywriting", tools: [], outcome: "completed", rehired: true },
      { category: "copywriting", tools: [], outcome: "completed", rehired: true },
    ],
    credentials: [],
    reviews: [{ text: "Great copy, rehired for the second batch of quests." }],
  },
];
