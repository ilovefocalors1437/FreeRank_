# assets-src/export_emblems.py — trims the Blender renders and writes web-sized WebPs.
#   python assets-src/export_emblems.py <render_dir> <web/public/assets/emblems>
import os
import sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for tier in ["freelance", "pro", "expert", "elite", "master"]:
    im = Image.open(os.path.join(src, f"{tier}.png")).convert("RGBA")
    box = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    im = im.crop(box)
    side = max(im.size)
    pad = int(side * 0.04)
    sq = Image.new("RGBA", (side + 2 * pad, side + 2 * pad), (0, 0, 0, 0))
    sq.alpha_composite(im, ((sq.width - im.width) // 2, (sq.height - im.height) // 2))
    for size in (640, 160):
        out = sq.resize((size, size), Image.LANCZOS)
        path = os.path.join(dst, f"{tier}-{size}.webp")
        out.save(path, "WEBP", quality=90, method=6)
        print(path, os.path.getsize(path) // 1024, "KB")
