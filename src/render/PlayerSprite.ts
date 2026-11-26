/**
 * the astronaut: picks an animation from the player state, tilts with vertical speed and feeds the exhaust
 *
 * art comes from art/player/astronaut.aseprite, exported to public/assets/player/rig
 * the sheet is drawn larger than the collider on purpose; the collider stays inside the body
 */

import { clamp, lerp } from "../config/gameplayConfig.js";
import { GameState, type Game, type ShopItem } from "../game/Game.js";
import { PlayerState } from "../game/Player.js";
import { FX, type Effects } from "./Effects.js";
import { assetPath, loadImage, ready } from "./images.js";
import type { Bounds } from "./layout.js";

/** sheet cell size and the torso pivot inside a cell, from the Aseprite export */
const CELL_W = 96;
const CELL_H = 176;
const PIVOT_X = 56;
const PIVOT_Y = 72;
/** sheet rows of the top of the helmet and the soles on the ground */
const HEAD_ROW = 15;
const SOLE_ROW = 148;
/** where the jetpack nozzle sits in a cell */
const NOZZLE_X = 32;
const NOZZLE_Y = 80;

/** logical pixels per sheet pixel */
const SCALE = 0.5;
const HEAD_ABOVE_PIVOT = (PIVOT_Y - HEAD_ROW) * SCALE;
const SOLE_BELOW_PIVOT = (SOLE_ROW - PIVOT_Y) * SCALE;
/** how far the lowest part of the body is below the pivot when it lies flat */
const FLAT_BELOW_PIVOT = 13;

interface Tag {
  from: number;
  /** milliseconds per frame */
  durations: number[];
  loop: boolean;
}

type TagName = "thrust" | "fall" | "run" | "land" | "hit" | "tumble";

/** used until the exported atlas has loaded, and if it fails to */
const FALLBACK_TAGS: Record<TagName, Tag> = {
  thrust: { from: 0, durations: [100, 83, 83, 100, 83, 83], loop: true },
  fall: { from: 6, durations: [133, 117, 133, 133, 117, 133], loop: true },
  run: { from: 12, durations: [83, 67, 83, 83, 83, 67, 83, 83], loop: true },
  land: { from: 20, durations: [67, 150, 100], loop: false },
  hit: { from: 23, durations: [50, 117, 133], loop: false },
  tumble: { from: 26, durations: [100, 117, 100, 117], loop: true },
};

interface AtlasJson {
  frames: Record<string, { duration: number }> | Array<{ duration: number }>;
  meta: { frameTags: Array<{ name: string; from: number; to: number; repeat?: string }> };
}

const POWERUP_COLORS: Array<{ item: ShopItem; color: string }> = [
  { item: "shield", color: "#5EEBFF" },
  { item: "doubleCoins", color: "#FFD45E" },
  { item: "booster", color: "#C678FF" },
];

export class PlayerSprite {
  private body = loadImage("assets/player/rig/astronaut.png");
  /** the body sheet with a pale rim baked in, built once the image has loaded */
  private rimmed: HTMLCanvasElement | null = null;
  private flame = loadImage("assets/player/rig/astronaut_flame.png");
  private tags: Record<TagName, Tag> = FALLBACK_TAGS;

  private tag: TagName = "thrust";
  private frame = 0;
  private frameTime = 0;
  /** a one-shot that must finish before the state picks the animation again */
  private oneShot: TagName | null = null;

  private tilt = 0;
  /** 0..1 jetpack output, eased so taps do not flicker */
  private power = 0;
  /** positive is squashed flat, negative is stretched tall */
  private squash = 0;
  private clock = 0;
  private exhaustDebt = 0;
  private boosterDebt = 0;
  private slideDebt = 0;
  private crashing = false;

  constructor(private game: Game, private fx: Effects) {
    void fetch(assetPath("assets/player/rig/astronaut.json"))
      .then((response) => (response.ok ? (response.json() as Promise<AtlasJson>) : null))
      .then((atlas) => {
        if (atlas) this.tags = readTags(atlas);
      })
      .catch(() => {
        // the built-in timings above match the export this was written against
      });
  }

  /** the player touched the floor at this downward speed, px/s */
  landed(speed: number): void {
    const strength = clamp(speed / 700, 0, 1);
    if (strength > 0.12) {
      this.oneShot = "land";
      this.play("land");
      this.squash = 0.06 + strength * 0.12;
      const feet = this.feet();
      this.fx.dust(feet.x, feet.y, this.game.worldSpeed, strength);
    }
  }

  /** thrust started while standing on the floor */
  tookOff(): void {
    this.squash = -0.1;
    const feet = this.feet();
    this.fx.dust(feet.x, feet.y, this.game.worldSpeed, 0.5);
  }

  update(dt: number): void {
    if (dt <= 0) return;
    const g = this.game;
    const p = g.player;
    this.clock += dt;

    const crash = g.crash;
    const hovering = g.state === GameState.READY;
    const thrusting = !crash && (hovering || (g.state === GameState.RUNNING && p.thrusting));
    const grounded = !crash && !hovering && p.state === PlayerState.FLOOR_CONTACT;

    // animation
    if (crash) {
      if (!this.crashing) {
        this.crashing = true;
        this.oneShot = "hit";
        this.play("hit");
      } else if (!this.oneShot && this.tag !== "tumble") {
        this.play("tumble");
      }
    } else {
      if (this.crashing) {
        // revived or restarted: drop the tumble at once instead of unwinding it
        this.crashing = false;
        this.oneShot = null;
        this.tilt = 0;
      }
      if (this.oneShot && !grounded) this.oneShot = null; // leaving the floor cancels the landing
      if (!this.oneShot) {
        const want: TagName = thrusting ? "thrust" : grounded ? "run" : "fall";
        if (want !== this.tag) this.play(want);
      }
    }
    const speedUp = this.tag === "run" ? clamp(g.worldSpeed / 420, 0.8, 1.7) : 1;
    if (!crash?.settled) this.frameTime += dt * 1000 * speedUp;
    const tag = this.tags[this.tag];
    while (this.frameTime >= tag.durations[this.frame]) {
      this.frameTime -= tag.durations[this.frame];
      if (this.frame + 1 < tag.durations.length) {
        this.frame++;
      } else if (tag.loop) {
        this.frame = 0;
      } else {
        this.oneShot = null;
        this.frameTime = 0;
        break;
      }
    }

    if (crash) {
      this.tilt = crash.rotation;
      if (crash.grounded && crash.speed > 50) {
        // scraping along the floor
        this.slideDebt += dt * 34;
        while (this.slideDebt >= 1) {
          this.slideDebt -= 1;
          const at = this.pivot();
          this.fx.dust(at.x - 10, at.y + 12, crash.speed, 0.25);
        }
      }
    } else {
      // body angle follows vertical speed: nose up on the way up, nose down on the way down
      const targetTilt = grounded || hovering ? 0 : clamp(p.vy / 900, -0.7, 1) * 0.3;
      this.tilt += (targetTilt - this.tilt) * Math.min(1, dt * 12);
    }
    this.power += ((thrusting ? 1 : 0) - this.power) * Math.min(1, dt * (thrusting ? 24 : 14));
    this.squash *= Math.exp(-dt * 11);

    // exhaust
    if (this.power > 0.05) {
      this.exhaustDebt += dt * 95 * this.power;
      const count = Math.floor(this.exhaustDebt);
      this.exhaustDebt -= count;
      if (count > 0) {
        const nozzle = this.nozzle();
        const angle = this.tilt + 0.3; // straight down in the sheet is slightly behind the body
        this.fx.exhaust(nozzle.x, nozzle.y, -Math.sin(angle), Math.cos(angle), hovering ? 0 : g.worldSpeed, count);
      }
    }
    if (g.state === GameState.RUNNING && g.isPowerupActive("booster")) {
      this.boosterDebt += dt * 40;
      const pivot = this.pivot();
      while (this.boosterDebt >= 1) {
        this.boosterDebt -= 1;
        this.fx.boosterTrail(pivot.x - 12, pivot.y + 6);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    const pivot = this.pivot();

    if (g.playerTheme === "player" && g.state === GameState.RUNNING) this.drawPowerupAura(ctx);

    const sheet = this.sheet();
    if (!sheet) {
      const r = g.player.rect();
      ctx.fillStyle = "#e8e8ec";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      return;
    }

    ctx.save();
    ctx.translate(pivot.x, pivot.y);
    ctx.rotate(this.tilt);
    // squash toward the feet so a landing compresses into the ground
    ctx.translate(0, SOLE_BELOW_PIVOT);
    ctx.scale(1 + this.squash, 1 - this.squash);
    ctx.translate(0, -SOLE_BELOW_PIVOT);

    if (this.power > 0.02) this.drawFlame(ctx);

    if (g.playerTheme === "admin") ctx.filter = "hue-rotate(170deg) saturate(1.35) brightness(1.08)";
    // the protection left after a booster or a broken shield shows as a flicker
    const protectedStill = g.state === GameState.RUNNING && g.graceSeconds > 0 && g.boosterSeconds <= 0;
    if (protectedStill && Math.floor(this.clock * 16) % 2 === 0) ctx.globalAlpha = 0.4;
    const cell = this.tags[this.tag].from + this.frame;
    ctx.drawImage(
      sheet,
      cell * CELL_W, 0, CELL_W, CELL_H,
      -PIVOT_X * SCALE, -PIVOT_Y * SCALE, CELL_W * SCALE, CELL_H * SCALE,
    );
    ctx.restore();
  }

  /**
   * the suit is as dark as the night sky, so the sheet gets a thin pale rim around every frame
   * the art itself is untouched; the rim only separates it from dark backdrops
   */
  private sheet(): HTMLCanvasElement | null {
    if (this.rimmed) return this.rimmed;
    if (!ready(this.body)) return null;
    const w = this.body.naturalWidth;
    const h = this.body.naturalHeight;

    const silhouette = document.createElement("canvas");
    silhouette.width = w;
    silhouette.height = h;
    const sctx = silhouette.getContext("2d")!;
    sctx.drawImage(this.body, 0, 0);
    sctx.globalCompositeOperation = "source-in";
    sctx.fillStyle = "#c9bcff";
    sctx.fillRect(0, 0, w, h);

    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const octx = out.getContext("2d")!;
    octx.globalAlpha = 0.5;
    // two sheet pixels is one logical pixel; every frame keeps at least three clear pixels to its cell edge
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      octx.drawImage(silhouette, dx, dy);
    }
    octx.globalAlpha = 1;
    octx.drawImage(this.body, 0, 0);
    this.rimmed = out;
    return out;
  }

  /** what the sprite covers on screen, for effects that wrap the player */
  bounds(): Bounds {
    const pivot = this.pivot();
    return { x: pivot.x - 22, y: pivot.y - HEAD_ABOVE_PIVOT, w: 40, h: HEAD_ABOVE_PIVOT + SOLE_BELOW_PIVOT };
  }

  /** screen position of the torso pivot, the point the sprite rotates around */
  pivot(): { x: number; y: number } {
    const g = this.game;
    const r = g.player.rect();
    const top = g.world.ceilingY();
    const bottom = g.world.floorY() - r.h;
    // the sprite is taller than the collider: slide it inside the corridor so the helmet meets the
    // ceiling and the soles meet the floor, and the collider sits mid-body in between
    const t = clamp((r.y - top) / (bottom - top), 0, 1);
    const hover = g.state === GameState.READY ? Math.sin(this.clock * 2.4) * 4 : 0;
    let y = lerp(r.y + HEAD_ABOVE_PIVOT, r.y + r.h - SOLE_BELOW_PIVOT, t) + hover;

    const crash = g.crash;
    if (crash) {
      // a tumbling body rests on whatever part is underneath: the soles when upright, the torso when flat
      const flat = Math.abs(Math.sin(crash.rotation));
      const rest = lerp(SOLE_BELOW_PIVOT, FLAT_BELOW_PIVOT, flat);
      y = lerp(y, r.y + r.h - rest, clamp(crash.time / 0.15, 0, 1));
    }
    return { x: r.x + r.w / 2, y };
  }

  private feet(): { x: number; y: number } {
    const pivot = this.pivot();
    return { x: pivot.x - 4, y: pivot.y + SOLE_BELOW_PIVOT };
  }

  private nozzle(): { x: number; y: number } {
    const pivot = this.pivot();
    const lx = (NOZZLE_X - PIVOT_X) * SCALE;
    const ly = (NOZZLE_Y - PIVOT_Y) * SCALE;
    const cos = Math.cos(this.tilt);
    const sin = Math.sin(this.tilt);
    return { x: pivot.x + lx * cos - ly * sin, y: pivot.y + lx * sin + ly * cos };
  }

  private play(tag: TagName): void {
    this.tag = tag;
    this.frame = 0;
    this.frameTime = 0;
  }

  /** drawn in the sprite's rotated space, under the body */
  private drawFlame(ctx: CanvasRenderingContext2D): void {
    const nx = (NOZZLE_X - PIVOT_X) * SCALE;
    const ny = (NOZZLE_Y - PIVOT_Y) * SCALE;
    const flicker = 0.85 + 0.15 * Math.sin(this.clock * 61) * Math.sin(this.clock * 37);
    const length = (15 + 13 * this.power) * flicker;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(nx, ny);
    ctx.rotate(0.3);
    ctx.globalAlpha = 0.9 * this.power;
    ctx.drawImage(this.fx.glow(FX.flameDeep), -9, -6, 18, length * 1.5);
    ctx.globalAlpha = this.power;
    ctx.drawImage(this.fx.glow(FX.white), -4.5, -3, 9, length * 0.8);
    ctx.restore();

    // the drawn flame only has ink on the thrust frames
    if (this.tag === "thrust" && ready(this.flame)) {
      ctx.save();
      ctx.globalAlpha = this.power;
      const cell = this.tags.thrust.from + this.frame;
      ctx.drawImage(
        this.flame,
        cell * CELL_W, 0, CELL_W, CELL_H,
        -PIVOT_X * SCALE, -PIVOT_Y * SCALE, CELL_W * SCALE, CELL_H * SCALE,
      );
      ctx.restore();
    }
  }

  /** corner brackets around the player, one set per active power-up */
  private drawPowerupAura(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    const active = POWERUP_COLORS.filter((effect) => g.isPowerupActive(effect.item));
    if (!active.length) return;
    const r = this.bounds();

    ctx.save();
    active.forEach((effect, index) => {
      const warning = effect.item === "booster" && g.boosterSeconds <= 1;
      ctx.globalAlpha = warning ? 0.9 : 0.55;
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = warning ? 2.5 : 1.5;
      const pad = 5 + index * 4;
      const left = r.x - pad;
      const right = r.x + r.w + pad;
      const top = r.y - pad;
      const bottom = r.y + r.h + pad;
      const corner = 7 + index * 2;
      ctx.beginPath();
      ctx.moveTo(left, top + corner);
      ctx.lineTo(left, top);
      ctx.lineTo(left + corner, top);
      ctx.moveTo(right - corner, top);
      ctx.lineTo(right, top);
      ctx.lineTo(right, top + corner);
      ctx.moveTo(right, bottom - corner);
      ctx.lineTo(right, bottom);
      ctx.lineTo(right - corner, bottom);
      ctx.moveTo(left + corner, bottom);
      ctx.lineTo(left, bottom);
      ctx.lineTo(left, bottom - corner);
      ctx.stroke();
    });
    ctx.restore();
  }
}

function readTags(atlas: AtlasJson): Record<TagName, Tag> {
  const durations = Object.values(atlas.frames).map((frame) => frame.duration);
  const tags = { ...FALLBACK_TAGS };
  for (const tag of atlas.meta.frameTags) {
    if (!(tag.name in tags) || tag.to >= durations.length) continue;
    tags[tag.name as TagName] = {
      from: tag.from,
      durations: durations.slice(tag.from, tag.to + 1),
      loop: tag.repeat === undefined,
    };
  }
  return tags;
}
