# assets-src/logo.py — writes the FreeRank logo as self-contained SVG (wordmark
# outlined from Big Shoulders Display 800, so it renders without the font).
#   python assets-src/logo.py
import glob
import os

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
font_path = glob.glob(os.path.join(ROOT, "web/node_modules/@fontsource/big-shoulders-display/files/big-shoulders-display-latin-800-normal.woff2"))[0]
font = TTFont(font_path)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
upm = font["head"].unitsPerEm
ascent = font["hhea"].ascent

MARK = [
    ("M32 3 42 24 32 34 22 24Z", 1.0),
    ("M18 46 32 38 46 46 46 52 32 44 18 52Z", 1.0),
    ("M18 56 32 48 46 56 46 62 32 54 18 62Z", 0.55),
]


def wordmark(text, size, x0, baseline, colors):
    """Outlined glyph paths; colors[i] per character."""
    s = size / upm
    x = x0
    out = []
    for i, ch in enumerate(text):
        g = cmap[ord(ch)]
        pen = SVGPathPen(glyphs)
        glyphs[g].draw(TransformPen(pen, (s, 0, 0, -s, x, baseline)))
        out.append(f'<path d="{pen.getCommands()}" fill="{colors[i]}"/>')
        x += glyphs[g].width * s
    return "".join(out), x


def logo(ink, accent, mark_color, mark_fade, bg=None):
    h = 64
    word, end = wordmark("FreeRank", 58, 76, 52, [ink] * 4 + [accent] * 4)
    w = int(end + 4)
    mark = "".join(f'<path d="{d}" fill="{mark_color}" opacity="{o if o < 1 else 1}"/>' for d, o in MARK)
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w * 3}" height="{h * 3}" role="img" aria-label="FreeRank">{rect}{mark}{word}</svg>\n'


out = os.path.join(ROOT, "web/public/brand")
os.makedirs(out, exist_ok=True)
open(os.path.join(out, "freerank-logo.svg"), "w").write(logo("#141a2e", "#0a2fa8", "#0a2fa8", 0.55))
open(os.path.join(out, "freerank-logo-on-cobalt.svg"), "w").write(logo("#f7f8ff", "#f2c14e", "#f7f8ff", 0.55, bg="#0a2fa8"))
print("wrote", os.listdir(out))
