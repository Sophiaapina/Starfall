"""Coverage and join checks on a 4-frame sheet (576 x H, frames side by side).

usage: python3 check.py <family> <column|floater> [sheet.png]
Default sheet: art/hazards/export/<family>.png
"""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hz

X0, X1 = hz.LETHAL_X0, hz.LETHAL_X1


def frames(sheet):
    a = np.array(Image.open(sheet).convert('RGBA'))
    w = a.shape[1] // 4
    assert w == 144, a.shape
    return [a[:, i * w:(i + 1) * w] for i in range(4)]


def cov(f, r0, r1):
    al = f[r0:r1 + 1, X0:X1 + 1, 3] > 0
    per = al.sum(axis=1)
    return int(per.min()), int(r0 + per.argmin())


def same(f, r_a, r_b):
    return bool(np.array_equal(f[r_a], f[r_b]))


ROUND_B_COLUMN = {'crystal', 'lasergate', 'tesla'}   # tip may taper through row 59


def run(family, kind, sheet):
    fr = frames(sheet)
    out = {'family': family, 'kind': kind, 'sheet': sheet, 'size': list(Image.open(sheet).size)}
    if kind == 'column' and family in ROUND_B_COLUMN:
        pieces = {
            'tip (rows 60-95, after the round-B taper)': (60, 95),
            'tip taper zone (rows 16-59, info only)': (16, 59),
            'shaft (rows 96-159)': (96, 159),
            'base (rows 160-207)': (160, 207),
        }
        joins = {
            'tip bottom row 95 == shaft bottom row 63 (so tip->shaft equals shaft->shaft)': [(95, 159)],
        }
        collar = (160, 163)
        overhang_rows = (0, 15)
    elif kind == 'column':
        pieces = {
            'tip (rows 44-95, after the 28-row taper)': (44, 95),
            'tip taper zone (rows 16-43, info only)': (16, 43),
            'shaft (rows 96-159)': (96, 159),
            'base (rows 160-207)': (160, 207),
        }
        joins = {
            'tip bottom row 95 == shaft bottom row 63 (so tip->shaft equals shaft->shaft)': [(95, 159)],
            'tip rows 80-95 == shaft rows 48-63 (shaft pattern is 64-periodic)': [(80 + k, 144 + k) for k in range(16)],
        }
        collar = (160, 163)
        overhang_rows = (0, 15)
    else:
        pieces = {
            'top (rows 40-51, after the 28-row taper)': (40, 51),
            'top taper zone (rows 12-39, info only)': (12, 39),
            'mid (rows 52-99)': (52, 99),
            'bottom (rows 100-111, before the 28-row taper)': (100, 111),
            'bottom taper zone (rows 112-139, info only)': (112, 139),
        }
        joins = {
            'top bottom row 51 == mid bottom row 47 (so top->mid equals mid->mid)': [(51, 99)],
            'top rows 36-51 == mid rows 32-47 (mid pattern is 48-periodic)': [(36 + k, 84 + k) for k in range(16)],
        }
        collar = (100, 103)
        overhang_rows = (0, 11)
    out['coverage_min_opaque_px_of_120'] = {}
    for name, (a, b) in pieces.items():
        vals = [cov(f, a, b) for f in fr]
        out['coverage_min_opaque_px_of_120'][name] = {'min': min(v[0] for v in vals), 'at_row': min(vals)[1], 'per_frame': [v[0] for v in vals]}
    out['joins_identical_all_frames'] = {}
    for name, pairs in joins.items():
        out['joins_identical_all_frames'][name] = all(same(f, a, b) for f in fr for a, b in pairs)
    # seam smoothness: colour change across the repeating seam vs. the typical change between adjacent rows
    def rowdiff(f, a, b):
        return float(np.abs(f[a, X0:X1 + 1, :3].astype(int) - f[b, X0:X1 + 1, :3].astype(int)).mean())
    if kind == 'column':
        seam = [rowdiff(f, 159, 96) for f in fr]
        typical = [np.mean([rowdiff(f, y, y + 1) for y in range(96, 158)]) for f in fr]
    else:
        seam = [rowdiff(f, 99, 52) for f in fr]
        typical = [np.mean([rowdiff(f, y, y + 1) for y in range(52, 98)]) for f in fr]
    out['seam_row_change_vs_typical_adjacent_row_change'] = [[round(s, 1), round(t, 1)] for s, t in zip(seam, typical)]
    c0, c1 = collar
    out['collar_rows_%d-%d_min_opaque' % collar] = min(cov(f, c0, c1)[0] for f in fr)
    # nothing outside the lethal column except in the margins (allowed: glow, lips)
    out['max_px_outside_lethal_x_per_frame'] = [int((f[:, :X0, 3] > 0).sum() + (f[:, X1 + 1:, 3] > 0).sum()) for f in fr]
    # partial alpha must not exist
    out['semi_transparent_px'] = int(sum(((f[:, :, 3] > 0) & (f[:, :, 3] < 255)).sum() for f in fr))
    pal = set(hz.hex2rgb(h) for h in hz.palette_all())
    cols = set()
    for f in fr:
        m = f[:, :, 3] > 0
        cols |= set(map(tuple, f[m][:, :3].tolist()))
    out['colours_used'] = len(cols)
    out['off_palette'] = len([c for c in cols if c not in pal])
    return out


if __name__ == '__main__':
    fam, kind = sys.argv[1], sys.argv[2]
    sheet = sys.argv[3] if len(sys.argv) > 3 else os.path.join(hz.ROOT, 'export', fam + '.png')
    print(json.dumps(run(fam, kind, sheet), indent=1))
