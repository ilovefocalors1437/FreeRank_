// src/data.js — turns raw freelancer records into indexable objects (per-image
// fingerprints + embeddings, per-project text vectors and extracted facts).
// Trust, evidence and rank are layered on top by fraud.js, evidence.js and rank.js;
// index.js runs the whole pipeline. buildRecords() is a pure function of its input
// so the eval can rebuild the index with injected attackers.
//
// Image pixels come from data/grids.json: the 8x8 downsample of every rendered
// portfolio image (assets-src/finalize.py). A project may carry its own `img` grid
// instead (the eval's injected attackers do).

import { gridVector, dhash, simhash, textVector, colorSignature, fingerprint, decodeGray, FP_SIDE } from "./embed.js";
import { extractFacts } from "./evidence.js";
import { makeGrid } from "./data-lib.js";
import { CORPUS } from "./corpus.js";
import GRIDS_JSON from "../data/grids.json" with { type: "json" };

export const RAW_CORPUS = CORPUS;

export const GRIDS = GRIDS_JSON;
const idSeed = (id) => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

// Real pixels when the render exists; a deterministic placeholder otherwise, so the
// engine still boots on a fresh checkout before assets are built.
export function gridFor(id) {
  return GRIDS[id] || makeGrid(idSeed(id), "minimal");
}

export const imageUrl = (id, size = "") => `/assets/portfolio/${id}${size ? "-" + size : ""}.webp`;

// Fingerprint input: the render's 64x64 luma when we have it, else the 8x8 grid
// blown up (the eval's synthetic images), so every image gets comparable hashes.
function grayOf(grid) {
  if (grid.g64) return decodeGray(grid.g64);
  const out = new Uint8Array(FP_SIDE * FP_SIDE);
  const k = FP_SIDE / 8;
  for (let y = 0; y < FP_SIDE; y++) {
    for (let x = 0; x < FP_SIDE; x++) {
      const p = (Math.floor(y / k) * 8 + Math.floor(x / k)) * 3;
      out[y * FP_SIDE + x] = Math.round(0.299 * grid.rgb[p] + 0.587 * grid.rgb[p + 1] + 0.114 * grid.rgb[p + 2]);
    }
  }
  return out;
}

export function imageRecord(id, grid, extra = {}) {
  return {
    id,
    grid,
    fp: fingerprint(grayOf(grid)),
    vec: gridVector(grid),
    color: colorSignature(grid),
    dhashRaw: dhash(grid, { contrastNorm: false }),
    dhashNorm: dhash(grid, { contrastNorm: true }),
    ...extra,
  };
}

// Project text as the index sees it. Tags are deliberately left out: they are
// claims, and a lexical/semantic hit on a claimed tag would let stuffers buy recall.
export function projectText(p) {
  return `${p.title} ${p.description} ${(p.tools || []).join(" ")}`;
}

export function buildRecords(raw = RAW_CORPUS) {
  const freelancers = [];
  const projects = [];
  const images = [];

  for (const f of raw) {
    const fr = { ...f, projects: [] };
    for (const p of f.projects) {
      const grid = p.img || gridFor(p.id);
      const img = imageRecord(`${p.id}-img`, grid, { projectId: p.id, freelancerId: f.id, ts: p.ts ?? f.ts });
      images.push(img);
      const text = projectText(p);
      const proj = {
        ...p,
        freelancerId: f.id,
        ts: p.ts ?? f.ts,
        text,
        descHash: simhash(p.title + " " + p.description),
        textVec: textVector(text),
        facts: extractFacts(p),
        images: [img],
        imageUrl: p.imageUrl ?? (GRIDS[p.id] ? imageUrl(p.id) : null),
        thumbUrl: p.thumbUrl ?? (GRIDS[p.id] ? imageUrl(p.id, "sm") : null),
        status: "visible", // fraud.js may set "held"
        trustWeight: 1,
      };
      delete proj.img;
      delete proj.image;
      projects.push(proj);
      fr.projects.push(proj);
    }
    freelancers.push(fr);
  }
  return { freelancers, projects, images };
}
