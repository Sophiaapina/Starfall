"""Assemble hazards the way the game will, from the exported 4-frame sheets.

usage: python3 preview.py <family> <column|floater> [frame]      -> previews/<family>.png
       python3 preview.py --all                                  -> previews/all_half.png
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hz

BG = (20, 16, 32, 255)
GUIDE = (255, 90, 77, 255)      # #FF5A4D, the game's danger outline colour (preview guides only)
COL_HEIGHTS = [48, 100, 128, 260, 480, 700]
FLO_HEIGHTS = [60, 110, 180, 280]
KINDS = {'pipes': 'column', 'tesla': 'column', 'crystal': 'column', 'drone': 'floater',
         'lasergate': 'column', 'generator': 'floater'}
SOURCES = {'crystal': 'obstacles_11_generador_electrico.png', 'tesla': 'obstacles_04_bobina_tesla.png',
           'lasergate': 'obstacles_03_compuerta_laser.png', 'generator': 'obstacles_10_cristal_grande.png'}


def frame_img(family, f=0):
    sh = Image.open(os.path.join(hz.ROOT, 'export', family + '.png')).convert('RGBA')
    return sh.crop((f * 144, 0, f * 144 + 144, sh.height))


def column(art, H):
    """Standing column of lethal height H. Returns (image, lethal_rect) with the floor at the bottom edge."""
    tip, shaft, base = art.crop((0, 0, 144, 96)), art.crop((0, 96, 144, 160)), art.crop((0, 160, 144, 208))
    Ht = H + 16                       # + tip overhang rows
    im = Image.new('RGBA', (144, Ht), (0, 0, 0, 0))
    if H <= 80:                       # game rule (round B): only the tip, cut at the floor
        im.alpha_composite(tip.crop((0, 0, 144, Ht)), (0, 0))
    else:                             # tip, shafts toward the floor, base drawn last over the bottom 48 rows
        im.alpha_composite(tip.crop((0, 0, 144, min(96, Ht - 48))), (0, 0))
        y = 96
        while y < Ht - 48:
            piece = shaft.crop((0, 0, 144, min(64, Ht - 48 - y)))
            im.alpha_composite(piece, (0, y))
            y += 64
        im.alpha_composite(base, (0, Ht - 48))
    return im, (12, 16, 131, Ht - 1)


def floater(art, H):
    top, mid, bot = art.crop((0, 0, 144, 52)), art.crop((0, 52, 144, 100)), art.crop((0, 100, 144, 152))
    Ht = H + 24                       # + 12 overhang rows at each end
    im = Image.new('RGBA', (144, Ht), (0, 0, 0, 0))
    im.alpha_composite(top, (0, 0))
    y = 52
    while y < Ht - 52:
        im.alpha_composite(mid.crop((0, 0, 144, min(48, Ht - 52 - y))), (0, y))
        y += 48
    im.alpha_composite(bot, (0, Ht - 52))
    return im, (12, 12, 131, Ht - 13)


def assemblies(family, f=0):
    art = frame_img(family, f)
    out = []
    if KINDS[family] == 'column':
        for H in COL_HEIGHTS:
            im, r = column(art, H)
            out.append(('floor', H, im, r))
        im, r = column(art, 260)
        out.append(('ceiling', 260, im.transpose(Image.FLIP_TOP_BOTTOM), (r[0], im.height - 1 - r[3], r[2], im.height - 1 - r[1])))
    else:
        for H in FLO_HEIGHTS:
            im, r = floater(art, H)
            out.append(('air', H, im, r))
    return out


def sheet(family, f=0, guides=True, gap=16):
    items = assemblies(family, f)
    maxh = max(i[2].height for i in items)
    W = gap + sum(144 + gap for _ in items)
    Hs = maxh + 2 * gap + 8
    out = Image.new('RGBA', (W, Hs), BG)
    d = ImageDraw.Draw(out)
    floor = gap + maxh
    x = gap
    for kind, H, im, r in items:
        if kind == 'ceiling':
            y = gap
        elif kind == 'air':
            y = gap + (maxh - im.height) // 2
        else:
            y = floor - im.height
        out.alpha_composite(im, (x, y))
        if guides:
            d.rectangle((x + r[0] - 1, y + r[1] - 1, x + r[2] + 1, y + r[3] + 1), outline=GUIDE)
        x += 144 + gap
    if guides and KINDS[family] == 'column':
        d.line((0, floor, W, floor), fill=(60, 52, 80, 255))
    return out


def vs_source(family, f=0):
    """Painted source and the assembly (columns at 260, floaters at 180) at the same display height,
    side by side on #141020, both at half size with smoothing."""
    art = frame_img(family, f)
    if KINDS[family] == 'column':
        im, r = column(art, 260)
    else:
        im, r = floater(art, 180)
    src = hz.load_src(SOURCES[family])
    # same display size: scale the painting to the assembly's height
    s = im.height / src.height
    src = src.resize((max(1, round(src.width * s)), im.height), Image.LANCZOS)
    gap = 24
    W = src.width + im.width + 3 * gap
    out = Image.new('RGBA', (W, im.height + 2 * gap), BG)
    out.alpha_composite(src, (gap, gap))
    out.alpha_composite(im, (2 * gap + src.width, gap))
    out = out.resize((out.width // 2, out.height // 2), Image.LANCZOS)
    out.save(os.path.join(hz.ROOT, 'previews', family + '_vs_source.png'))
    return out


if __name__ == '__main__':
    if sys.argv[1] == '--vs':
        vs_source(sys.argv[2]); print('vs', sys.argv[2])
    elif sys.argv[1] == '--all':
        fams = [f for f in KINDS if os.path.exists(os.path.join(hz.ROOT, 'export', f + '.png'))]
        rows = [sheet(f, 0, guides=False) for f in fams]
        W = max(r.width for r in rows)
        H = sum(r.height for r in rows)
        full = Image.new('RGBA', (W, H), BG)
        y = 0
        for r in rows:
            full.alpha_composite(r, (0, y))
            y += r.height
        half = full.resize((W // 2, H // 2), Image.LANCZOS)
        half.save(os.path.join(hz.ROOT, 'previews', 'all_half.png'))
        print('all_half', half.size, fams)
    else:
        fam = sys.argv[1]
        f = int(sys.argv[3]) if len(sys.argv) > 3 else 0
        im = sheet(fam, f)
        im.save(os.path.join(hz.ROOT, 'previews', fam + '.png'))
        print(fam, im.size)
