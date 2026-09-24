// src/corpus.js — the demo marketplace. 26 freelancers across five categories.
//
// Nobody's rank is typed in: each freelancer has a job history (client, stars,
// value, age, arena) and a portfolio, and rank.js derives the rating from those.
// Every portfolio image is a real render (assets-src/), described by `image`.
//
// The edge cases the eval depends on are kept from the prototype:
//   aoi  genuine stylized-character artist, the original that king copies
//   king recoloured copies of aoi's renders, uploaded later       -> held
//   max  25 claimed skills, no evidence                            -> under review
//   rin  one character uploaded as five projects                   -> counted once
//   vera new, verified source files, no clients yet                -> Casual only
//   dan  copywriter with 2 of the 3 clients Competitive needs      -> Casual only

import { mulberry32 } from "./data-lib.js";

// ---------------------------------------------------------------- job histories

const CLIENTS = ["Lumen Games", "Pixelhaus", "Northwind Studio", "Kappa Interactive", "Siam Digital", "Blue Owl Apps", "Tidewater Co.", "Orbit Labs", "Paper Crane", "Moss & Marble", "Fable Forge", "Juniper Health", "Nimbus Pay", "Sunday Studio", "Bangkok Brew", "Harbor Books", "Quartz Mobile", "Red Kite Media", "Atlas Outdoor", "Glasshouse", "Mango Arcade", "Delta Robotics", "Lantern Press", "Velvet Audio", "Cobalt Cloud", "Oak & Ember", "Pebble Toys", "Starboard AI", "Wren Collective", "Kiln Coffee"];

// n casual + m competitive jobs, stars around `avg`, deterministic per seed.
function history(seed, { casual = 0, competitive = 0, avg = 4.6, spread = 0.5, value = [120, 900], repeat = 0.15, category, tools = [], disputes = 0, lateRate = 0.08, span = 520 }) {
  const rnd = mulberry32(seed);
  const jobs = [];
  const used = [];
  const pickClient = () => {
    if (used.length && rnd() < repeat) return used[Math.floor(rnd() * used.length)];
    const c = CLIENTS[Math.floor(rnd() * CLIENTS.length)];
    used.push(c);
    return c;
  };
  const make = (arena, i, total) => {
    const client = arena === "casual" && i < 3 ? CLIENTS[(seed * 7 + i * 5) % CLIENTS.length] : pickClient();
    const s = Math.max(1, Math.min(5, Math.round((avg + (rnd() - 0.5) * 2 * spread) * 2) / 2));
    const v = Math.round(value[0] + rnd() * (value[1] - value[0]));
    const daysAgo = Math.round(span * (1 - (i + 1) / (total + 1)) + rnd() * 20);
    return { client, arena, category, tools, stars: s, value: v, daysAgo, onTime: rnd() > lateRate, outcome: "completed", rehired: used.filter((c) => c === client).length > 1 };
  };
  for (let i = 0; i < casual; i++) jobs.push(make("casual", i, casual + competitive));
  for (let i = 0; i < competitive; i++) jobs.push(make("competitive", casual + i, casual + competitive));
  for (let i = 0; i < disputes; i++) jobs[jobs.length - 1 - i] = { ...jobs[jobs.length - 1 - i], outcome: "dispute_lost", stars: 1 };
  // rehired = the client had hired this freelancer before this job
  const seen = new Set();
  for (const j of jobs.sort((a, b) => b.daysAgo - a.daysAgo)) {
    j.rehired = seen.has(j.client);
    seen.add(j.client);
  }
  return jobs;
}

const REVIEW_LINES = {
  "3d_character": ["The rig she built worked perfectly in our engine. Would rehire.", "Topology was clean and the character read well at mobile size.", "Nailed the style guide on the first pass.", "Delivered the Blender files with every shape key named. Rare."],
  "3d_props": ["Props dropped straight into Unity, no cleanup needed.", "Cozy, readable, and on budget.", "Great texel density discipline across the whole pack."],
  ui_design: ["The design system saved our devs weeks.", "Figma file was the tidiest we have ever received.", "Clear UI decisions, explained every one."],
  brand_design: ["The brand finally looks like us.", "Logo works at favicon size and on a billboard.", "Thoughtful brand guidelines, easy to hand to the team."],
  copywriting: ["Great copy, rehired for the second batch of quests.", "Our store page conversion went up after the rewrite.", "Understood the voice immediately."],
};
function reviews(seed, jobs, category) {
  const lines = REVIEW_LINES[category] || [];
  return jobs.filter((_, i) => (seed + i) % 3 === 0 && jobs[i].stars >= 4).slice(0, 4).map((j, i) => ({ text: lines[(seed + i) % lines.length], client: j.client, stars: j.stars }));
}

// ---------------------------------------------------------------- helpers for projects

const chibi = (params) => ({ kind: "chibi", ...params });
const clay = (params) => ({ kind: "clay", ...params });
const prop = (params) => ({ kind: "prop", ...params });
const ui = (params) => ({ kind: "ui", ...params });
const brand = (params) => ({ kind: "brand", ...params });
const copy = (params) => ({ kind: "copy", ...params });

function freelancer(f) {
  const jobs = f.jobs || [];
  return {
    availability: true,
    credentials: [],
    ...f,
    workHistory: jobs,
    reviews: f.reviews ?? reviews(f.seed || 1, jobs, f.category),
  };
}

// ---------------------------------------------------------------- the core cast

const aoiJobs = history(11, { casual: 4, competitive: 13, avg: 4.8, spread: 0.3, value: [300, 1800], category: "3d_character", tools: ["blender"] });
const CORE = [
  freelancer({
    id: "aoi", seed: 11, name: "Aoi Kurosawa", location: "Osaka, JP", headline: "Stylized 3D characters for games, built in Blender",
    category: "3d_character", ts: 1000, jobs: aoiJobs,
    claims: ["blender", "character_design", "stylized_sculpting", "game_character_art", "rigging", "substance_painter", "zbrush", "maya", "unreal", "unity"],
    credentials: [{ skill: "blender", type: "blender_cert", issuer: "Blender Foundation", verified: true }],
    reviews: [{ text: "The rig she built worked perfectly in our engine. Would rehire.", client: "Lumen Games", stars: 5 }, { text: "Nailed the style guide on the first pass.", client: "Kappa Interactive", stars: 5 }],
    projects: [
      { id: "aoi-p1", title: "Cel-shaded anime heroine for mobile RPG", description: "Stylized anime character sculpted and modeled in Blender. Game-ready topology, clean UVs, toon shader. Full character design from concept to engine.", tools: ["blender"], tags: ["character_design", "stylized_sculpting", "game_character_art"], style: { stylized_anime: 0.95, cel_shaded: 0.9 }, difficulty: 0.7, image: chibi({ hair: "#f4a6c7", hair2: "#d97aa6", skin: "#ffe3d6", outfit: "#8f6ad6", outfit2: "#ffffff", eyes: "#6b3fb8", bg: "#fbe4ef", bg2: "#e9dcff", style: "twintails", acc: "staff", turn: 18 }) },
      { id: "aoi-p2", title: "Anime mage companion — rigged game asset", description: "Blender character with rigging and shape keys for a stylized anime game. Hand-painted textures, cel shading, delivered as engine-ready asset.", tools: ["blender"], tags: ["character_design", "rigging", "game_character_art"], style: { stylized_anime: 0.9, cel_shaded: 0.85 }, difficulty: 0.75, image: chibi({ hair: "#9b8cff", hair2: "#6c5ce7", skin: "#ffe6da", outfit: "#2d2a6e", outfit2: "#f5c542", eyes: "#3b2f9e", bg: "#e7e4ff", bg2: "#ffe9f3", style: "long", acc: "witchhat", turn: -20 }) },
      { id: "aoi-p3", title: "Chibi anime mascot for gacha game", description: "Cute stylized anime mascot, Blender sculpt with exaggerated proportions. Toon shader setup, turntable and expression sheets.", tools: ["blender"], tags: ["character_design", "stylized_sculpting"], style: { stylized_anime: 0.92, cel_shaded: 0.8 }, difficulty: 0.55, image: chibi({ hair: "#ffd36e", hair2: "#f2a93b", skin: "#ffe8dc", outfit: "#ff7aa8", outfit2: "#ffffff", eyes: "#d9487c", bg: "#fff1d6", bg2: "#ffe0ec", style: "bun", acc: "catears", turn: 12 }) },
      { id: "aoi-p4", title: "Stylized anime NPC pack (3 characters)", description: "Three game-ready stylized characters in Blender for an indie RPG. Consistent anime style, hand-painted textures, simple rigging for locomotion.", tools: ["blender"], tags: ["character_design", "game_character_art", "rigging"], style: { stylized_anime: 0.88, cel_shaded: 0.75 }, difficulty: 0.7, image: chibi({ hair: "#7fd1c7", hair2: "#3fa597", skin: "#ffe4d8", outfit: "#f06a5b", outfit2: "#2f3b52", eyes: "#237a70", bg: "#dff6f2", bg2: "#fbe7e3", style: "short", acc: "headphones", turn: -8 }) },
      { id: "aoi-p5", title: "Painterly fantasy portrait study", description: "A painterly fantasy character portrait, soft lighting study of a companion character.", tools: [], tags: ["character_design"], style: { painterly: 0.8, stylized_anime: 0.4 }, difficulty: 0.4, image: chibi({ hair: "#c98b5a", hair2: "#8d5a36", skin: "#f6d7c3", outfit: "#5c7a4f", outfit2: "#e9dcc0", eyes: "#4a3524", bg: "#efe2cc", bg2: "#d9c6a5", style: "ponytail", acc: "none", turn: 30, shade: "soft" }) },
    ],
  }),
  freelancer({
    id: "marco", seed: 21, name: "Marco Tedesco", location: "Turin, IT", headline: "Realistic creatures and characters, sculpted in ZBrush",
    category: "3d_character", ts: 2000, jobs: history(21, { casual: 3, competitive: 8, avg: 4.6, value: [600, 3000], category: "3d_character", tools: ["zbrush"] }),
    claims: ["zbrush", "character_design", "realistic_sculpting", "hard_surface"],
    projects: [
      { id: "marco-p1", title: "Realistic warrior bust for cinematics", description: "Photoreal warrior bust sculpted in ZBrush, PBR texturing for cinematic render. Realistic anatomy and armor detail.", tools: ["zbrush"], tags: ["realistic_sculpting", "character_design"], style: { realistic: 0.9 }, difficulty: 0.8, image: clay({ clay: "#b9a58f", bg: "#2a2622", bg2: "#4a4038", horns: false, helmet: true, turn: 25, seed: 1 }) },
      { id: "marco-p2", title: "Creature concept — realistic fantasy beast", description: "Realistic creature sculpt with detailed skin, ZBrush high-poly for film pipeline.", tools: ["zbrush"], tags: ["realistic_sculpting"], style: { realistic: 0.85, painterly: 0.3 }, difficulty: 0.85, image: clay({ clay: "#a8a39a", bg: "#1f2226", bg2: "#3a3f46", horns: true, turn: -30, seed: 2 }) },
      { id: "marco-p3", title: "Historical soldier — realistic uniform study", description: "Realistic soldier with cloth and hard surface accessories. ZBrush and Marvelous Designer workflow.", tools: ["zbrush"], tags: ["realistic_sculpting", "hard_surface"], style: { realistic: 0.88 }, difficulty: 0.7, image: clay({ clay: "#c2b8aa", bg: "#262a2e", bg2: "#40464d", horns: false, helmet: true, turn: 0, seed: 3 }) },
    ],
  }),
  freelancer({
    id: "yui", seed: 31, name: "Yui Sakamoto", location: "Sapporo, JP", headline: "Cozy stylized props and casual game assets in Blender",
    category: "3d_props", ts: 3000, jobs: history(31, { casual: 3, competitive: 2, avg: 4.5, value: [150, 600], category: "3d_props", tools: ["blender"] }),
    claims: ["blender", "stylized_sculpting", "game_character_art"],
    projects: [
      { id: "yui-p1", title: "Cozy farm props pack for mobile game", description: "Stylized cozy props modeled in Blender for a farming game. Soft shapes, warm palette, game-ready meshes.", tools: ["blender"], tags: ["stylized_sculpting", "game_character_art"], style: { cozy: 0.9, stylized_anime: 0.3 }, difficulty: 0.4, image: prop({ type: "mushroom", c1: "#e8573f", c2: "#fff4e0", c3: "#8fbf6a", bg: "#fdf0dc", bg2: "#f6dcc0", turn: 15 }) },
      { id: "yui-p2", title: "Stylized potion set — casual RPG", description: "Blender stylized potion bottles with hand-painted look. Cozy casual game style.", tools: ["blender"], tags: ["stylized_sculpting"], style: { cozy: 0.8, stylized_anime: 0.35 }, difficulty: 0.35, image: prop({ type: "potion", c1: "#8bd3a3", c2: "#f3b35b", c3: "#e56b8a", bg: "#fbeedd", bg2: "#efd8c4", turn: -10 }) },
      { id: "yui-p3", title: "Cozy lantern and crate set", description: "Stylized lantern and props in Blender, warm cozy lighting for a casual game.", tools: ["blender"], tags: ["stylized_sculpting"], style: { cozy: 0.85 }, difficulty: 0.4, image: prop({ type: "lantern", c1: "#f2b84b", c2: "#6e4a33", c3: "#ffe9a8", bg: "#f8ead6", bg2: "#e9cfb2", turn: 20 }) },
    ],
  }),
  freelancer({
    id: "nina", seed: 41, name: "Nina Rosen", location: "Berlin, DE", headline: "Product and web UI designer working in Figma",
    category: "ui_design", ts: 4000, jobs: history(41, { casual: 3, competitive: 6, avg: 4.6, value: [400, 2500], category: "ui_design", tools: ["figma"] }),
    claims: ["figma", "ui_design", "brand_design"],
    credentials: [{ skill: "ui_design", type: "portfolio_review", issuer: "internal", verified: true }],
    projects: [
      { id: "nina-p1", title: "Neon fintech dashboard UI", description: "Dark neon dashboard design in Figma, design system and components for a fintech web app.", tools: ["figma"], tags: ["ui_design"], style: { neon: 0.9, minimal: 0.3 }, difficulty: 0.6, image: ui({ variant: 0, layout: "dashboard", bg: "#0f0c24", surface: "#1a1640", ink: "#e9e6ff", accent: "#00e5ff", accent2: "#ff2bb3", title: "Ledgerline" }) },
      { id: "nina-p2", title: "Minimal landing page for SaaS", description: "Clean minimal landing page in Figma with brand guidelines. Web design for SaaS product.", tools: ["figma"], tags: ["ui_design", "brand_design"], style: { minimal: 0.9 }, difficulty: 0.45, image: ui({ variant: 0, layout: "landing", bg: "#f4f4f2", surface: "#ffffff", ink: "#18181b", accent: "#4f46e5", accent2: "#a5b4fc", title: "Quiet CRM" }) },
      { id: "nina-p3", title: "Banking app design system", description: "Mobile UI design system in Figma: components, tokens and dashboard screens for a bank app.", tools: ["figma"], tags: ["ui_design"], style: { minimal: 0.7, neon: 0.2 }, difficulty: 0.65, image: ui({ variant: 2, layout: "mobile", bg: "#eef1f6", surface: "#ffffff", ink: "#0e1b33", accent: "#1f6feb", accent2: "#7cc4ff", title: "Kite Bank" }) },
    ],
  }),
  freelancer({
    id: "dan", seed: 51, name: "Dan Porter", location: "Leeds, UK", headline: "Game narrative and marketing copywriter",
    category: "copywriting", ts: 5000, jobs: history(51, { casual: 2, avg: 4.8, value: [150, 500], category: "copywriting" }),
    claims: ["copywriting", "brand_design"],
    reviews: [{ text: "Great copy, rehired for the second batch of quests.", client: "Fable Forge", stars: 5 }],
    projects: [
      { id: "dan-p1", title: "Steam page copy for indie RPG", description: "Marketing copy and store description for an indie RPG launch. Punchy game copywriting.", tools: [], tags: ["copywriting"], style: {}, difficulty: 0.35, image: copy({ kicker: "Steam store page", headline: "The dungeon remembers you.", body: "Every run rewrites the map. Every death teaches the dungeon something about you — and it never forgets.", bg: "#161616", ink: "#f2efe6", accent: "#e0a526", font: "serif" }) },
      { id: "dan-p2", title: "In-game quest dialogue pack", description: "Quest writing and dialogue for a fantasy game. Narrative design and copywriting.", tools: [], tags: ["copywriting"], style: {}, difficulty: 0.45, image: copy({ kicker: "Quest: The Salt Road", headline: "“You carry the lantern. I carry the debt.”", body: "Branching dialogue for a merchant companion: 40 lines, three endings, one lie she never admits.", bg: "#efe6d4", ink: "#2a2118", accent: "#8a3b1e", font: "serif" }) },
    ],
  }),
  freelancer({
    id: "max", seed: 61, name: "Max Skillsman", location: "—", headline: "Expert in everything — 25 skills, trust me",
    category: "3d_character", ts: 6000, jobs: [],
    claims: ["blender", "maya", "zbrush", "character_design", "stylized_sculpting", "realistic_sculpting", "game_character_art", "hard_surface", "rigging", "ui_design", "brand_design", "copywriting", "figma", "substance_painter", "unreal", "unity", "motion_graphics", "vfx", "illustration", "concept_art", "logo_design", "3ds_max", "houdini", "after_effects", "seo"],
    projects: [
      { id: "max-p1", title: "3d model work sample", description: "I do 3d model work and design work. Good quality fast cheap.", tools: [], tags: ["blender", "maya", "zbrush", "character_design", "rigging", "game_character_art"], style: { realistic: 0.2 }, difficulty: 0.2, image: clay({ clay: "#9a9a9a", bg: "#d9d9d9", bg2: "#c4c4c4", horns: false, turn: 0, seed: 9, lowpoly: true }) },
    ],
  }),
  freelancer({
    id: "king", seed: 71, name: "Sketch King", location: "—", headline: "Top anime character artist (portfolio inside)",
    category: "3d_character", ts: 9000, jobs: [],
    claims: ["blender", "character_design", "stylized_sculpting", "game_character_art"],
    projects: [
      { id: "king-p1", title: "Cel-shaded anime heroine for mobile RPG", description: "Stylized anime character sculpted and modeled in Blender. Game-ready topology, clean UVs, toon shader. Full character design concept to engine!!", tools: ["blender"], tags: ["character_design", "stylized_sculpting", "game_character_art"], style: { stylized_anime: 0.95, cel_shaded: 0.9 }, difficulty: 0.7, image: { kind: "derived", from: "aoi-p1", hue: 150, bright: 0.06 } },
      { id: "king-p2", title: "Anime mage companion — rigged game asset", description: "Blender character with rigging and shape keys for a stylized anime game. Hand painted textures, cel shading, delivered as engine ready asset.", tools: ["blender"], tags: ["character_design", "rigging"], style: { stylized_anime: 0.9, cel_shaded: 0.85 }, difficulty: 0.7, image: { kind: "derived", from: "aoi-p2", hue: 150, bright: 0.06 } },
      { id: "king-p3", title: "Chibi anime mascot for gacha game", description: "Cute stylized anime mascot, Blender sculpt with exaggerated proportions. Toon shader setup, turntable and expression sheets!!", tools: ["blender"], tags: ["character_design", "stylized_sculpting"], style: { stylized_anime: 0.92, cel_shaded: 0.8 }, difficulty: 0.55, image: { kind: "derived", from: "aoi-p3", hue: 150, bright: 0.06 } },
    ],
  }),
  freelancer({
    id: "vera", seed: 81, name: "Vera Lindqvist", location: "Gothenburg, SE", headline: "New here — stylized Blender characters, source files on request",
    category: "3d_character", ts: 12000, jobs: [],
    claims: ["blender", "character_design", "stylized_sculpting", "game_character_art"],
    credentials: [{ skill: "game_character_art", type: "source_files", issuer: "manual_review", verified: true, note: "3/3 .blend files open and match renders" }],
    projects: [
      { id: "vera-p1", title: "Stylized anime elf ranger — game ready", description: "Anime-style elf ranger built in Blender. Toon shading, game-ready low poly with clean topology. Wireframes and .blend source on request.", tools: ["blender"], tags: ["character_design", "stylized_sculpting", "game_character_art"], style: { stylized_anime: 0.9, cel_shaded: 0.8 }, difficulty: 0.7, image: chibi({ hair: "#e8e1c9", hair2: "#b9ad84", skin: "#ffe1d2", outfit: "#3f7d4e", outfit2: "#a4d17a", eyes: "#2f6b3c", bg: "#e6f3de", bg2: "#f6efd8", style: "long", acc: "elfears", turn: -16 }) },
      { id: "vera-p2", title: "Anime knight — stylized Blender character", description: "Stylized anime knight character in Blender with cel shading. Clean model, verified source files available.", tools: ["blender"], tags: ["character_design", "game_character_art"], style: { stylized_anime: 0.85, cel_shaded: 0.75 }, difficulty: 0.65, image: chibi({ hair: "#3b4a6b", hair2: "#232c42", skin: "#ffe0cf", outfit: "#c9ced8", outfit2: "#c0392b", eyes: "#2b4a8f", bg: "#e3e8f2", bg2: "#f2e6e6", style: "short", acc: "helmet", turn: 22 }) },
      { id: "vera-p3", title: "Stylized anime idol — mobile game character", description: "Anime idol character with cel shader, Blender pipeline. Stylized character design for mobile game.", tools: ["blender"], tags: ["character_design", "stylized_sculpting"], style: { stylized_anime: 0.93, cel_shaded: 0.85 }, difficulty: 0.6, image: chibi({ hair: "#ff8fb3", hair2: "#e05c8a", skin: "#ffe6db", outfit: "#ffffff", outfit2: "#ff5c9a", eyes: "#c2185b", bg: "#ffe5ef", bg2: "#e5f0ff", style: "twintails", acc: "headphones", turn: -6 }) },
    ],
  }),
  freelancer({
    id: "rin", seed: 91, name: "Rin Matsuda", location: "Nagoya, JP", headline: "Anime character artist — 5 finished projects",
    category: "3d_character", ts: 8000, jobs: history(91, { casual: 1, avg: 4.2, value: [100, 200], category: "3d_character", tools: ["blender"] }),
    claims: ["blender", "character_design", "stylized_sculpting", "game_character_art"],
    projects: [1, 2, 3, 4, 5].map((n) => ({
      id: `rin-p${n}`, title: `Anime girl character render v${n} — Blender`, description: "Stylized anime girl character in Blender, cel shaded render. Alternate angle and lighting of the same model.",
      tools: ["blender"], tags: ["character_design", "stylized_sculpting", "game_character_art"], style: { stylized_anime: 0.85, cel_shaded: 0.8 }, difficulty: 0.5,
      image: chibi({ hair: "#6aa9ff", hair2: "#3b73d1", skin: "#ffe4d6", outfit: "#ffffff", outfit2: "#3b73d1", eyes: "#2553a8", bg: "#e4eeff", bg2: "#f3e9ff", style: "short", acc: "none", turn: [0, 3, -3, 2, -2][n - 1], light: n }),
    })),
  }),
];

// ---------------------------------------------------------------- the ladder population

const L = (id, seed, name, location, headline, category, jobsCfg, claims, projects, extra = {}) =>
  freelancer({ id, seed, name, location, headline, category, ts: 1500 + seed * 10, jobs: history(seed, { category, ...jobsCfg }), claims, projects, ...extra });

const LADDER = [
  // stylized characters
  L("kenta", 101, "Kenta Mori", "Tokyo, JP", "Lead-quality stylized characters, rigged and game-ready", "3d_character", { casual: 5, competitive: 30, avg: 4.9, spread: 0.2, value: [800, 4000], tools: ["blender"] }, ["blender", "character_design", "rigging", "game_character_art", "stylized_sculpting"], [
    { id: "kenta-p1", title: "Sky pirate captain — hero character", description: "Stylized anime hero character in Blender for a console game. Game-ready topology, full facial rig, cel shaded.", tools: ["blender"], tags: ["character_design", "rigging"], style: { stylized_anime: 0.9, cel_shaded: 0.9 }, difficulty: 0.9, image: chibi({ hair: "#e84a5f", hair2: "#a82c3f", skin: "#ffe0cf", outfit: "#243b55", outfit2: "#f6c453", eyes: "#8a1c2b", bg: "#fde2e2", bg2: "#dde8f7", style: "short", acc: "pirate", turn: 20 }) },
    { id: "kenta-p2", title: "Shrine maiden — rigged anime character", description: "Anime character in Blender with rigging, cloth sim ready, game-ready for Unity.", tools: ["blender"], tags: ["character_design", "rigging", "game_character_art"], style: { stylized_anime: 0.92, cel_shaded: 0.85 }, difficulty: 0.85, image: chibi({ hair: "#1d1d2c", hair2: "#3a3a5c", skin: "#fff0e6", outfit: "#ffffff", outfit2: "#d7263d", eyes: "#b3202f", bg: "#fff3ea", bg2: "#ffe0e3", style: "long", acc: "ribbon", turn: -14 }) },
    { id: "kenta-p3", title: "Robot sidekick — stylized game character", description: "Stylized character design, hard surface robot companion modeled in Blender, rigged for engine.", tools: ["blender"], tags: ["character_design", "rigging"], style: { stylized_anime: 0.7, cel_shaded: 0.8 }, difficulty: 0.8, image: chibi({ hair: "#f0f3f7", hair2: "#b8c2cf", skin: "#dfe6ee", outfit: "#ff9f1c", outfit2: "#2ec4b6", eyes: "#2ec4b6", bg: "#e8f6f5", bg2: "#fff1e0", style: "robot", acc: "antenna", turn: 28 }) },
  ]),
  L("mira", 111, "Mira Santos", "Lisbon, PT", "Anime characters and VTuber models", "3d_character", { casual: 4, competitive: 16, avg: 4.7, value: [400, 2000], tools: ["blender"] }, ["blender", "character_design", "rigging", "stylized_sculpting"], [
    { id: "mira-p1", title: "VTuber model — fox girl", description: "Stylized anime VTuber character in Blender with face rigging and shape keys, toon shading.", tools: ["blender"], tags: ["character_design", "rigging"], style: { stylized_anime: 0.95, cel_shaded: 0.85 }, difficulty: 0.75, image: chibi({ hair: "#ff9a4d", hair2: "#d9642a", skin: "#ffe7da", outfit: "#2b2d42", outfit2: "#ffd6a5", eyes: "#d9642a", bg: "#fff0e2", bg2: "#e9e4ff", style: "long", acc: "foxears", turn: 10 }) },
    { id: "mira-p2", title: "Idol duo — stylized anime characters", description: "Two stylized anime characters sculpted in Blender, cel shaded, for a rhythm game.", tools: ["blender"], tags: ["character_design", "stylized_sculpting"], style: { stylized_anime: 0.93, cel_shaded: 0.8 }, difficulty: 0.65, image: chibi({ hair: "#c3f0ff", hair2: "#77c6e6", skin: "#ffe8dd", outfit: "#6c63ff", outfit2: "#ffffff", eyes: "#3f51b5", bg: "#e7f7ff", bg2: "#efe8ff", style: "twintails", acc: "star", turn: -18 }) },
    { id: "mira-p3", title: "Chibi merch figures", description: "Chibi anime character sculpts in Blender for print and game use.", tools: ["blender"], tags: ["character_design", "stylized_sculpting"], style: { stylized_anime: 0.9, cozy: 0.3 }, difficulty: 0.5, image: chibi({ hair: "#8e6c5a", hair2: "#5e4337", skin: "#ffe1d0", outfit: "#f7b2bd", outfit2: "#ffffff", eyes: "#5e4337", bg: "#fdeef0", bg2: "#f5f0e6", style: "bun", acc: "none", turn: 6 }) },
  ]),
  L("lucas", 121, "Lucas Brandt", "Hamburg, DE", "Stylized characters for indie games", "3d_character", { casual: 3, competitive: 5, avg: 4.3, spread: 0.6, value: [200, 700], tools: ["blender"] }, ["blender", "character_design", "stylized_sculpting"], [
    { id: "lucas-p1", title: "Goblin merchant — stylized character", description: "Stylized character sculpted in Blender for an indie game, hand-painted textures.", tools: ["blender"], tags: ["character_design", "stylized_sculpting"], style: { stylized_anime: 0.6, cozy: 0.4 }, difficulty: 0.5, image: chibi({ hair: "#6b8f3a", hair2: "#4c6a26", skin: "#9fcf6e", outfit: "#7b4b2a", outfit2: "#e3c16f", eyes: "#2d3a14", bg: "#eef4dc", bg2: "#f5ead7", style: "short", acc: "hood", turn: -24 }) },
    { id: "lucas-p2", title: "Knight squire — game character", description: "Stylized knight character in Blender, game-ready low poly.", tools: ["blender"], tags: ["character_design"], style: { stylized_anime: 0.65 }, difficulty: 0.45, image: chibi({ hair: "#d9a441", hair2: "#a87a22", skin: "#ffe0cf", outfit: "#8d99ae", outfit2: "#2b2d42", eyes: "#3d5a80", bg: "#e8edf4", bg2: "#f4efe3", style: "short", acc: "none", turn: 16 }) },
    { id: "lucas-p3", title: "Witch apprentice", description: "Stylized anime witch character in Blender with cel shading.", tools: ["blender"], tags: ["character_design"], style: { stylized_anime: 0.8, cel_shaded: 0.6 }, difficulty: 0.5, image: chibi({ hair: "#2e2440", hair2: "#4b3a6b", skin: "#ffe6da", outfit: "#4b3a6b", outfit2: "#b8e986", eyes: "#6aa84f", bg: "#ecebf7", bg2: "#eaf6e3", style: "long", acc: "witchhat", turn: -10 }) },
  ]),
  L("noor", 131, "Noor Aziz", "Kuala Lumpur, MY", "Cute anime characters, first year freelancing", "3d_character", { casual: 1, avg: 4.5, value: [80, 200], tools: ["blender"] }, ["blender", "character_design"], [
    { id: "noor-p1", title: "Bunny girl mascot", description: "Cute anime mascot character in Blender, toon shaded.", tools: ["blender"], tags: ["character_design"], style: { stylized_anime: 0.85, cozy: 0.4 }, difficulty: 0.4, image: chibi({ hair: "#fff4f7", hair2: "#f3c6d4", skin: "#ffe9e0", outfit: "#ffb3c7", outfit2: "#ffffff", eyes: "#e85d8a", bg: "#fff0f5", bg2: "#f0f7ff", style: "bun", acc: "bunnyears", turn: 8 }) },
    { id: "noor-p2", title: "Cafe waiter NPC", description: "Stylized anime NPC character in Blender for a cafe sim game.", tools: ["blender"], tags: ["character_design"], style: { stylized_anime: 0.8, cozy: 0.5 }, difficulty: 0.4, image: chibi({ hair: "#5b3a29", hair2: "#3b251a", skin: "#f3cfb3", outfit: "#1f1f1f", outfit2: "#ffffff", eyes: "#3b251a", bg: "#f7eee6", bg2: "#e9f1ea", style: "ponytail", acc: "none", turn: -12 }) },
  ]),
  // realistic characters
  L("ivan", 141, "Ivan Petrov", "Belgrade, RS", "Realistic creatures for film and AAA games", "3d_character", { casual: 4, competitive: 26, avg: 4.85, spread: 0.25, value: [1500, 6000], tools: ["zbrush"] }, ["zbrush", "realistic_sculpting", "character_design", "hard_surface"], [
    { id: "ivan-p1", title: "Horned demon — realistic creature bust", description: "Realistic creature sculpt in ZBrush, high-poly skin detail and PBR texturing for film.", tools: ["zbrush"], tags: ["realistic_sculpting"], style: { realistic: 0.95 }, difficulty: 0.95, image: clay({ clay: "#8c6f5e", bg: "#141414", bg2: "#3b2a22", horns: true, turn: 32, seed: 21 }) },
    { id: "ivan-p2", title: "Old sea captain — realistic character", description: "Realistic character bust sculpted in ZBrush, cinematic lighting.", tools: ["zbrush"], tags: ["realistic_sculpting", "character_design"], style: { realistic: 0.95 }, difficulty: 0.9, image: clay({ clay: "#b8a48c", bg: "#1a1d21", bg2: "#35404a", horns: false, beard: true, turn: -22, seed: 22 }) },
    { id: "ivan-p3", title: "Armored orc — hard surface and anatomy", description: "Realistic orc with hard surface armor, ZBrush sculpt for a AAA game.", tools: ["zbrush"], tags: ["realistic_sculpting", "hard_surface"], style: { realistic: 0.9 }, difficulty: 0.9, image: clay({ clay: "#7f8a6a", bg: "#1b1f18", bg2: "#39402f", horns: false, helmet: true, turn: 12, seed: 23 }) },
  ]),
  L("sofia", 151, "Sofia Reyes", "Guadalajara, MX", "Realistic portrait sculpts", "3d_character", { casual: 3, competitive: 3, avg: 4.1, spread: 0.7, value: [150, 600], tools: ["zbrush"], lateRate: 0.3 }, ["zbrush", "realistic_sculpting"], [
    { id: "sofia-p1", title: "Portrait study — realistic sculpt", description: "Realistic portrait sculpt in ZBrush, likeness study.", tools: ["zbrush"], tags: ["realistic_sculpting"], style: { realistic: 0.85 }, difficulty: 0.55, image: clay({ clay: "#c9b6a2", bg: "#2b2b2b", bg2: "#454545", horns: false, turn: -8, seed: 31 }) },
    { id: "sofia-p2", title: "Elder character bust", description: "Realistic elder character bust sculpted in ZBrush.", tools: ["zbrush"], tags: ["realistic_sculpting"], style: { realistic: 0.85 }, difficulty: 0.5, image: clay({ clay: "#b7aa9c", bg: "#26221f", bg2: "#403933", horns: false, beard: true, turn: 18, seed: 32 }) },
    { id: "sofia-p3", title: "Stone gargoyle sculpt", description: "Realistic stone gargoyle creature sculpt in ZBrush.", tools: ["zbrush"], tags: ["realistic_sculpting"], style: { realistic: 0.8 }, difficulty: 0.55, image: clay({ clay: "#9d9d98", bg: "#202225", bg2: "#3a3d42", horns: true, turn: -26, seed: 33 }) },
  ]),
  // props
  L("theo", 161, "Theo Walsh", "Dublin, IE", "Stylized props and environments for top mobile games", "3d_props", { casual: 4, competitive: 24, avg: 4.85, spread: 0.25, value: [500, 3000], tools: ["blender"] }, ["blender", "prop_art", "stylized_sculpting"], [
    { id: "theo-p1", title: "Treasure chest set — stylized props", description: "Stylized props pack in Blender: treasure chests, game-ready with hand-painted textures.", tools: ["blender"], tags: ["prop_art", "stylized_sculpting"], style: { cozy: 0.6, stylized_anime: 0.4 }, difficulty: 0.75, image: prop({ type: "chest", c1: "#8b5a2b", c2: "#f2c14e", c3: "#5ac8fa", bg: "#e8f1f8", bg2: "#f9ecd9", turn: 24 }) },
    { id: "theo-p2", title: "Crystal cave props", description: "Stylized crystal props in Blender for a mobile RPG, game-ready meshes and toon shading.", tools: ["blender"], tags: ["prop_art", "stylized_sculpting"], style: { stylized_anime: 0.5, neon: 0.3 }, difficulty: 0.7, image: prop({ type: "crystal", c1: "#7b5cff", c2: "#39d5ff", c3: "#3a3150", bg: "#ecebff", bg2: "#e3f7ff", turn: -12 }) },
    { id: "theo-p3", title: "Alchemy table props", description: "Stylized potion props and alchemy set modeled in Blender, game-ready.", tools: ["blender"], tags: ["prop_art"], style: { cozy: 0.7 }, difficulty: 0.65, image: prop({ type: "potion", c1: "#ff6b6b", c2: "#4ecdc4", c3: "#ffe66d", bg: "#f5efe6", bg2: "#e6eef5", turn: 30 }) },
  ]),
  L("ploy", 171, "Ploy Chaiyaporn", "Chiang Mai, TH", "Cozy stylized props for casual games", "3d_props", { casual: 3, competitive: 11, avg: 4.7, value: [200, 1200], tools: ["blender"] }, ["blender", "prop_art", "stylized_sculpting"], [
    { id: "ploy-p1", title: "Mushroom village props", description: "Cozy stylized mushroom props in Blender for a farming game, game-ready.", tools: ["blender"], tags: ["prop_art", "stylized_sculpting"], style: { cozy: 0.9 }, difficulty: 0.55, image: prop({ type: "mushroom", c1: "#b388eb", c2: "#fff7e8", c3: "#7ed957", bg: "#f3ecff", bg2: "#fdf3e1", turn: -18 }) },
    { id: "ploy-p2", title: "Tea shop lantern set", description: "Stylized cozy lantern props modeled in Blender, warm palette.", tools: ["blender"], tags: ["prop_art"], style: { cozy: 0.85 }, difficulty: 0.5, image: prop({ type: "lantern", c1: "#e63946", c2: "#3d2b1f", c3: "#ffd166", bg: "#fdebe3", bg2: "#f3e2cf", turn: 10 }) },
    { id: "ploy-p3", title: "Potion shop shelf", description: "Stylized potion bottles in Blender, cozy casual game props.", tools: ["blender"], tags: ["prop_art", "stylized_sculpting"], style: { cozy: 0.8 }, difficulty: 0.5, image: prop({ type: "potion", c1: "#c77dff", c2: "#80ed99", c3: "#ffadad", bg: "#f7eefc", bg2: "#ecf8ef", turn: -26 }) },
  ]),
  L("jun", 181, "Jun Hayashi", "Fukuoka, JP", "Stylized props, learning environments", "3d_props", { casual: 2, avg: 4.4, value: [60, 180], tools: ["blender"] }, ["blender", "prop_art"], [
    { id: "jun-p1", title: "Crystal pickups", description: "Stylized crystal props in Blender for a platformer.", tools: ["blender"], tags: ["prop_art"], style: { stylized_anime: 0.4, neon: 0.4 }, difficulty: 0.35, image: prop({ type: "crystal", c1: "#ff5d8f", c2: "#ffd6e0", c3: "#2d1e2f", bg: "#fff0f4", bg2: "#f0ecff", turn: 14 }) },
    { id: "jun-p2", title: "Wooden chest", description: "Stylized chest prop in Blender.", tools: ["blender"], tags: ["prop_art"], style: { cozy: 0.5 }, difficulty: 0.35, image: prop({ type: "chest", c1: "#a0522d", c2: "#c0c0c0", c3: "#ff4d4d", bg: "#f4ede4", bg2: "#e5ecf2", turn: -20 }) },
  ]),
  // UI
  L("hana", 191, "Hana Kim", "Seoul, KR", "Design systems for fintech and health apps", "ui_design", { casual: 4, competitive: 28, avg: 4.9, spread: 0.2, value: [1500, 8000], tools: ["figma"] }, ["figma", "ui_design", "brand_design"], [
    { id: "hana-p1", title: "Health tracking app — design system", description: "Mobile UI design system in Figma with components, tokens and dashboard screens.", tools: ["figma"], tags: ["ui_design"], style: { minimal: 0.8 }, difficulty: 0.85, image: ui({ variant: 0, layout: "mobile", bg: "#f2f7f4", surface: "#ffffff", ink: "#0f2419", accent: "#16a34a", accent2: "#bbf7d0", title: "Pulse" }) },
    { id: "hana-p2", title: "Payments dashboard", description: "Fintech dashboard UI in Figma, design system and data visualization components.", tools: ["figma"], tags: ["ui_design"], style: { minimal: 0.6, neon: 0.3 }, difficulty: 0.9, image: ui({ variant: 2, layout: "dashboard", bg: "#0b1220", surface: "#131c2e", ink: "#e6edf7", accent: "#7c5cff", accent2: "#22d3ee", title: "Remit" }) },
    { id: "hana-p3", title: "Clinic booking landing page", description: "Landing page web design in Figma for a clinic network, brand and UI.", tools: ["figma"], tags: ["ui_design", "brand_design"], style: { minimal: 0.8 }, difficulty: 0.7, image: ui({ variant: 2, layout: "landing", bg: "#fbf7f2", surface: "#ffffff", ink: "#1c1917", accent: "#0f766e", accent2: "#99f6e4", title: "Clearwell" }) },
  ]),
  L("arun", 201, "Arun Tan", "Singapore, SG", "SaaS dashboards and web apps", "ui_design", { casual: 3, competitive: 14, avg: 4.7, value: [600, 3000], tools: ["figma"] }, ["figma", "ui_design"], [
    { id: "arun-p1", title: "Analytics dashboard for SaaS", description: "Dashboard UI design in Figma with components for an analytics web app.", tools: ["figma"], tags: ["ui_design"], style: { minimal: 0.7 }, difficulty: 0.7, image: ui({ variant: 1, layout: "dashboard", bg: "#f6f7f9", surface: "#ffffff", ink: "#111827", accent: "#f97316", accent2: "#fed7aa", title: "Metricly" }) },
    { id: "arun-p2", title: "Travel booking app", description: "Mobile UI design in Figma for a travel booking app.", tools: ["figma"], tags: ["ui_design"], style: { minimal: 0.6, cozy: 0.3 }, difficulty: 0.6, image: ui({ variant: 1, layout: "mobile", bg: "#fff8ef", surface: "#ffffff", ink: "#1f2937", accent: "#e11d48", accent2: "#fecdd3", title: "Roam" }) },
    { id: "arun-p3", title: "Dev tool landing page", description: "Dark landing page web design in Figma for a developer tool.", tools: ["figma"], tags: ["ui_design"], style: { neon: 0.6, minimal: 0.5 }, difficulty: 0.6, image: ui({ variant: 1, layout: "landing", bg: "#0a0a0a", surface: "#171717", ink: "#fafafa", accent: "#a3e635", accent2: "#365314", title: "Shipyard" }) },
  ]),
  L("bea", 211, "Beatriz Lima", "Recife, BR", "UI designer, fresh portfolio", "ui_design", { casual: 1, avg: 4.6, value: [100, 300], tools: ["figma"] }, ["figma", "ui_design"], [
    { id: "bea-p1", title: "Recipe app concept", description: "Mobile UI design in Figma for a recipe app.", tools: ["figma"], tags: ["ui_design"], style: { cozy: 0.6, minimal: 0.4 }, difficulty: 0.4, image: ui({ variant: 3, layout: "mobile", bg: "#fff6e9", surface: "#ffffff", ink: "#3b2410", accent: "#ea580c", accent2: "#fed7aa", title: "Panela" }) },
    { id: "bea-p2", title: "Bookshop landing page", description: "Landing page web design in Figma for an independent bookshop.", tools: ["figma"], tags: ["ui_design"], style: { minimal: 0.7 }, difficulty: 0.4, image: ui({ variant: 3, layout: "landing", bg: "#f3efe7", surface: "#fffdf8", ink: "#1e293b", accent: "#1e3a8a", accent2: "#bfdbfe", title: "Marginalia" }) },
  ]),
  // brand
  L("oskar", 221, "Oskar Vik", "Oslo, NO", "Brand identities for studios and small makers", "brand_design", { casual: 3, competitive: 12, avg: 4.7, value: [800, 4000], tools: ["figma"] }, ["brand_design", "figma"], [
    { id: "oskar-p1", title: "Coffee roaster brand identity", description: "Brand identity: logo, brand guidelines and packaging for a coffee roaster.", tools: ["figma"], tags: ["brand_design"], style: { minimal: 0.7, cozy: 0.3 }, difficulty: 0.7, image: brand({ variant: 0, name: "Kiln", mark: "arch", bg: "#f1e7da", ink: "#2b1d14", accent: "#c2410c", accent2: "#fcd9b6" }) },
    { id: "oskar-p2", title: "Game studio rebrand", description: "Brand design and logo system for an indie game studio.", tools: ["figma"], tags: ["brand_design"], style: { minimal: 0.6, neon: 0.3 }, difficulty: 0.75, image: brand({ variant: 2, name: "Fable Forge", mark: "anvil", bg: "#111827", ink: "#f9fafb", accent: "#f59e0b", accent2: "#374151" }) },
    { id: "oskar-p3", title: "Outdoor gear brand", description: "Logo and brand guidelines for an outdoor gear company.", tools: ["figma"], tags: ["brand_design"], style: { minimal: 0.8 }, difficulty: 0.65, image: brand({ variant: 4, name: "Atlas", mark: "peak", bg: "#e7efe9", ink: "#12261b", accent: "#15803d", accent2: "#bbf7d0" }) },
  ]),
  L("lin", 231, "Lin Mei", "Taipei, TW", "Logos and brand kits for startups", "brand_design", { casual: 3, competitive: 4, avg: 4.4, spread: 0.5, value: [200, 900] }, ["brand_design", "logo_design"], [
    { id: "lin-p1", title: "Bubble tea brand", description: "Logo and brand identity for a bubble tea shop.", tools: [], tags: ["brand_design"], style: { cozy: 0.7 }, difficulty: 0.45, image: brand({ variant: 1, name: "Pearl", mark: "circle", bg: "#fdf2f8", ink: "#3b0a24", accent: "#db2777", accent2: "#fbcfe8" }) },
    { id: "lin-p2", title: "AI startup logo", description: "Logo design and brand kit for an AI startup.", tools: [], tags: ["brand_design"], style: { minimal: 0.8 }, difficulty: 0.45, image: brand({ variant: 3, name: "Starboard", mark: "star", bg: "#eef2ff", ink: "#1e1b4b", accent: "#4f46e5", accent2: "#c7d2fe" }) },
    { id: "lin-p3", title: "Bakery wordmark", description: "Brand wordmark and packaging for a neighbourhood bakery.", tools: [], tags: ["brand_design"], style: { cozy: 0.8 }, difficulty: 0.4, image: brand({ variant: 5, name: "Crumb", mark: "arch", bg: "#fff7ed", ink: "#431407", accent: "#b45309", accent2: "#fde68a" }) },
  ]),
  // copy
  L("maya", 241, "Maya Jensen", "Copenhagen, DK", "Conversion copy and brand voice for games and apps", "copywriting", { casual: 4, competitive: 22, avg: 4.85, spread: 0.25, value: [400, 2500] }, ["copywriting", "brand_design"], [
    { id: "maya-p1", title: "Launch trailer script and store copy", description: "Game marketing copywriting: trailer script and store page description.", tools: [], tags: ["copywriting"], style: {}, difficulty: 0.8, image: copy({ kicker: "Launch trailer, 0:42", headline: "Nine lives. One shot left.", body: "A cat-burglar roguelike where every heist costs a life — and the last one is the one you remember.", bg: "#0b1f3a", ink: "#f4f1ea", accent: "#ffb703", font: "sans" }) },
    { id: "maya-p2", title: "App onboarding copy", description: "UX writing and copywriting for a fintech app onboarding flow.", tools: [], tags: ["copywriting"], style: {}, difficulty: 0.7, image: copy({ kicker: "Onboarding, screen 1 of 4", headline: "Your money, finally quiet.", body: "No streaks, no confetti. Just where it went, and what is left for Friday.", bg: "#f1f5f2", ink: "#10231a", accent: "#15803d", font: "sans" }) },
    { id: "maya-p3", title: "Brand voice guide", description: "Brand voice guidelines and copywriting examples for a coffee company.", tools: [], tags: ["copywriting", "brand_design"], style: {}, difficulty: 0.75, image: copy({ kicker: "Voice guide, p.3", headline: "We say “good morning,” not “rise and grind.”", body: "Warm, plain, a little dry. We never shout, and we never pretend coffee is a personality.", bg: "#f4ece1", ink: "#2b1a10", accent: "#9a3412", font: "serif" }) },
  ]),
  L("tom", 251, "Tom Ellis", "Bristol, UK", "Blog and product copywriter", "copywriting", { casual: 3, competitive: 3, avg: 4.0, spread: 0.6, value: [100, 400], lateRate: 0.25 }, ["copywriting", "seo"], [
    { id: "tom-p1", title: "Product descriptions for outdoor shop", description: "E-commerce copywriting for an outdoor gear store.", tools: [], tags: ["copywriting"], style: {}, difficulty: 0.35, image: copy({ kicker: "Product page", headline: "The tent that sets up before the rain does.", body: "Four minutes, one person, no instructions. We timed it in a car park in Wales.", bg: "#e9efe6", ink: "#1d2b1a", accent: "#4d7c0f", font: "sans" }) },
    { id: "tom-p2", title: "SaaS blog series", description: "Long-form blog copywriting series for a SaaS company.", tools: [], tags: ["copywriting"], style: {}, difficulty: 0.4, image: copy({ kicker: "Blog, part 2 of 5", headline: "Stop measuring meetings.", body: "The hour you saved is not the metric. The decision you made in it is.", bg: "#ffffff", ink: "#111827", accent: "#2563eb", font: "serif" }) },
  ]),
  L("pim", 261, "Pim Srisuk", "Bangkok, TH", "Thai and English copy for cafes and lifestyle brands", "copywriting", { casual: 2, avg: 4.7, value: [60, 250] }, ["copywriting"], [
    { id: "pim-p1", title: "Cafe menu copy (TH/EN)", description: "Bilingual menu copywriting for a Bangkok cafe.", tools: [], tags: ["copywriting"], style: {}, difficulty: 0.4, image: copy({ kicker: "Menu, Kiln Coffee", headline: "Slow bar. Fast friends.", body: "กาแฟดริปที่ใจเย็นพอจะรอคุณ — pour-over that waits for you.", bg: "#f6efe4", ink: "#2d1b10", accent: "#b45309", font: "serif" }) },
    { id: "pim-p2", title: "Instagram captions for a skincare brand", description: "Social copywriting and captions for a skincare launch.", tools: [], tags: ["copywriting"], style: {}, difficulty: 0.35, image: copy({ kicker: "Launch captions", headline: "Less routine. More you.", body: "Three steps, no filters. Your skin already knows what it is doing.", bg: "#fdf2f4", ink: "#3f0d1c", accent: "#be185d", font: "sans" }) },
  ]),
];

// The client's side of the demo: reference images a client might upload. Not in anyone's portfolio.
export const REFERENCE_IMAGES = {
  anime: { label: "Stylized anime character", image: chibi({ hair: "#b98cff", hair2: "#8a5ad6", skin: "#ffe5d9", outfit: "#ff8fb8", outfit2: "#ffffff", eyes: "#7a3fd1", bg: "#f6e6ff", bg2: "#ffe6f0", style: "twintails", acc: "catears", turn: 14 }) },
  realistic: { label: "Realistic creature", image: clay({ clay: "#a39584", bg: "#1c1c1f", bg2: "#383840", horns: true, turn: 20, seed: 41 }) },
  neon: { label: "Dark neon dashboard", image: ui({ layout: "dashboard", bg: "#10091f", surface: "#1d1238", ink: "#f1eaff", accent: "#ff3ea5", accent2: "#27e0ff", title: "Nightdesk" }) },
  cozy: { label: "Cozy game prop", image: prop({ type: "mushroom", c1: "#f08a4b", c2: "#fff3dc", c3: "#9ccf6b", bg: "#fdf1dd", bg2: "#f3dcc2", turn: -8 }) },
};

export const CORPUS = [...CORE, ...LADDER];

// Images the eval's attack simulations use (rendered and fingerprinted like the
// rest, but never part of the marketplace): a second thief's laundered copies of
// nina's work, and six unique renders for the "established veterans" in the
// cold-start test.
export const ATTACK_FIXTURES = [
  { id: "fx-nox-p1", kind: "derived", from: "nina-p1", hue: 100, bright: 0.1 },
  { id: "fx-nox-p2", kind: "derived", from: "nina-p2", hue: 200, bright: -0.06 },
  ...[
    ["#f25f5c", "#247ba0", "long"], ["#70c1b3", "#50514f", "short"], ["#ffe066", "#6c5ce7", "twintails"],
    ["#b8f2e6", "#5e6472", "bun"], ["#ffa69e", "#355070", "ponytail"], ["#aed9e0", "#6d597a", "long"],
  ].map(([hair, outfit, style], i) => ({
    id: `fx-vet-${i}`, kind: "chibi", hair, hair2: hair, skin: "#ffe4d6", outfit, outfit2: "#ffffff", eyes: outfit,
    bg: ["#fde2e4", "#e2ece9", "#fff1e6", "#e8e8f7", "#f0efeb", "#dfe7fd"][i], bg2: "#f7f7f7", style, acc: ["none", "catears", "headphones", "ribbon", "staff", "witchhat"][i], turn: -20 + i * 8,
  })),
];
