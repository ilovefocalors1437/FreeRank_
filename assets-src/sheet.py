# assets-src/sheet.py — contact sheet for reviewing renders: python sheet.py out.png bg_hex img1 img2 ...
import sys
from PIL import Image

out, bg, *paths = sys.argv[1:]
imgs = [Image.open(p).convert("RGBA") for p in paths]
cell = max(max(i.size) for i in imgs)
cols = min(len(imgs), 5)
rows = (len(imgs) + cols - 1) // cols
sheet = Image.new("RGBA", (cols * cell, rows * cell), "#" + bg.lstrip("#"))
for n, im in enumerate(imgs):
    x, y = (n % cols) * cell, (n // cols) * cell
    sheet.alpha_composite(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
sheet.convert("RGB").save(out)
print(out, sheet.size)
