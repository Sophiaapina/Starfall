"""Modular pixel-art rig and animation frame generators for Starfall's ghost.

Design notes:
- Cell size: 96 x 96 px, transparent background.
- Visual centre of helmet-and-torso mass: (54, 44).
- Spectral echo of the game's astronaut: rounded helmet with glowing cyan visor,
  circular ear-cup & subtle rear helmet crest, compact collar + torso with glowing
  chest core and tiny translucent pack echo, stubby articulated arms, and below
  the waist no legs—a flowing, wispy spectral tail trailing to the left and
  slightly down.
- Drawn strictly in one cool cyan-to-indigo ramp with discrete alpha steps
  (0%, 30%, 60%, 100%) and crisp 1px pixel outlines matching the astronaut.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
import numpy as np

from palette import (
    A_0,
    A_30,
    A_60,
    A_100,
    C_BLUE,
    C_CYAN,
    C_ICE,
    C_INDIGO,
    C_OUTLINE,
    C_TEAL,
    C_TEAL_HI,
    C_WHITE,
    PixelCanvas,
)

ANCHOR_X = 54.0
ANCHOR_Y = 44.0

# Internal local origin offset so the helmet+torso mass centroid sits dead-on (54.0, 44.0)
_LOCAL_OX = 0.5
_LOCAL_OY = 2.5


def rot_pt(
    x: float, y: float, cx: float, cy: float, angle_deg: float
) -> tuple[float, float]:
    """Rotate (x, y) around (cx, cy) by angle_deg (positive = clockwise/pitch down)."""
    rad = math.radians(angle_deg)
    ca, sa = math.cos(rad), math.sin(rad)
    dx, dy = x - cx, y - cy
    return cx + dx * ca - dy * sa, cy + dx * sa + dy * ca


@dataclass
class GhostPose:
    # Body centre offset from (54, 44)
    dx: float = 0.0
    dy: float = 0.0
    # Overall pitch in degrees (+ = tips forward/down, - = leans back/up)
    pitch_deg: float = 0.0
    # Extra head nod relative to torso
    head_nod_deg: float = 0.0
    # Squash/stretch factors (1.0 = normal)
    scale_x: float = 1.0
    scale_y: float = 1.0
    # Arm angles relative to body (degrees; 0 = right, +90 = down, -90 = up)
    far_arm_deg: float = 30.0
    near_arm_deg: float = 68.0
    far_arm_len: float = 8.8
    near_arm_len: float = 8.8
    # Tail curve parameters
    tail_dir_deg: float = 165.0      # general direction from waist (180=left, 90=down, 270=up)
    tail_length: float = 41.0
    tail_phase: float = 0.0          # radians; increases each frame for travelling wave
    tail_amp: float = 7.2            # max wave amplitude near tip
    tail_cycles: float = 1.22        # number of waves along tail
    tail_curve: float = 4.5          # gentle overall droop (+) or lift (-)
    # Visor & holographic life
    visor_glow: float = 0.6          # 0.0 (calm) .. 1.0 (bright pulse)
    visor_blink: bool = False        # brief hologram blink/scan-dip
    visor_startle: bool = False      # wide bright startled flash
    flicker_glitch: bool = False     # 1-frame scanline shimmer/ghost echo
    chest_bright: bool = False       # brighter chest core pulse
    # Trailing motes around tail
    mote_phase: float = 0.0          # 0..1 continuous drift


def _shade_sphere_mask(
    canvas: PixelCanvas,
    mask: np.ndarray,
    cx: float,
    cy: float,
    rx: float,
    ry: float,
    light_dir: tuple[float, float] = (0.55, -0.78),
    ramp: tuple[tuple[int, int, int], ...] = (C_BLUE, C_TEAL, C_TEAL_HI, C_ICE),
    thresholds: tuple[float, ...] = (-0.15, 0.28, 0.68),
    alpha: int = A_100,
) -> None:
    """Cel-shade a filled 2D pixel region cleanly using a 2D normal projection."""
    yy, xx = np.where(mask)
    if len(yy) == 0:
        return
    nx = ((xx + 0.5) - cx) / max(rx, 1.0)
    ny = ((yy + 0.5) - cy) / max(ry, 1.0)
    dot = nx * light_dir[0] + ny * light_dir[1]
    for i in range(len(yy)):
        d = dot[i]
        idx = 0
        for th in thresholds:
            if d >= th:
                idx += 1
        canvas.set_px(int(xx[i]), int(yy[i]), ramp[idx], alpha)


def draw_tail(
    canvas: PixelCanvas,
    waist_x: float,
    waist_y: float,
    pose: GhostPose,
) -> tuple[np.ndarray, np.ndarray]:
    """Render a liquid, single-ribbon travelling-S spectral tail with translucent
    trailing wisps and shedding cyan motes (strictly 100%, 60%, 30% alpha steps).
    """
    rad = math.radians(pose.tail_dir_deg)
    ux, uy = math.cos(rad), math.sin(rad)
    # Perpendicular vector pointing roughly downward when tail goes left
    vx, vy = -uy, ux
    if vy < 0:
        vx, vy = -vx, -vy

    steps = 80
    pts: list[tuple[float, float, float, float]] = []
    for i in range(steps + 1):
        s = i / steps  # 0 at waist -> 1 at fine tip
        dist = s * pose.tail_length
        # Amplitude grows smoothly from waist toward the tip so the S-wave truly flows
        env = (s ** 1.12) * (1.0 - 0.08 * (s ** 3))
        wave = math.sin(s * pose.tail_cycles * 2.0 * math.pi - pose.tail_phase)
        bend = pose.tail_curve * (s ** 1.55)
        perp = env * pose.tail_amp * wave + bend
        px = waist_x + ux * dist + vx * perp
        py = waist_y + uy * dist + vy * perp
        # Smooth organic taper from waist (~7.3px) to a fine wispy curl tip (~1.0px)
        radius = (7.2 * ((1.0 - s) ** 0.85) + 0.85) * (0.95 + 0.06 * math.cos(s * 5.0 - pose.tail_phase))
        pts.append((px, py, radius, s))

    yy, xx = np.mgrid[0:canvas.h, 0:canvas.w]
    gx = xx + 0.5
    gy = yy + 0.5

    best_norm_d = np.full((canvas.h, canvas.w), 99.0, dtype=np.float32)
    best_s = np.zeros((canvas.h, canvas.w), dtype=np.float32)
    best_side = np.zeros((canvas.h, canvas.w), dtype=np.float32)

    for px, py, r, s in pts:
        d2 = (gx - px) ** 2 + (gy - py) ** 2
        norm_d = np.sqrt(d2) / max(r, 0.45)
        better = norm_d < best_norm_d
        best_norm_d[better] = norm_d[better]
        best_s[better] = s
        side = ((gx - px) * vx + (gy - py) * vy) / max(r, 0.45)
        best_side[better] = side[better]

    # Delicate detached upper/lower ethereal vapor curl peeling gently off mid-wave (purely 30% alpha)
    vapor_d = np.full((canvas.h, canvas.w), 99.0, dtype=np.float32)
    for i in range(28, 66, 2):
        s = i / steps
        t = max(0.0, (s - 0.35) / 0.48)
        if t > 1.0:
            continue
        dist = s * pose.tail_length * 0.98
        wave = math.sin(s * pose.tail_cycles * 2.0 * math.pi - pose.tail_phase + 0.65)
        bend = pose.tail_curve * (s ** 1.55) + 4.4 * (t ** 1.15)
        perp = (s ** 1.12) * pose.tail_amp * 0.85 * wave + bend
        px = waist_x + ux * dist + vx * perp
        py = waist_y + uy * dist + vy * perp
        r = 1.9 * (1.0 - 0.65 * t)
        norm_d = np.sqrt((gx - px) ** 2 + (gy - py) ** 2) / max(r, 0.4)
        vapor_d = np.minimum(vapor_d, norm_d)

    # Layer 1: Faint 30% outer wisp halo + curled tip + trailing vapor strand
    faint_main = ((best_norm_d <= 1.24) & (best_s > 0.25)) | (
        (best_norm_d <= 1.02) & (best_s > 0.72)
    )
    faint_vapor = vapor_d <= 1.0
    faint_mask = faint_main | faint_vapor

    # Layer 2: Translucent 60% mid-tail
    mid_main = (best_norm_d <= 1.0) & (best_s >= 0.32) & (best_s <= 0.84)
    mid_edge = (best_norm_d <= 1.06) & (best_norm_d > 0.80) & (best_s < 0.42)
    mid_mask = mid_main | mid_edge

    # Layer 3: Opaque 100% upper tail near waist + luminous inner spine core
    solid_body = (best_norm_d <= 0.96) & (best_s < 0.40)
    solid_core = (best_norm_d <= 0.56) & (best_s >= 0.34) & (best_s <= 0.66)
    solid_mask = solid_body | solid_core

    # Paint faint 30% wisps (bright luminous cyan)
    canvas.fill_mask(faint_mask & (best_side < 0.0), C_ICE, A_30, only_stronger=True)
    canvas.fill_mask(faint_mask & (best_side >= 0.0), C_CYAN, A_30, only_stronger=True)

    # Paint mid 60% tail with luminous ice-cyan core & bright teal shading
    mid_core = mid_mask & (best_norm_d <= 0.46)
    mid_top = mid_mask & (best_side < -0.15) & (~mid_core)
    mid_bot = mid_mask & (best_side >= 0.32) & (~mid_core)
    mid_rest = mid_mask & (~mid_core) & (~mid_top) & (~mid_bot)
    canvas.fill_mask(mid_bot, C_TEAL, A_60, only_stronger=True)
    canvas.fill_mask(mid_rest, C_TEAL_HI, A_60, only_stronger=True)
    canvas.fill_mask(mid_top, C_CYAN, A_60, only_stronger=True)
    canvas.fill_mask(mid_core, C_ICE, A_60, only_stronger=True)

    # Paint opaque 100% upper tail & glowing spine core
    s_top = solid_mask & (best_side < -0.22)
    s_bot = solid_mask & (best_side > 0.36)
    s_core = solid_mask & (best_norm_d <= 0.44) & (best_s >= 0.14)
    s_mid = solid_mask & (~s_top) & (~s_bot) & (~s_core)
    canvas.fill_mask(s_bot, C_BLUE, A_100)
    canvas.fill_mask(s_mid, C_TEAL, A_100)
    canvas.fill_mask(s_top, C_TEAL_HI, A_100)
    canvas.fill_mask(s_core, C_CYAN, A_100)

    # Subtle 60% indigo contour along upper/mid tail (fades before wispy tip)
    contour_src = (solid_mask | mid_main) & (best_s <= 0.56)
    padded = np.pad(contour_src, 1, mode="constant", constant_values=False)
    dil = (
        padded[0:-2, 1:-1]
        | padded[2:, 1:-1]
        | padded[1:-1, 0:-2]
        | padded[1:-1, 2:]
    )
    mid_outline = dil & (~contour_src) & (best_s <= 0.58)
    write_ol = mid_outline & (canvas.buf[:, :, 3] <= A_30)
    canvas.buf[write_ol] = (C_INDIGO[0], C_INDIGO[1], C_INDIGO[2], A_60)

    # Shedding translucent motes drifting smoothly backward from tail tip & wave crest!
    tip_x, tip_y, _, _ = pts[-1]
    mid_x, mid_y, _, _ = pts[int(steps * 0.66)]
    for idx in range(3):
        frac = (pose.mote_phase + idx / 3.0) % 1.0
        base_x = tip_x if idx != 1 else (mid_x + vx * 6.0)
        base_y = tip_y if idx != 1 else (mid_y + vy * 6.0)
        mx = int(round(base_x + ux * (2.5 + frac * 10.0) + vx * math.sin(frac * 5.0 + idx) * 2.4))
        my = int(round(base_y + uy * (2.5 + frac * 10.0) + vy * math.sin(frac * 5.0 + idx) * 2.4))
        if frac < 0.45:
            canvas.set_px_if_stronger(mx, my, C_WHITE if idx == 0 else C_ICE, A_60)
            if frac < 0.25:
                canvas.set_px_if_empty(mx + 1, my, C_CYAN, A_30)
        else:
            canvas.set_px_if_stronger(mx, my, C_ICE if idx == 0 else C_CYAN, A_30)

    return solid_mask, mid_mask


def render_ghost(pose: GhostPose) -> tuple[PixelCanvas, np.ndarray]:
    """Render one frame of the ghost character according to `pose`.

    Returns (canvas, core_body_mask) where `core_body_mask` is the helmet+torso
    mass mask (excluding tail and sparks) used to verify visual centring at (54, 44).
    """
    canvas = PixelCanvas(96, 96)

    cx = ANCHOR_X + pose.dx
    cy = ANCHOR_Y + pose.dy
    pitch = pose.pitch_deg
    sx, sy = pose.scale_x, pose.scale_y

    def p(lx: float, ly: float) -> tuple[float, float]:
        """Transform local coordinates into canvas coords centred cleanly on (54, 44)."""
        return rot_pt(
            cx + (lx + _LOCAL_OX) * sx,
            cy + (ly + _LOCAL_OY) * sy,
            cx,
            cy,
            pitch,
        )

    # 1. Trailing wispy spectral tail behind torso
    waist_x, waist_y = p(-5.5, 11.5)
    tail_solid, _ = draw_tail(canvas, waist_x, waist_y, pose)

    # 2. Far stubby arm (behind torso, reaching forward-right)
    far_sh_x, far_sh_y = p(5.2, 4.8)
    fa_rad = math.radians(pose.far_arm_deg + pitch)
    far_hand_x = far_sh_x + math.cos(fa_rad) * pose.far_arm_len * sx
    far_hand_y = far_sh_y + math.sin(fa_rad) * pose.far_arm_len * sy

    far_arm_layer = PixelCanvas(96, 96)
    far_arm_mask = far_arm_layer.draw_capsule(
        far_sh_x, far_sh_y, far_hand_x, far_hand_y, 3.0 * sx, 2.5 * sx, C_TEAL, A_100
    )
    far_arm_layer.draw_capsule(
        far_sh_x + 0.5, far_sh_y - 0.8, far_hand_x, far_hand_y - 0.8, 1.6, 1.4, C_TEAL_HI, A_100
    )
    far_arm_layer.set_px(int(round(far_hand_x)), int(round(far_hand_y - 0.5)), C_CYAN, A_100)
    far_arm_layer.add_outline(far_arm_mask, C_OUTLINE, A_100)
    canvas.composite_over(far_arm_layer)

    # 3. Tiny spectral mini-pack echo on left-back of torso
    pack_layer = PixelCanvas(96, 96)
    pk0_x, pk0_y = p(-9.2, 2.2)
    pk1_x, pk1_y = p(-10.8, 11.2)
    pack_mask = pack_layer.draw_capsule(
        pk0_x, pk0_y, pk1_x, pk1_y, 3.3 * sx, 2.8 * sx, C_TEAL, A_100
    )
    st0_x, st0_y = p(-9.6, 3.8)
    st1_x, st1_y = p(-10.5, 9.2)
    pack_layer.draw_capsule(st0_x, st0_y, st1_x, st1_y, 1.25, 1.1, C_ICE, A_100)
    glow_x, glow_y = p(-12.2, 7.0)
    pack_layer.draw_disc(glow_x, glow_y, 2.5, C_CYAN, A_60, only_stronger=True)
    pack_layer.add_outline(pack_mask, C_OUTLINE, A_100)
    canvas.composite_over(pack_layer)

    # 4. Compact luminous spectral torso (tapers smoothly into tail)
    torso_layer = PixelCanvas(96, 96)
    t_top_x, t_top_y = p(-0.5, 3.5)
    t_bot_x, t_bot_y = p(-3.5, 13.5)
    torso_mask = torso_layer.draw_capsule(
        t_top_x, t_top_y, t_bot_x, t_bot_y, 7.6 * sx, 6.2 * sx, C_TEAL_HI, A_100
    )
    tcx, tcy = p(-1.5, 8.2)
    _shade_sphere_mask(
        torso_layer,
        torso_mask,
        tcx,
        tcy,
        8.5 * sx,
        9.0 * sy,
        light_dir=(0.72, -0.55),
        ramp=(C_BLUE, C_TEAL, C_TEAL_HI, C_CYAN, C_ICE),
        thresholds=(-0.50, -0.10, 0.30, 0.72),
        alpha=A_100,
    )
    # Subtle holographic transparency belly window (60% alpha near lower-back torso)
    belly_x, belly_y = p(-3.8, 13.0)
    yy, xx = np.mgrid[0:96, 0:96]
    fade_mask = torso_mask & (((xx + 0.5 - belly_x) ** 2 + (yy + 0.5 - belly_y) ** 2) <= 13.0)
    torso_layer.buf[fade_mask, 3] = A_60

    # Glowing chest core indicator (direct echo of astronaut's cyan chest bar)
    ch_x, ch_y = p(3.8, 7.5)
    ch_x2, ch_y2 = p(3.2, 10.2)
    torso_layer.draw_capsule(ch_x, ch_y, ch_x2, ch_y2, 2.0, 1.9, C_INDIGO, A_100)
    core_col = C_WHITE if pose.chest_bright else C_ICE
    torso_layer.draw_capsule(ch_x, ch_y, ch_x2, ch_y2, 1.3, 1.2, core_col, A_100)

    # Luminous collar ring
    col_l_x, col_l_y = p(-5.2, 1.2)
    col_r_x, col_r_y = p(5.6, 2.4)
    collar_mask = torso_layer.draw_capsule(
        col_l_x, col_l_y, col_r_x, col_r_y, 2.2, 2.2, C_CYAN, A_100
    )
    torso_layer.draw_capsule(
        col_l_x + 1.0, col_l_y - 0.5, col_r_x, col_r_y - 0.4, 1.15, 1.15, C_WHITE, A_100
    )

    # Outline torso + collar (open where torso merges seamlessly into solid tail)
    torso_total = torso_mask | collar_mask
    ol_torso = torso_layer.add_outline(torso_total, C_OUTLINE, A_100)
    torso_layer.buf[ol_torso & tail_solid] = (0, 0, 0, 0)
    canvas.composite_over(torso_layer)

    # 5. Rounded Helmet + Glowing Visor
    head_layer = PixelCanvas(96, 96)
    head_angle = pitch + pose.head_nod_deg
    hx, hy = p(1.4, -8.8)

    rx, ry = 13.4 * sx, 12.2 * sy
    helmet_mask = head_layer.draw_rotated_ellipse(
        hx, hy, rx, ry, head_angle, C_TEAL_HI, A_100
    )
    # Subtle rear helmet crest (echoes astronaut's helmet peak)
    fin_x, fin_y = rot_pt(hx - 11.2 * sx, hy - 3.6 * sy, hx, hy, head_angle)
    fin_x2, fin_y2 = rot_pt(hx - 14.2 * sx, hy - 2.6 * sy, hx, hy, head_angle)
    fin_mask = head_layer.draw_capsule(fin_x, fin_y, fin_x2, fin_y2, 2.8, 1.5, C_TEAL_HI, A_100)
    helmet_full = helmet_mask | fin_mask

    # Brighter, airy spectral cel shading on helmet so it gleams even at 60% opacity!
    _shade_sphere_mask(
        head_layer,
        helmet_full,
        hx,
        hy,
        rx,
        ry,
        light_dir=(0.45, -0.82),
        ramp=(C_BLUE, C_TEAL, C_TEAL_HI, C_CYAN, C_ICE),
        thresholds=(-0.45, -0.05, 0.36, 0.74),
        alpha=A_100,
    )
    # Crisp bright white-ice rim light along top crown of helmet
    rim_x, rim_y = rot_pt(hx + 0.5 * sx, hy - 10.0 * sy, hx, hy, head_angle)
    rim_x2, rim_y2 = rot_pt(hx + 7.5 * sx, hy - 8.2 * sy, hx, hy, head_angle)
    rim_cap = head_layer.draw_capsule(rim_x, rim_y, rim_x2, rim_y2, 1.15, 0.95, C_WHITE, A_100)
    head_layer.buf[rim_cap & (~helmet_full)] = (0, 0, 0, 0)

    # Complete circular ear-cup detail (clear of the visor bezel so it never clips into a 'C'!)
    ear_x, ear_y = rot_pt(hx - 5.9 * sx, hy + 1.1 * sy, hx, hy, head_angle)
    head_layer.draw_disc(ear_x, ear_y, 3.1, C_ICE, A_100)
    head_layer.draw_disc(ear_x, ear_y, 1.8, C_INDIGO, A_100)
    head_layer.set_px(int(round(ear_x + 0.4)), int(round(ear_y - 0.4)), C_BLUE, A_100)

    # Big friendly glowing visor dome!
    vx, vy = rot_pt(hx + 6.5 * sx, hy + 0.4 * sy, hx, hy, head_angle)
    vrx = (7.4 if not pose.visor_startle else 8.2) * sx
    vry = (8.2 if not pose.visor_startle else 9.0) * sy
    head_layer.draw_rotated_ellipse(vx - 0.6, vy, vrx + 1.1, vry + 1.1, head_angle, C_INDIGO, A_100)
    visor_mask = head_layer.draw_rotated_ellipse(vx, vy, vrx, vry, head_angle, C_CYAN, A_100)

    if pose.visor_startle:
        head_layer.fill_mask(visor_mask, C_ICE, A_100)
        head_layer.draw_rotated_ellipse(vx + 0.6, vy - 0.4, vrx * 0.74, vry * 0.74, head_angle, C_WHITE, A_100)
    elif pose.visor_blink:
        # Crisp brief hologram blink/scan-dip across visor
        _shade_sphere_mask(
            head_layer,
            visor_mask,
            vx,
            vy,
            vrx,
            vry,
            light_dir=(0.35, -0.65),
            ramp=(C_INDIGO, C_BLUE, C_TEAL, C_TEAL_HI),
            thresholds=(-0.3, 0.1, 0.55),
            alpha=A_100,
        )
        bl_l_x, bl_l_y = rot_pt(vx - 4.2, vy + 0.2, vx, vy, head_angle)
        bl_r_x, bl_r_y = rot_pt(vx + 5.2, vy + 0.2, vx, vy, head_angle)
        blink_bar = head_layer.draw_capsule(bl_l_x, bl_l_y, bl_r_x, bl_r_y, 1.15, 1.15, C_WHITE, A_100)
        head_layer.buf[blink_bar & (~visor_mask)] = (0, 0, 0, 0)
    else:
        # Bright luminous cyan-ice visor with breathing glow pulse & white curved specular
        glow = pose.visor_glow
        th0 = -0.60 - 0.10 * glow
        th1 = -0.18 - 0.14 * glow
        th2 = 0.26 - 0.18 * glow
        _shade_sphere_mask(
            head_layer,
            visor_mask,
            vx,
            vy,
            vrx,
            vry,
            light_dir=(0.40, -0.70),
            ramp=(C_TEAL, C_TEAL_HI, C_CYAN, C_ICE),
            thresholds=(th0, th1, th2),
            alpha=A_100,
        )
        # Bright curved white specular gleam
        sp1_x, sp1_y = rot_pt(vx + 0.3, vy - 4.4, vx, vy, head_angle)
        sp2_x, sp2_y = rot_pt(vx + 3.6, vy - 1.8, vx, vy, head_angle)
        spec_m = head_layer.draw_capsule(sp1_x, sp1_y, sp2_x, sp2_y, 1.75, 1.25, C_WHITE, A_100)
        head_layer.buf[spec_m & (~visor_mask)] = (0, 0, 0, 0)
        sd_x, sd_y = rot_pt(vx - 1.6, vy - 4.8, vx, vy, head_angle)
        head_layer.set_px(int(round(sd_x)), int(round(sd_y)), C_WHITE, A_100)
        if glow >= 0.72:
            head_layer.draw_rotated_ellipse(
                vx + 1.5, vy, vrx + 1.8, vry + 0.7, head_angle, C_ICE, A_30, only_stronger=True
            )

    head_solid = helmet_full | visor_mask
    head_layer.add_outline(head_solid, C_OUTLINE, A_100)
    canvas.composite_over(head_layer)

    # 6. Near stubby arm (in front of torso, articulates expressively!)
    near_layer = PixelCanvas(96, 96)
    near_sh_x, near_sh_y = p(-2.6, 5.2)
    na_rad = math.radians(pose.near_arm_deg + pitch)
    near_hand_x = near_sh_x + math.cos(na_rad) * pose.near_arm_len * sx
    near_hand_y = near_sh_y + math.sin(na_rad) * pose.near_arm_len * sy
    near_layer.draw_disc(near_sh_x, near_sh_y, 3.6 * sx, C_CYAN, A_100)
    near_arm_mask = near_layer.draw_capsule(
        near_sh_x, near_sh_y, near_hand_x, near_hand_y, 3.4 * sx, 2.7 * sx, C_TEAL_HI, A_100
    )
    arm_total = near_arm_mask | (near_layer.buf[:, :, 3] == A_100)
    _shade_sphere_mask(
        near_layer,
        arm_total,
        (near_sh_x + near_hand_x) * 0.5,
        (near_sh_y + near_hand_y) * 0.5,
        5.5,
        5.5,
        light_dir=(0.45, -0.78),
        ramp=(C_TEAL, C_TEAL_HI, C_CYAN, C_ICE),
        thresholds=(-0.30, 0.12, 0.62),
        alpha=A_100,
    )
    cuff_x = near_sh_x + (near_hand_x - near_sh_x) * 0.62
    cuff_y = near_sh_y + (near_hand_y - near_sh_y) * 0.62
    near_layer.set_px(int(round(cuff_x)), int(round(cuff_y)), C_WHITE, A_100)
    near_layer.add_outline(arm_total, C_OUTLINE, A_100)
    canvas.composite_over(near_layer)

    # 7. Crisp sparse 30% spectral aura sheen on crown/visor-front
    aura_src = head_solid | torso_total
    padded = np.pad(aura_src, 1, mode="constant", constant_values=False)
    dil1 = padded[0:-2, 1:-1] | padded[2:, 1:-1] | padded[1:-1, 0:-2] | padded[1:-1, 2:]
    padded2 = np.pad(dil1, 1, mode="constant", constant_values=False)
    dil2 = padded2[0:-2, 1:-1] | padded2[2:, 1:-1] | padded2[1:-1, 0:-2] | padded2[1:-1, 2:]
    yy, xx = np.mgrid[0:96, 0:96]
    rim_halo = dil2 & (~dil1) & (canvas.buf[:, :, 3] == 0) & (yy < cy + 6) & (xx > cx - 10)
    rim_halo &= ((xx + yy) % 2 == 0)
    canvas.buf[rim_halo] = (C_ICE[0], C_ICE[1], C_ICE[2], A_30)

    # 8. Optional 1-frame holographic flicker/scanline shimmer (float frame 5)
    if pose.flicker_glitch:
        orig = canvas.buf.copy()
        for y in range(16, 80):
            if y % 5 == 0:
                row = canvas.buf[y]
                opaq = row[:, 3] == A_100
                row[opaq, 3] = A_60
            elif y % 5 == 2:
                for x in range(2, 94):
                    if orig[y, x - 2, 3] == A_100 and canvas.buf[y, x, 3] == 0:
                        canvas.buf[y, x] = (C_ICE[0], C_ICE[1], C_ICE[2], A_30)

    core_body_mask = head_solid | torso_total | arm_total | far_arm_mask | pack_mask
    return canvas, core_body_mask


# ---------------------------------------------------------------------------
# Animation builders (5 rows)
# ---------------------------------------------------------------------------

def build_float_frames() -> tuple[list[PixelCanvas], list[np.ndarray]]:
    """Row 0: 8 frames, 110ms, loops.
    Level flight: 3px bob, travelling S-wave tail, pulsing visor glow,
    gentle arm paddle + head breathe, and a crisp hologram blink/flicker at f5.
    """
    frames: list[PixelCanvas] = []
    masks: list[np.ndarray] = []
    dys = [0.0, -1.0, -2.0, -2.0, -1.0, 0.0, 1.0, 1.0]
    pitches = [0.0, -1.8, -2.8, -1.2, 1.0, 2.2, 1.5, 0.5]
    nods = [0.0, -1.8, -2.2, -0.5, 1.5, 1.8, 0.5, -0.5]
    far_arms = [30.0, 20.0, 12.0, 18.0, 30.0, 40.0, 44.0, 36.0]
    near_arms = [68.0, 78.0, 86.0, 80.0, 68.0, 58.0, 54.0, 62.0]
    visor_glows = [0.50, 0.76, 1.00, 0.88, 0.58, 0.20, 0.82, 0.54]

    for i in range(8):
        phase = (2.0 * math.pi * i) / 8.0
        pose = GhostPose(
            dx=0.0,
            dy=dys[i],
            pitch_deg=pitches[i],
            head_nod_deg=nods[i],
            scale_x=1.02 if i in (2, 3) else (0.98 if i in (6, 7) else 1.0),
            scale_y=0.98 if i in (2, 3) else (1.02 if i in (6, 7) else 1.0),
            far_arm_deg=far_arms[i],
            near_arm_deg=near_arms[i],
            tail_dir_deg=164.0,
            tail_length=41.0,
            tail_phase=phase,
            tail_amp=7.6,
            tail_cycles=1.22,
            tail_curve=4.2,
            visor_glow=visor_glows[i],
            visor_blink=(i == 5),
            flicker_glitch=(i == 5),
            chest_bright=(i in (2, 3, 6)),
            mote_phase=i / 8.0,
        )
        c, m = render_ghost(pose)
        if i == 6:
            c.draw_spark(69, 24, 2, C_WHITE, C_ICE, A_100, A_60)
        elif i == 2:
            c.draw_spark(70, 27, 2, C_ICE, C_CYAN, A_60, A_30)
        frames.append(c)
        masks.append(m)
    return frames, masks


def build_rise_frames() -> tuple[list[PixelCanvas], list[np.ndarray]]:
    """Row 1: 4 frames, 90ms, loops.
    Thrusting upward: body leans back, tail whips downward, bold spectral sparks under it.
    """
    frames: list[PixelCanvas] = []
    masks: list[np.ndarray] = []
    dys = [0.0, -1.5, -2.5, -1.0]
    pitches = [-15.5, -18.5, -17.0, -14.5]
    nods = [-3.5, -4.5, -3.0, -2.5]
    far_arms = [4.0, -6.0, 0.0, 10.0]
    near_arms = [92.0, 102.0, 96.0, 86.0]

    for i in range(4):
        phase = (2.0 * math.pi * i) / 4.0
        pose = GhostPose(
            dx=0.5,
            dy=dys[i],
            pitch_deg=pitches[i],
            head_nod_deg=nods[i],
            scale_x=0.96,
            scale_y=1.05,
            far_arm_deg=far_arms[i],
            near_arm_deg=near_arms[i],
            # Steep downward-left whip!
            tail_dir_deg=124.0,
            tail_length=35.0,
            tail_phase=phase,
            tail_amp=6.6,
            tail_cycles=1.18,
            tail_curve=-5.0,
            visor_glow=0.92 if i in (1, 2) else 0.76,
            chest_bright=(i in (1, 2)),
            mote_phase=i / 4.0,
        )
        c, m = render_ghost(pose)

        # Bold, readable spectral thrust sparks & mini glowing wisp-puffs underneath!
        # Positioned in clean open space underneath torso & tail (x ~ 42..68, y ~ 65..90)
        puff_y = 67 + (i % 2) * 3
        puff_x = 56 - (i % 2)
        c.draw_disc(puff_x, puff_y, 2.3, C_ICE, A_60, only_stronger=True)
        c.draw_disc(puff_x - 5, puff_y + 4, 1.9, C_CYAN, A_60, only_stronger=True)
        c.draw_disc(puff_x + 4, puff_y + 6, 1.6, C_CYAN, A_30, only_stronger=True)

        # 8 lively spectral sparks streaming downward in cycling 4-frame motion
        spark_tracks = [
            # (x_base, y_start, vx, vy_span, phase_offset, size)
            (58, 64, -2.5, 22.0, 0.00, 3),
            (50, 68, -3.5, 21.0, 0.50, 3),
            (65, 62, -1.5, 20.0, 0.25, 2),
            (42, 72, -3.0, 17.0, 0.75, 2),
            (54, 66, -2.0, 21.0, 0.35, 2),
            (63, 68, -1.2, 18.0, 0.65, 2),
            (47, 74, -2.5, 16.0, 0.15, 2),
            (36, 78, -2.0, 12.0, 0.85, 2),
        ]
        for xb, ys, svx, svy, off, sz in spark_tracks:
            t = ((i / 4.0) + off) % 1.0
            sx_p = int(round(xb + svx * t))
            sy_p = int(round(ys + svy * t))
            if t < 0.45:
                c.draw_spark(sx_p, sy_p, sz, C_WHITE, C_ICE, A_100, A_60)
            elif t < 0.80:
                c.draw_spark(sx_p, sy_p, max(2, sz - 1), C_ICE, C_CYAN, A_100 if sz == 3 else A_60, A_30)
            else:
                c.draw_spark(sx_p, sy_p, 1, C_ICE, C_CYAN, A_60, A_30)

        frames.append(c)
        masks.append(m)
    return frames, masks


def build_fall_frames() -> tuple[list[PixelCanvas], list[np.ndarray]]:
    """Row 2: 4 frames, 90ms, loops.
    Sinking: body tips forward, tail streams upward, BOTH stubby arms visibly lift up.
    """
    frames: list[PixelCanvas] = []
    masks: list[np.ndarray] = []
    dys = [0.0, 1.0, 2.0, 1.0]
    pitches = [15.5, 18.0, 16.5, 14.5]
    nods = [3.5, 4.5, 3.0, 2.0]
    # Far arm reaches clearly forward-and-up past chest/visor;
    # Near arm lifts cleanly up-and-back in open space clear of the ear-cup!
    far_arms = [-30.0, -40.0, -34.0, -24.0]
    near_arms = [-142.0, -152.0, -146.0, -136.0]

    for i in range(4):
        phase = (2.0 * math.pi * i) / 4.0
        pose = GhostPose(
            dx=-0.5,
            dy=dys[i],
            pitch_deg=pitches[i],
            head_nod_deg=nods[i],
            scale_x=1.02,
            scale_y=0.97,
            far_arm_deg=far_arms[i],
            near_arm_deg=near_arms[i],
            far_arm_len=10.2,
            near_arm_len=9.8,
            # Streams cleanly upward and back-left!
            tail_dir_deg=214.0,
            tail_length=41.0,
            tail_phase=phase,
            tail_amp=6.8,
            tail_cycles=1.20,
            tail_curve=-5.5,
            visor_glow=0.60 if i in (0, 2) else 0.45,
            chest_bright=(i == 2),
            mote_phase=i / 4.0,
        )
        c, m = render_ghost(pose)
        # Subtle upward-drifting air wisps near lifted hands & streaming tail
        for idx, (wx, wy) in enumerate(((72, 34), (44, 24), (24, 20))):
            drift = ((i + idx) % 4) * 2
            c.set_px_if_empty(wx - drift // 2, wy - drift, C_ICE if idx == 0 else C_CYAN, A_60 if idx == 0 else A_30)
            c.set_px_if_empty(wx - drift // 2, wy - drift + 1, C_CYAN, A_30)
        frames.append(c)
        masks.append(m)
    return frames, masks


def build_pop_frames() -> tuple[list[PixelCanvas], list[np.ndarray]]:
    """Row 3: 6 frames, 70ms, plays once.
    Hazard hit: startled flinch -> comic bright bubble-swell -> organic playful
    puff-wisp burst -> curling dispersing wisps -> fading curls -> nearly empty.
    """
    frames: list[PixelCanvas] = []
    masks: list[np.ndarray] = []

    # Frame 0: Startled flinch! Recoil, squash, wide bright visor, flung arms, kinked tail, comic shock lines
    p0 = GhostPose(
        dx=-2.0,
        dy=-1.0,
        pitch_deg=-10.0,
        head_nod_deg=-4.0,
        scale_x=1.08,
        scale_y=0.92,
        far_arm_deg=-34.0,
        near_arm_deg=-138.0,
        far_arm_len=10.2,
        near_arm_len=9.6,
        tail_dir_deg=170.0,
        tail_length=35.0,
        tail_phase=1.2,
        tail_amp=10.5,
        tail_cycles=1.65,
        tail_curve=2.0,
        visor_glow=1.0,
        visor_startle=True,
        chest_bright=True,
        mote_phase=0.1,
    )
    f0, m0 = render_ghost(p0)
    for (x0, y0), (x1, y1) in (
        ((71, 25), (76, 21)),
        ((75, 34), (80, 32)),
        ((59, 17), (61, 12)),
        ((43, 19), (39, 15)),
    ):
        f0.draw_capsule(x0, y0, x1, y1, 0.85, 0.65, C_WHITE, A_100)
    frames.append(f0)
    masks.append(m0)

    # Frame 1: Comic puff/bubble swell! Recognisable ghost silhouette puffing bright cyan-white
    p1 = GhostPose(
        dx=0.0,
        dy=-0.5,
        pitch_deg=-3.0,
        head_nod_deg=0.0,
        scale_x=1.18,
        scale_y=1.15,
        far_arm_deg=-22.0,
        near_arm_deg=-150.0,
        tail_dir_deg=170.0,
        tail_length=22.0,
        tail_phase=2.4,
        tail_amp=5.5,
        tail_cycles=1.0,
        tail_curve=0.0,
        visor_glow=1.0,
        visor_startle=True,
        chest_bright=True,
        mote_phase=0.3,
    )
    f1, m1 = render_ghost(p1)
    opaq = f1.buf[:, :, 3] == A_100
    is_outline = (
        (f1.buf[:, :, 0] == C_OUTLINE[0])
        & (f1.buf[:, :, 1] == C_OUTLINE[1])
        & (f1.buf[:, :, 2] == C_OUTLINE[2])
    )
    # Bright luminous bubble-puff glow while keeping visor & collar glint readable
    f1.buf[opaq & (~is_outline)] = (C_ICE[0], C_ICE[1], C_ICE[2], A_100)
    f1.draw_disc(56, 39, 10.0, C_WHITE, A_100)
    f1.buf[is_outline] = (C_CYAN[0], C_CYAN[1], C_CYAN[2], A_100)
    # Playful fracture glints across puff
    for (x0, y0), (x1, y1) in (((44, 34), (66, 36)), ((42, 48), (64, 46))):
        f1.draw_capsule(x0, y0, x1, y1, 0.7, 0.7, C_TEAL_HI, A_60)
    yy, xx = np.mgrid[0:96, 0:96]
    dist = np.sqrt((xx + 0.5 - 54.0) ** 2 + (yy + 0.5 - 44.0) ** 2)
    ang = np.arctan2(yy + 0.5 - 44.0, xx + 0.5 - 54.0)
    ring1 = (dist >= 20.5) & (dist <= 22.2) & (f1.buf[:, :, 3] == 0) & (np.sin(ang * 4.0 + 0.5) > -0.2)
    f1.buf[ring1] = (C_ICE[0], C_ICE[1], C_ICE[2], A_30)
    frames.append(f1)
    masks.append(m1)

    # Frame 2: Playful comic cloud-wisp POP! Fluffy asymmetrical wisps & curved curls (zero rigid spokes)
    f2 = PixelCanvas(96, 96)
    cx, cy = 54.0, 44.0
    # Airy central pop-ring wisps (hollow centre with 2 tiny sparkles)
    f2.draw_disc(cx + 2, cy - 2, 3.0, C_WHITE, A_60)
    f2.draw_spark(int(cx - 3), int(cy + 3), 1, C_ICE, C_CYAN, A_60, A_30)
    # Fluffy asymmetrical comic puffs & curled wisps bursting outward
    puffs_f2 = [
        # (dx, dy, r_outer, r_inner, core_alpha, curl_dx, curl_dy)
        (12.5, -10.0, 6.6, 4.0, A_100, -4.5, -2.0),  # big visor puff curling up-right
        (-13.0, -8.5, 5.8, 3.3, A_100, 3.0, -3.5),   # puff curling up-left
        (-16.5, 7.0, 6.0, 3.4, A_60, 4.5, 3.5),      # wispy tail puff left-down
        (12.0, 11.0, 5.0, 2.8, A_100, -3.5, 3.0),    # lower-right puff
        (-1.0, -15.5, 4.4, 2.3, A_60, -3.5, 1.5),    # top bubble-wisp
        (2.0, 15.0, 4.0, 2.1, A_60, 3.5, -1.5),      # bottom bubble-wisp
    ]
    for pdx, pdy, ro, ri, ca, cdx, cdy in puffs_f2:
        px, py = cx + pdx, cy + pdy
        # Curved comma-like wisp tail curling tangentially (NOT radial spokes!)
        f2.draw_capsule(px, py, px + cdx, py + cdy, ro * 0.72, ro * 0.28, C_CYAN, A_30, only_stronger=True)
        f2.draw_disc(px, py, ro, C_CYAN, A_60, only_stronger=True)
        f2.draw_disc(px + 0.6, py - 0.6, ri, C_ICE, ca, only_stronger=True)
        if ca == A_100:
            f2.draw_disc(px + 1.0, py - 1.0, ri * 0.48, C_WHITE, A_100)
    # Irregular playful star sparkles shooting out
    for sx_p, sy_p, sz in (
        (76, 25, 3), (31, 25, 2), (75, 62, 2), (27, 58, 3),
        (56, 19, 2), (48, 69, 2), (80, 43, 1), (35, 42, 1),
    ):
        f2.draw_spark(sx_p, sy_p, sz, C_WHITE, C_ICE, A_100, A_60)
    frames.append(f2)
    masks.append(f2.buf[:, :, 3] > 0)

    # Frame 3: the same puffs one step later: drifted outward, shrunk and thinned, each trailing a short
    # wisp back toward where it burst from, so the eye follows every puff from frame 2 into frame 4
    f3 = PixelCanvas(96, 96)
    for pdx, pdy, ro, ri, ca, cdx, cdy in puffs_f2:
        px, py = cx + pdx * 1.3, cy + pdy * 1.3
        tx, ty = cx + pdx * 0.95, cy + pdy * 0.95
        f3.draw_capsule(px, py, tx, ty, ro * 0.5, ro * 0.18, C_CYAN, A_30, only_stronger=True)
        f3.draw_disc(px, py, ro * 0.6, C_CYAN, A_60 if ca == A_100 else A_30, only_stronger=True)
        f3.draw_disc(px + 0.5, py - 0.5, ri * 0.55, C_ICE, A_60, only_stronger=True)
        if ca == A_100:
            f3.set_px(int(round(px + 1)), int(round(py - 1)), C_WHITE, A_100)
    # Small drifting bubbles & twinkles
    for bx, by, br in ((62, 42, 1.8), (44, 46, 1.6), (58, 34, 1.4)):
        f3.draw_disc(bx, by, br, C_ICE, A_30, only_stronger=True)
    for sx_p, sy_p, sz in ((80, 22, 2), (25, 22, 1), (78, 66, 1), (22, 62, 2), (56, 14, 1)):
        f3.draw_spark(sx_p, sy_p, sz, C_ICE, C_CYAN, A_60, A_30)
    frames.append(f3)
    masks.append(f3.buf[:, :, 3] > 0)

    # Frame 4: Faint curling tendrils & fading dust motes drifting gently left
    f4 = PixelCanvas(96, 96)
    fades_f4 = [
        (73, 23, 78, 19, 1.6, 0.8),
        (29, 26, 23, 23, 1.5, 0.8),
        (23, 57, 17, 60, 1.7, 0.7),
        (70, 64, 74, 68, 1.4, 0.7),
        (46, 17, 43, 14, 1.2, 0.6),
        (48, 70, 45, 73, 1.2, 0.6),
    ]
    for idx, (x0, y0, x1, y1, r0, r1) in enumerate(fades_f4):
        f4.draw_capsule(x0, y0, x1, y1, r0, r1, C_CYAN, A_30, only_stronger=True)
        if idx in (0, 2):
            f4.set_px(x1, y1, C_ICE, A_60)
    for sx_p, sy_p in ((64, 38), (38, 44), (58, 60)):
        f4.set_px(sx_p, sy_p, C_ICE, A_30)
    frames.append(f4)
    masks.append(f4.buf[:, :, 3] > 0)

    # Frame 5: Nearly empty — just 4 delicate fading 30% alpha motes!
    f5 = PixelCanvas(96, 96)
    for px, py in ((79, 18), (21, 22), (16, 61), (74, 69)):
        f5.set_px(px, py, C_ICE, A_30)
        if px in (79, 16):
            f5.set_px(px - 1, py, C_CYAN, A_30)
    frames.append(f5)
    masks.append(f5.buf[:, :, 3] > 0)

    return frames, masks


def build_appear_frames(float_f0: PixelCanvas, float_m0: np.ndarray) -> tuple[list[PixelCanvas], list[np.ndarray]]:
    """Row 4: 6 frames, 70ms, plays once.
    Materialises cleanly from a flicker of scan lines & sparks into `float` frame 0.
    """
    frames: list[PixelCanvas] = []
    masks: list[np.ndarray] = []

    src = float_f0.buf
    src_present = src[:, :, 3] > 0

    # Frame 0: Sparse horizontal holographic scanline flickers & converging sparks
    f0 = PixelCanvas(96, 96)
    for y, x0, x1, col, a in (
        (36, 44, 65, C_CYAN, A_30),
        (43, 39, 69, C_ICE, A_60),
        (50, 42, 63, C_CYAN, A_30),
        (58, 30, 56, C_TEAL_HI, A_30),
    ):
        for x in range(x0, x1 + 1):
            if (x + y) % 2 == 0 or a == A_60:
                f0.set_px(x, y, col, a)
    f0.draw_spark(59, 38, 2, C_WHITE, C_ICE, A_100, A_60)
    for sx, sy in ((32, 34), (74, 28), (69, 58), (34, 64), (53, 22), (46, 67)):
        f0.draw_spark(sx, sy, 1, C_ICE, C_CYAN, A_60, A_30)
    frames.append(f0)
    masks.append(f0.buf[:, :, 3] > 0)

    # Frame 1: Sliced hologram silhouette (every 3rd row) + bright boot sparks
    f1 = PixelCanvas(96, 96)
    for y in range(96):
        if y % 3 == 0:
            shift = -3 if (y // 3) % 2 == 0 else 2
            for x in range(96):
                sx = x - shift
                if 0 <= sx < 96 and src_present[y, sx]:
                    a = A_60 if src[y, sx, 3] == A_100 else A_30
                    col = C_ICE if src[y, sx, 1] > 180 else C_CYAN
                    f1.set_px(x, y, col, a)
        elif y % 3 == 1:
            for x in range(96):
                if src[y, x, 3] == A_100 and (x % 3 == 0):
                    f1.set_px(x, y, C_TEAL_HI, A_30)
    f1.draw_spark(62, 37, 3, C_WHITE, C_ICE, A_100, A_60)
    f1.draw_spark(58, 54, 2, C_WHITE, C_CYAN, A_100, A_60)
    for sx, sy in ((40, 32), (71, 40), (44, 60), (26, 63)):
        f1.set_px_if_stronger(sx, sy, C_ICE, A_60)
    frames.append(f1)
    masks.append(f1.buf[:, :, 3] > 0)

    # Frame 2: ~60% solid with crisp scanline bands & horizontal hologram jitter
    f2 = PixelCanvas(96, 96)
    for y in range(96):
        band = y % 4
        shift = 2 if (y // 4) % 3 == 1 else (-1 if (y // 4) % 3 == 2 else 0)
        for x in range(96):
            sx = x - shift
            if not (0 <= sx < 96) or not src_present[y, sx]:
                continue
            sr, sg, sb, sa = [int(v) for v in src[y, sx]]
            if band in (0, 1):
                if sa == A_100:
                    col = C_WHITE if sg > 220 else (C_ICE if sg > 165 else C_CYAN)
                    f2.set_px(x, y, col, A_100)
                else:
                    f2.set_px(x, y, C_CYAN, A_60 if sa == A_60 else A_30)
            elif band == 2:
                f2.set_px(x, y, (sr, sg, sb), A_60 if sa >= A_60 else A_30)
            else:
                if sa == A_100:
                    f2.set_px(x, y, C_TEAL_HI, A_30)
    for y_ray, x0, x1 in ((33, 66, 77), (46, 31, 42), (57, 60, 71)):
        for x in range(x0, x1):
            f2.set_px_if_empty(x, y_ray, C_ICE, A_30)
    frames.append(f2)
    masks.append(f2.buf[:, :, 3] > 0)

    # Frame 3: ~82% solid, vertical snap-in stretch + bright rim flare + clearing scanlines
    p3 = GhostPose(
        dx=0.0,
        dy=-1.5,
        pitch_deg=-1.5,
        head_nod_deg=-1.5,
        scale_x=0.94,
        scale_y=1.07,
        far_arm_deg=24.0,
        near_arm_deg=74.0,
        tail_dir_deg=164.0,
        tail_length=37.0,
        tail_phase=-0.35,
        tail_amp=6.2,
        tail_cycles=1.18,
        tail_curve=3.6,
        visor_glow=1.0,
        chest_bright=True,
        mote_phase=0.88,
    )
    f3, m3 = render_ghost(p3)
    for y_sl in (30, 42, 54, 62):
        opaq = f3.buf[y_sl, :, 3] == A_100
        f3.buf[y_sl, opaq] = (C_ICE[0], C_ICE[1], C_ICE[2], A_60)
    f3.draw_spark(71, 27, 2, C_WHITE, C_ICE, A_100, A_60)
    f3.draw_spark(36, 68, 2, C_ICE, C_CYAN, A_60, A_30)
    frames.append(f3)
    masks.append(m3)

    # Frame 4: ~94% settled, gentle bounce overshoot settling down into float[0] + last scan glint
    p4 = GhostPose(
        dx=0.0,
        dy=1.0,
        pitch_deg=0.8,
        head_nod_deg=0.8,
        scale_x=1.02,
        scale_y=0.98,
        far_arm_deg=33.0,
        near_arm_deg=65.0,
        tail_dir_deg=164.0,
        tail_length=40.0,
        tail_phase=-0.12,
        tail_amp=7.1,
        tail_cycles=1.20,
        tail_curve=4.0,
        visor_glow=0.88,
        chest_bright=True,
        mote_phase=0.95,
    )
    f4, m4 = render_ghost(p4)
    opaq = f4.buf[52, :, 3] == A_100
    f4.buf[52, opaq] = (C_ICE[0], C_ICE[1], C_ICE[2], A_60)
    f4.draw_spark(69, 29, 2, C_WHITE, C_ICE, A_60, A_30)
    frames.append(f4)
    masks.append(m4)

    # Frame 5: Cleanly locked into exact `float` frame 0!
    f5 = float_f0.copy()
    frames.append(f5)
    masks.append(float_m0)

    return frames, masks
