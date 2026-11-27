# Phase 21: the app icons for the web manifest (Add to Home Screen), drawn in
# code: a hex in the accent colour on the paper colour, with a small inner hex.
# Original art. Run: python3 tools/gen/icons.py
from PIL import Image, ImageDraw
import math

PAPER = (244, 236, 216, 255)
ACCENT = (138, 43, 29, 255)
INK = (31, 36, 48, 255)

def hexagon(cx, cy, r):
    return [(cx + r * math.cos(math.radians(60 * i - 90)), cy + r * math.sin(math.radians(60 * i - 90))) for i in range(6)]

def icon(size, maskable):
    img = Image.new('RGBA', (size, size), PAPER)
    d = ImageDraw.Draw(img)
    # Maskable icons keep the picture inside the central safe circle (80%).
    r = size * (0.34 if maskable else 0.44)
    c = size / 2
    d.polygon(hexagon(c, c, r), fill=ACCENT)
    d.polygon(hexagon(c, c, r * 0.42), fill=PAPER)
    d.polygon(hexagon(c, c, r * 0.2), fill=INK)
    return img

for size in (192, 512):
    icon(size, False).save(f'assets/icons/icon-{size}.png')
    icon(size, True).save(f'assets/icons/icon-maskable-{size}.png')
print('icons written')
