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
import { useStorage } from "./src/storage.js";
import { nodeStorage, UPLOAD_DIR } from "./src/storage-node.js";
import { createApi, serialize } from "./src/api.js";

const PORT = Number(process.env.PORT) || 3399;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, "web", "dist");
const PUBLIC = path.join(ROOT, "web", "public");

useStorage(nodeStorage); // before the API builds its index from corpus + uploads
const api = createApi();

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(serialize(body));
};
const fail = (status, message) => Object.assign(new Error(message), { status });

async function readBody(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw fail(413, `request body over ${limit / 1024} KB`);
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw fail(400, "body is not valid JSON");
  }
}

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
    if (url.pathname.startsWith("/api/")) return json(res, 200, await api.handle(req.method, url, (limit) => readBody(req, limit)));
    if (req.method !== "GET") return json(res, 405, { error: "method not allowed" });
    await serveStatic(res, url.pathname);
  } catch (err) {
    json(res, err.status || 500, { error: err.message });
    if (!err.status) console.error(err);
  }
});

server.listen(PORT, async () => {
  const { stats: s } = await api.handle("GET", new URL("http://x/api/meta"));
  console.log(`FreeRank on http://localhost:${PORT}`);
  console.log(`indexed ${s.freelancers} freelancers (${s.ranked} ranked) / ${s.projects} projects in ${s.builtMs} ms — ${s.held} held, ${s.flagged} under review`);
});
