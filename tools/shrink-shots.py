# Shrink a committed screenshot set (docs/shots/<phase>/) to 256-colour PNGs,
# which keeps pixel art and text readable at a fraction of the size.
# Run by tools/shots.mjs --copy when Python with Pillow is available.
import sys, os
from PIL import Image
root = sys.argv[1]
before = after = 0
for d, _, files in os.walk(root):
    for f in files:
        if not f.endswith('.png'): continue
        p = os.path.join(d, f)
        before += os.path.getsize(p)
        im = Image.open(p).convert('RGB').quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        im.save(p, optimize=True)
        after += os.path.getsize(p)
print(f'shrink-shots: {before // 1024} KB -> {after // 1024} KB')
