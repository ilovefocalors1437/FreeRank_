// src/portfolio.js — checking a new portfolio upload before it goes live.
//
//   1. fingerprint the upload (same 64x64-luma hashes as the index, src/embed.js)
//   2. compare against EVERY indexed image, held ones included
//   3. verdict: clear / already yours / identical match / altered copy
//   4. grade it (MiMo when configured, the deterministic estimate otherwise)
// A match against someone else's earlier upload holds the piece and offers an
// appeal (src/appeals.js) — selling the same work on several marketplaces is
// legitimate and common, so a 1:1 match is a question, not a verdict.

import { fingerprint, decodeGray, hamming, cosine, colorSignature, isGrid } from "./embed.js";
import { THRESH } from "./fraud.js";
import { extractFacts } from "./evidence.js";
import { gradeProject } from "./grader.js";

// Same-file test on the stable hash: re-uploads (incl. WebP recompression) sit at
// 0-2 bits; the closest two honest pieces by different people sit at 12 (measured).
export const IDENTICAL = 4;

export function reverseSearchStatus() {
  return {
    internal: "on — every indexed image, held ones included",
    google_lens: "not wired in yet — the internal index is the only check",
  };
}

export async function checkUpload(index, body) {
  if (!isGrid(body.grid)) throw Object.assign(new Error("grid must be {w:8, h:8, rgb:[192 numbers]}"), { status: 400 });
  let gray;
  try {
    gray = decodeGray(String(body.g64 || ""));
  } catch (err) {
    throw Object.assign(err, { status: 400 });
  }
  const fp = fingerprint(gray);
  const color = colorSignature(body.grid);
  const uploader = body.freelancerId || null;

  const matches = index.images
    .map((im) => ({ im, distance: hamming(fp.dhash256, im.fp.dhash256), stable: hamming(fp.stable256, im.fp.stable256) }))
    .filter((m) => m.distance <= THRESH.dhash || m.stable <= IDENTICAL)
    .sort((a, b) => a.stable - b.stable || a.distance - b.distance)
    .map(({ im, distance, stable }) => {
      const p = index.projectById.get(im.projectId);
      const f = index.byId.get(im.freelancerId);
      const colorSim = cosine(color, im.color);
      return {
        project: { id: p.id, title: p.title, thumb: p.thumbUrl, status: p.status },
        freelancer: { id: f.id, name: f.name },
        distance,
        stableDistance: stable,
        colorSim: +colorSim.toFixed(3),
        kind: stable <= IDENTICAL && colorSim >= THRESH.recolor ? "identical" : colorSim < THRESH.recolor ? "recoloured" : "near_identical",
        mine: f.id === uploader,
      };
    });

  // Your own earlier upload explains the match (a thief's later copy of your piece
  // matching too is their problem, already on hold) — so "yours" wins.
  const others = matches.filter((m) => !m.mine);
  let verdict = "clear";
  if (matches.some((m) => m.mine)) verdict = "already_in_your_portfolio";
  else if (others.length) verdict = others[0].kind === "identical" ? "identical_match" : "altered_match";

  const project = { title: String(body.title || "").slice(0, 140), description: String(body.description || "").slice(0, 2000), tools: [], difficulty: 0.5 };
  project.facts = extractFacts(project);
  const grade = verdict === "clear" ? await gradeProject(project, typeof body.preview === "string" && body.preview.startsWith("data:image/") ? body.preview : null) : null;

  return {
    verdict,
    status: verdict === "clear" ? "ready_to_publish" : verdict === "already_in_your_portfolio" ? "duplicate" : "held",
    appealable: verdict === "identical_match" || verdict === "altered_match",
    matches: matches.slice(0, 5),
    fingerprint: { dhash256: fp.dhash256.toString(16).padStart(64, "0"), stable256: fp.stable256.toString(16).padStart(64, "0"), edge256: fp.edge256.toString(16).padStart(64, "0") },
    thresholds: { match: THRESH.dhash, identical: IDENTICAL, bits: 256 },
    grade,
    reverseSearch: reverseSearchStatus(),
  };
}
