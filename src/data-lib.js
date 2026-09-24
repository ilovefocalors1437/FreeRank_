// src/data-lib.js — deterministic image-grid generator + style helpers.
// Same (seed, palette) always yields the same picture: that's what makes the
// portfolio-theft demo reproducible (thief recolors an exact copy).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PALETTES = {
  anime: [[250, 205, 225], [155, 107, 214], [255, 232, 224]],
  realistic: [[196, 154, 108], [110, 78, 55], [235, 214, 190]],
  minimal: [[235, 235, 235], [120, 120, 130], [255, 255, 255]],
  neon: [[20, 16, 40], [0, 229, 255], [255, 0, 170]],
  cozy: [[240, 200, 150], [150, 90, 60], [255, 240, 210]],
  ink: [[30, 30, 36], [200, 200, 210], [90, 90, 110]],
};

// Deterministic 8x8 "thumbnail". tint/bright = laundering transforms a thief applies.
export function makeGrid(seed, paletteName, tint = [0, 0, 0], bright = 0) {
  const rnd = mulberry32(seed);
  const pal = PALETTES[paletteName];
  const rgb = new Array(8 * 8 * 3).fill(0);
  const put = (x, y, col, a) => {
    if (x < 0 || y < 0 || x > 7 || y > 7) return;
    const p = (y * 8 + x) * 3;
    for (let c = 0; c < 3; c++) rgb[p + c] = rgb[p + c] * (1 - a) + col[c] * a;
  };
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) put(x, y, pal[0], 1);
  const blobs = [
    { cx: 1 + rnd() * 5, cy: 1 + rnd() * 5, r: 1.6 + rnd() * 1.6, col: pal[1] },
    { cx: 1 + rnd() * 5, cy: 1 + rnd() * 5, r: 1.2 + rnd() * 1.4, col: pal[2] },
  ];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      for (const b of blobs) {
        const d = Math.hypot(x - b.cx, y - b.cy);
        if (d < b.r) put(x, y, b.col, Math.min(1, (b.r - d) / b.r + 0.25));
      }
    }
  }
  for (let i = 0; i < 8 * 8 * 3; i++) rgb[i] = Math.max(0, Math.min(255, rgb[i] + tint[i % 3] + bright));
  return { w: 8, h: 8, rgb };
}

export const STYLE_KEYS = ["stylized_anime", "realistic", "minimal", "painterly", "cel_shaded", "cozy", "neon"];

export function styleVector(styleAttrs) {
  return STYLE_KEYS.map((k) => styleAttrs?.[k] ?? 0);
}

export function styleOverlap(a, b) {
  const va = styleVector(a);
  const vb = styleVector(b);
  let num = 0;
  let den = 0;
  for (let i = 0; i < va.length; i++) {
    num += Math.min(va[i], vb[i]);
    den += Math.max(va[i], vb[i]);
  }
  return den ? num / den : 0;
}
