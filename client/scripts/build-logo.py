"""
Builds client/public/logo.png from the client-supplied artwork (client/logo.jpeg).

The source is a black sticker-style star with white lettering, surrounded by halftone dots, on white.
For the dark app: the white background becomes transparent, the sticker stays fully opaque (so it also
reads on personal theme colours), its outer edge fades through black instead of grey (no light halo),
and the halftone dots are re-inked in brand violet so they glow softly instead of vanishing.

Run: python client/scripts/build-logo.py   (needs Pillow)
"""
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "logo.jpeg"
OUT = ROOT / "public" / "logo.png"
SCALE = 3
VIOLET = (176, 38, 255)
BG_THRESHOLD = 150  # luminance above this, reachable from the border, is background

img = Image.open(SRC).convert("L")
img = img.resize((img.width * SCALE, img.height * SCALE), Image.LANCZOS)
w, h = img.size
lum = img.load()

# 1) Background: light pixels connected to the border.
bg = bytearray(w * h)
queue = deque()
for x in range(w):
    queue.extend([(x, 0), (x, h - 1)])
for y in range(h):
    queue.extend([(0, y), (w - 1, y)])
while queue:
    x, y = queue.popleft()
    i = y * w + x
    if bg[i] or lum[x, y] <= BG_THRESHOLD:
        continue
    bg[i] = 1
    if x > 0:
        queue.append((x - 1, y))
    if x < w - 1:
        queue.append((x + 1, y))
    if y > 0:
        queue.append((x, y - 1))
    if y < h - 1:
        queue.append((x, y + 1))

# 2) Connected components of everything else; the largest is the sticker, the rest are halftone dots.
label = [0] * (w * h)
sizes = {}
current = 0
for start in range(w * h):
    if bg[start] or label[start]:
        continue
    current += 1
    label[start] = current
    count = 0
    stack = [start]
    while stack:
        i = stack.pop()
        count += 1
        x, y = i % w, i // w
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                j = ny * w + nx
                if not bg[j] and not label[j]:
                    label[j] = current
                    stack.append(j)
    sizes[current] = count
sticker = max(sizes, key=sizes.get)


def touches_background(x, y):
    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
        if 0 <= nx < w and 0 <= ny < h and bg[ny * w + nx]:
            return True
    return False


out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
px = out.load()
for y in range(h):
    for x in range(w):
        i = y * w + x
        v = lum[x, y]
        if bg[i]:
            continue
        if label[i] == sticker:
            if touches_background(x, y):
                px[x, y] = (0, 0, 0, 255 - v if v > 40 else 255)  # edge fades through black, never grey
            else:
                px[x, y] = (v, v, v, 255)
        else:
            px[x, y] = (*VIOLET, int((255 - v) * 0.85))  # halftone dot, re-inked violet

# Largest use is ~240 CSS px wide; 720 px covers 3x screens.
final = out.resize((720, round(720 * h / w)), Image.LANCZOS)
final.quantize(256, method=Image.Quantize.FASTOCTREE).save(OUT, optimize=True)  # palette PNG fallback
preview = Image.new("RGBA", final.size, (0, 0, 0, 255))
preview.alpha_composite(final)
preview.convert("RGB").save(ROOT / "assets-src" / "logo-preview-on-black.png")
print(f"wrote {OUT} {final.size}")
