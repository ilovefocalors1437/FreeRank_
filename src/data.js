// src/data.js — turns raw freelancer records into indexable objects (per-image
// fingerprints + embeddings, per-project text vectors and extracted facts).
// Trust and evidence are layered on top by fraud.js and evidence.js; index.js
// runs the whole pipeline. buildRecords() is a pure function of its input so the
// eval can rebuild the index with injected attackers.

import { gridVector, dhash, simhash, textVector, colorSignature } from "./embed.js";
import { extractFacts } from "./evidence.js";
import { CORPUS_A } from "./corpus-a.js";
import { CORPUS_B } from "./corpus-b.js";
import { CORPUS_C } from "./corpus-c.js";
import { CORPUS_D } from "./corpus-d.js";

export const RAW_CORPUS = [...CORPUS_A, ...CORPUS_B, ...CORPUS_C, ...CORPUS_D];

export function imageRecord(id, grid, extra = {}) {
  return {
    id,
    grid,
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
      const img = imageRecord(`${p.id}-img`, p.img, { projectId: p.id, freelancerId: f.id, ts: f.ts });
      images.push(img);
      const text = projectText(p);
      const proj = {
        ...p,
        freelancerId: f.id,
        ts: f.ts,
        text,
        descHash: simhash(p.title + " " + p.description),
        textVec: textVector(text),
        facts: extractFacts(p),
        images: [img],
        status: "visible", // fraud.js may set "held"
        trustWeight: 1,
      };
      delete proj.img;
      projects.push(proj);
      fr.projects.push(proj);
    }
    freelancers.push(fr);
  }
  return { freelancers, projects, images };
}
