// src/index.js — the portfolio indexing pipeline (design §4), run over the whole corpus:
//   records -> fingerprints/embeddings -> cross-user dup scan -> hold copies ->
//   evidence graph -> risk + tier -> lexical index -> rollups.
// Pure function of the raw corpus, so eval.js can rebuild it with injected attackers.

import { tokens } from "./embed.js";
import { buildRecords, RAW_CORPUS } from "./data.js";
import { buildEvidence } from "./evidence.js";
import { scanImageDuplicates, scanTextCopies, assessFreelancer, reviewCase } from "./fraud.js";
import { estimateGrade } from "./grader.js";
import { buildLadder } from "./rank.js";

function buildBM25(projects) {
  const docs = new Map();
  const df = new Map();
  let total = 0;
  for (const p of projects) {
    const tf = new Map();
    const toks = tokens(p.text);
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    docs.set(p.id, { tf, len: toks.length });
    total += toks.length;
  }
  return { docs, df, N: projects.length, avgdl: total / Math.max(1, projects.length) };
}

function outcomeQuality(f) {
  const n = f.workHistory.length;
  if (!n) return { score: 0, jobs: 0, completed: 0, rehired: 0 };
  const completed = f.workHistory.filter((w) => w.outcome === "completed").length;
  const rehired = f.workHistory.filter((w) => w.rehired).length;
  // Behavioural outcomes, shrunk toward 0 for tiny samples. Star ratings are not an input.
  const score = (0.5 * (completed / n) + 0.5 * (rehired / n)) * (n / (n + 2));
  return { score, jobs: n, completed, rehired };
}

export function buildIndex(raw = RAW_CORPUS) {
  const t0 = performance.now();
  const { freelancers, projects, images } = buildRecords(raw);
  const byId = new Map(freelancers.map((f) => [f.id, f]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const provenance = new Map(freelancers.map((f) => [f.id, f.credentials.some((c) => c.verified && c.type === "source_files") ? 1 : 0]));
  const { edges: imageEdges, candidatePairs } = scanImageDuplicates(images, provenance);
  const textEdges = scanTextCopies(projects);

  // A project whose image is a later cross-account copy never feeds search or evidence.
  for (const e of imageEdges) {
    const p = projectById.get(e.copyProject);
    p.status = "held";
    p.trustWeight = 0;
    p.heldReason = `image matches ${e.originalProject} (${byId.get(e.originalFreelancer).name}, uploaded earlier) — ${e.kind.replace(/_/g, " ")}, dHash distance ${e.hamming}`;
  }

  const cases = [];
  for (const f of freelancers) {
    f.evidence = buildEvidence(f);
    f.trust = assessFreelancer(f, imageEdges, textEdges, f.evidence);
    if (f.trust.tier === "hard_hold") {
      for (const p of f.projects) {
        if (p.status !== "held") p.heldReason = "account on hard hold pending review";
        p.status = "held";
        p.trustWeight = 0;
      }
    }
    if (f.trust.tier !== "pass") cases.push(reviewCase(f, f.trust, imageEdges, textEdges));
    f.outcome = outcomeQuality(f);
    f.isNewcomer = f.workHistory.length === 0 && f.reviews.length === 0;
  }

  // System score inputs: a grade per project (the cached estimate; POST
  // /api/portfolio/check runs the LLM grader on new uploads when configured).
  for (const p of projects) p.grade = p.grade || estimateGrade(p);
  const ladder = buildLadder(freelancers);
  for (const f of freelancers) f.ladder = ladder.get(f.id);

  const live = projects.filter((p) => p.status !== "held");
  return {
    freelancers,
    projects,
    images,
    byId,
    projectById,
    live,
    bm25: buildBM25(live),
    fraud: { imageEdges, textEdges, cases, candidatePairs, comparedNaively: (images.length * (images.length - 1)) / 2 },
    queryLog: [],
    builtMs: +(performance.now() - t0).toFixed(1),
  };
}
