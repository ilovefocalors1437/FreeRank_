// Turns a dropped/uploaded image into what the engine indexes:
//   grid     8x8 RGB (visual channel)
//   g64      64x64 luma, base64 (authenticity fingerprints)
//   preview  a small JPEG data URL (what the LLM grader looks at, if configured)
//
// The index was built with PIL: convert("L") then resize((64, 64), BOX) — an exact
// area average. A canvas bilinear downscale is not that (measured: re-uploading an
// unchanged portfolio file scored 11/256 bits instead of ~0), so the pooling here is
// the same fractional-box average as src/embed.js resizeArea, on real pixels.
import type { Grid } from "./api";

const MAX_SIDE = 1600; // bigger photos are halved first; halving is an exact 2x2 box

function areaResize(src: Float64Array, sw: number, sh: number, dw: number, dh: number) {
  const out = new Float64Array(dw * dh);
  const fx = sw / dw;
  const fy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = y * fy;
    const y1 = y0 + fy;
    for (let x = 0; x < dw; x++) {
      const x0 = x * fx;
      const x1 = x0 + fx;
      let sum = 0;
      let area = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const w = wy * (Math.min(x1, sx + 1) - Math.max(x0, sx));
          sum += src[sy * sw + sx] * w;
          area += w;
        }
      }
      out[y * dw + x] = sum / area;
    }
  }
  return out;
}

function pixels(bmp: ImageBitmap) {
  let w = bmp.width;
  let h = bmp.height;
  let source: CanvasImageSource = bmp;
  while (Math.max(w, h) > MAX_SIDE) {
    const c = document.createElement("canvas");
    c.width = Math.ceil(w / 2);
    c.height = Math.ceil(h / 2);
    c.getContext("2d")!.drawImage(source, 0, 0, c.width, c.height);
    source = c;
    w = c.width;
    h = c.height;
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const cx = c.getContext("2d", { willReadFrequently: true })!;
  cx.drawImage(source, 0, 0);
  return { data: cx.getImageData(0, 0, w, h).data, w, h };
}

export async function analyseImage(file: Blob): Promise<{ grid: Grid; g64: string; preview: string; url: string }> {
  const bmp = await createImageBitmap(file);
  const { data, w, h } = pixels(bmp);
  const n = w * h;
  const luma = new Float64Array(n);
  const ch = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  for (let i = 0; i < n; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    luma[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b); // PIL "L" rounds per pixel
    ch[0][i] = r;
    ch[1][i] = g;
    ch[2][i] = b;
  }
  const gray = areaResize(luma, w, h, 64, 64);
  const rgb = ch.map((c) => areaResize(c, w, h, 8, 8));
  const rgb8: number[] = [];
  for (let i = 0; i < 64; i++) for (let k = 0; k < 3; k++) rgb8.push(Math.round(rgb[k][i]));
  let bin = "";
  for (const v of gray) bin += String.fromCharCode(Math.round(v));

  const pv = document.createElement("canvas");
  const scale = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
  pv.width = Math.round(bmp.width * scale);
  pv.height = Math.round(bmp.height * scale);
  pv.getContext("2d")!.drawImage(bmp, 0, 0, pv.width, pv.height);
  return { grid: { w: 8, h: 8, rgb: rgb8 }, g64: btoa(bin), preview: pv.toDataURL("image/jpeg", 0.82), url: URL.createObjectURL(file) };
}

export async function fetchAsBlob(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url}`);
  return res.blob();
}
