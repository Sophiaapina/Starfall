"""Compose build/<family>/body.png + fx_N.png into a 4-frame sheet (same layout as the plugin export)."""
import os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hz
fam = sys.argv[1]
d = os.path.join(hz.ROOT, 'src', 'build', fam)
b = Image.open(os.path.join(d, 'body.png'))
sh = Image.new('RGBA', (576, b.height), (0, 0, 0, 0))
for f in range(4):
    c = Image.new('RGBA', b.size, (0, 0, 0, 0)); c.alpha_composite(b); c.alpha_composite(Image.open(os.path.join(d, f'fx_{f + 1}.png')))
    sh.alpha_composite(c, (f * 144, 0))
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(d, 'local_sheet.png')
sh.save(out); print(out)
