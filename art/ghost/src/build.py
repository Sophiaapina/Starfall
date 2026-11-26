"""Build script for Starfall's ghost sprite sheet, metadata JSON, and previews.

Run from the repository root:
    python3 art/ghost/src/build.py

Outputs (all strictly under art/ghost/):
    art/ghost/export/ghost.png            (768 x 480, 8 cols x 5 rows of 96x96 cells)
    art/ghost/export/ghost.json           (row metadata: name, frames, durationMs, loop)
    art/ghost/previews/ghost_float.gif    (4x nearest on #141020, 110ms, loops)
    art/ghost/previews/ghost_rise.gif     (4x nearest on #141020, 90ms, loops)
    art/ghost/previews/ghost_fall.gif     (4x nearest on #141020, 90ms, loops)
    art/ghost/previews/ghost_pop.gif      (4x nearest on #141020, 70ms, plays once)
    art/ghost/previews/ghost_appear.gif   (4x nearest on #141020, 70ms, plays once)
    art/ghost/previews/ghost_in_scene.gif (480x300 scene crop, half-size smoothed ghost
                                           at ~60% opacity drifting beside astronaut)
    art/ghost/previews/sheet_4x.png       (4x whole sheet on #141020 with thin cell grid)
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from ghost_rig import (
    ANCHOR_X,
    ANCHOR_Y,
    build_appear_frames,
    build_fall_frames,
    build_float_frames,
    build_pop_frames,
    build_rise_frames,
)
from palette import ALLOWED_ALPHAS, BG_PREVIEW_RGB, PixelCanvas

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT_EXPORT = REPO_ROOT / "art" / "ghost" / "export"
OUT_PREVIEWS = REPO_ROOT / "art" / "ghost" / "previews"

CELL = 96
COLS = 8
ROWS = 5

ROW_SPEC = [
    {"row": 0, "name": "float",  "frames": 8, "frameDurationMs": 110, "loop": True},
    {"row": 1, "name": "rise",   "frames": 4, "frameDurationMs": 90,  "loop": True},
    {"row": 2, "name": "fall",   "frames": 4, "frameDurationMs": 90,  "loop": True},
    {"row": 3, "name": "pop",    "frames": 6, "frameDurationMs": 70,  "loop": False},
    {"row": 4, "name": "appear", "frames": 6, "frameDurationMs": 70,  "loop": False},
]


def canvas_to_pil(c: PixelCanvas) -> Image.Image:
    return Image.fromarray(c.buf, mode="RGBA")


def composite_on_bg(im: Image.Image, bg_rgb: tuple[int, int, int] = BG_PREVIEW_RGB) -> Image.Image:
    bg = Image.new("RGBA", im.size, (*bg_rgb, 255))
    return Image.alpha_composite(bg, im).convert("RGB")


def save_anim_gif(
    frames: list[PixelCanvas],
    out_path: Path,
    duration_ms: int,
    loop: bool,
    scale: int = 4,
) -> None:
    pil_frames: list[Image.Image] = []
    for f in frames:
        rgb = composite_on_bg(canvas_to_pil(f))
        up = rgb.resize((CELL * scale, CELL * scale), Image.NEAREST)
        pil_frames.append(up.convert("P", palette=Image.ADAPTIVE, colors=64))
    kwargs: dict = {
        "save_all": True,
        "append_images": pil_frames[1:],
        "duration": duration_ms,
        "disposal": 2,
    }
    if loop:
        kwargs["loop"] = 0
    pil_frames[0].save(out_path, **kwargs)


def save_sheet_4x(sheet: Image.Image, out_path: Path) -> None:
    scale = 4
    bg = composite_on_bg(sheet)
    up = bg.resize((sheet.width * scale, sheet.height * scale), Image.NEAREST)
    draw = ImageDraw.Draw(up)
    grid_col = (52, 44, 78)  # subtle violet-slate grid line on #141020
    for c in range(1, COLS):
        x = c * CELL * scale
        draw.line([(x, 0), (x, up.height - 1)], fill=grid_col, width=1)
    for r in range(1, ROWS):
        y = r * CELL * scale
        draw.line([(0, y), (up.width - 1, y)], fill=grid_col, width=1)
    up.save(out_path)


def save_in_scene_gif(float_frames: list[PixelCanvas], out_path: Path) -> None:
    """Create 480x300 in-scene preview:
    - Backdrop: alien_background.png composited on #141020, cropped to 480x300
    - Astronaut frame 0 at half size (48x88), smoothed
    - Ghost `float` loop at half size (48x48), smoothed, ~60% opacity, ~90px to the
      right of the astronaut, drifting gently up and down along a smooth path.
    """
    bg_src = Image.open(REPO_ROOT / "public" / "assets" / "background" / "alien_background.png").convert("RGBA")
    astro_src = Image.open(REPO_ROOT / "public" / "assets" / "player" / "rig" / "astronaut.png").convert("RGBA")

    # Composite full alien_background over #141020 night sky, then crop a scenic 480x300 slice
    # centered over the alien moon & crystal ridge!
    sky = Image.new("RGBA", bg_src.size, (*BG_PREVIEW_RGB, 255))
    scene_full = Image.alpha_composite(sky, bg_src)
    # 768x352 -> crop x=[144..624] (480px wide), y=[16..316] (300px tall, clean dark ground at bottom)
    crop_x0 = (bg_src.width - 480) // 2
    crop_y0 = 16
    scene_base = scene_full.crop((crop_x0, crop_y0, crop_x0 + 480, crop_y0 + 300))

    # Astronaut frame 0 at half size (48x88) with smoothing
    astro_f0 = astro_src.crop((0, 0, 96, 176)).resize((48, 88), Image.Resampling.LANCZOS)

    # Pre-scale ghost float frames to half size (48x48) with smoothing and ~60% overall opacity
    ghost_half_frames: list[Image.Image] = []
    for f in float_frames:
        im = canvas_to_pil(f).resize((48, 48), Image.Resampling.LANCZOS)
        arr = np.array(im, dtype=np.float32)
        arr[:, :, 3] = np.round(arr[:, :, 3] * 0.60)
        ghost_half_frames.append(Image.fromarray(arr.astype(np.uint8), mode="RGBA"))

    # Placement:
    # Astronaut visual centre around x = 185, y = 148
    astro_cx, astro_cy = 185, 148
    astro_x = astro_cx - 24
    astro_y = astro_cy - 44

    # Ghost visual centre ~90px to astronaut's right: x = 275, y = 136 (slightly ahead & buoyant)
    ghost_base_cx = astro_cx + 90
    ghost_base_cy = 136
    # Half-size anchor inside 48x48 cell is (54/2, 44/2) = (27, 22)
    anchor_hx, anchor_hy = 27, 22

    # Run 2 full cycles of the 8-frame float loop (16 frames) so the gentle path drift loops cleanly
    total_frames = 16
    out_frames: list[Image.Image] = []
    for idx in range(total_frames):
        frame_bg = scene_base.copy()
        # Subtle gentle astronaut hover (1px) so scene feels grounded; keep mostly steady for scale
        frame_bg.alpha_composite(astro_f0, (astro_x, astro_y))

        # Ghost drifts gently up and down ±6px along a smooth sine path
        t = (2.0 * math.pi * idx) / total_frames
        path_dy = int(round(math.sin(t) * 6.0))
        path_dx = int(round(math.cos(t) * 2.0))
        gx = ghost_base_cx + path_dx - anchor_hx
        gy = ghost_base_cy + path_dy - anchor_hy

        g_im = ghost_half_frames[idx % len(ghost_half_frames)]
        frame_bg.alpha_composite(g_im, (gx, gy))
        out_frames.append(frame_bg.convert("RGB").convert("P", palette=Image.ADAPTIVE, colors=256))

    out_frames[0].save(
        out_path,
        save_all=True,
        append_images=out_frames[1:],
        duration=110,
        loop=0,
        disposal=2,
    )


def verify_and_report(
    rows_frames: dict[str, list[PixelCanvas]],
    rows_masks: dict[str, list[np.ndarray]],
    sheet: Image.Image,
) -> dict:
    """Compute exact audit metrics on the generated sheet and animations."""
    arr = np.array(sheet)
    alphas = sorted(int(v) for v in np.unique(arr[:, :, 3]))
    # Check for any warm/forbidden colors (R > G + 5 or R > B + 5 on visible pixels)
    vis = arr[:, :, 3] > 0
    rgb_vis = arr[vis][:, :3]
    warm = np.any((rgb_vis[:, 0].astype(int) > rgb_vis[:, 1].astype(int)) | (rgb_vis[:, 0].astype(int) > rgb_vis[:, 2].astype(int)))
    unique_rgb = np.unique(rgb_vis, axis=0)

    metrics = {
        "sheet_size": list(sheet.size),
        "unique_alphas": alphas,
        "alphas_valid": set(alphas).issubset(set(ALLOWED_ALPHAS)),
        "unique_rgb_count": int(len(unique_rgb)),
        "has_warm_colors": bool(warm),
        "rows": {},
    }

    for spec in ROW_SPEC:
        name = spec["name"]
        frames = rows_frames[name]
        masks = rows_masks[name]
        centroids = []
        adj_diffs = []
        sil_diffs = []
        for idx, (f, m) in enumerate(zip(frames, masks)):
            ys, xs = np.where(m)
            if len(xs) > 0:
                centroids.append((round(float(xs.mean()), 1), round(float(ys.mean()), 1)))
            else:
                centroids.append(None)
            # Compare with next frame (wrap if loop)
            if idx + 1 < len(frames) or spec["loop"]:
                nxt = frames[(idx + 1) % len(frames)]
                rgba_diff = int(np.sum(np.any(f.buf != nxt.buf, axis=2)))
                sil_a = f.buf[:, :, 3] > 0
                sil_b = nxt.buf[:, :, 3] > 0
                sil_xor = int(np.sum(sil_a ^ sil_b))
                adj_diffs.append(rgba_diff)
                sil_diffs.append(sil_xor)

        # Also check how much frame-to-frame difference exists after factoring out rigid dy shift
        rigid_sil_xors = []
        if name == "float":
            for i in range(len(frames)):
                a = frames[i].buf[:, :, 3] > 0
                b = frames[(i + 1) % len(frames)].buf[:, :, 3] > 0
                # Try shifts dy in -3..3, dx in -2..2 and take min XOR to prove silhouette truly morphs!
                best_xor = 999999
                for sdy in range(-3, 4):
                    for sdx in range(-2, 3):
                        shifted = np.roll(np.roll(b, sdy, axis=0), sdx, axis=1)
                        best_xor = min(best_xor, int(np.sum(a ^ shifted)))
                rigid_sil_xors.append(best_xor)

        nonempty_px = [int(np.sum(f.buf[:, :, 3] > 0)) for f in frames]
        metrics["rows"][name] = {
            "count": len(frames),
            "nonempty_pixels": nonempty_px,
            "body_centroids": centroids,
            "adj_rgba_diff_pixels": adj_diffs,
            "adj_silhouette_xor_pixels": sil_diffs,
            "min_rigid_shifted_silhouette_xor": rigid_sil_xors if rigid_sil_xors else None,
        }

    return metrics


def main() -> None:
    OUT_EXPORT.mkdir(parents=True, exist_ok=True)
    OUT_PREVIEWS.mkdir(parents=True, exist_ok=True)

    float_frames, float_masks = build_float_frames()
    rise_frames, rise_masks = build_rise_frames()
    fall_frames, fall_masks = build_fall_frames()
    pop_frames, pop_masks = build_pop_frames()
    appear_frames, appear_masks = build_appear_frames(float_frames[0], float_masks[0])

    rows_frames = {
        "float": float_frames,
        "rise": rise_frames,
        "fall": fall_frames,
        "pop": pop_frames,
        "appear": appear_frames,
    }
    rows_masks = {
        "float": float_masks,
        "rise": rise_masks,
        "fall": fall_masks,
        "pop": pop_masks,
        "appear": appear_masks,
    }

    # Assemble 768 x 480 sheet (8 cols x 5 rows of 96x96 cells)
    sheet = Image.new("RGBA", (COLS * CELL, ROWS * CELL), (0, 0, 0, 0))
    for spec in ROW_SPEC:
        r = spec["row"]
        frames = rows_frames[spec["name"]]
        assert len(frames) == spec["frames"]
        for c_idx, f in enumerate(frames):
            sheet.paste(canvas_to_pil(f), (c_idx * CELL, r * CELL))

    sheet_path = OUT_EXPORT / "ghost.png"
    sheet.save(sheet_path)

    # Export JSON metadata
    meta = {
        "image": "ghost.png",
        "cellWidth": CELL,
        "cellHeight": CELL,
        "columns": COLS,
        "rows": ROWS,
        "anchor": {"x": int(ANCHOR_X), "y": int(ANCHOR_Y)},
        "animations": [
            {
                "row": s["row"],
                "name": s["name"],
                "frames": s["frames"],
                "frameDurationMs": s["frameDurationMs"],
                "loop": s["loop"],
            }
            for s in ROW_SPEC
        ],
    }
    with open(OUT_EXPORT / "ghost.json", "w", encoding="utf-8") as fp:
        json.dump(meta, fp, indent=2)
        fp.write("\n")

    # Export 4x previews + sheet_4x.png + ghost_in_scene.gif
    for spec in ROW_SPEC:
        name = spec["name"]
        save_anim_gif(
            rows_frames[name],
            OUT_PREVIEWS / f"ghost_{name}.gif",
            duration_ms=spec["frameDurationMs"],
            loop=spec["loop"],
            scale=4,
        )

    save_sheet_4x(sheet, OUT_PREVIEWS / "sheet_4x.png")
    save_in_scene_gif(float_frames, OUT_PREVIEWS / "ghost_in_scene.gif")

    # Verify and print summary
    metrics = verify_and_report(rows_frames, rows_masks, sheet)
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
