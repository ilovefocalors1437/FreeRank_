# assets-src/finalize.py — turns raw renders into the shipped portfolio images and the
# engine's image index.
#
#   python assets-src/finalize.py <jobs.json> <raw_dir> <web_portfolio_dir> <grids.json>
#
# * 3D renders (RGBA) get their gradient backdrop and a soft contact shadow.
# * "derived" jobs are the theft cases: an earlier render hue-rotated and brightened,
#   exactly what a portfolio thief does to dodge naive duplicate checks.
# * Every final image is downsampled to the 8x8 RGB grid the engine indexes, so the
#   search and fraud layers run on the real pixels a visitor sees.
import base64
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

jobs_path, raw_dir, web_dir, grids_path = sys.argv[1:5]
jobs = json.load(open(jobs_path, encoding="utf-8"))
os.makedirs(web_dir, exist_ok=True)
W, H = 960, 720


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def gradient(top, bottom):
    t, b = hexrgb(top), hexrgb(bottom)
    col = Image.new("RGB", (1, H))
    for y in range(H):
        a = y / (H - 1)
        col.putpixel((0, y), tuple(round(t[i] * (1 - a) + b[i] * a) for i in range(3)))
    img = col.resize((W, H))
    # soft light from the upper left
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse((-W * 0.2, -H * 0.5, W * 0.8, H * 0.6), fill=60)
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    return Image.composite(Image.new("RGB", (W, H), (255, 255, 255)), img, glow)


def compose(job, raw):
    bg = gradient(job.get("bg", "#e5e7eb"), job.get("bg2", job.get("bg", "#d1d5db")))
    box = raw.getchannel("A").point(lambda a: 255 if a > 20 else 0).getbbox()
    if box:
        x0, y0, x1, y1 = box
        cx, w = (x0 + x1) / 2, (x1 - x0)
        shadow = Image.new("L", (W, H), 0)
        ImageDraw.Draw(shadow).ellipse((cx - w * 0.38, y1 - 16, cx + w * 0.38, y1 + 14), fill=110)
        shadow = shadow.filter(ImageFilter.GaussianBlur(14))
        dark = tuple(max(0, int(c * 0.55)) for c in hexrgb(job.get("bg2", job.get("bg", "#999999"))))
        bg = Image.composite(Image.new("RGB", (W, H), dark), bg, shadow)
    out = bg.convert("RGBA")
    out.alpha_composite(raw)
    return out.convert("RGB")


def hue_shift(img, degrees, bright):
    hsv = img.convert("HSV")
    h, s, v = hsv.split()
    off = int(degrees / 360 * 255)
    h = h.point(lambda x: (x + off) % 256)
    v = v.point(lambda x: min(255, int(x * (1 + bright))))
    return Image.merge("HSV", (h, s, v)).convert("RGB")


finals = {}
for job in jobs:
    if job["kind"] == "derived":
        continue
    raw = Image.open(os.path.join(raw_dir, job["id"] + ".png"))
    img = compose(job, raw.convert("RGBA")) if job["kind"] in ("chibi", "clay", "prop") else raw.convert("RGB").resize((W, H))
    finals[job["id"]] = img
for job in jobs:
    if job["kind"] == "derived":
        finals[job["id"]] = hue_shift(finals[job["from"]], job.get("hue", 150), job.get("bright", 0.05))

grids = {}
for jid, img in finals.items():
    if not jid.startswith("fx-"):  # attack fixtures feed the eval only, never the site
        img.save(os.path.join(web_dir, f"{jid}.webp"), "WEBP", quality=86, method=6)
        img.resize((480, 360), Image.LANCZOS).save(os.path.join(web_dir, f"{jid}-sm.webp"), "WEBP", quality=82, method=6)
    g = img.resize((8, 8), Image.BOX)
    gray = img.convert("L").resize((64, 64), Image.BOX)  # canonical fingerprint input (see src/embed.js)
    grids[jid] = {"w": 8, "h": 8, "rgb": list(g.tobytes()), "g64": base64.b64encode(gray.tobytes()).decode()}
json.dump(grids, open(grids_path, "w"), separators=(",", ":"))
print(f"{len(finals)} images -> {web_dir}; grids -> {grids_path}")
