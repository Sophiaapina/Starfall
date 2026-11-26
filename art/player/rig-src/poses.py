import math, json, os
import rig, comp
from PIL import Image

rig.LEG_L = (24.0, 24.0)
G = 148                       # ground line: lowest opaque row of a planted sole
LIMBS = ['leg-far', 'arm-far', 'leg-near', 'arm-near']


def s(x):
    return math.sin(x)


def planted(name, hip_dx, dy, foot=0.0):
    """Leg with the sole resting on G, ankle hip_dx px ahead of the hip."""
    hp = (rig.HIP[name][0], rig.HIP[name][1] + dy)
    best = None
    for k in range(0, 80):
        ay = 125 + k * 0.25
        knee, ank = rig.ik(hp, (hp[0] + hip_dx, ay))
        L, j = rig.leg_at(name, hp, knee, ank, foot)
        bottom = max(y for (x, y) in L.px)
        if bottom == G:
            best = (L, j)
        if bottom > G:
            break
    assert best, (name, hip_dx, dy)
    return best


def swing(name, hip_dx, ay, dy, foot):
    hp = (rig.HIP[name][0], rig.HIP[name][1] + dy)
    knee, ank = rig.ik(hp, (hp[0] + hip_dx, ay + dy))
    return rig.leg_at(name, hp, knee, ank, foot)


def frame(arms, legs, dy=0, flame=None):
    """arms: {name: (upper, fore, hand)}, legs: {name: (L, joints)} or (thigh, shin, foot)."""
    out, J = {}, {}
    for n, a in arms.items():
        a = list(a)
        for _ in range(12):
            L, j = rig.arm(n, *a, off=(0, dy))
            b = L.image().getbbox()
            if b[2] < 95 and b[1] > 1:
                break
            a[1] += 9; a[2] += 9          # pull the pose in: bend the forearm down
            print('PULL', n, a)
        out[n], J[n] = L.image(), j
    for n, l in legs.items():
        if isinstance(l, tuple) and len(l) == 3 and not hasattr(l[0], 'px'):
            L, j = rig.leg(n, *l, hip_off=(0, dy))
        else:
            L, j = l
        out[n], J[n] = L.image(), j
    return {'layers': out, 'joints': J, 'dy': dy, 'flame': flame}


TAGS = []

# ---- thrust: 6 frames, flame on; legs trail back and down, arms brace ----
fr = []
for i in range(6):
    p = 2 * math.pi * i / 6
    fr.append(frame(
        {'arm-near': (74 + 7 * s(p + .5), 36 + 24 * s(p - .5), 80 + 24 * s(p - 1.4)),
         'arm-far': (90 + 7 * s(p + math.pi + .5), 62 + 24 * s(p + math.pi - .5), 100 + 24 * s(p + math.pi - 1.4))},
        {'leg-near': (116 + 4 * s(p), 133 + 15 * s(p - 1), 80 + 22 * s(p - 2)),
         'leg-far': (108 + 4 * s(p + math.pi), 124 + 15 * s(p + math.pi - 1), 75 + 22 * s(p + math.pi - 2))},
        flame=i))
TAGS.append(('thrust', fr, [100, 83, 83, 100, 83, 83], 'forward'))

# ---- fall: 6 frames, flame off; legs swing forward with loose knees, arms lift forward ----
fr = []
for i in range(6):
    p = 2 * math.pi * i / 6
    fr.append(frame(
        {'arm-near': (42 + 6 * s(p + .6), -30 + 12 * s(p - .4), 10 + 16 * s(p - 1.2)),
         'arm-far': (66 + 5 * s(p + math.pi + .6), 2 + 12 * s(p + math.pi - .4), 50 + 16 * s(p + math.pi - 1.2))},
        {'leg-near': (70 + 8 * s(p), 105 + 14 * s(p - 1), 35 + 18 * s(p - 1.8)),
         'leg-far': (60 + 8 * s(p + math.pi), 98 + 14 * s(p + math.pi - 1), 25 + 18 * s(p + math.pi - 1.8))}))
TAGS.append(('fall', fr, [133, 117, 133, 133, 117, 133], 'forward'))

# ---- run: 8 frames on G; contact / down / pass / up, legs half a cycle apart ----
FOOT = [  # (hip_dx, ankle_y or None=planted, foot angle)
    (17, None, -8),    # 0 contact (heel)
    (8, None, 0),      # 1 down
    (-2, None, 0),     # 2 pass (stance)
    (-12, None, 0),    # 3 push
    (-19, 132, 45),    # 4 toe-off
    (-13, 123, 62),    # 5 lift
    (2, 118, 32),      # 6 pass (swing)
    (15, 129, 5),      # 7 reach
]
BOB = [0, 1, 0, -1, 0, 1, 0, -1]


def run_leg(name, k, dy):
    dx, ay, foot = FOOT[k % 8]
    if ay is None:
        return planted(name, dx, dy, foot)
    return swing(name, dx, ay, dy, foot)


def run_arm(k):
    p = 2 * math.pi * k / 8
    up = 90 + 46 * math.cos(p)            # near leg forward at k=0 -> near arm back
    fore = up - 88
    return (up, fore, fore + 75)


fr = []
for i in range(8):
    dy = BOB[i]
    fr.append(frame({'arm-near': run_arm(i), 'arm-far': run_arm(i + 4)},
                    {'leg-near': run_leg('leg-near', i, dy), 'leg-far': run_leg('leg-far', i + 4, dy)}, dy=dy))
TAGS.append(('run', fr, [83, 67, 83, 83, 83, 67, 83, 83], 'forward'))

# ---- land: 3 frames, feet planted, knees absorb, rise into run frame 1 ----
fr = []
for dy, an, af in ((0, (70, 35, 80), (75, 45, 90)), (5, (60, 50, 110), (70, 60, 120)), (2, (100, 40, 100), (80, 40, 100))):
    fr.append(frame({'arm-near': an, 'arm-far': af},
                    {'leg-near': planted('leg-near', 10, dy, 0), 'leg-far': planted('leg-far', -6, dy, 0)}, dy=dy))
TAGS.append(('land', fr, [67, 150, 100], 'forward'))

# ---- hit: 3 frames, impact -> peak whiplash -> settle ----
fr = []
fr.append(frame({'arm-near': (-120, -140, -150), 'arm-far': (50, 45, 80)},
                {'leg-near': (45, 85, 20), 'leg-far': (55, 95, 25)}))
fr.append(frame({'arm-near': (-155, -172, -178), 'arm-far': (42, 55, 95)},
                {'leg-near': (28, 74, 8), 'leg-far': (40, 92, 14)}))
fr.append(frame({'arm-near': (60, 15, 90), 'arm-far': (60, 30, 100)},
                {'leg-near': (60, 100, 35), 'leg-far': (55, 95, 30)}))
TAGS.append(('hit', fr, [50, 117, 133], 'forward'))

# ---- tumble: 4 frames loop, limp body, dangling arms, splayed loose legs ----
fr = []
for i in range(4):
    p = 2 * math.pi * i / 4
    un = 155 + 15 * s(p)
    uf = 35 + 15 * s(p + 2)
    tn = 140 + 12 * s(p + 1)
    tf = 48 + 12 * s(p + 2.5)
    fr.append(frame({'arm-near': (un, un - 50 + 18 * s(p - 1), un - 40 + 22 * s(p - 2)),
                     'arm-far': (uf, 95 + 15 * s(p + 1), 110 + 15 * s(p))},
                    {'leg-near': (tn, tn - 45 + 15 * s(p), tn - 110),
                     'leg-far': (tf, tf + 55 + 15 * s(p + 1.5), tf + 5)}))
TAGS.append(('tumble', fr, [100, 117, 100, 117], 'forward'))


def bbox(im):
    return im.getbbox()


if __name__ == '__main__':
    os.makedirs('frames', exist_ok=True)
    flames = [Image.open(f'flame_{i}.png').convert('RGBA') for i in range(6)] if os.path.exists('flame_0.png') else None
    n = 0
    meta = []
    allstrips = []
    for tag, frames, durs, d in TAGS:
        ims = []
        for k, f in enumerate(frames):
            n += 1
            for lay, im in f['layers'].items():
                im.save(f'frames/{lay}_{n:02d}.png')
                b = bbox(im)
                if b and (b[0] <= 0 or b[2] >= 96 or b[3] >= 176 or b[1] <= 0):
                    print('EDGE', tag, k, lay, b)
            fl = flames[f['flame']] if (flames and f['flame'] is not None) else None
            ims.append(comp.compose(f['layers'], f['dy'], fl))
            J = {l: {kk: [round(v[0], 1), round(v[1], 1)] for kk, v in j.items()} for l, j in f['joints'].items()}
            meta.append({'frame': n, 'tag': tag, 'dy': f['dy'], 'flame': f['flame'], 'joints': J})
        comp.strip(ims, 2, f'tag_{tag}.png')
        allstrips.append(ims[0])
    comp.strip(allstrips, 3, 'firsts.png')
    json.dump({'tags': [(t, len(f), du, d) for t, f, du, d in TAGS], 'frames': meta}, open('meta.json', 'w'), indent=1)
    print('frames', n)
