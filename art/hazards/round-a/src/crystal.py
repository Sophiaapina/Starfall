"""crystal: a purple crystal cluster packed shoulder to shoulder, cyan cores, on a dark rock foot."""
import math, os, random, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hz

H = hz.COLUMN_H
# prisms: (x0, x1 inclusive, tip row, facet split as a fraction of the width, diagonal facet phase)
PRISMS = [
    (12, 36, 28, 0.38, 10),
    (37, 74, 16, 0.50, 42),
    (75, 104, 23, 0.55, 26),
    (105, 131, 33, 0.45, 54),
]
# ragged points: apex (x, y) and the rows where the left / right edge meets the prism side (all <= 43)
POINTS = [((19, 28), 34, 42), ((57, 16), 40, 33), ((93, 23), 35, 41), ((123, 33), 37, 43)]
CORE_PHASE = [6, 38, 22, 54]     # where each prism's cyan core segment sits in the 64-row period
CORE_LEN = [12, 20, 16, 10]
LIGHT, MID, DARK, DEEP = 'd369e2', '7829be', '3a177c', '3a177c'   # lavender light, indigo shadow
LIT = 'e9afee'
EDGE = 'e9afee'
TOP = 44


def ymod(y):
    return (y - 96) % 64


def facets(cv, mask, xi, x0, x1, sx):
    w = x1 - x0
    cv.paint(mask, MID)
    cv.paint(mask & (xi < sx - 2), LIGHT)
    cv.paint(mask & (xi >= x0 + 2) & (xi < x0 + 4), LIT)
    cv.paint(mask & (xi > x1 - int(w * 0.34)), DARK)
    cv.paint(mask & (xi == sx), LIT)                        # facet ridge


def prism_rows(cv, fx, X, Y, p, y0, y1, frame):
    """Straight part of one prism for rows y0..y1-1, a function of ymod (tiles every 64 rows)."""
    x0, x1, tip, split, dphase = p
    xi = (X - 0.5).astype(int)
    yi = (Y - 0.5).astype(int)
    m = ymod(yi)
    rows = (yi >= y0) & (yi < y1)
    body = rows & (xi >= x0) & (xi <= x1)
    w = x1 - x0
    sx = x0 + int(w * split)
    facets(cv, body, xi, x0, x1, sx)
    # one diagonal facet step per 64 rows on the lit side, subtle
    diag = body & (((m - dphase - (xi - x0) // 2) % 64) == 0) & (xi > x0 + 1) & (xi < sx)
    cv.paint(diag, LIT)
    cv.paint(body & ((xi == x0) | (xi == x1)), hz.OUT)      # seams between prisms
    # cyan core: a soft glowing segment inside the prism (one per 64 rows), pulsing
    k = PRISMS.index(p)
    cm = (m - CORE_PHASE[k]) % 64
    L = CORE_LEN[k]
    seg = cm < L
    wide = (cm >= 2) & (cm < L - 2)
    cx = (x0 + x1) // 2 + 1
    core = body & seg & ((np.abs(xi - cx) == 0) | (wide & (np.abs(xi - cx) <= 1)))
    halo = body & wide & (np.abs(xi - cx) == 2)
    cc, hc = [('4fdbe8', '1f9ab0'), ('b4f6f8', '4fdbe8'), ('4fdbe8', '1f9ab0'), ('1f9ab0', '1f9ab0')][frame]
    fx.paint(halo, hc)
    fx.paint(core, cc)
    # glint: a diagonal bright streak sweeping across the facets, 16 rows per frame
    g = (m + (xi - 12) - 16 * frame) % 64
    glint = body & (g <= 1) & (xi > x0) & (xi < sx) & ~halo & ~core
    fx.paint(glint & (g == 0), 'ffffff')
    fx.paint(glint & (g == 1), 'f2c8f4')


def prism_point(cv, fx, X, Y, p, frame):
    """The ragged free end: an asymmetric point with a leaning apex, inside rows tip..43 (the taper zone)."""
    from PIL import Image, ImageDraw
    x0, x1, tip, split, dphase = p
    k = PRISMS.index(p)
    (ax, ay), yl, yr = POINTS[k]
    xi = (X - 0.5).astype(int)
    yi = (Y - 0.5).astype(int)
    im = Image.new('L', (hz.W, H), 0)
    ImageDraw.Draw(im).polygon([(ax, ay), (x1 + 0.99, yr), (x1 + 0.99, TOP), (x0, TOP), (x0, yl)], fill=255)
    pt = np.array(im) > 0
    sx = x0 + int((x1 - x0) * split)
    facets(cv, pt, xi, x0, x1, sx)
    # the facet ridge runs from the apex down to the side ridge
    for y in range(ay, TOP):
        t = (y - ay) / max(1, TOP - ay)
        rx = int(round(ax + (sx - ax) * min(1, t * 2)))
        if pt[y, rx]:
            cv.a[y, rx] = (*hz.C[LIT], 255)
    cv.paint(hz.edge_of(pt) & pt & (yi < TOP), hz.OUT)
    cv.paint(pt & ((xi == x0) | (xi == x1)), hz.OUT)
    # the core reaches up into the point, thin
    cx = (x0 + x1) // 2 + 1
    cc = ['4fdbe8', 'b4f6f8', '4fdbe8', '1f9ab0'][frame]
    fx.paint(pt & (xi == cx) & (yi > max(yl, yr) - 4), cc)


def base(cv, X, Y):
    xi = (X - 0.5).astype(int)
    yi = (Y - 0.5).astype(int)
    # dark slate: ledge collar across the top (covers the cut shaft), then slabs to the floor
    col = (yi >= 160) & (yi < 168) & (xi >= 11) & (xi <= 132)
    cv.paint(col, '384a58')
    cv.paint(col & (yi == 161), '6f7787')
    cv.paint(col & (yi >= 165), '232b37')
    cv.paint(col & ((yi == 160) | (yi == 167) | (xi == 11) | (xi == 132)), hz.OUT)
    for y in range(168, 208):
        t = (y - 168) / 39.0
        half = 60 + t * 2
        row = (yi == y) & (np.abs(X - 72) <= half)
        cv.paint(row, '384a58')
        cv.paint(row & (X - 72 < -half + 12), '6f7787')
        cv.paint(row & (X - 72 > half - 14), '232b37')
        cv.paint(row & (np.abs(np.abs(X - 72) - half) < 1.0), hz.OUT)
    # slab joints (as in the source's stone foot)
    for jx in (40, 72, 104):
        cv.paint((yi >= 168) & (yi < 207) & (xi == jx), hz.OUT)
        cv.paint((yi >= 168) & (yi < 207) & (xi == jx + 1), '6f7787')
    cv.paint((yi == 186) & (np.abs(X - 72) <= 61), '232b37')
    cv.paint((yi == 207) & (np.abs(X - 72) <= 64), hz.OUT)
    # small crystal shards growing out of the ledge (inside the column)
    for sx, h in ((24, 6), (60, 5), (96, 7), (118, 5)):
        sh = (yi >= 168) & (yi < 168 + h) & (np.abs(X - sx) <= (yi - 167) * 0.6 + 0.5)
        cv.paint(sh, MID)
        cv.paint(sh & (X < sx), LIGHT)


def sparks(fx, frame):
    rng = random.Random(300 + frame)
    for _ in range(5):
        x = rng.randint(18, 125)
        y = rng.randint(2, 13)
        c = rng.choice(['b4f6f8', 'ffffff', 'e9afee'])
        fx.a[y, x] = (*hz.C[c], 255)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            fx.a[y + dy, x + dx] = (*hz.C['4fdbe8' if c != 'e9afee' else 'd369e2'], 255)


def build(frame):
    cv = hz.Canvas(H)
    fx = hz.Canvas(H)
    X, Y = hz.grid(H)
    for p in PRISMS:
        prism_rows(cv, fx, X, Y, p, TOP, 160, frame)
        prism_point(cv, fx, X, Y, p, frame)
    base(cv, X, Y)
    sparks(fx, frame)
    fx.a[160:] = 0
    hz.remove_isolated(fx)
    return cv, fx


def main(outdir):
    os.makedirs(outdir, exist_ok=True)
    bodies = []
    for f in range(4):
        cv, fx = build(f)
        bodies.append(cv.a.copy())
        fx.save(os.path.join(outdir, f'fx_{f + 1}.png'))
    assert all(np.array_equal(bodies[0], b) for b in bodies), 'body must not change between frames'
    cv.save(os.path.join(outdir, 'body.png'))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(hz.ROOT, 'src', 'build', 'crystal'))
