// server.js — zero-dependency HTTP server for the freelance-search prototype.
//   npm start            -> http://localhost:3399  (PORT env to change)
//
//   GET  /                 test console (public/index.html)
//   GET  /api/meta         reference images, scenarios, spec vocabulary, index stats
//   POST /api/understand   {text, tags, image}            -> SearchSpec (rule stub)
//   POST /api/search       {text, tags, image, spec?, k}  -> ranked results + explanations
//                          pass `spec` to bypass the stub (the "LLM writes the spec" path)
//   GET  /api/trust        review queue, duplicate edges, per-freelancer trust
//   GET  /api/freelancers  indexed profiles with evidence summaries
//   GET  /api/log          last 200 queries (future learning-to-rank data)
//
// `image` is an 8x8 thumbnail: {w:8, h:8, rgb:[192 numbers 0..255]}. The console
// downsamples uploads to that in the browser.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildIndex } from "./src/index.js";
import { search } from "./src/search.js";
import { understand, CATEGORIES, TECH_REQS } from "./src/spec.js";
import { STYLE_KEYS } from "./src/data-lib.js";
import { isGrid } from "./src/embed.js";
import { REF, GOLDEN } from "./src/scenarios.js";

const PORT = Number(process.env.PORT) || 3399;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const index = buildIndex();

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString(16).padStart(16, "0") : v instanceof Set ? [...v] : v)));
};

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 256 * 1024) throw Object.assign(new Error("request body over 256 KB"), { status: 413 });
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("body is not valid JSON"), { status: 400 });
  }
}

function cleanRequest(b) {
  const out = { text: typeof b.text === "string" ? b.text.slice(0, 2000) : "", tags: Array.isArray(b.tags) ? b.tags.filter((t) => typeof t === "string").slice(0, 30) : [] };
  if (b.image != null) {
    if (!isGrid(b.image)) throw Object.assign(new Error("image must be {w:8, h:8, rgb:[192 numbers 0..255]}"), { status: 400 });
    out.image = b.image;
  }
  if (b.spec != null) out.spec = b.spec;
  if (b.k != null) out.k = Number(b.k);
  return out;
}

const grid = (projectId) => index.projectById.get(projectId)?.images[0].grid;

function freelancerSummary(f) {
  return {
    id: f.id,
    name: f.name,
    headline: f.headline,
    category: f.category,
    newcomer: f.isNewcomer,
    trust: { tier: f.trust.tier, risk: f.trust.risk, signals: f.trust.signals, copiedBy: f.trust.copiedBy },
    claims: f.claims,
    unsupportedClaims: f.evidence.unsupported,
    distinctProjects: f.evidence.clusterCount,
    outcome: f.outcome,
    skills: [...f.evidence.skills].map(([skill, v]) => ({ skill, score: +v.score.toFixed(2), sources: [...v.sources] })).sort((a, b) => b.score - a.score),
    projects: f.projects.map((p) => ({ id: p.id, title: p.title, status: p.status, heldReason: p.heldReason || null, grid: p.images[0].grid, facts: p.facts })),
  };
}

const routes = {
  "GET /api/meta": () => ({
    refs: Object.entries(REF).map(([id, r]) => ({ id, label: r.label, grid: r.grid })),
    scenarios: GOLDEN.map((g) => ({ id: g.id, label: g.label, q: g.q })),
    vocabulary: { categories: CATEGORIES, style: STYLE_KEYS, tech: TECH_REQS },
    stats: {
      freelancers: index.freelancers.length,
      projects: index.projects.length,
      liveProjects: index.live.length,
      held: index.freelancers.filter((f) => f.trust.tier === "hard_hold").length,
      flagged: index.freelancers.filter((f) => f.trust.tier === "soft_flag").length,
      builtMs: index.builtMs,
    },
  }),
  "POST /api/understand": async (req) => understand(cleanRequest(await readBody(req)), index),
  "POST /api/search": async (req) => search(index, cleanRequest(await readBody(req))),
  "GET /api/trust": () => ({
    cases: index.fraud.cases,
    imageEdges: index.fraud.imageEdges.map((e) => ({ ...e, originalGrid: grid(e.originalProject), copyGrid: grid(e.copyProject) })),
    textEdges: index.fraud.textEdges,
    lsh: { candidatePairs: index.fraud.candidatePairs, naivePairs: index.fraud.comparedNaively },
    freelancers: index.freelancers.map((f) => ({ id: f.id, name: f.name, tier: f.trust.tier, risk: f.trust.risk, claims: f.claims.length, unsupported: f.evidence.unsupported.length, projects: f.projects.length, distinct: f.evidence.clusterCount })),
  }),
  "GET /api/freelancers": () => index.freelancers.map(freelancerSummary),
  "GET /api/log": () => index.queryLog,
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    const handler = routes[`${req.method} ${url.pathname}`];
    if (handler) return json(res, 200, await handler(req));
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const html = await readFile(path.join(ROOT, "public", "index.html"));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(html);
    }
    if (url.pathname.startsWith("/api/")) return json(res, 404, { error: `no route ${req.method} ${url.pathname}` });
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  } catch (err) {
    json(res, err.status || 500, { error: err.message });
    if (!err.status) console.error(err);
  }
});

server.listen(PORT, () => {
  const s = routes["GET /api/meta"]().stats;
  console.log(`freelance-search on http://localhost:${PORT}`);
  console.log(`indexed ${s.freelancers} freelancers / ${s.projects} projects in ${s.builtMs} ms — ${s.held} held, ${s.flagged} flagged for review`);
});
