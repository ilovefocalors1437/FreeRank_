// server.js — FreeRank API + static hosting. Zero dependencies.
//   npm start            -> http://localhost:3399  (PORT to change)
//
//   GET  /api/meta                  categories, tiers, entry rules, reference images, scenarios
//   POST /api/search                {text, tags, image?, spec?, k?, mode: casual|competitive|open, rotation?}
//   POST /api/understand            same input -> the SearchSpec only
//   GET  /api/freelancers           every indexed profile, summarised
//   GET  /api/freelancers/:id       one profile: rank, eligibility, portfolio, evidence, reviews
//   GET  /api/ladder                leaderboards per category + tier bands
//   POST /api/portfolio/check       {grid, g64, title?, description?, freelancerId?, preview?} -> authenticity + grade
//   POST /api/portfolio/publish     same body -> re-checked server-side, stored, index rebuilt
//   GET  /api/uploads               pieces published through the Studio, with their state
//   GET  /api/appeals               appeal queue
//   POST /api/appeals               {reason, message, links[], matchProject, freelancerId, title, fingerprint}
//   PATCH /api/appeals/:id          {status, note}  (reviewer action)
//   GET  /api/trust                 review queue, duplicate edges, per-account risk
//   GET  /api/log                   recent queries
//
//   /            the web app (web/dist after `npm run build`; `npm run dev` serves it with HMR)
//   /console     the engine test console
//   /assets/*    emblems and portfolio renders

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildIndex } from "./src/index.js";
import { RAW_CORPUS } from "./src/data.js";
import { listUploads, addUpload, setUploadState, mergeUploads, UPLOAD_DIR } from "./src/uploads.js";
import { search } from "./src/search.js";
import { understand, CATEGORIES, TECH_REQS } from "./src/spec.js";
import { STYLE_KEYS } from "./src/data-lib.js";
import { isGrid } from "./src/embed.js";
import { REF, GOLDEN } from "./src/scenarios.js";
import { TIERS, DIVISIONS, ENTRY, MASTER_SEATS, divisionFloor } from "./src/rank.js";
import { checkUpload, reverseSearchStatus } from "./src/portfolio.js";
import { REASONS, createAppeal, listAppeals, updateAppeal } from "./src/appeals.js";
import { graderStatus } from "./src/grader.js";

const PORT = Number(process.env.PORT) || 3399;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, "web", "dist");
const PUBLIC = path.join(ROOT, "web", "public");
// The index is rebuilt (~70 ms) from corpus + Studio uploads whenever an upload is
// published or an appeal decides one, so new work goes through the same pipeline.
let index = buildIndex(mergeUploads(RAW_CORPUS, listUploads()));
// buildIndex() returns a fresh queryLog, so a rebuild (an upload published, an appeal
// decided) would otherwise wipe the recent-query history. Carry it across rebuilds.
const rebuild = () => {
  const carried = index.queryLog;
  index = buildIndex(mergeUploads(RAW_CORPUS, listUploads()));
  index.queryLog = carried;
};

export const CATEGORY_LABELS = { "3d_character": "3D Characters", "3d_props": "3D Props", ui_design: "UI Design", brand_design: "Brand Identity", copywriting: "Copywriting" };

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString(16).padStart(16, "0") : v instanceof Set ? [...v] : v)));
};
const fail = (status, message) => Object.assign(new Error(message), { status });

async function readBody(req, limit = 512 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw fail(413, `request body over ${limit / 1024} KB`);
    chunks.push(c);
  }
  if (!chunks.length) return {};
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw fail(400, "body is not valid JSON");
  }
  // Handlers read properties off the body, so a bare null/array/number/string
  // (all valid JSON) would crash them with a 500 instead of a 400.
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw fail(400, "body must be a JSON object");
  return parsed;
}

function cleanSearch(b) {
  const out = { text: typeof b.text === "string" ? b.text.slice(0, 2000) : "", tags: Array.isArray(b.tags) ? b.tags.filter((t) => typeof t === "string").slice(0, 30) : [] };
  if (b.image != null) {
    if (!isGrid(b.image)) throw fail(400, "image must be {w:8, h:8, rgb:[192 numbers 0..255]}");
    out.image = b.image;
  }
  if (b.spec != null) out.spec = b.spec;
  // Number("abc") is NaN, and Math.max/min silently pass NaN through, so a junk
  // k would slice the page to NaN and return zero results. Only pass finite k on.
  if (b.k != null && Number.isFinite(Number(b.k))) out.k = Number(b.k);
  if (["casual", "competitive", "open"].includes(b.mode)) out.mode = b.mode;
  if (Number.isFinite(b.rotation)) out.rotation = b.rotation;
  return out;
}

// ---------------------------------------------------------------- views

function rankView(f) {
  const L = f.ladder;
  return {
    competitive: L.competitive,
    rating: L.competitive ? L.rating : null,
    label: L.rank?.label ?? null,
    tier: L.rank?.tier ?? null,
    division: L.rank?.division ?? null,
    masterSeat: L.rank?.masterSeat ?? null,
    masterEligible: !!L.rank?.masterEligible,
    categoryPosition: L.categoryPosition ?? null,
    categorySize: L.categorySize ?? null,
    progress: L.progress ?? null,
    eligibility: L.eligibility,
    components: L.components,
  };
}

function summary(f) {
  const live = f.projects.filter((p) => p.status !== "held");
  return {
    id: f.id,
    name: f.name,
    headline: f.headline,
    location: f.location,
    category: f.category,
    categoryLabel: CATEGORY_LABELS[f.category],
    newcomer: f.isNewcomer,
    trust: f.trust.tier,
    rank: rankView(f),
    cover: live[0]?.thumbUrl ?? null,
    jobs: f.outcome.jobs,
  };
}

function profile(f) {
  const jobs = f.workHistory;
  const stars = jobs.filter((j) => j.stars);
  return {
    ...summary(f),
    claims: f.claims,
    unsupportedClaims: f.evidence.unsupported,
    trustDetail: { tier: f.trust.tier, risk: f.trust.risk, signals: f.trust.tier === "pass" ? [] : f.trust.signals, copiedBy: f.trust.copiedBy.map((id) => index.byId.get(id)?.name ?? id) },
    credentials: f.credentials.filter((c) => c.verified).map((c) => ({ type: c.type, issuer: c.issuer, skill: c.skill, note: c.note ?? null })),
    stats: {
      jobs: jobs.length,
      casual: jobs.filter((j) => j.arena === "casual").length,
      competitive: jobs.filter((j) => j.arena === "competitive").length,
      clients: new Set(jobs.map((j) => j.client)).size,
      rehired: f.outcome.rehired,
      avgStars: stars.length ? +(stars.reduce((a, j) => a + j.stars, 0) / stars.length).toFixed(2) : null,
      onTime: jobs.length ? +(jobs.filter((j) => j.onTime !== false).length / jobs.length).toFixed(2) : null,
      lastJobDaysAgo: jobs.length ? Math.min(...jobs.map((j) => j.daysAgo)) : null,
    },
    skills: [...f.evidence.skills]
      .map(([skill, v]) => ({ skill, score: +v.score.toFixed(2), sources: [...v.sources], distinctProjects: v.clusters.size }))
      .filter((s) => s.score >= 0.5)
      .sort((a, b) => b.score - a.score),
    portfolio: f.projects.filter((p) => p.status !== "held" || !p.upload).map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      tools: p.tools,
      image: p.imageUrl,
      thumb: p.thumbUrl,
      status: p.status,
      heldReason: p.heldReason || null,
      grade: p.grade,
      duplicateOf: f.evidence.clusters.get(p.id) && [...f.evidence.clusters].find(([pid, c]) => c === f.evidence.clusters.get(p.id) && pid !== p.id && f.projects.findIndex((x) => x.id === pid) < f.projects.findIndex((x) => x.id === p.id))?.[0] || null,
    })),
    reviews: f.reviews,
    recentJobs: [...jobs].sort((a, b) => a.daysAgo - b.daysAgo).slice(0, 8).map((j) => ({ client: j.client, arena: j.arena, stars: j.stars, daysAgo: j.daysAgo, value: j.value, rehired: j.rehired })),
  };
}

function ladder(category) {
  const cats = category ? [category] : Object.keys(CATEGORY_LABELS);
  const boards = cats.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    entries: index.freelancers
      .filter((f) => f.category === cat && f.ladder.competitive)
      .sort((a, b) => a.ladder.categoryPosition - b.ladder.categoryPosition)
      .map(summary),
  }));
  const tiers = TIERS.map((t, i) => {
    const next = TIERS[i + 1];
    return {
      ...t,
      max: next ? next.min - 1 : null,
      divisions: t.id === "master" ? null : Array.from({ length: DIVISIONS }, (_, d) => ({ division: DIVISIONS - d, min: divisionFloor({ tier: t.id, division: DIVISIONS - d }) })),
      count: index.freelancers.filter((f) => f.ladder.rank?.tier === t.id).length,
    };
  });
  return { tiers, boards, masterSeats: MASTER_SEATS, casualOnly: index.freelancers.filter((f) => !f.ladder.competitive && f.trust.tier !== "hard_hold").length };
}

// ---------------------------------------------------------------- routes

const routes = [
  ["GET", /^\/api\/meta$/, () => ({
    categories: Object.entries(CATEGORY_LABELS).map(([id, label]) => ({ id, label, count: index.freelancers.filter((f) => f.category === id && f.trust.tier !== "hard_hold").length })),
    tiers: TIERS,
    divisions: DIVISIONS,
    entry: ENTRY,
    masterSeats: MASTER_SEATS,
    refs: Object.entries(REF).map(([id, r]) => ({ id, label: r.label, grid: r.grid, url: r.url })),
    scenarios: GOLDEN.map((g) => ({ id: g.id, label: g.label, q: g.q })),
    vocabulary: { categories: CATEGORIES, style: STYLE_KEYS, tech: TECH_REQS },
    appealReasons: REASONS,
    grader: graderStatus(),
    reverseSearch: reverseSearchStatus(),
    stats: {
      freelancers: index.freelancers.length,
      ranked: index.freelancers.filter((f) => f.ladder.competitive).length,
      projects: index.projects.length,
      liveProjects: index.live.length,
      held: index.freelancers.filter((f) => f.trust.tier === "hard_hold").length,
      flagged: index.freelancers.filter((f) => f.trust.tier === "soft_flag").length,
      builtMs: index.builtMs,
    },
  })],
  ["POST", /^\/api\/understand$/, async (req) => understand(cleanSearch(await readBody(req)), index)],
  ["POST", /^\/api\/search$/, async (req) => search(index, cleanSearch(await readBody(req)))],
  ["GET", /^\/api\/freelancers$/, () => index.freelancers.filter((f) => f.trust.tier !== "hard_hold").map(summary)],
  ["GET", /^\/api\/freelancers\/([\w-]+)$/, (_req, m) => {
    const f = index.byId.get(m[1]);
    if (!f) throw fail(404, "no such freelancer");
    if (f.trust.tier === "hard_hold") throw fail(404, "this profile is unavailable while it is under review");
    return profile(f);
  }],
  // The engine console's Index tab: raw per-project grids, evidence and trust.
  ["GET", /^\/api\/console\/freelancers$/, () => index.freelancers.map((f) => ({
    id: f.id, name: f.name, category: f.category, newcomer: f.isNewcomer,
    trust: { tier: f.trust.tier }, outcome: f.outcome, unsupportedClaims: f.evidence.unsupported, distinctProjects: f.evidence.clusterCount,
    skills: [...f.evidence.skills].map(([skill, v]) => ({ skill, score: +v.score.toFixed(2) })).sort((a, b) => b.score - a.score),
    projects: f.projects.map((p) => ({ title: p.title, status: p.status, heldReason: p.heldReason || null, grid: p.images[0].grid })),
  }))],
  ["GET", /^\/api\/ladder$/, (_req, _m, url) => ladder(url.searchParams.get("category") || null)],
  ["POST", /^\/api\/portfolio\/check$/, async (req) => checkUpload(index, await readBody(req, 1024 * 1024))],
  ["POST", /^\/api\/portfolio\/publish$/, async (req) => {
    const b = await readBody(req, 3 * 1024 * 1024);
    const f = index.byId.get(String(b.freelancerId || ""));
    if (!f || f.trust.tier === "hard_hold") throw fail(400, "unknown or held freelancer");
    const check = await checkUpload(index, b); // never trust the client's verdict
    if (check.verdict === "already_in_your_portfolio") throw fail(409, "this piece is already in your portfolio");
    const upload = addUpload({ ...b, grade: check.grade, state: check.verdict === "clear" ? "live" : "held" });
    rebuild();
    const { g64, grid, ...rest } = upload;
    return { upload: rest, verdict: check.verdict };
  }],
  ["GET", /^\/api\/uploads$/, () => listUploads().map(({ g64, grid, ...u }) => u)],
  ["GET", /^\/api\/appeals$/, () => listAppeals()],
  ["POST", /^\/api\/appeals$/, async (req) => createAppeal(index, await readBody(req))],
  ["PATCH", /^\/api\/appeals\/([\w-]+)$/, async (req, m) => {
    const a = updateAppeal(m[1], await readBody(req));
    if (a.uploadId && (a.status === "approved" || a.status === "rejected")) {
      setUploadState(a.uploadId, a.status === "approved" ? "cleared" : "rejected");
      rebuild();
    }
    return a;
  }],
  ["GET", /^\/api\/trust$/, () => {
    const grid = (pid) => index.projectById.get(pid)?.images[0].grid;
    return {
      cases: index.fraud.cases,
      imageEdges: index.fraud.imageEdges.map((e) => ({ ...e, originalGrid: grid(e.originalProject), copyGrid: grid(e.copyProject), originalThumb: index.projectById.get(e.originalProject)?.thumbUrl, copyThumb: index.projectById.get(e.copyProject)?.thumbUrl })),
      textEdges: index.fraud.textEdges,
      lsh: { candidatePairs: index.fraud.candidatePairs, naivePairs: index.fraud.comparedNaively },
      freelancers: index.freelancers.map((f) => ({ id: f.id, name: f.name, tier: f.trust.tier, risk: f.trust.risk, claims: f.claims.length, unsupported: f.evidence.unsupported.length, projects: f.projects.length, distinct: f.evidence.clusterCount })),
    };
  }],
  ["GET", /^\/api\/log$/, () => index.queryLog],
];

// ---------------------------------------------------------------- static files

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2", ".ico": "image/x-icon" };

async function sendFile(res, file, cache = "public, max-age=3600") {
  const body = await readFile(file);
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": cache });
  res.end(body);
}
const exists = async (f) => !!(await stat(f).catch(() => null))?.isFile();
const inside = (base, rel) => {
  const full = path.join(base, rel);
  return full.startsWith(base) ? full : null;
};

async function serveStatic(res, pathname) {
  if (pathname === "/console" || pathname === "/console/") return sendFile(res, path.join(ROOT, "console", "index.html"), "no-store");
  // Percent-decoding throws URIError on a malformed escape (e.g. /%C0%AE).
  // That is a bad request line, not a server fault: answer 400 instead of 500.
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return json(res, 400, { error: "malformed percent-encoding in path" });
  }
  if (decoded.startsWith("/uploads/")) {
    const f = inside(fileURLToPath(UPLOAD_DIR), decoded.slice("/uploads/".length));
    if (f && (await exists(f))) return sendFile(res, f, "public, max-age=86400");
  }
  const rel = decoded.replace(/^\/+/, "");
  for (const base of [DIST, PUBLIC]) {
    const f = rel && inside(base, rel);
    if (f && (await exists(f))) return sendFile(res, f, rel.startsWith("assets/") ? "public, max-age=86400" : "no-store");
  }
  if (await exists(path.join(DIST, "index.html"))) return sendFile(res, path.join(DIST, "index.html"), "no-store"); // SPA fallback
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<p style="font:16px system-ui;padding:40px">FreeRank API is running. Build the web app with <code>npm run build</code>, or run <code>npm run dev</code>. The engine console is at <a href="/console">/console</a>.</p>`);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    for (const [method, re, handler] of routes) {
      const m = url.pathname.match(re);
      if (m && req.method === method) return json(res, 200, await handler(req, m, url));
    }
    if (url.pathname.startsWith("/api/")) return json(res, 404, { error: `no route ${req.method} ${url.pathname}` });
    if (req.method !== "GET") return json(res, 405, { error: "method not allowed" });
    await serveStatic(res, url.pathname);
  } catch (err) {
    json(res, err.status || 500, { error: err.message });
    if (!err.status) console.error(err);
  }
});

server.listen(PORT, () => {
  const s = routes[0][2]().stats;
  console.log(`FreeRank on http://localhost:${PORT}`);
  console.log(`indexed ${s.freelancers} freelancers (${s.ranked} ranked) / ${s.projects} projects in ${s.builtMs} ms — ${s.held} held, ${s.flagged} under review`);
});
