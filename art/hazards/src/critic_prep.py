"""Pre-upscaled images for the pixel-critic (it cannot zoom)."""
import os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hz, preview
SRC = '/Users/bto/orca/workspaces/Starfall/rework-polish/public/assets/obstacles/obstaculos_png/'
OUT = os.path.join(hz.ROOT, 'src', 'build', 'critic')


def prep(fam, srcs):
    os.makedirs(OUT, exist_ok=True)
    p = Image.open(os.path.join(hz.ROOT, 'previews', fam + '.png'))
    p.resize((p.width * 2, p.height * 2), Image.NEAREST).save(f'{OUT}/{fam}_preview_x2.png')
    s = preview.sheet(fam, 0, guides=False)
    h = s.resize((s.width // 2, s.height // 2), Image.LANCZOS)
    h.resize((h.width * 3, h.height * 3), Image.NEAREST).save(f'{OUT}/{fam}_halfsize_x3.png')
    sh = Image.open(os.path.join(hz.ROOT, 'export', fam + '.png'))
    bg = Image.new('RGBA', sh.size, (20, 16, 32, 255)); bg.alpha_composite(sh)
    bg.resize((sh.width * 3, sh.height * 3), Image.NEAREST).save(f'{OUT}/{fam}_frames_x3.png')
    ims = [Image.open(SRC + n).convert('RGBA') for n in srcs]
    W = sum(i.width for i in ims) + 10 * len(ims); H = max(i.height for i in ims)
    c = Image.new('RGBA', (W, H), (20, 16, 32, 255)); x = 0
    for i in ims:
        c.alpha_composite(i, (x, 0)); x += i.width + 10
    c.resize((W * 2, H * 2), Image.NEAREST).save(f'{OUT}/{fam}_source_x2.png')


if __name__ == '__main__':
    prep(sys.argv[1], sys.argv[2:])
