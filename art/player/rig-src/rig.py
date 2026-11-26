"""Two-bone limb renderer for the Starfall astronaut rig (round 2).

Draws each limb pose as a hard-edged 1x RGBA image in the locked palette:
tapered segments, light from the upper right, an inside outline per segment,
and the suit trim (shoulder pad stripe, forearm stripe, cuff, finger lines,
knee seam, boot cuff, sole). No resampling, no partial alpha.
"""
import math
from PIL import Image

W, H = 96, 176
OUT = (13, 10, 18)          # #0d0a12
SEAM = (23, 19, 29)         # #17131d
C = {
    '17': (23, 19, 29), '21': (33, 28, 40), '2c': (44, 39, 51),
    '3a': (58, 52, 67), '4e': (78, 70, 89),
    'tr_d': (58, 41, 83), 'tr': (92, 63, 130), 'tr_l': (136, 98, 189), 'tr_h': (183, 138, 224),
}
# shadow, base, lit, highlight per limb
RAMP = {
    'arm-near': (C['2c'], C['3a'], C['4e'], C['4e']),
    'leg-near': (C['21'], C['2c'], C['3a'], C['4e']),
    'arm-far':  (C['17'], C['21'], C['2c'], C['2c']),
    'leg-far':  (C['17'], C['21'], C['2c'], C['3a']),
}
LIGHT = (0.55, -0.835)

# joints (canvas px, pixel-centre coordinates)
SHOULDER = {'arm-near': (52.0, 51.0), 'arm-far': (61.0, 54.0)}
HIP = {'leg-near': (50.0, 100.0), 'leg-far': (56.0, 100.0)}
ARM_L = (20.0, 13.0, 11.0)    # upper, fore, glove
LEG_L = (23.0, 22.0)          # thigh, shin


def vec(a):
    r = math.radians(a)
    return (math.cos(r), math.sin(r))


def add(p, d, s):
    return (p[0] + d[0] * s, p[1] + d[1] * s)


class Layer:
    def __init__(self):
        self.px = {}

    def put(self, x, y, c):
        if 0 <= x < W and 0 <= y < H:
            self.px[(x, y)] = c

    def image(self):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for (x, y), c in self.px.items():
            im.putpixel((x, y), c + (255,))
        return im


def capsule(a, b, r0, r1):
    """Return {pixel: (dist, r, t, n, perpOffset)} for a tapered capsule."""
    ax, ay = a
    bx, by = b
    L = math.hypot(bx - ax, by - ay) or 1e-6
    d = ((bx - ax) / L, (by - ay) / L)
    perp = (-d[1], d[0])
    rmax = max(r0, r1) + 1
    out = {}
    for y in range(int(min(ay, by) - rmax - 1), int(max(ay, by) + rmax + 2)):
        for x in range(int(min(ax, bx) - rmax - 1), int(max(ax, bx) + rmax + 2)):
            px, py = x + 0.5, y + 0.5
            t = ((px - ax) * d[0] + (py - ay) * d[1]) / L
            tc = min(1.0, max(0.0, t))
            cx, cy = ax + d[0] * L * tc, ay + d[1] * L * tc
            r = r0 + (r1 - r0) * tc
            dist = math.hypot(px - cx, py - cy)
            if dist <= r:
                n = ((px - cx) / dist, (py - cy) / dist) if dist > 1e-6 else perp
                s = (px - ax) * perp[0] + (py - ay) * perp[1]
                out[(x, y)] = (dist, r, t, n, s, d, perp)
    return out


def ellipse(c, rx, ry):
    out = {}
    for y in range(int(c[1] - ry - 1), int(c[1] + ry + 2)):
        for x in range(int(c[0] - rx - 1), int(c[0] + rx + 2)):
            px, py = x + 0.5, y + 0.5
            u, v = (px - c[0]) / rx, (py - c[1]) / ry
            q = math.hypot(u, v)
            if q <= 1.0:
                n = (u / q, v / q) if q > 1e-6 else (0, -1)
                out[(x, y)] = (q, 1.0, 0, n, 0, (0, 1), (-1, 0))
    return out


def shade(shape, ramp, layer, extra=None):
    """Fill a shape with banded light, then an inside outline; extra(p, info)
    may return a trim colour for a pixel (applied before the outline)."""
    sh, base, lit, hl = ramp
    cols = {}
    for p, info in shape.items():
        dist, r, t, n, s, d, perp = info
        k = (n[0] * LIGHT[0] + n[1] * LIGHT[1]) * min(1.0, dist / max(r, 1e-6) + 0.15)
        if k > 0.58:
            c = hl
        elif k > 0.02:
            c = lit
        elif k < -0.45:
            c = sh
        else:
            c = base
        if extra:
            e = extra(p, info)
            if e:
                c = e
        cols[p] = c
    for p, c in cols.items():
        x, y = p
        edge = any((x + dx, y + dy) not in shape for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        layer.put(x, y, OUT if edge else c)


def arm(name, upper, fore, hand, off=(0, 0)):
    """Angles in degrees, screen space: 0 = forward (+x), 90 = down, 180 = back."""
    sh = add(SHOULDER[name], (1, 0), off[0])
    sh = (sh[0], sh[1] + off[1])
    du, df, dh = vec(upper), vec(fore), vec(hand)
    elbow = add(sh, du, ARM_L[0])
    wrist = add(elbow, df, ARM_L[1])
    tip = add(wrist, dh, ARM_L[2])
    ramp = RAMP[name]
    L = Layer()
    near = name == 'arm-near'
    # upper arm
    shade(capsule(sh, elbow, 7.0 if near else 6.0, 6.5 if near else 5.5), ramp, L)

    # forearm with back stripe and cuff
    def fore_trim(p, info):
        dist, r, t, n, s, d, perp = info
        if t > 0.86:
            return C['tr'] if near else C['tr_d']
        if near and 0.12 < t < 0.8 and 2.0 < s < 5.0:
            return C['tr_h'] if t < 0.24 else C['tr_l']
        return None
    shade(capsule(elbow, wrist, 6.5 if near else 5.5, 6.0 if near else 5.0), ramp, L, fore_trim)

    # glove with finger lines and thumb
    def glove_trim(p, info):
        dist, r, t, n, s, d, perp = info
        if t > 0.45 and round(s - 0.5) in (-2, 1) and dist < r - 1.2:
            return SEAM
        return None
    shade(capsule(wrist, tip, 6.5 if near else 5.5, 5.5 if near else 4.5), ramp, L, glove_trim)
    thumb_c = add(add(wrist, dh, 3.5), (-dh[1], dh[0]), -4.5)  # front side
    shade(capsule(thumb_c, add(thumb_c, dh, 3), 2.2, 2.0), ramp, L)

    if near:
        # shoulder pad on top, with its purple stripe (fixed to the torso)
        def pad_trim(p, info):
            x, y = p
            if (x, y) in {(46, 52), (47, 53), (48, 54), (49, 55), (50, 55), (51, 55), (52, 55)}:
                return C['tr_l']
            if (x, y) == (45, 51):
                return C['tr_h']
            return None
        shade(ellipse((52.0, 51.0), 9.5, 11.0), ramp, L, pad_trim)
    return L, {'shoulder': sh, 'elbow': elbow, 'wrist': wrist, 'tip': tip}


def leg(name, thigh, shin, foot, hip_off=(0, 0)):
    hp = HIP[name]
    hp = (hp[0] + hip_off[0], hp[1] + hip_off[1])
    knee = add(hp, vec(thigh), LEG_L[0])
    ankle = add(knee, vec(shin), LEG_L[1])
    return leg_at(name, hp, knee, ankle, foot)


def leg_at(name, hp, knee, ankle, foot):
    ramp = RAMP[name]
    L = Layer()
    near = name == 'leg-near'
    shade(capsule(hp, knee, 9.0, 8.0), ramp, L)

    def shin_trim(p, info):
        dist, r, t, n, s, d, perp = info
        if 0.80 < t < 0.88:
            return SEAM
        if 0.88 <= t < 0.95:
            return ramp[2]
        return None
    shade(capsule(knee, ankle, 8.0, 7.0), ramp, L, shin_trim)
    # knee seam: front arc
    kx, ky = knee
    for y in range(int(ky - 7), int(ky + 8)):
        for x in range(int(kx - 7), int(kx + 8)):
            px, py = x + 0.5, y + 0.5
            dd = math.hypot(px - kx, py - ky)
            if abs(dd - 5.0) < 0.5 and ((px - kx) * LIGHT[0] + (py - ky) * LIGHT[1]) > 1.0 and (x, y) in L.px and L.px[(x, y)] != OUT:
                L.put(x, y, SEAM)
    f = vec(foot)
    heel = add(ankle, f, -4.5)
    toe = add(ankle, f, 9.0)
    soleN = (-f[1], f[0])

    def boot_trim(p, info):
        dist, r, t, n, s, d, perp = info
        if s > r - 2.6:
            return SEAM
        return None
    shade(capsule(heel, toe, 7.0, 6.5), ramp, L, boot_trim)
    return L, {'hip': hp, 'knee': knee, 'ankle': ankle, 'toe': toe}


def ik(hp, target, l1=LEG_L[0], l2=LEG_L[1], knee_forward=True):
    """Two-bone IK: returns knee for a hip->ankle target, knee bending forward (+x)."""
    dx, dy = target[0] - hp[0], target[1] - hp[1]
    D = min(math.hypot(dx, dy), l1 + l2 - 0.01)
    base = math.atan2(dy, dx)
    cosA = (l1 * l1 + D * D - l2 * l2) / (2 * l1 * D)
    A = math.acos(max(-1, min(1, cosA)))
    # in screen space (y down), subtracting rotates toward +x when pointing down
    ang = base - A if knee_forward else base + A
    knee = (hp[0] + l1 * math.cos(ang), hp[1] + l1 * math.sin(ang))
    ank = (knee[0] + l2 * math.cos(math.atan2(target[1] - knee[1], target[0] - knee[0])),
           knee[1] + l2 * math.sin(math.atan2(target[1] - knee[1], target[0] - knee[0])))
    return knee, ank
