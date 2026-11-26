"""pipes: three dark iron pipes side by side, flanges, cyan light strip; elbows at the free end."""
import math, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hz

H = hz.COLUMN_H
IRON = ['19171b', '252326', '333034', '423e43', '575256', '737072', '9aa2a1']        # flanges, collar
BODY = ['19171b', '19171b', '252326', '252326', '252326', '333034', '333034', '423e43', '575256']  # pipe bodies: dark iron
GAMMA = 1.4
FLANGE = ['19171b', '252326', '333034', '423e43', '575256']
HALO = ['0f4c5a', '1f9ab0', '0f4c5a', '0f4c5a']   # glow around the cyan, pulses with it
RIM = '5c4254'          # magenta-tinted reflected light on the left edge (as in the group sprite)
R_PIPE = 20.0
BEND = 22.0
# pipe: centre x, flange phase in the 64-row shaft period, has cyan strip, cyan ring phase
PIPES = {
    'left':   dict(cx=32.0, flange=8,  strip=False, ring=17),
    'middle': dict(cx=72.0, flange=40, strip=True,  ring=None),
    'right':  dict(cx=112.0, flange=24, strip=False, ring=33),
}
# elbow: (centre of bend, vertical part starts below this y, which side the bend goes)
ELBOW = {
    'left':   dict(C=(32.0 + BEND, 68.0), sign=-1),   # bends right, behind the middle pipe
    'right':  dict(C=(112.0 - BEND, 64.0), sign=+1),  # bends left, behind the middle pipe
    'middle': dict(C=(72.0 + BEND, 61.0), sign=-1),   # bends right, in front, ends in a flange face
}
STRIP_S = (-0.42, -0.30)   # cyan strip position across the middle pipe (s in [-1,1]), 2 px


def ymod(y):
    return (y - 96) % 64


def shade_into(cv, mask, s, rim=True):
    if rim:   # a pipe body
        idx = hz.cyl_shade(s, BODY, gamma=GAMMA)
        cv.paint_idx(mask, BODY, idx)
        cv.paint(mask & (s < -0.56) & (s > -0.9), RIM)
        cv.paint(mask & (s >= -0.36) & (s < -0.28), '737072')   # narrow specular line
    else:     # flange metal: dark iron, one light edge (drawn by the caller)
        idx = hz.cyl_shade(s, FLANGE, gamma=1.3)
        cv.paint_idx(mask, FLANGE, idx)
    # rust / dirt specks, periodic in the shaft period
    return idx


def vpipe(cv, fx, name, y0, y1, X, Y, frame):
    p = PIPES[name]
    cx = p['cx']
    rows = (Y >= y0) & (Y < y1)
    s = (X - cx) / R_PIPE
    body = rows & (np.abs(s) <= 1.0)
    shade_into(cv, body, s)
    yi = (Y - 0.5).astype(int)
    xi = (X - 0.5).astype(int)
    m = ymod(yi)
    speck = hz.hash01(xi, m, 3) < 0.012
    cv.paint(body & speck & (s > -0.5) & (s < 0.5), '423e43')
    cv.paint(hz.edge_of(body) & rows, hz.OUT) if False else None
    # outline only on the vertical silhouette edges (not top/bottom of the band)
    cv.paint(body & (np.abs(s) > 0.93), hz.OUT)
    # flange ring in the shaft period
    f0 = p['flange']
    fr = rows & (m >= f0) & (m < f0 + 9)
    fs = (X - cx) / (R_PIPE + 3)
    fl = fr & (np.abs(fs) <= 1.0)
    shade_into(cv, fl, fs, rim=False)
    cv.paint(fl & ((m == f0) | (m == f0 + 8)), hz.OUT)
    cv.paint(fl & (np.abs(fs) > 0.95), hz.OUT)
    cv.paint(fl & (m == f0 + 1) & (np.abs(fs) < 0.9), '737072')
    # bolts
    for bx in (-0.66, -0.22, 0.22, 0.66):
        bxc = cx + bx * (R_PIPE + 3)
        cv.paint(fl & (np.abs(X - bxc) < 1.0) & (m >= f0 + 3) & (m <= f0 + 5), '19171b')
        cv.paint(fl & (np.abs(X - bxc) < 1.0) & (m == f0 + 3), '575256')
    # cyan strip on the middle pipe, interrupted by the flange
    if p['strip']:
        st = body & ~fr & (s >= STRIP_S[0] - 0.06) & (s < STRIP_S[1] + 0.02)
        fx_strip(fx, st, X, cx, frame)
    if p['ring'] is not None:
        r0 = p['ring']
        rg = body & (m >= r0) & (m < r0 + 2) & (np.abs(s) < 0.9)
        fx_ring(fx, rg, m, r0, frame)


PULSE = [('1f9ab0', '4fdbe8'), ('4fdbe8', 'b4f6f8'), ('1f9ab0', '4fdbe8'), ('0f4c5a', '1f9ab0')]


def fx_strip(fx, mask, X, cx, frame):
    edge, core = PULSE[frame]
    xi = (X - 0.5).astype(int)
    left = xi == xi[mask].min() if mask.any() else None
    fx.paint(mask, core)
    if mask.any():
        fx.paint(mask & left, edge)


def fx_ring(fx, mask, m, r0, frame):
    edge, core = PULSE[frame]
    fx.paint(mask & (m == r0), core)
    fx.paint(mask & (m == r0 + 1), edge)


def elbow(cv, fx, name, X, Y, frame):
    p = PIPES[name]
    e = ELBOW[name]
    Cx, Cy = e['C']
    dx, dy = X - Cx, Y - Cy
    d = np.hypot(dx, dy)
    # quadrant above the centre, on the pipe side
    if Cx > p['cx']:
        quad = (dy <= 0) & (dx <= 0)
    else:
        quad = (dy <= 0) & (dx >= 0)
    s = e['sign'] * (d - BEND) / R_PIPE
    m = quad & (np.abs(d - BEND) <= R_PIPE)
    shade_into(cv, m, s)
    cv.paint(m & (np.abs(s) > 0.93), hz.OUT)
    return m, s


def flange_face(cv, x0, axis, X, Y):
    """A flange seen edge-on at the end of an elbow run: an 8 px wide ring band with bolts."""
    face = (X >= x0) & (X < x0 + 8) & (np.abs(Y - axis) <= R_PIPE + 3)
    fs = (Y - axis) / (R_PIPE + 3)
    cv.paint_idx(face, IRON, hz.cyl_shade(fs, IRON, light=(-0.8, 0.6), gamma=GAMMA))
    xi = (X - 0.5).astype(int)
    cv.paint(face & (xi == int(x0) + 1), '737072')
    cv.paint(face & ((np.abs(fs) > 0.94) | (xi == int(x0)) | (xi == int(x0) + 7)), hz.OUT)
    for by in (-0.7, -0.25, 0.25, 0.7):
        bolt = face & (np.abs(Y - (axis + by * (R_PIPE + 3))) < 1.0) & (np.abs(X - (x0 + 4.5)) < 1.5)
        cv.paint(bolt, '19171b')


def build(frame):
    cv = hz.Canvas(H)
    fx = hz.Canvas(H)
    X, Y = hz.grid(H)
    order = ['left', 'right', 'middle']
    for name in order:
        p = PIPES[name]
        e = ELBOW[name]
        Cx, Cy = e['C']
        # vertical part from the elbow start down to the base collar (shaft pattern continues)
        vpipe(cv, fx, name, Cy, 160 + 48, X, Y, frame)
        m, s = elbow(cv, fx, name, X, Y, frame)
        if name == 'left':
            flange_face(cv, Cx - 1, Cy - BEND, X, Y)
        if name == 'middle':
            # horizontal run after the bend, then a flange face
            axis = Cy - BEND
            run = (X >= Cx) & (X < Cx + 16) & (np.abs(Y - axis) <= R_PIPE)
            hs = (Y - axis) / R_PIPE
            shade_into(cv, run, hs)
            cv.paint(run & (np.abs(hs) > 0.93), hz.OUT)
            flange_face(cv, Cx + 14, axis, X, Y)
            # cyan strip follows the bend and the run
            ds = -(np.hypot(X - Cx, Y - Cy) - BEND) / R_PIPE
            st = m & (ds >= STRIP_S[0] - 0.06) & (ds < STRIP_S[1] + 0.02)
            st |= run & (hs >= STRIP_S[0] - 0.06) & (hs < STRIP_S[1] + 0.02)
            edge, core = PULSE[frame]
            fx.paint(st, core)
            # flange ring just under the bend
        fr = (Y >= Cy + 2) & (Y < Cy + 11)
        fs = (X - p['cx']) / (R_PIPE + 3)
        fl = fr & (np.abs(fs) <= 1.0)
        shade_into(cv, fl, fs, rim=False)
        yy = (Y - 0.5).astype(int)
        cv.paint(fl & ((yy == int(Cy) + 2) | (yy == int(Cy) + 10) | (np.abs(fs) > 0.95)), hz.OUT)
        cv.paint(fl & (yy == int(Cy) + 3) & (np.abs(fs) < 0.9), '737072')
    # ---- base: collar across the top rows, pipe feet, floor plate ----
    yy = (Y - 0.5).astype(int)
    col = (yy >= 160) & (yy < 170) & (X >= 9) & (X < 135)
    cs = (Y - 165) / 5.0
    cidx = hz.cyl_shade(cs, IRON, light=(-0.8, 0.6))
    cv.paint_idx(col, IRON, cidx)
    cv.paint(col & ((yy == 160) | (yy == 169) | (X < 10) | (X >= 134)), hz.OUT)
    for bx in range(16, 130, 12):
        cv.paint(col & (np.abs(X - bx - 0.5) < 1.0) & (yy >= 163) & (yy <= 165), '19171b')
        cv.paint(col & (np.abs(X - bx - 0.5) < 1.0) & (yy == 163), '737072')
    for name in order:
        cx = PIPES[name]['cx']
        ring = (yy >= 188) & (yy < 196) & (np.abs(X - cx) <= R_PIPE + 3)
        fs = (X - cx) / (R_PIPE + 3)
        shade_into(cv, ring, fs, rim=False)
        cv.paint(ring & ((yy == 188) | (yy == 195) | (np.abs(fs) > 0.95)), hz.OUT)
    plate = (yy >= 196) & (yy <= 207) & (X >= 8) & (X < 136)
    ps = (Y - 201) / 6.0
    cv.paint_idx(plate, IRON, hz.cyl_shade(ps, IRON, light=(-0.8, 0.6)))
    cv.paint(plate & ((yy == 196) | (yy == 207) | (X < 9) | (X >= 135)), hz.OUT)
    cv.paint(plate & (yy == 197) & (X >= 10) & (X < 134), '737072')
    # no fx above the collar line inside the base area except on pipes (strips already clipped by y<208)
    fx.a[160:170] = 0
    fx.a[188:208] = 0
    # glow: a 1 px halo around every cyan pixel, only where there is iron underneath
    lit = fx.alpha()
    grow = lit.copy()
    grow[1:] |= lit[:-1]; grow[:-1] |= lit[1:]; grow[:, 1:] |= lit[:, :-1]; grow[:, :-1] |= lit[:, 1:]
    halo = grow & ~lit & cv.alpha()
    halo[160:170] = False
    halo[188:208] = False
    fx.paint(halo, HALO[frame])
    return cv, fx


def main(outdir):
    os.makedirs(outdir, exist_ok=True)
    bodies = []
    for f in range(4):
        cv, fx = build(f)
        bodies.append(cv.a.copy())
        fx.save(os.path.join(outdir, f'fx_{f + 1}.png'))
    assert all(np.array_equal(bodies[0], b) for b in bodies), 'body must not change between frames'
    hz.Canvas(H).image()
    cv.save(os.path.join(outdir, 'body.png'))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(hz.ROOT, 'src', 'build', 'pipes'))
