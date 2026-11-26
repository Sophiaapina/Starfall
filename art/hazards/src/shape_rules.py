"""Family-specific shape rules (round B), measured on a 4-frame sheet (default: the plugin export)."""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hz
import preview


def frames(sheet):
    a = Image.open(sheet).convert('RGBA')
    return [a.crop((i * 144, 0, i * 144 + 144, a.height)) for i in range(4)]


def bright(im):
    a = np.asarray(im).astype(int)
    lum = 0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2]
    return (a[..., 3] > 0) & (lum > 170)


def longest(v):
    best = run = 0
    for t in v:
        run = run + 1 if t else 0
        best = max(best, run)
    return best


def lasergate(fr):
    out = {}
    worst_post, worst_gap = 999, 0
    for f, im in enumerate(fr):
        for H in (48, 100, 128, 260, 480, 700):
            col, r = preview.column(im, H)
            a = np.asarray(col)[..., 3] > 0
            rows = range(r[1], r[3] + 1)
            # each post: the longest opaque run touching its side of the column
            for y in rows:
                if col.height - 1 - y > H - 8 + 16 - 16 and y < r[1] + 8:
                    continue          # the rounded tops of the post heads (first 8 lethal rows)
                worst_post = min(worst_post, longest(a[y, 12:66]), longest(a[y, 78:132]))
            b = bright(col)
            beam_rows = [y for y in rows if b[y, 50:90].sum() >= 30]
            gaps, prev = [], r[1] - 1
            for y in beam_rows:
                if y - prev - 1 > 0:
                    gaps.append(y - prev - 1)
                prev = y
            # the gap that matters is between beams (not the floor end)
            inner = [g for g in gaps[1:]] if gaps else []
            worst_gap = max([worst_gap] + inner)
    out['min_post_width_px (each post, every row, all heights, all frames)'] = worst_post
    out['max_gap_between_beams_rows (all heights, all frames)'] = worst_gap
    return out


def tesla(fr):
    """No stretch of more than 24 rows without bright pixels in each third of the lethal width (shaft+tip)."""
    worst = 0
    reach = []
    for im in fr:
        for H in (48, 100, 128, 260, 480, 700):
            col, r = preview.column(im, H)
            b = bright(col)
            for t in range(3):
                x0 = 12 + 40 * t
                has = b[:, x0:x0 + 40].any(axis=1)
                run = 0
                for y in range(r[1], r[3] + 1 - (48 if H > 80 else 0)):
                    run = 0 if has[y] else run + 1
                    worst = max(worst, run)
        a = bright(im)
        sh = a[96:160]
        xs = np.where(sh.any(axis=0))[0]
        reach.append((int(xs.min()), int(xs.max())))
    return {'max_rows_without_bright_px_in_a_third (tip+shaft, all heights/frames)': worst,
            'shaft bright x range per frame (must reach <=23 and >=120)': reach}


if __name__ == '__main__':
    fam = sys.argv[1]
    sheet = sys.argv[2] if len(sys.argv) > 2 else os.path.join(hz.ROOT, 'export', fam + '.png')
    print(json.dumps(globals()[fam](frames(sheet)), indent=1))
