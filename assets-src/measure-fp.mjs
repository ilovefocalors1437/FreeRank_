// assets-src/measure-fp.mjs — distance distributions of the authenticity fingerprints
// over the real portfolio. Run after finalize.py; the thresholds in src/fraud.js come
// from this output.   node assets-src/measure-fp.mjs
import { readFileSync } from "node:fs";
import { fingerprint, decodeGray, hamming, cosine, colorSignature } from "../src/embed.js";

const grids = JSON.parse(readFileSync(new URL("../data/grids.json", import.meta.url)));
const ids = Object.keys(grids).filter((i) => !i.startsWith("ref-"));
const fp = Object.fromEntries(ids.map((i) => [i, { ...fingerprint(decodeGray(grids[i].g64)), color: colorSignature(grids[i]) }]));
const owner = (i) => i.split("-")[0];
const theft = [];
const self = [];
const cross = [];
for (let a = 0; a < ids.length; a++) {
  for (let b = a + 1; b < ids.length; b++) {
    const A = ids[a];
    const B = ids[b];
    const row = { pair: `${A}~${B}`, d: hamming(fp[A].dhash256, fp[B].dhash256), e: hamming(fp[A].edge256, fp[B].edge256), c: +cosine(fp[A].color, fp[B].color).toFixed(2) };
    if (new Set([owner(A), owner(B)]).has("king") && new Set([owner(A), owner(B)]).has("aoi") && A.at(-1) === B.at(-1)) theft.push(row);
    else if (owner(A) === owner(B)) self.push(row);
    else cross.push(row);
  }
}
const q = (arr, k, f) => arr.map((r) => r[k]).sort((x, y) => x - y)[Math.floor(arr.length * f)];
console.log("theft (recoloured copies):", theft.map((r) => `${r.pair} d=${r.d} e=${r.e} c=${r.c}`).join(" | "));
console.log("rin self-duplicates d max:", Math.max(...self.filter((r) => r.pair.startsWith("rin")).map((r) => r.d)));
console.log(`cross-account d: min ${q(cross, "d", 0)} p1 ${q(cross, "d", 0.01)} median ${q(cross, "d", 0.5)}; e: min ${q(cross, "e", 0)} p1 ${q(cross, "e", 0.01)}`);
console.log("closest honest cross pairs:");
for (const r of cross.sort((x, y) => x.d + x.e - (y.d + y.e)).slice(0, 8)) console.log(`  ${r.pair} d=${r.d} e=${r.e} c=${r.c}`);
