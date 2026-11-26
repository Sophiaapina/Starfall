"""tesla (round B, column): the lightning is the column; the painted pedestal is the base.

  * base (rows 160..207): the pedestal and emitter flash resampled from obstacles_04_bobina_tesla.png
    (painting rows 146..222, x 8..68 -> lethal column, 2.0x wide / 0.63x tall); the emitter lands at x 72.
  * shaft (64 rows): the bolt. Its geometry is generated (four different shapes are needed, with fixed
    entry/exit points), drawn with the painted bolt's look: a thin pale lavender-white core, a pink inner
    glow and a dithered violet-magenta haze, thin tendrils. It enters and leaves every tile at x 72 and
    zig-zags to within 12 px of both sides twice per tile.
  * tip (rows 0..95): rows 64..95 continue the shaft exactly; above, the trunk climbs and splits into forks
    that fade out in the overhang rows.
Everything animated lives on the fx layer; the body layer holds the pedestal only.
"""
import os, random, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hz
from crystal import premul_resize

H = hz.COLUMN_H
SRC = 'obstacles_04_bobina_tesla.png'
CX = 72
LO, HI = 16, 127          # zig-zag extremes (within 12 px of the lethal edges 12 / 131)
BG = np.array([20, 16, 32], float)
CL = np.array([[0, 2], [3, 1]]) / 4.0


def pedestal_float():
    src = np.asarray(hz.load_src(SRC), np.float64)
    crop = Image.fromarray(src[146:223, 8:68].astype(np.uint8), 'RGBA')
    r = premul_resize(crop, (120, 48))
    al = r[..., 3:4] / 255.0
    rgb = r[..., :3] * al + BG * (1 - al)
    return np.concatenate([rgb, np.where(r[..., 3:4] >= 90, 255.0, 0.0)], -1)


def pedestal():
    cv = hz.Canvas(H)
    full = np.zeros((H, hz.W, 4))
    full[160:208, 12:132] = pedestal_float()
    cv.a[:] = hz.snap(full)
    hz.remove_isolated(cv)
    return cv


def jag(p, q, rng, amp, depth=3):
    if depth == 0 or abs(q[1] - p[1]) + abs(q[0] - p[0]) < 6:
        return [p, q]
    mx = (p[0] + q[0]) / 2 + rng.uniform(-amp, amp)
    my = (p[1] + q[1]) / 2 + rng.uniform(-amp * 0.4, amp * 0.4)
    m = (mx, my)
    return jag(p, m, rng, amp * 0.6, depth - 1)[:-1] + jag(m, q, rng, amp * 0.6, depth - 1)


def line_px(p, q):
    (x0, y0), (x1, y1) = p, q
    n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    return [(int(round(x0 + (x1 - x0) * i / n)), int(round(y0 + (y1 - y0) * i / n))) for i in range(n + 1)]


def tile_paths(frame):
    """Trunk and tendrils of one 64-row tile (y 0..64), entering and leaving at x = CX.
    Irregular: uneven waypoints, one touching each edge zone per tile, sharp crackle between them."""
    rng = random.Random(700 + frame * 29)
    left_first = frame % 2 == 0
    e1 = LO + rng.randint(0, 5) if left_first else HI - rng.randint(0, 5)
    e2 = HI - rng.randint(0, 5) if left_first else LO + rng.randint(0, 5)
    way = [(CX, 0),
           (CX + rng.randint(-18, 18), 6 + rng.randint(0, 4)),
           (e1, 17 + rng.randint(-3, 3)),
           (CX + rng.randint(-20, 20), 27 + rng.randint(-2, 3)),
           (e2, 38 + rng.randint(-3, 3)),
           (CX + rng.randint(-26, 26) + (-14 if left_first else 14), 49 + rng.randint(-2, 2)),
           (CX + rng.randint(-10, 10), 57 + rng.randint(-1, 1)),
           (CX, 64)]
    pts = []
    for i in range(len(way) - 1):
        seg = jag(way[i], way[i + 1], rng, 7)
        pts += seg if not pts else seg[1:]
    trunk = []
    for a, b in zip(pts, pts[1:]):
        trunk += line_px(a, b)
    tendrils = []
    for _ in range(6):
        k = rng.randint(3, len(pts) - 4)
        sx, sy = pts[k]
        if not (8 <= sy <= 56):
            continue
        out = -1 if sx > CX else 1
        out = out if rng.random() < 0.6 else -out
        end = (min(max(sx + out * rng.uniform(10, 22), 14), 129), max(sy - rng.uniform(5, 12), 4))
        seg = jag((sx, sy), end, rng, 3, 2)
        for a, b in zip(seg, seg[1:]):
            tendrils += line_px(a, b)
        mx, my = seg[len(seg) // 2]                      # a twig off the tendril
        tw = (min(max(mx + out * rng.uniform(4, 8), 14), 129), max(my - rng.uniform(3, 7), 3))
        tendrils += line_px((mx, my), tw)
    tendrils = ensure_thirds(pts, tendrils, trunk, 2, 62, rng)
    tendrils = [(x, y) for x, y in tendrils if 1 <= y <= 62]     # keep the tile edges clean for tiling
    return trunk, tendrils, pts


def ensure_thirds(pts, thin, core_px, y0, y1, rng, wrap=None, win=16):
    """Every `win` rows, each third of the lethal width gets bright pixels: a tendril from the trunk if needed."""
    lit = set((x, y) for x, y in core_px) | set(thin)
    for wy in range(y0, y1, win):
        rows = set(range(wy, min(wy + win, y1)))
        for t in range(3):
            x0 = 12 + 40 * t
            if any(x0 <= x < x0 + 40 and y in rows for x, y in lit):
                continue
            cands = [q for q in pts if wy <= q[1] < wy + win] or pts
            sx, sy = min(cands, key=lambda q: abs(q[1] - (wy + win / 2)))
            tx = min(max(sx, x0 + 4), x0 + 36) + rng.uniform(-3, 3)      # just inside the third, nearest the trunk
            ty = min(max(sy - rng.uniform(2, 8), wy + 1), min(wy + win, y1) - 2)
            seg = jag((sx, sy), (tx, ty), rng, 3, 2)
            for a, b in zip(seg, seg[1:]):
                px = line_px(a, b)
                thin += px
                lit |= set(px)
    return thin


def tip_paths(frame, start):
    rng = random.Random(900 + frame * 7)
    sx, sy = start
    way = [(sx, sy), (LO + 8 + rng.randint(0, 10) if sx > CX else HI - 8 - rng.randint(0, 10), 46),
           (CX + rng.randint(-10, 10), 30), (CX + rng.randint(-6, 6), 18)]
    pts = []
    for i in range(len(way) - 1):
        seg = jag(way[i], way[i + 1], rng, 5)
        pts += seg if not pts else seg[1:]
    trunk = []
    for a, b in zip(pts, pts[1:]):
        trunk += line_px(a, b)
    forks = []
    top = pts[-1]
    for tx in (LO + 6 + rng.randint(0, 10), CX + rng.randint(-8, 8), HI - 6 - rng.randint(0, 10)):
        seg = jag(top, (tx, rng.randint(0, 4)), rng, 5, 3)
        for a, b in zip(seg, seg[1:]):
            forks += line_px(a, b)
    for k in range(3):
        j = rng.randint(2, len(pts) - 3)
        bx, by = pts[j]
        end = (min(max(bx + rng.choice((-1, 1)) * rng.uniform(14, 26), 14), 129), by - rng.uniform(6, 14))
        seg = jag((bx, by), end, rng, 3, 2)
        for a, b in zip(seg, seg[1:]):
            forks += line_px(a, b)
    forks = ensure_thirds(pts, forks, trunk, 16, 64, rng)
    return trunk, forks


def render(trunk, thin, fade_rows=None):
    core = np.zeros((H, hz.W), bool)
    thinm = np.zeros((H, hz.W), bool)
    for (x, y) in trunk:
        for dx in (0, 1):
            if 12 <= x + dx <= 131 and 0 <= y < H:
                core[y, x + dx] = True
    for (x, y) in thin:
        if 12 <= x <= 131 and 0 <= y < H:
            thinm[y, x] = True
    allc = core | thinm

    def grow(m, n):
        g = m.copy()
        for _ in range(n):
            h = g.copy()
            h[1:] |= g[:-1]; h[:-1] |= g[1:]; h[:, 1:] |= g[:, :-1]; h[:, :-1] |= g[:, 1:]
            g = h
        return g
    g1 = grow(allc, 1) & ~allc
    g2 = grow(allc, 3) & ~allc & ~g1
    g3 = grow(core, 6) & ~allc & ~g1 & ~g2
    yy, xx = np.mgrid[0:H, 0:hz.W]
    th = CL[(yy // 2) % 2, (xx // 2) % 2]
    lim = (xx >= 12) & (xx <= 131)
    cv = hz.Canvas(H)
    near = grow(core, 3)
    cv.paint(g3 & lim & (th < 0.2), '5c4254')
    cv.paint(g2 & lim & near & (th < 0.45), 'a03fa0')
    cv.paint(g2 & lim & near & (th < 0.2), 'baa0c7')
    cv.paint(g1 & lim, 'baa0c7')
    cv.paint(g1 & lim & grow(core, 1), 'f2c8f4')
    cv.paint(thinm, 'f2c8f4')
    cv.paint(core, 'fbecfa')
    cv.paint(core & (th < 0.5), 'ffffff')
    if fade_rows is not None:
        f0, f1 = fade_rows
        a = cv.a
        rgb = a[..., :3].astype(int)
        lum = 0.3 * rgb[..., 0] + 0.59 * rgb[..., 1] + 0.11 * rgb[..., 2]
        dim = (yy >= f0) & (yy < f1) & (a[..., 3] > 0)
        cv.paint(dim & (lum > 200), 'baa0c7')
        cv.paint(dim & (lum <= 200), '724683')
    return cv


def build_fx(frame):
    trunk, tend, pts = tile_paths(frame)
    T = render(trunk, tend).a[0:64].copy()
    fx = hz.Canvas(H)
    fx.a[96:160] = T
    fx.a[64:96] = T[32:64]
    start = min(pts, key=lambda p: abs(p[1] - 32))
    tt, forks = tip_paths(frame, (start[0], 64))
    top = render(tt, forks, fade_rows=(0, 6))
    m = top.alpha() & (np.arange(H)[:, None] < 70)
    keep = fx.alpha()
    fx.a[m & ~keep] = top.a[m & ~keep]
    hz.remove_isolated(fx)
    fx.a[159] = fx.a[95]
    fx.a[160:] = 0
    return fx


def main(outdir):
    os.makedirs(outdir, exist_ok=True)
    pedestal().save(os.path.join(outdir, 'body.png'))
    for f in range(4):
        build_fx(f).save(os.path.join(outdir, f'fx_{f + 1}.png'))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(hz.ROOT, 'src', 'build', 'tesla'))
