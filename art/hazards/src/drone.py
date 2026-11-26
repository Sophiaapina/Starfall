"""drone (floater): rotor on top, dark slate body with a cyan band, magenta eye; free at both ends."""
import math, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hz

H = hz.FLOATER_H            # top 0-51, mid 52-99, bottom 100-151
SLATE = ['19171b', '232b37', '232b37', '232b37', '384a58', '384a58', '6f7787']
G = 1.9
BAND = 20                   # cyan band phase in the 48-row mid period
X0, X1 = 12, 131
MID_TOP = 36                # top rows >= 36 repeat the mid pattern (join)


def ymod(y):
    return (y - 52) % 48


RAMP = ['19171b', '232b37', '384a58', '6f7787']
CL = np.array([[0, 2], [3, 1]]) / 4.0          # 2x2-cluster ordered dither (no isolated pixels)
LV = np.array([-0.55, -0.45, 0.70]); LV = LV / np.linalg.norm(LV)


def shade3d(cv, mask, nx, ny, xi, yd):
    """Lambert on a surface normal (nx, ny, nz), banded into RAMP with a clustered dither between steps.
    yd: the row index used for the dither pattern (ymod for repeating parts, so the tile stays periodic)."""
    nz = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1))
    b = np.clip(LV[0] * nx + LV[1] * ny + LV[2] * nz, 0, 1) ** 1.4
    t = b * (len(RAMP) - 1) + (CL[(yd // 2) % 2, (xi // 2) % 2] - 0.5) * 0.45
    idx = np.clip(np.floor(t + 0.5).astype(int), 0, len(RAMP) - 1)
    cv.paint_idx(mask, RAMP, idx)
    cv.paint(mask & (b > 0.965), '9aa2a1')                     # specular
    cv.paint(mask & (nx < -0.74) & (nz > 0.2), '4b2b5e')       # violet rim, follows the curve


def body_rows(cv, fx, X, Y, y0, y1, frame):
    """Repeating body segment (function of ymod, period 48)."""
    xi = (X - 0.5).astype(int)
    yi = (Y - 0.5).astype(int)
    m = ymod(yi)
    rows = (yi >= y0) & (yi < y1)
    body = rows & (xi >= X0) & (xi <= X1)
    shade3d(cv, body, (X - 72) / 61.0, np.zeros_like(X), xi, m)
    cv.paint(body & ((xi == X0) | (xi == X1)), hz.OUT)
    # cyan band (a ring around the body) with flicker
    band = body & (m >= BAND) & (m < BAND + 4) & (xi > X0) & (xi < X1)
    edge, core = [('1f9ab0', '4fdbe8'), ('1f9ab0', '4fdbe8'), ('4fdbe8', 'b4f6f8'), ('0f4c5a', '1f9ab0')][frame]
    fx.paint(band & ((m == BAND) | (m == BAND + 3)), edge)
    fx.paint(band & ((m == BAND + 1) | (m == BAND + 2)), core)
    cv.paint(rows & (xi >= X0) & (xi <= X1) & ((m == BAND - 1) | (m == BAND + 4)), '19171b')


def top_piece(cv, fx, X, Y, frame):
    xi = (X - 0.5).astype(int)
    yi = (Y - 0.5).astype(int)
    # dome: rounds from row 12 to full width at row 40 (the 28-row taper zone)
    d = np.hypot((X - 72) / 60.0, (Y - 40) / 28.0)
    dome = (d <= 1.0) & (yi >= 12) & (yi < MID_TOP) & (xi >= X0) & (xi <= X1)
    shade3d(cv, dome, (X - 72) / 61.0, np.minimum(0, (Y - 40) / 29.0), xi, ymod(yi))
    cv.paint(hz.edge_of(dome) & dome & (yi < MID_TOP - 1), hz.OUT)
    # side join: the dome meets the straight body at MID_TOP; fill the corners below the dome curve
    body_rows(cv, fx, X, Y, MID_TOP, 52, frame)
    corner = (yi >= 24) & (yi < MID_TOP) & ~dome & (xi >= X0) & (xi <= X1)
    cv.paint(corner & (d <= 1.06), hz.OUT)
    # rotor hub (static, on the body layer): a squat cap on a short mast, rows 3-13
    hubm = (np.abs(X - 72) <= 5) & (yi >= 9) & (yi <= 13)
    cv.paint(hubm, '232b37')
    cv.paint(hubm & (np.abs(X - 72) > 4), hz.OUT)
    cap = (np.hypot((X - 72) / 13.0, (Y - 7) / 4.6) <= 1.0) & (yi >= 3) & (yi <= 10)
    cv.paint(cap, '384a58')
    cv.paint(cap & (Y < 6.5) & (X < 72), '6f7787')
    cv.paint(cap & (Y < 5) & (np.abs(X - 66) < 3), '9aa2a1')
    cv.paint(cap & (X > 76), '232b37')
    cv.paint(hz.edge_of(cap) & cap, hz.OUT)
    # rotor: two thick blades (even frames) / a blur disc (odd frames), inside x 12..131
    clear = (np.abs(X - 72) <= 13) & (yi >= 2) & (yi <= 11)
    if frame % 2 == 0:
        for side in (-1, 1):
            u = (X - 72) * side                     # distance from the hub along the blade
            thick = np.where(u > 50, 2, 3)
            blade = (u >= 12) & (u <= 59) & (yi >= 6 - thick // 2 - 1) & (yi <= 6 + thick // 2) & ~clear
            blade &= (xi >= X0) & (xi <= X1)
            fx.paint(blade, '384a58')
            fx.paint(blade & (yi <= 5), '6f7787')
            fx.paint(blade & (yi == 7), '19171b')
            tip = blade & (u > 50)
            fx.paint(tip, 'a03fa0')
            fx.paint(tip & (yi <= 5), 'ff5ee0')
    else:
        d = np.hypot((X - 72) / 59.5, (Y - 6) / 3.6)
        disc = (d <= 1.0) & ~clear & (xi >= X0) & (xi <= X1)
        th = CL[(yi // 2) % 2, (xi // 2) % 2]
        fx.paint(disc & (th < 0.55), '232b37')
        fx.paint(disc & (th < 0.55) & (np.abs(Y - 6) < 1.5), '6f7787')
        fx.paint(disc & (d > 0.82) & (th < 0.8), 'a03fa0')


def bottom_piece(cv, fx, X, Y, frame):
    xi = (X - 0.5).astype(int)
    yi = (Y - 0.5).astype(int)
    # collar across the top rows (covers the cut mid), straight hull to row 112, then the round underside
    col = (yi >= 100) & (yi < 104) & (xi >= X0) & (xi <= X1)
    cv.paint(col, '232b37')
    cv.paint(col & (yi == 101), '6f7787')
    cv.paint(col & ((yi == 100) | (yi == 103) | (xi == X0) | (xi == X1)), hz.OUT)
    d = np.hypot((X - 72) / 60.0, (Y - 112) / 28.0)
    hull = (yi >= 104) & (xi >= X0) & (xi <= X1) & ((yi < 112) | (d <= 1.0)) & (yi <= 139)
    shade3d(cv, hull, (X - 72) / 61.0, np.maximum(0, (Y - 112) / 29.0), xi, yi)
    cv.paint(hz.edge_of(hull) & hull & (yi > 104), hz.OUT)
    cv.paint(hull & ((xi == X0) | (xi == X1)), hz.OUT)
    # lower cyan band (underglow ring)
    lb = hull & (yi >= 126) & (yi <= 128) & ~hz.edge_of(hull)
    edge, core = [('1f9ab0', '4fdbe8'), ('1f9ab0', '4fdbe8'), ('4fdbe8', 'b4f6f8'), ('0f4c5a', '1f9ab0')][frame]
    fx.paint(lb & (yi != 127), edge)
    fx.paint(lb & (yi == 127), core)
    # gun nub at the lower back (left), as in the source
    from PIL import Image, ImageDraw
    im = Image.new('L', (hz.W, H), 0)
    ImageDraw.Draw(im).polygon([(14, 112), (34, 112), (36, 118), (26, 136), (14, 134)], fill=255)
    nub = np.array(im) > 0
    cv.paint(nub, '232b37')
    cv.paint(nub & (yi <= 114), '6f7787')
    cv.paint(nub & (xi <= 16), '4b2b5e')
    cv.paint(hz.edge_of(nub) & nub, hz.OUT)
    # the eye pod: a large grey housing on the front (right), magenta lens, pulsing
    ex, ey = 106.0, 122.0
    r = np.hypot(X - ex, Y - ey)
    house = (r <= 20) & (yi >= 104)
    shade3d(cv, house, (X - ex) / 21.0, (Y - ey) / 21.0, xi, yi)
    cv.paint(house & (r > 19), hz.OUT)
    inb = yi >= 104
    cv.paint((r <= 15) & (r > 13) & inb, '19171b')
    cv.paint((r <= 13) & inb, '232b37')
    lens = (r <= 11.5) & inb
    outer, mid, hot = [('5c4254', 'a03fa0', 'ff5ee0'), ('a03fa0', 'ff5ee0', 'f2c8f4'),
                       ('a03fa0', 'ff5ee0', 'ffffff'), ('5c4254', 'a03fa0', 'ff5ee0')][frame]
    fx.paint(lens, outer)
    fx.paint((r <= 8.0) & inb, mid)
    fx.paint((r <= 3.5) & inb, hot)
    fx.paint((np.abs(X - (ex - 4)) < 1.5) & (np.abs(Y - (ey - 4)) < 1.0), 'ffffff')
    # underglow in the overhang rows (cyan, clustered dither so nothing is isolated)
    th = CL[(yi // 2) % 2, (xi // 2) % 2]
    dg = np.hypot((X - 72) / 44.0, (Y - 140) / 12.0)
    glow = (yi >= 136) & (yi <= 151) & (dg <= 1.0) & ~cv.alpha() & (xi >= X0) & (xi <= X1)
    dens = (1.0 - dg) * (0.9 if frame % 2 == 0 else 0.7)
    fx.paint(glow & (th < dens), '1f9ab0')
    fx.paint(glow & (th < dens - 0.45), '4fdbe8')


def build(frame):
    cv = hz.Canvas(H)
    fx = hz.Canvas(H)
    X, Y = hz.grid(H)
    body_rows(cv, fx, X, Y, 52, 100, frame)       # mid
    top_piece(cv, fx, X, Y, frame)
    bottom_piece(cv, fx, X, Y, frame)
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
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(hz.ROOT, 'src', 'build', 'drone'))
