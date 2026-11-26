/**
 * hazards assembled from stackable pieces, so a collider of any height is drawn without stretching or cropping
 *
 * Each family is one sheet exported from art/hazards/<family>.aseprite: FRAMES frames side by side,
 * every frame CELL_W wide with the lethal column in the middle and a harmless margin on each side.
 *   column   tip / shaft / base, drawn standing on the floor and flipped for the ceiling
 *   floater  top / mid / bottom, free at both ends
 * A hazard is composed once per animation frame at source resolution, where every piece lands on
 * whole pixels, and then drawn as a single image; stacking the pieces straight onto the scaled
 * canvas would leave hairlines between them.
 */

import type { AABB } from "../game/Player.js";
import { loadImage, ready } from "./images.js";

const KIT_DIR = "assets/obstacles/kit/";

const CELL_W = 144;
/** width of the lethal column inside a cell; the rest is margin for glow and flanges */
const LETHAL_W = 120;
const MARGIN = (CELL_W - LETHAL_W) / 2;
const FRAMES = 4;
const FRAME_SECONDS = 0.12;

/** rows of each piece in the sheet; `over` rows reach past the end of the lethal area */
const COLUMN = {
  tip: { y: 0, h: 96, over: 16 },
  shaft: { y: 96, h: 64 },
  base: { y: 160, h: 48 },
};
const FLOATER = {
  top: { y: 0, h: 52, over: 12 },
  mid: { y: 52, h: 48 },
  bottom: { y: 100, h: 52, over: 12 },
};

export type HazardShape = "floor" | "ceiling" | "floater";

/** a family, the lethal heights in source pixels it still looks right at, and whether the backdrop shows through it */
interface Family {
  name: string;
  min?: number;
  max?: number;
  /** the art leaves gaps inside the lethal area (beams between posts), so nothing solid may be drawn behind it */
  open?: boolean;
}

/**
 * one entry per equal share of the hazards of that kind; a family listed twice appears twice as often
 * null leaves that share to the painted sprites: the tesla coil is one tall bolt, and no stack of pieces looked like it
 */
const COLUMN_FAMILIES: (Family | null)[] = [{ name: "pipes" }, null, { name: "crystal" }];
/** the two halves of a gate; the laser gate is the game's signature one */
const GATE_FAMILIES: (Family | null)[] = [{ name: "lasergate", open: true }, { name: "lasergate", open: true }, { name: "pipes" }];
/** a drone stretched tall stops reading as a drone, so taller floaters keep their painted sprites */
const FLOATER_FAMILIES: (Family | null)[] = [{ name: "drone", max: 160 }];

const CACHE_LIMIT = 96;

export class HazardKit {
  private sheets = new Map<string, HTMLImageElement>();
  private composed = new Map<string, HTMLCanvasElement>();

  constructor() {
    for (const family of [...COLUMN_FAMILIES, ...GATE_FAMILIES, ...FLOATER_FAMILIES]) {
      if (family && !this.sheets.has(family.name)) this.sheets.set(family.name, loadImage(`${KIT_DIR}${family.name}.png`));
    }
  }

  /** true when draw() would cover this whole rectangle with art, so the caller may put something solid behind it */
  fills(rect: AABB, shape: HazardShape, gate: boolean, pick: number): boolean {
    const found = this.resolve(rect, shape, gate, pick);
    return found !== null && !found.family.open;
  }

  /**
   * draws one solid rectangle of a hazard; `pick` chooses the family and stays fixed per hazard
   * false when no family fits that height or its sheet is not available, so the caller can fall back
   */
  draw(ctx: CanvasRenderingContext2D, rect: AABB, shape: HazardShape, gate: boolean, pick: number, time: number): boolean {
    const found = this.resolve(rect, shape, gate, pick);
    if (!found) return false;
    const { family, sheet, density, lethal } = found;

    const frame = Math.floor(time / FRAME_SECONDS + pick * 1.7) % FRAMES;
    const image = this.compose(family.name, sheet, shape === "floater", lethal, (frame + FRAMES) % FRAMES);

    const over = (shape === "floater" ? FLOATER.top.over : COLUMN.tip.over) / density;
    const width = CELL_W / density;
    const height = image.height / density;
    const x = rect.x - MARGIN / density;
    if (shape === "ceiling") {
      // the same art upside down: the free end points down into the corridor
      ctx.save();
      ctx.translate(0, rect.y + rect.h + over);
      ctx.scale(1, -1);
      ctx.drawImage(image, x, 0, width, height);
      ctx.restore();
    } else {
      ctx.drawImage(image, x, rect.y - over, width, height);
    }
    return true;
  }

  /** the family for this rectangle and the scale it is drawn at; null when it is left to the painted sprites or its sheet is missing */
  private resolve(rect: AABB, shape: HazardShape, gate: boolean, pick: number): { family: Family; sheet: HTMLImageElement; density: number; lethal: number } | null {
    // source pixels per logical pixel follows the collider width, so the lethal column always fits it
    const density = LETHAL_W / rect.w;
    const lethal = Math.max(1, Math.round(rect.h * density));

    const all = shape === "floater" ? FLOATER_FAMILIES : gate ? GATE_FAMILIES : COLUMN_FAMILIES;
    const fitting = all.filter((f) => !f || (lethal >= (f.min ?? 0) && lethal <= (f.max ?? Infinity)));
    const family = fitting.length ? fitting[Math.abs(pick) % fitting.length] : null;
    if (!family) return null;
    const sheet = this.sheets.get(family.name)!;
    return ready(sheet) ? { family, sheet, density, lethal } : null;
  }

  private compose(family: string, sheet: HTMLImageElement, floater: boolean, lethal: number, frame: number): HTMLCanvasElement {
    const key = `${family}:${frame}:${lethal}`;
    const cached = this.composed.get(key);
    if (cached) {
      // re-insert so the oldest entry is always the least recently drawn
      this.composed.delete(key);
      this.composed.set(key, cached);
      return cached;
    }

    const canvas = document.createElement("canvas");
    canvas.width = CELL_W;
    const sx = frame * CELL_W;
    if (floater) {
      const { top, mid, bottom } = FLOATER;
      canvas.height = lethal + top.over + bottom.over;
      const ctx = canvas.getContext("2d")!;
      const topLethal = top.h - top.over;
      const bottomLethal = bottom.h - bottom.over;
      if (lethal < topLethal + bottomLethal) {
        // too short for both ends in full: each keeps its free edge and they meet in the middle
        const upper = top.over + Math.ceil(lethal / 2);
        const lower = canvas.height - upper;
        ctx.drawImage(sheet, sx, top.y, CELL_W, upper, 0, 0, CELL_W, upper);
        ctx.drawImage(sheet, sx, bottom.y + bottom.h - lower, CELL_W, lower, 0, upper, CELL_W, lower);
      } else {
        const bottomAt = canvas.height - bottom.h;
        ctx.drawImage(sheet, sx, top.y, CELL_W, top.h, 0, 0, CELL_W, top.h);
        tile(ctx, sheet, sx, mid.y, mid.h, top.h, bottomAt);
        ctx.drawImage(sheet, sx, bottom.y, CELL_W, bottom.h, 0, bottomAt, CELL_W, bottom.h);
      }
    } else {
      const { tip, shaft, base } = COLUMN;
      canvas.height = lethal + tip.over;
      const ctx = canvas.getContext("2d")!;
      // a stub no taller than the free end is only that end, cut off by the floor;
      // anything taller gets its foot, whose opaque collar hides wherever the piece above was cut
      const hasBase = canvas.height > tip.h;
      const baseAt = hasBase ? canvas.height - base.h : canvas.height;
      ctx.drawImage(sheet, sx, tip.y, CELL_W, tip.h, 0, 0, CELL_W, tip.h);
      tile(ctx, sheet, sx, shaft.y, shaft.h, tip.h, baseAt);
      if (hasBase) {
        ctx.clearRect(0, baseAt, CELL_W, base.h); // on a short column the foot replaces the lower part of the free end
        ctx.drawImage(sheet, sx, base.y, CELL_W, base.h, 0, baseAt, CELL_W, base.h);
      }
    }

    this.composed.set(key, canvas);
    if (this.composed.size > CACHE_LIMIT) this.composed.delete(this.composed.keys().next().value!);
    return canvas;
  }
}

/** repeats one piece from `from` down to `to`, cutting the last copy short */
function tile(ctx: CanvasRenderingContext2D, sheet: HTMLImageElement, sx: number, sy: number, pieceHeight: number, from: number, to: number): void {
  for (let y = from; y < to; y += pieceHeight) {
    const rows = Math.min(pieceHeight, to - y);
    ctx.drawImage(sheet, sx, sy, CELL_W, rows, 0, y, CELL_W, rows);
  }
}
