// src/api.js — the FreeRank API as plain functions: request in, JSON-able view out.
//
// Runtime-neutral, so the same routes serve two hosts: server.js (HTTP, files under
// data/) and the static demo build, which runs the whole engine in the browser
// (web/src/lib/local-api.ts). Endpoint list: see the header of server.js.
// The host picks a storage backend (src/storage.js) before calling createApi().

import { buildIndex } from "./index.js";
import { RAW_CORPUS } from "./data.js";
import { listUploads, addUpload, setUploadState, mergeUploads } from "./uploads.js";
import { search } from "./search.js";
import { understand, CATEGORIES, TECH_REQS } from "./spec.js";
import { STYLE_KEYS } from "./data-lib.js";
import { isGrid } from "./embed.js";
import { REF, GOLDEN } from "./scenarios.js";
import { TIERS, DIVISIONS, ENTRY, MASTER_SEATS, divisionFloor } from "./rank.js";
import { checkUpload, reverseSearchStatus } from "./portfolio.js";
import { REASONS, createAppeal, listAppeals, updateAppeal } from "./appeals.js";
import { graderStatus } from "./grader.js";

// The index is rebuilt (~70 ms) from corpus + Studio uploads whenever an upload is
// published or an appeal decides one, so new work goes through the same pipeline.
let index;
const rebuild = () => (index = buildIndex(mergeUploads(RAW_CORPUS, listUploads())));

export const CATEGORY_LABELS = { "3d_character": "3D Characters", "3d_props": "3D Props", ui_design: "UI Design", brand_design: "Brand Identity", copywriting: "Copywriting" };

const fail = (status, message) => Object.assign(new Error(message), { status });

function cleanSearch(b) {
  const out = { text: typeof b.text === "string" ? b.text.slice(0, 2000) : "", tags: Array.isArray(b.tags) ? b.tags.filter((t) => typeof t === "string").slice(0, 30) : [] };
  if (b.image != null) {
    if (!isGrid(b.image)) throw fail(400, "image must be {w:8, h:8, rgb:[192 numbers 0..255]}");
    out.image = b.image;
  }
  if (b.spec != null) out.spec = b.spec;
  if (b.k != null) out.k = Number(b.k);
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

// [method, path, handler(body, match, url), body size limit — set for routes that take a body]
const KB512 = 512 * 1024;
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
  ["POST", /^\/api\/understand$/, (b) => understand(cleanSearch(b), index), KB512],
  ["POST", /^\/api\/search$/, (b) => search(index, cleanSearch(b)), KB512],
  ["GET", /^\/api\/freelancers$/, () => index.freelancers.filter((f) => f.trust.tier !== "hard_hold").map(summary)],
  ["GET", /^\/api\/freelancers\/([\w-]+)$/, (_b, m) => {
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
  ["GET", /^\/api\/ladder$/, (_b, _m, url) => ladder(url.searchParams.get("category") || null)],
  ["POST", /^\/api\/portfolio\/check$/, (b) => checkUpload(index, b), 1024 * 1024],
  ["POST", /^\/api\/portfolio\/publish$/, async (b) => {
    const f = index.byId.get(String(b.freelancerId || ""));
    if (!f || f.trust.tier === "hard_hold") throw fail(400, "unknown or held freelancer");
    const check = await checkUpload(index, b); // never trust the client's verdict
    if (check.verdict === "already_in_your_portfolio") throw fail(409, "this piece is already in your portfolio");
    const upload = addUpload({ ...b, grade: check.grade, state: check.verdict === "clear" ? "live" : "held" });
    rebuild();
    const { g64, grid, ...rest } = upload;
    return { upload: rest, verdict: check.verdict };
  }, 3 * 1024 * 1024],
  ["GET", /^\/api\/uploads$/, () => listUploads().map(({ g64, grid, ...u }) => u)],
  ["GET", /^\/api\/appeals$/, () => listAppeals()],
  ["POST", /^\/api\/appeals$/, (b) => createAppeal(index, b), KB512],
  ["PATCH", /^\/api\/appeals\/([\w-]+)$/, (b, m) => {
    const a = updateAppeal(m[1], b);
    if (a.uploadId && (a.status === "approved" || a.status === "rejected")) {
      setUploadState(a.uploadId, a.status === "approved" ? "cleared" : "rejected");
      rebuild();
    }
    return a;
  }, KB512],
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

// ---------------------------------------------------------------- dispatch

// Fingerprints are BigInts and some views hold Sets; this is how they go on the wire.
export const serialize = (body) => JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString(16).padStart(16, "0") : v instanceof Set ? [...v] : v));

// handle(method, url, readBody) -> view; throws an Error with .status on a bad
// request. readBody(limit) is only called for routes that take a body.
export function createApi() {
  rebuild();
  return {
    async handle(method, url, readBody) {
      for (const [m, re, handler, limit] of routes) {
        const hit = url.pathname.match(re);
        if (hit && method === m) return handler(limit ? await readBody(limit) : undefined, hit, url);
      }
      throw fail(404, `no route ${method} ${url.pathname}`);
    },
  };
}
