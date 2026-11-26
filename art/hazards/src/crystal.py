"""crystal (round B): resampled from the painted crystal cluster (obstacles_11_generador_electrico.png).

The painting is the source of the pixels:
  1. the side crystals are cut out and moved up so the column is full by row 60 (points may taper above);
  2. the arranged painting is resampled to 0.9x and placed so its body spans the lethal column x 12..131;
  3. tip = canvas rows 0..95 as resampled; shaft = the band below it, made to tile every 64 rows by
     blending its last rows into the rows just above the band (so shaft row 63 == tip row 95);
  4. base = the painted crystal feet over an invented dark violet rock foot with a few shards;
  5. everything is snapped to the shared palette (grown with colours from the painting).
Animation (fx layer): the cyan cores pulse; a glint sweeps across the lit facets.
"""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hz

H = hz.COLUMN_H
SRC = 'obstacles_11_generador_electrico.png'
SCALE = 0.9
SPLIT_L, SPLIT_R = 41, 108       # painting x: left strip | main crystal | right strip
SHIFT_L, SHIFT_R = 34, 38        # painting rows the side strips move up
BLEND = 24                        # shaft rows blended into the rows above the band (tiling)


def premul_resize(im, size):
    a = np.asarray(im, np.float64)
    al = a[..., 3:4] / 255.0
    pm = np.concatenate([a[..., :3] * al, a[..., 3:4]], -1)
    chans = [np.asarray(Image.fromarray(pm[..., i].astype(np.float32), 'F').resize(size, Image.LANCZOS)) for i in range(4)]
    out = np.stack(chans, -1)
    alpha = np.clip(out[..., 3], 0, 255)
    rgb = np.where(alpha[..., None] > 1e-3, out[..., :3] / np.maximum(alpha[..., None] / 255.0, 1e-3), 0)
    return np.concatenate([np.clip(rgb, 0, 255), alpha[..., None]], -1)


def over(dst, s):
    a = s[..., 3:4] / 255.0
    dst[..., :3] = s[..., :3] * a + dst[..., :3] * (1 - a)
    dst[..., 3:4] = s[..., 3:4] + dst[..., 3:4] * (1 - a)


def arranged():
    """The painting with the side crystals moved up (straight alpha, float)."""
    src = np.asarray(hz.load_src(SRC), np.float64)
    h, w, _ = src.shape
    out = np.zeros_like(src)
    left = np.zeros_like(src); left[:h - SHIFT_L, :SPLIT_L] = src[SHIFT_L:, :SPLIT_L]
    right = np.zeros_like(src); right[:h - SHIFT_R, SPLIT_R:] = src[SHIFT_R:, SPLIT_R:]
    centre = np.zeros_like(src); centre[:, SPLIT_L:SPLIT_R] = src[:, SPLIT_L:SPLIT_R]
    over(out, left)
    over(out, right)
    over(out, centre)
    return out


def canvas_from(arr):
    """Resample the arranged painting by SCALE and place painting x 13 at canvas x 12."""
    h, w, _ = arr.shape
    nw, nh = int(round(w * SCALE)), int(round(h * SCALE))
    r = premul_resize(Image.fromarray(arr.astype(np.uint8), 'RGBA'), (nw, nh))
    cv = np.zeros((max(H, nh), hz.W, 4))
    dx = 12 - int(round(13 * SCALE))
    for x in range(nw):
        X = x + dx
        if 0 <= X < hz.W:
            cv[:nh, X] = r[:, x]
    return cv[:H]


def body_float():
    c = canvas_from(arranged())
    c[:, :hz.LETHAL_X0] = 0
    c[:, hz.LETHAL_X1 + 1:] = 0
    shaft = c[96:160].copy()
    for k in range(BLEND):
        r = 64 - BLEND + k
        w = (k + 1) / BLEND
        shaft[r] = shaft[r] * (1 - w) + c[96 - BLEND + k] * w
    body = np.zeros((H, hz.W, 4))
    body[0:96] = c[0:96]
    body[96:160] = shaft
    body[160:208] = c[160:208]
    return body


def shadow_fill(body):
    """Fill holes inside the column (rows 60..175) with the nearest painted crystal colour in that row,
    darkened, so gaps read as crystal in shadow rather than as a slab."""
    b = body.copy()
    for y in range(60, 184):
        row = b[y]
        op = np.where(row[hz.LETHAL_X0:hz.LETHAL_X1 + 1, 3] >= 128)[0] + hz.LETHAL_X0
        if len(op) == 0:
            continue
        for x in range(hz.LETHAL_X0, hz.LETHAL_X1 + 1):
            if row[x, 3] < 128:
                j = op[np.abs(op - x).argmin()]
                d = abs(j - x)
                k = max(0.32, 0.62 - d * 0.012)
                row[x, :3] = row[j, :3] * k + np.array([20, 10, 45]) * (1 - k)
                row[x, 3] = 255
    return b


def calm_shaft_cyan(cv):
    """The repeating tile keeps one central core; side cyan becomes deep violet so tall columns don't ladder."""
    a = cv.a[96:159]
    rgb = a[..., :3].astype(int)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    cyan = (a[..., 3] > 0) & (b > 150) & (g > 110) & (b > r + 40)
    xs = np.arange(hz.W)[None, :].repeat(a.shape[0], 0)
    side = cyan & ((xs > 92) | (xs < 52))
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    for lo, c in ((0, '2a0d5d'), (110, '472e80'), (160, '6c4eaf'), (205, '7373c9')):
        m = side & (lum >= lo)
        a[m] = (*hz.hex2rgb(c), 255)


def build_body():
    cv = hz.Canvas(H)
    bf = body_float()
    # fill the shaft from its own tile so the fill also repeats every 64 rows
    bf = shadow_fill(bf)
    cv.a[:] = hz.snap(bf)
    fill_and_foot(cv)
    calm_shaft_cyan(cv)
    cv.a[159] = cv.a[95]          # the shaft's last row IS the tip's last row: one seam, identical everywhere
    return cv


def fill_dark(cv, mask, xi, yi):
    cv.paint(mask, '201927')
    cv.paint(mask & (((xi + yi) // 3) % 7 == 0), '33283e')


def fill_and_foot(cv):
    X, Y = hz.grid(H)
    xi = (X - 0.5).astype(int)
    yi = (Y - 0.5).astype(int)
    lethal = (xi >= hz.LETHAL_X0) & (xi <= hz.LETHAL_X1)
    # fairness: from row 60 down, holes inside the column get deep indigo crystal shadow
    # (the shaft rows use the row mod 64 so the fill tiles too)
    m = np.where(yi >= 96, (yi - 96) % 64 + 96, yi)
    rock_top = 176 + (np.abs(np.sin(xi * 0.37)) * 4).astype(int)
    rock = lethal & (yi >= rock_top)
    rel = (yi - rock_top) / 32.0
    cv.paint(rock, '201927')
    cv.paint(rock & (rel < 0.18), '4b2b5e')
    cv.paint(rock & (rel >= 0.18) & (rel < 0.4) & (xi < 70), '33283e')
    cv.paint(rock & (rel > 0.75), '19171b')
    for jx in (38, 71, 104):
        cv.paint(rock & (xi == jx) & (yi > rock_top + 2), '0c0a0e')
    cv.paint(rock & ((yi == rock_top) | (yi == 207) | (xi == hz.LETHAL_X0) | (xi == hz.LETHAL_X1)), '0c0a0e')
    for sx, h in ((24, 8), (58, 6), (90, 9), (120, 6)):
        top = 176 - h + 2
        sh = (yi >= top) & (yi < 178) & (np.abs(X - sx) <= (yi - top) * 0.45 + 0.6)
        cv.paint(sh, '7829be')
        cv.paint(sh & (X < sx), 'b22bd0')
        cv.paint(hz.edge_of(sh) & sh, '0c0a0e')
    hz.remove_isolated(cv)


def build_fx(cv, frame):
    fx = hz.Canvas(H)
    X, Y = hz.grid(H)
    xi = (X - 0.5).astype(int)
    yi = (Y - 0.5).astype(int)
    a = cv.a
    rgb = a[..., :3].astype(int)
    opaque = a[..., 3] > 0
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    cyan = opaque & (b > 150) & (g > 110) & (b > r + 40)
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    ramp = ['0f4c5a', '1f9ab0', '4fdbe8', 'b4f6f8', 'ffffff']
    step = [0, 1, 0, -1][frame]
    lvl = np.clip(np.digitize(lum, [70, 120, 170, 215]) + step, 0, 3)
    for k, c in enumerate(ramp):
        fx.paint(cyan & (lvl == k), c)
    m = (yi - 96) % 64
    gl = (m + xi - 16 * frame) % 64
    lit = opaque & ~cyan & (lum > 120) & (r > 130)
    fx.paint(lit & (gl == 0), 'ffffff')
    fx.paint(lit & (gl == 1), 'f2c8f4')
    fx.a[176:] = 0
    hz.remove_isolated(fx)
    fx.a[159] = fx.a[95]
    return fx


def main(outdir):
    os.makedirs(outdir, exist_ok=True)
    cv = build_body()
    cv.save(os.path.join(outdir, 'body.png'))
    for f in range(4):
        build_fx(cv, f).save(os.path.join(outdir, f'fx_{f + 1}.png'))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(hz.ROOT, 'src', 'build', 'crystal'))
