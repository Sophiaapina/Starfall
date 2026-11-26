"""Palette and crisp discrete-alpha pixel primitives for Starfall's ghost sprite.

All colours lie strictly in one cool spectral ramp (pale ice cyan-white ->
bright cyan -> luminous teal -> deep indigo) with zero red, orange, or
yellow/gold hues. Alpha is strictly quantised to four discrete steps:
0%, 30%, 60%, 100%.
"""

from __future__ import annotations

import math
import numpy as np

# Discrete alpha steps (0%, 30%, 60%, 100%)
A_0 = 0
A_30 = 77
A_60 = 153
A_100 = 255
ALLOWED_ALPHAS = (A_0, A_30, A_60, A_100)

# Single cool hue-family palette (ice cyan-white -> cyan -> bright teal -> deep indigo).
# Tuned bright and airy so the ghost glows cleanly even at 60% opacity over dark violet.
# Every colour satisfies B >= G >= R (zero red/orange/gold; tints cleanly for skill tiers).
C_WHITE   = (244, 255, 255)  # #F4FFFF - visor specular, bright sparks, blink glint
C_ICE     = (196, 250, 255)  # #C4FAFF - visor upper glow, crisp rim light, scanlines
C_CYAN    = (124, 234, 248)  # #7CEAF8 - primary visor glow, core light, tail heart
C_TEAL_HI = (74,  198, 224)  # #4AC6E0 - bright spectral suit highlight, mid-tail top
C_TEAL    = (46,  150, 190)  # #2E96BE - spectral suit midtone, mid-tail
C_BLUE    = (31,  98,  148)  # #1F6294 - suit shadow, visor deep edge
C_INDIGO  = (22,  58,  106)  # #163A6A - deep crease, visor bezel, mid-tail contour
C_OUTLINE = (13,  29,  60)   # #0D1D3C - crisp 1px dark-indigo pixel outline

PALETTE_RGB = (
    C_WHITE,
    C_ICE,
    C_CYAN,
    C_TEAL_HI,
    C_TEAL,
    C_BLUE,
    C_INDIGO,
    C_OUTLINE,
)

BG_PREVIEW_HEX = "#141020"
BG_PREVIEW_RGB = (20, 16, 32)


def rgba(rgb: tuple[int, int, int], alpha: int = A_100) -> tuple[int, int, int, int]:
    assert alpha in ALLOWED_ALPHAS, f"Invalid alpha {alpha}"
    return (rgb[0], rgb[1], rgb[2], alpha)


class PixelCanvas:
    """96x96 crisp RGBA pixel canvas with integer coordinates and discrete alphas."""

    def __init__(self, width: int = 96, height: int = 96) -> None:
        self.w = width
        self.h = height
        self.buf = np.zeros((height, width, 4), dtype=np.uint8)

    def copy(self) -> "PixelCanvas":
        c = PixelCanvas(self.w, self.h)
        c.buf[:] = self.buf
        return c

    def set_px(self, x: int, y: int, rgb: tuple[int, int, int], alpha: int = A_100) -> None:
        if 0 <= x < self.w and 0 <= y < self.h:
            self.buf[y, x] = (rgb[0], rgb[1], rgb[2], alpha)

    def set_px_if_stronger(
        self, x: int, y: int, rgb: tuple[int, int, int], alpha: int = A_100
    ) -> None:
        """Write pixel only if new alpha >= existing alpha (preserves opaque layers)."""
        if 0 <= x < self.w and 0 <= y < self.h:
            if alpha >= int(self.buf[y, x, 3]):
                self.buf[y, x] = (rgb[0], rgb[1], rgb[2], alpha)

    def set_px_if_empty(
        self, x: int, y: int, rgb: tuple[int, int, int], alpha: int = A_100
    ) -> None:
        if 0 <= x < self.w and 0 <= y < self.h and self.buf[y, x, 3] == 0:
            self.buf[y, x] = (rgb[0], rgb[1], rgb[2], alpha)

    def clear_px(self, x: int, y: int) -> None:
        if 0 <= x < self.w and 0 <= y < self.h:
            self.buf[y, x] = (0, 0, 0, 0)

    def fill_mask(
        self,
        mask: np.ndarray,
        rgb: tuple[int, int, int],
        alpha: int = A_100,
        only_stronger: bool = False,
    ) -> None:
        if only_stronger:
            write = mask & (self.buf[:, :, 3] <= alpha)
        else:
            write = mask
        self.buf[write] = (rgb[0], rgb[1], rgb[2], alpha)

    def composite_over(self, other: "PixelCanvas") -> None:
        """Snap-over composite keeping discrete alpha steps (no muddy alpha blending)."""
        src = other.buf
        dst = self.buf
        m100 = src[:, :, 3] == A_100
        dst[m100] = src[m100]
        m_semi = (src[:, :, 3] > 0) & (src[:, :, 3] < A_100)
        m_empty = m_semi & (dst[:, :, 3] == 0)
        dst[m_empty] = src[m_empty]
        m_higher = m_semi & (dst[:, :, 3] > 0) & (src[:, :, 3] > dst[:, :, 3])
        dst[m_higher] = src[m_higher]
        m_same = m_semi & (dst[:, :, 3] == src[:, :, 3])
        if np.any(m_same):
            src_lum = src[:, :, 0].astype(int) + src[:, :, 1].astype(int) + src[:, :, 2].astype(int)
            dst_lum = dst[:, :, 0].astype(int) + dst[:, :, 1].astype(int) + dst[:, :, 2].astype(int)
            m_bright = m_same & (src_lum > dst_lum)
            dst[m_bright] = src[m_bright]

    def draw_disc(
        self,
        cx: float,
        cy: float,
        r: float,
        rgb: tuple[int, int, int],
        alpha: int = A_100,
        only_stronger: bool = False,
    ) -> None:
        x0 = max(0, int(math.floor(cx - r - 1)))
        x1 = min(self.w - 1, int(math.ceil(cx + r + 1)))
        y0 = max(0, int(math.floor(cy - r - 1)))
        y1 = min(self.h - 1, int(math.ceil(cy + r + 1)))
        r2 = r * r
        for y in range(y0, y1 + 1):
            dy2 = (y + 0.5 - cy) ** 2
            for x in range(x0, x1 + 1):
                if (x + 0.5 - cx) ** 2 + dy2 <= r2:
                    if only_stronger:
                        self.set_px_if_stronger(x, y, rgb, alpha)
                    else:
                        self.set_px(x, y, rgb, alpha)

    def draw_rotated_ellipse(
        self,
        cx: float,
        cy: float,
        rx: float,
        ry: float,
        angle_deg: float,
        rgb: tuple[int, int, int],
        alpha: int = A_100,
        only_stronger: bool = False,
    ) -> np.ndarray:
        """Rasterise a rotated filled ellipse and return its boolean mask."""
        rad = math.radians(angle_deg)
        ca, sa = math.cos(rad), math.sin(rad)
        yy, xx = np.mgrid[0:self.h, 0:self.w]
        dx = (xx + 0.5) - cx
        dy = (yy + 0.5) - cy
        u = dx * ca + dy * sa
        v = -dx * sa + dy * ca
        mask = (u / rx) ** 2 + (v / ry) ** 2 <= 1.0
        self.fill_mask(mask, rgb, alpha, only_stronger=only_stronger)
        return mask

    def draw_capsule(
        self,
        x0: float,
        y0: float,
        x1: float,
        y1: float,
        r0: float,
        r1: float,
        rgb: tuple[int, int, int],
        alpha: int = A_100,
        only_stronger: bool = False,
    ) -> np.ndarray:
        """Rasterise a tapered rounded segment (capsule) from (x0,y0,r0) to (x1,y1,r1)."""
        yy, xx = np.mgrid[0:self.h, 0:self.w]
        px = xx + 0.5
        py = yy + 0.5
        vx = x1 - x0
        vy = y1 - y0
        len2 = vx * vx + vy * vy
        if len2 < 1e-6:
            t = np.zeros_like(px)
        else:
            t = np.clip(((px - x0) * vx + (py - y0) * vy) / len2, 0.0, 1.0)
        qx = x0 + t * vx
        qy = y0 + t * vy
        r = r0 + t * (r1 - r0)
        mask = (px - qx) ** 2 + (py - qy) ** 2 <= r * r
        self.fill_mask(mask, rgb, alpha, only_stronger=only_stronger)
        return mask

    def draw_spark(
        self,
        cx: int,
        cy: int,
        size: int,
        rgb_core: tuple[int, int, int],
        rgb_arm: tuple[int, int, int],
        alpha_core: int = A_100,
        alpha_arm: int = A_60,
    ) -> None:
        """Draw a crisp 1px pixel-art star/sparkle (size 1=dot, 2=plus, 3=big star)."""
        self.set_px_if_stronger(cx, cy, rgb_core, alpha_core)
        if size >= 2:
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                self.set_px_if_stronger(cx + dx, cy + dy, rgb_arm, alpha_arm)
        if size >= 3:
            for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2)):
                self.set_px_if_stronger(cx + dx, cy + dy, rgb_arm, A_30)
            for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
                self.set_px_if_stronger(cx + dx, cy + dy, rgb_arm, A_30)

    def add_outline(
        self,
        target_mask: np.ndarray,
        rgb: tuple[int, int, int] = C_OUTLINE,
        alpha: int = A_100,
        connectivity: int = 4,
    ) -> np.ndarray:
        """Add a crisp 1px pixel-art outline around target_mask into empty/weaker pixels."""
        padded = np.pad(target_mask, 1, mode="constant", constant_values=False)
        dilated = (
            padded[0:-2, 1:-1]
            | padded[2:, 1:-1]
            | padded[1:-1, 0:-2]
            | padded[1:-1, 2:]
        )
        if connectivity == 8:
            dilated |= (
                padded[0:-2, 0:-2]
                | padded[0:-2, 2:]
                | padded[2:, 0:-2]
                | padded[2:, 2:]
            )
        outline = dilated & (~target_mask)
        write = outline & (self.buf[:, :, 3] < A_100)
        if alpha < A_100:
            write = outline & (self.buf[:, :, 3] < alpha)
        self.buf[write] = (rgb[0], rgb[1], rgb[2], alpha)
        return outline
