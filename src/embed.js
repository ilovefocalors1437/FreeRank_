// src/embed.js — deterministic toy embedders.
// Every vector/hash here is computed from REAL input pixels or text, so the pipeline
// is honest end-to-end. These are the documented swap points:
//   gridVector()  -> SigLIP / DINOv2 image embedding   (visual channel)
//   textVector()  -> bge / e5 text embedding           (semantic channel)
//   dhash()       -> keep! perceptual hashing stays deterministic even in prod.

export function normalize(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

export function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

const W = 8;
const H = 8;

// ---- image descriptor: { w:8, h:8, rgb:[192 numbers 0..255] } -----------------

export function gridVector(img) {
  // 48-dim: each 2x2 block of the 8x8 grid in signed opponent-colour space
  // (lightness, red-green, yellow-blue). Raw mean RGB is all-positive, so every
  // pair of images scored cosine ~0.97 and the visual channel ranked nothing;
  // centred opponent channels give cosine a real spread.
  const v = [];
  for (let by = 0; by < 4; by++) {
    for (let bx = 0; bx < 4; bx++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const p = ((by * 2 + dy) * W + (bx * 2 + dx)) * 3;
          r += img.rgb[p];
          g += img.rgb[p + 1];
          b += img.rgb[p + 2];
        }
      }
      r /= 4 * 255;
      g /= 4 * 255;
      b /= 4 * 255;
      v.push((r + g + b) / 3 - 0.5, r - g, (r + g) / 2 - b);
    }
  }
  return normalize(v);
}

function gray(img, contrastNorm) {
  const out = [];
  for (let i = 0; i < W * H; i++) {
    const p = i * 3;
    out.push(0.299 * img.rgb[p] + 0.587 * img.rgb[p + 1] + 0.114 * img.rgb[p + 2]);
  }
  if (!contrastNorm) return out;
  // Normalize brightness/contrast -> survives recolor / brightness laundering.
  const mean = out.reduce((a, b) => a + b, 0) / out.length;
  const sd = Math.sqrt(out.reduce((a, b) => a + (b - mean) ** 2, 0) / out.length) || 1;
  return out.map((x) => (x - mean) / sd);
}

function dhashFromGray(g) {
  let bits = 0n;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      bits = (bits << 1n) | (g[y * W + x] > g[y * W + ((x + 1) % W)] ? 1n : 0n);
    }
  }
  return bits; // BigInt, 64-bit
}

export function dhash(img, { contrastNorm = true } = {}) {
  return dhashFromGray(gray(img, contrastNorm));
}

export function hamming(a, b) {
  let x = a ^ b;
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

export function hex64(b) {
  return b.toString(16).padStart(16, "0");
}

// ---- text ---------------------------------------------------------------------

export function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9ก-๙]+/)
    .filter((t) => t.length > 1);
}

function h64(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const TDIM = 96;

export function textVector(text) {
  const v = new Array(TDIM).fill(0);
  for (const t of tokens(text)) v[h64(t) % TDIM] += 1;
  return normalize(v);
}

// 64-bit SimHash -> near-copy detection for project descriptions (fraud layer).
export function simhash(text) {
  const acc = new Array(64).fill(0);
  for (const t of tokens(text)) {
    const h1 = h64(t);
    const h2 = h64(t + "#");
    for (let i = 0; i < 32; i++) {
      acc[i] += (h1 >>> i) & 1 ? 1 : -1;
      acc[32 + i] += (h2 >>> i) & 1 ? 1 : -1;
    }
  }
  let bits = 0n;
  for (let i = 0; i < 64; i++) bits = (bits << 1n) | (acc[i] >= 0 ? 1n : 0n);
  return bits;
}

// Hue histogram -> separates "same drawing recolored" from "different drawing".
export function colorSignature(img) {
  const sig = new Array(8).fill(0);
  for (let i = 0; i < W * H; i++) {
    const p = i * 3;
    const r = img.rgb[p];
    const g = img.rgb[p + 1];
    const b = img.rgb[p + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    let hue = 0;
    if (mx !== mn) {
      if (mx === r) hue = ((g - b) / (mx - mn)) % 6;
      else if (mx === g) hue = (b - r) / (mx - mn) + 2;
      else hue = (r - g) / (mx - mn) + 4;
      hue = (hue * 60 + 360) % 360;
    }
    sig[Math.min(7, Math.floor(hue / 45))] += 1;
  }
  return normalize(sig);
}

export function isGrid(img) {
  return (
    img &&
    img.w === W &&
    img.h === H &&
    Array.isArray(img.rgb) &&
    img.rgb.length === W * H * 3 &&
    img.rgb.every((x) => typeof x === "number" && x >= 0 && x <= 255)
  );
}
