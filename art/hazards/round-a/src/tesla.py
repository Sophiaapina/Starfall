"""tesla: a thick purple pylon with coil rings; the free end is the emitter with pink-white lightning."""
import math, os, random, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hz

H = hz.COLUMN_H
X0, X1 = 14, 129            # pylon body, inclusive (116 px)
PANEL = (58, 85)            # recessed centre panel, inclusive
RINGS = (2, 18, 34, 50)     # coil winding phases in the 64-row shaft period (6 rows each)
RING_H = 6
TOP = 44                    # full-width body starts here (end of the 28-row taper zone)


def ymod(y):
    return (y - 96) % 64


def pylon_rows(cv, fx, X, Y, y0, y1, frame):
    """The repeating pylon pattern for rows y0..y1-1 (function of ymod only)."""
    xi = (X - 0.5).astype(int)
    yi = (Y - 0.5).astype(int)
    m = ymod(yi)
    rows = (yi >= y0) & (yi < y1)
    body = rows & (xi >= X0) & (xi <= X1)
    # faceted faces: lit left face, front, shadowed right face
    cv.paint(body, '33283e')
    cv.paint(body & (xi < X0 + 14), '4b2b5e')
    cv.paint(body & (xi > X1 - 14), '201927')
    cv.paint(body & (xi == X0 + 14), '201927')            # facet crease
    cv.paint(body & (xi == X1 - 14), '0c0a0e')
    cv.paint(body & (xi >= X0 + 3) & (xi <= X0 + 6), '724683')   # lit face catches more light
    cv.paint(body & (xi == X0 + 1), '1f9ab0')             # teal edge light (as in the source)
    cv.paint(body & (xi == X0 + 2), '4fdbe8')
    cv.paint(body & (xi == X1 - 1), '4b2b5e')             # violet rim on the dark side
    cv.paint(body & ((xi == X0) | (xi == X1)), hz.OUT)
    # recessed panel
    pan = body & (xi >= PANEL[0]) & (xi <= PANEL[1])
    cv.paint(pan, '201927')
    cv.paint(pan & ((xi == PANEL[0]) | (xi == PANEL[1])), '0c0a0e')
    cv.paint(pan & (xi == PANEL[0] + 1), '33283e')
    # coil rings: wider than the body, lighter violet with a bright top edge
    for r0 in RINGS:
        ring = rows & (m >= r0) & (m < r0 + RING_H) & (xi >= 12) & (xi <= 131)
        rr = m - r0
        cv.paint(ring, '724683')
        cv.paint(ring & (rr == 1) & (xi < 100), 'baa0c7')
        cv.paint(ring & (rr == 1) & (xi < 40), 'f2c8f4')
        cv.paint(ring & (rr >= 3), '4b2b5e')
        cv.paint(ring & (xi > 112) & (rr >= 2), '33283e')
        cv.paint(ring & ((rr == 0) | (rr == RING_H - 1) | (xi == 12) | (xi == 131)), hz.OUT)
    # glow line in the panel, with a pulse travelling toward the tip, 16 rows per frame
    line = body & (xi >= 70) & (xi <= 73) & ~ring_mask(m)
    fx.paint(line, '4b2b5e')
    fx.paint(line & (xi >= 71) & (xi <= 72), '5c4254')
    c = (56 - 16 * frame) % 64
    dist = (m - c) % 64
    dist = np.minimum(dist, 64 - dist)
    band = body & (xi > PANEL[0]) & (xi < PANEL[1]) & ~ring_mask(m)
    fx.paint(band & (dist <= 5), '5c4254')
    fx.paint(band & (dist <= 3) & (xi >= 66) & (xi <= 77), 'a03fa0')
    fx.paint(line & (dist <= 6), 'a03fa0')
    fx.paint(line & (dist <= 3), 'ff5ee0')
    fx.paint(line & (dist <= 1) & (xi >= 71) & (xi <= 72), 'f2c8f4')
    for r0 in RINGS:
        lit = rows & (m == r0 + 1) & (xi > 12) & (xi < 131) & (dist <= 9)
        fx.paint(lit, 'ff5ee0')
        fx.paint(lit & (np.abs(xi - 72) <= 20), 'f2c8f4')


def ring_mask(m):
    out = np.zeros_like(m, dtype=bool)
    for r0 in RINGS:
        out |= (m >= r0) & (m < r0 + RING_H)
    return out


def bolt_points(rng, start, end, steps, jitter):
    pts = [start]
    for i in range(1, steps):
        t = i / steps
        x = start[0] + (end[0] - start[0]) * t + rng.uniform(-jitter, jitter)
        y = start[1] + (end[1] - start[1]) * t + rng.uniform(-jitter * 0.5, jitter * 0.5)
        pts.append((x, y))
    pts.append(end)
    return pts


def raster_line(p, q):
    (x0, y0), (x1, y1) = p, q
    n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    return [(int(round(x0 + (x1 - x0) * i / n)), int(round(y0 + (y1 - y0) * i / n))) for i in range(n + 1)]


def lightning(fx, frame):
    """One bright vertical trunk rising off the emitter, thin forks that branch upward (as in the source)."""
    rng = random.Random(2000 + frame * 31)
    trunk, forks = set(), set()
    top = (72 + rng.uniform(-10, 10), 0)
    pts = bolt_points(rng, (72, 30), top, 7, 6)
    for a, b in zip(pts, pts[1:]):
        for x, y in raster_line(a, b):
            trunk.update({(x, y), (x + 1, y)})
    for k in range(3):
        j = rng.randint(1, 4)
        sx, sy = pts[j]
        side = (-1, 1, rng.choice((-1, 1)))[k]
        end = (sx + side * rng.uniform(10, 24), max(0, sy - rng.uniform(10, 20)))
        fp = bolt_points(rng, (sx, sy), end, 3, 3)
        for a, b in zip(fp, fp[1:]):
            forks.update(raster_line(a, b))
        if rng.random() < 0.7:     # a twig off the fork
            tx, ty = fp[1]
            te = (tx + side * rng.uniform(5, 10), max(0, ty - rng.uniform(4, 8)))
            forks.update(raster_line((tx, ty), te))
    keep = lambda s: {(x, y) for x, y in s if 14 <= x <= 129 and 0 <= y < 36}
    trunk, forks = keep(trunk), keep(forks)
    a = np.zeros((H, hz.W), bool)
    for x, y in trunk | forks:
        a[y, x] = True
    glow = a.copy()
    glow[1:] |= a[:-1]; glow[:-1] |= a[1:]; glow[:, 1:] |= a[:, :-1]; glow[:, :-1] |= a[:, 1:]
    lim = np.zeros_like(a); lim[0:44, 12:132] = True
    fx.paint(glow & ~a & lim, 'ff5ee0')
    for x, y in forks:
        fx.paint_px = None
    fx.paint(a, 'f2c8f4')
    t = np.zeros_like(a)
    for x, y in trunk:
        t[y, x] = True
    fx.paint(t, 'ffffff')


BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0


def aura(fx, cv, X, Y, frame):
    """Magenta glow around the emitter, filling the lethal band beside the cap: ordered-dither falloff."""
    grow = (0, 2, 3, 1)[frame]
    d = np.hypot((X - 72) / (52.0 + grow), (Y - 36) / (26.0 + grow / 2))
    xi = (X - 0.5).astype(int)
    yi = (Y - 0.5).astype(int)
    th = BAYER4[(yi // 2) % 4, (xi // 2) % 4]     # 2x2 clusters: no isolated pixels
    lim = (yi < 44) & (xi >= 12) & (xi <= 131)
    free = lim & ~cv.alpha()
    dens = np.clip(1.15 - d, 0, 1)          # 1 near the core, 0 at the rim
    on = free & (th < dens * 0.9)
    fx.paint(on, '4b2b5e')
    fx.paint(on & (d < 0.75), '5c4254')
    fx.paint(on & (d < 0.5), 'a03fa0')
    fx.paint(on & (d < 0.3), 'ff5ee0')


def emitter(cv, fx, X, Y, frame):
    xi = (X - 0.5).astype(int)
    yi = (Y - 0.5).astype(int)
    # chamfered shoulders: the body narrows from full width at row TOP to 72 px at row 32
    for y in range(38, TOP):
        t = (TOP - y) / (TOP - 38)
        half = 58 - t * 20
        row = (yi == y) & (np.abs(X - 72) <= half)
        cv.paint(row, '33283e')
        cv.paint(row & (X - 72 < -half + 3), '4b2b5e')
        cv.paint(row & (X - 72 > half - 3), '201927')
        cv.paint(row & ((np.abs(np.abs(X - 72) - half) < 1.0)), hz.OUT)
    cv.paint((yi == 38) & (np.abs(X - 72) <= 38), hz.OUT)
    cv.paint((yi == 39) & (np.abs(X - 72) <= 37), '724683')
    # emitter dome with a glowing core
    d = np.hypot((X - 72) / 18.0, (Y - 39) / 12.0)
    dome = (d <= 1.0) & (yi <= 39) & (yi >= 27)
    cv.paint(dome, '4b2b5e')
    cv.paint(dome & (X < 66), '724683')
    cv.paint(dome & (d > 0.88), hz.OUT)
    pass


def emitter_core(fx, X, Y, frame):
    yi = (Y - 0.5).astype(int)
    d = np.hypot((X - 72) / 18.0, (Y - 39) / 12.0)
    dome = (d <= 1.0) & (yi <= 39) & (yi >= 27)
    pulse = ['ff5ee0', 'f2c8f4', 'ffffff', 'f2c8f4'][frame]
    fx.paint((np.hypot((X - 72) / 8.0, (Y - 35) / 5.0) <= 1.0) & dome, 'ff5ee0')
    fx.paint((np.hypot((X - 72) / 5.0, (Y - 35) / 3.5) <= 1.0) & dome, pulse)
    fx.paint((np.hypot((X - 72) / 2.5, (Y - 35) / 1.8) <= 1.0) & dome, 'ffffff')


def base(cv, X, Y):
    xi = (X - 0.5).astype(int)
    yi = (Y - 0.5).astype(int)
    # collar: a full-width coil ring across the top rows (covers the cut shaft)
    col = (yi >= 160) & (yi < 168) & (xi >= 12) & (xi <= 131)
    rr = yi - 160
    cv.paint(col, '4b2b5e')
    cv.paint(col & (rr == 1), '724683')
    cv.paint(col & (rr == 2), 'baa0c7')
    cv.paint(col & (rr >= 5), '33283e')
    cv.paint(col & (rr == 3) & (xi > 14) & (xi < 129), '1f9ab0')
    cv.paint(col & ((rr == 0) | (rr == 7) | (xi == 12) | (xi == 131)), hz.OUT)
    # flared foot: widens from the body to 8..135 at the floor
    for y in range(168, 208):
        t = (y - 168) / 39.0
        half = 58 + t * 6
        row = (yi == y) & (np.abs(X - 72) <= half)
        cv.paint(row, '33283e')
        cv.paint(row & (X - 72 < -half + 15), '4b2b5e')
        cv.paint(row & (X - 72 > half - 15), '201927')
        cv.paint(row & (np.abs(X - 72 + half - 2) < 1.0), '1f9ab0')
        cv.paint(row & (np.abs(np.abs(X - 72) - half) < 1.0), hz.OUT)
    arch = ((yi >= 182) & (yi <= 200) & (xi >= 58) & (xi <= 85)) | ((yi < 182) & (yi >= 170) & (np.hypot((X - 72) / 14.0, (Y - 182) / 12.0) <= 1.0))
    cv.paint(arch, '201927')
    cv.paint(hz.edge_of(arch), hz.OUT)
    cv.paint(arch & (xi == 59) & (yi > 178), '33283e')
    cv.paint((yi >= 204) & (yi <= 207) & (np.abs(X - 72) <= 64), '201927')
    cv.paint((yi == 207) & (np.abs(X - 72) <= 64), hz.OUT)
    cv.paint((yi == 204) & (np.abs(X - 72) <= 63), '4b2b5e')


def build(frame):
    cv = hz.Canvas(H)
    fx = hz.Canvas(H)
    X, Y = hz.grid(H)
    pylon_rows(cv, fx, X, Y, TOP, 160, frame)
    emitter(cv, fx, X, Y, frame)
    base(cv, X, Y)
    aura(fx, cv, X, Y, frame)
    lightning(fx, frame)
    # re-light the emitter core over the aura
    emitter_core(fx, X, Y, frame)
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
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(hz.ROOT, 'src', 'build', 'tesla'))
