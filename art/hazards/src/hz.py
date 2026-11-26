"""Shared helpers for the Starfall hazard kit (round A).

Every family is generated as full-canvas RGBA layers in the locked palette:
  body.png         static body, drawn once
  fx_1..fx_4.png   animated layer, one per frame
Pieces are periodic by construction so the joins are pixel-identical:
the lower part of a column `tip` and the top of a floater `top` repeat the
shaft / mid pattern aligned as if it continued past the join.
"""
import math, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)            # art/hazards

PALETTE = [
    # iron neutrals
    '0c0a0e', '19171b', '252326', '333034', '423e43', '575256', '737072', '9aa2a1',
    # drone slate
    '232b37', '384a58', '6f7787',
    # violet (pylon, rock)
    '201927', '33283e', '4b2b5e', '724683',
    # crystal purples
    '3a177c', '7829be', 'b22bd0', 'd369e2', 'e9afee',
    # magenta
    '5c4254', 'a03fa0', 'ff5ee0',
    # cyan
    '0f4c5a', '1f9ab0', '4fdbe8', 'b4f6f8',
    # lightning
    'baa0c7', 'f2c8f4', 'fbecfa', 'ffffff',
]
assert len(PALETTE) <= 32
C = {h: tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) for h in PALETTE}
OUT = C['0c0a0e']

W = 144
LETHAL_X0, LETHAL_X1 = 12, 131          # inclusive
COLUMN_H = 208                           # tip 0-95, shaft 96-159, base 160-207
FLOATER_H = 152                          # top 0-51, mid 52-99, bottom 100-151


def write_gpl(path):
    with open(path, 'w') as f:
        f.write('GIMP Palette\nName: Starfall hazards\nColumns: 8\n#\n')
        for h in PALETTE:
            r, g, b = C[h]
            f.write(f'{r:3d} {g:3d} {b:3d}\t#{h}\n')


class Canvas:
    """RGBA uint8 canvas with z-ordered painting helpers."""

    def __init__(self, h, w=W):
        self.a = np.zeros((h, w, 4), np.uint8)
        self.h, self.w = h, w

    def paint(self, mask, color):
        c = C[color] if isinstance(color, str) else color
        self.a[mask] = (*c, 255)

    def paint_idx(self, mask, colors, idx):
        """colors: list of hex; idx: int array same shape as canvas; only where mask."""
        for k, h in enumerate(colors):
            m = mask & (idx == k)
            if m.any():
                self.paint(m, h)

    def image(self):
        return Image.fromarray(self.a, 'RGBA')

    def save(self, path):
        self.image().save(path)

    def alpha(self):
        return self.a[:, :, 3] > 0


def grid(h, w=W):
    y, x = np.mgrid[0:h, 0:w]
    return x + 0.5, y + 0.5


def edge_of(mask):
    """Pixels of mask that touch a non-mask pixel (4-neighbour) -> inside outline."""
    m = mask
    e = np.zeros_like(m)
    e[1:, :] |= m[1:, :] & ~m[:-1, :]
    e[:-1, :] |= m[:-1, :] & ~m[1:, :]
    e[:, 1:] |= m[:, 1:] & ~m[:, :-1]
    e[:, :-1] |= m[:, :-1] & ~m[:, 1:]
    # canvas border does not count as an edge
    return e


def hash01(x, y, seed=0):
    """Deterministic pseudo-random in [0,1) per integer pixel."""
    v = (x.astype(np.int64) * 73856093) ^ (y.astype(np.int64) * 19349663) ^ (seed * 83492791)
    v = (v ^ (v >> 13)) * 1274126177
    return ((v ^ (v >> 16)) & 0xFFFF) / 65536.0


def cyl_shade(s, ramp, light=(-0.55, 0.83), gamma=1.0):
    """s in [-1,1] across a cylinder (left -> right). Returns index into ramp.
    gamma > 1 keeps more of the surface in the dark steps (narrow highlight)."""
    s = np.clip(s, -1, 1)
    z = np.sqrt(np.maximum(0, 1 - s * s))
    b = light[0] * s + light[1] * z          # about -0.55..1
    b = np.clip((b + 0.2) / 1.2, 0, 1) ** gamma
    idx = np.clip((b * (len(ramp) - 0.01)).astype(int), 0, len(ramp) - 1)
    return idx


def coverage(alpha, rows):
    """Min opaque px inside the lethal column over the given rows."""
    sub = alpha[rows, LETHAL_X0:LETHAL_X1 + 1]
    return int(sub.sum(axis=1).min())


def rows_equal(a, b):
    return bool(np.array_equal(a, b))


def remove_isolated(cv):
    """Clear pixels with no opaque 4-neighbour (validate counts them as strays)."""
    a = cv.alpha()
    n = np.zeros_like(a)
    n[1:] |= a[:-1]; n[:-1] |= a[1:]; n[:, 1:] |= a[:, :-1]; n[:, :-1] |= a[:, 1:]
    cv.a[a & ~n] = 0


# ---------------------------------------------------------------- round B: painting-based helpers
SRC_DIR = '/Users/bto/orca/workspaces/Starfall/rework-polish/public/assets/obstacles/obstaculos_png/'
EXTRA = [    # colours added in round B (appended to PALETTE by palette_all())
    # crystal (from the painted cluster)
    '7fd6f3', 'a297e1', 'd277dc', '7373c9', 'c752d5', 'a050b7', '6c4eaf', '9a34bb',
    '7938a7', '5c3197', '472e80', '8419ae', '681a9d', '2a1843', '2a0d5d', '11092a',
    # lasergate (teal posts, beam whites)
    'd3f4f6', '86eef3', '58b1b9', '537e89', '4f6875', '257883', '55546d',
    # tesla pedestal
    '9995ae', '614675', '433053',
]


def palette_all():
    return PALETTE + [h for h in EXTRA if h not in PALETTE]


def write_gpl_all(path):
    pal = palette_all()
    assert len(pal) <= 64, len(pal)
    with open(path, 'w') as f:
        f.write('GIMP Palette\nName: Starfall hazards\nColumns: 8\n#\n')
        for h in pal:
            r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
            f.write(f'{r:3d} {g:3d} {b:3d}\t#{h}\n')


def _lab(rgb):
    c = np.asarray(rgb, np.float64) / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def hex2rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def snap(rgba, pal=None, alpha_cut=128):
    """Snap an RGBA float/uint8 array to the palette (CIELAB nearest); alpha becomes 0/255."""
    pal = pal or palette_all()
    P = np.array([hex2rgb(h) for h in pal], np.float64)
    PL = _lab(P)
    a = np.asarray(rgba, np.float64)
    L = _lab(a[..., :3])
    d = ((L[..., None, :] - PL[None, None, :, :]) ** 2).sum(-1)
    idx = d.argmin(-1)
    out = np.zeros(a.shape[:2] + (4,), np.uint8)
    out[..., :3] = P[idx].astype(np.uint8)
    out[..., 3] = np.where(a[..., 3] >= alpha_cut, 255, 0)
    out[out[..., 3] == 0] = 0
    return out


def propose_colours(rgba, n, min_de=7.0):
    """Median-cut colours of the opaque pixels that are not within min_de of the palette."""
    from PIL import Image as _I
    a = np.asarray(rgba)
    px = a[a[..., 3] >= 128][:, :3].astype(np.uint8)
    im = _I.fromarray(px.reshape(1, -1, 3), 'RGB').quantize(colors=n, method=_I.Quantize.MEDIANCUT)
    cand = np.array(im.getpalette()[:n * 3]).reshape(-1, 3)
    PL = _lab(np.array([hex2rgb(h) for h in palette_all()], np.float64))
    out = []
    for c in cand:
        cl = _lab(c.astype(np.float64))
        if np.sqrt(((PL - cl) ** 2).sum(-1)).min() >= min_de:
            out.append('%02x%02x%02x' % tuple(int(v) for v in c))
            PL = np.vstack([PL, cl])
    return out


def load_src(name):
    from PIL import Image as _I
    return _I.open(SRC_DIR + name).convert('RGBA')
