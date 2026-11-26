"""lasergate (round B, column): resampled from the painted laser gate (obstacles_03_compuerta_laser.png).

Pixels come from the painting, horizontally at 1.2x (painting x 11..110 -> lethal x 12..131):
  * the repeating band is painting rows 40..80 stretched to 64 rows: the painted beams and emitter knobs
    repeat every ~20 painting rows, so the stretch puts exactly two beams per tile, 32 rows apart;
    its last 8 rows blend into the rows just above it, so it tiles;
  * tip = the painted post heads and top beam (painting rows 0..30), flowing into the band;
  * base = band rows 0..9 (posts + a beam) over the painted foot plates (painting rows 118..150).
Glow is baked against the game background so it survives the palette snap.
Animation (fx): the beams pulse, and a bright pulse runs along each beam.
"""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hz
from crystal import premul_resize

H = hz.COLUMN_H
SRC = 'obstacles_03_compuerta_laser.png'
PX0, PX1 = 11, 111            # painting x range mapped onto the lethal column
BG = np.array([20, 16, 32], float)


def sample(src, py0, py1, ny):
    crop = Image.fromarray(src[py0:py1, PX0:PX1].astype(np.uint8), 'RGBA')
    return premul_resize(crop, (120, ny))


def bake(a, cut=70):
    """Composite partial alpha onto the game background (glow), then threshold."""
    al = a[..., 3:4] / 255.0
    rgb = a[..., :3] * al + BG * (1 - al)
    out = np.concatenate([rgb, np.where(a[..., 3:4] >= cut, 255.0, 0.0)], -1)
    return out


def body_float():
    src = np.asarray(hz.load_src(SRC), np.float64)
    W0 = hz.LETHAL_X0
    canvas = np.zeros((H, hz.W, 4))
    # band with 8 extra rows in front (painting rows 35..80 -> 72 rows), blended so row 63 leads into row 0
    ext = sample(src, 35, 80, 72)
    band = ext[8:72].copy()
    for k in range(8):
        w = (k + 1) / 8.0
        band[56 + k] = band[56 + k] * (1 - w) + ext[k] * w
    head = sample(src, 0, 30, 36)            # canvas rows 12..47
    feet = sample(src, 118, 150, 38)          # canvas rows 170..207
    feet_r = sample(src, 110, 142, 38)        # the painted right foot sits 8 rows higher: bring it to the floor
    feet[:, 66:] = feet_r[:, 66:]
    cols = slice(W0, W0 + 120)
    canvas[12:48, cols] = head
    for y in range(48, 96):
        canvas[y, cols] = band[(y - 96) % 64]
    for y in range(44, 52):                  # blend head into band
        w = (y - 43) / 9.0
        hrow = head[min(y - 12, 35)]
        canvas[y, cols] = hrow * (1 - w) + band[(y - 96) % 64] * w
    for y in range(96, 160):
        canvas[y, cols] = band[y - 96]
    for y in range(160, 170):
        canvas[y, cols] = band[y - 160]
    canvas[170:208, cols] = feet
    for y in range(166, 174):                # blend band into feet
        w = (y - 165) / 9.0
        canvas[y, cols] = band[min(y - 160, 63)] * (1 - w) + feet[max(0, y - 170)] * w
    return canvas


def build_body():
    cv = hz.Canvas(H)
    cv.a[:] = hz.snap(bake(body_float()), alpha_cut=128)
    hz.remove_isolated(cv)
    cv.a[159] = cv.a[95]
    return cv


def beam_mask(cv):
    a = cv.a
    rgb = a[..., :3].astype(int)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    xs = np.arange(hz.W)[None, :].repeat(H, 0)
    return (a[..., 3] > 0) & (g > 150) & (b > 150) & (r < 200 + 60) & (xs > 44) & (xs < 112)


def build_fx(cv, frame):
    fx = hz.Canvas(H)
    a = cv.a
    rgb = a[..., :3].astype(int)
    lum = 0.3 * rgb[..., 0] + 0.59 * rgb[..., 1] + 0.11 * rgb[..., 2]
    beams = beam_mask(cv)
    ramp = ['1f9ab0', '4fdbe8', 'b4f6f8', 'ffffff']
    step = [0, 1, 0, -1][frame]
    lvl = np.clip(np.digitize(lum, [140, 190, 230]) + step, 0, 3)
    for k, c in enumerate(ramp):
        fx.paint(beams & (lvl == k), c)
    # a bright pulse running along the beams (left to right, one quarter of the span per frame)
    xs = np.arange(hz.W)[None, :].repeat(H, 0)
    px = 48 + frame * 16
    fx.paint(beams & (np.abs(xs - px) <= 3) & (lum > 170), 'ffffff')
    # the top beam (the gate's free end) is always the brightest
    top = beams & (np.arange(H)[:, None] < 48)
    fx.paint(top & (lum > 150), 'ffffff' if frame % 2 == 0 else 'b4f6f8')
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
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(hz.ROOT, 'src', 'build', 'lasergate'))
