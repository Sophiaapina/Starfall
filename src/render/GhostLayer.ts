/**
 * the search's test pilots, drawn flying ahead of the player along the paths they tested
 *
 * One ghost per agent profile. Where each one is comes from GhostTrack; this file only gives it a body:
 * which animation plays, how it leans, how it fades in and bursts when its test flight ended in a hit.
 * Ghosts never touch the simulation.
 */

import type { GameplayConfig } from "../config/gameplayConfig.js";
import { GameState, type Game } from "../game/Game.js";
import type { AgentProfile } from "../game/procedural/AgentController.js";
import { GhostTrack } from "../game/procedural/GhostTracks.js";
import { loadImage, ready } from "./images.js";

const SHEET = "assets/ghost/ghost.png";
/** one cell of the sheet, the point of it that is pinned to the path, and the size it is drawn at */
const CELL = 96;
const PIVOT_X = 54;
const PIVOT_Y = 44;
const SCALE = 0.75;

/** rows of the sheet */
const ANIMATIONS = {
  float: { row: 0, frames: 8, seconds: 0.11, loop: true },
  rise: { row: 1, frames: 4, seconds: 0.09, loop: true },
  fall: { row: 2, frames: 4, seconds: 0.09, loop: true },
  pop: { row: 3, frames: 6, seconds: 0.07, loop: false },
  appear: { row: 4, frames: 6, seconds: 0.07, loop: false },
} as const;
type AnimationName = keyof typeof ANIMATIONS;

/** how far ahead of the player each pilot flies, world px, and the colour that tells them apart */
const PILOTS: { profile: AgentProfile["name"]; lead: number; tint: string }[] = [
  { profile: "strong", lead: 320, tint: "#8ff4ff" },
  { profile: "intermediate", lead: 225, tint: "#b9a2ff" },
  { profile: "novice", lead: 140, tint: "#ff9be4" },
];

const OPACITY = 0.78;
/**
 * a flight through moving hazards only means something if the run's clock still matches the tested one;
 * past this many seconds apart (a booster burst does it) the ghost sits that encounter out
 */
const CLOCK_TOLERANCE = 0.06;
/** falling faster than this, px/s, shows the fall animation instead of the float */
const FALL_SPEED = 90;
/** a pose is held at least this long, so quick taps do not make the ghost twitch */
const MIN_POSE_SECONDS = 0.14;
/** how quickly a ghost closes the gap when its next test flight starts somewhere else, 1/s */
const REJOIN_RATE = 6;
const FADE_RATE = 5;

interface Burst {
  worldX: number;
  y: number;
  age: number;
  tint: string;
}

class Ghost {
  readonly track: GhostTrack;
  flying = false;
  encounter = -1;
  y = 0;
  vy = 0;
  /** distance still to close after joining a flight that starts elsewhere */
  offset = 0;
  pose: AnimationName = "float";
  poseAge = 0;
  presence = 0;
  tinted: HTMLCanvasElement | null = null;

  constructor(readonly profile: AgentProfile["name"], readonly lead: number, readonly tint: string) {
    this.track = new GhostTrack(profile);
  }

  setPose(pose: AnimationName): void {
    if (this.pose === pose) return;
    this.pose = pose;
    this.poseAge = 0;
  }
}

export class GhostLayer {
  private sheet = loadImage(SHEET);
  private ghosts = PILOTS.map((p) => new Ghost(p.profile, p.lead, p.tint));
  private bursts: Burst[] = [];
  private clock = 0;
  private lastStepCount = 0;
  /** a ghost burst on screen; the renderer gives it a sound */
  onPop: (() => void) | null = null;

  constructor(private game: Game) {}

  update(dt: number): void {
    const g = this.game;
    const cfg = g.cfg;
    this.clock += dt;
    if (g.stepCount < this.lastStepCount) this.clear(); // a new run: new encounters, new flights
    this.lastStepCount = g.stepCount;

    // nothing to scout for while the booster smashes through everything
    const running = cfg.ghosts >= 1 && g.spawner.searchMode && g.boosterSeconds <= 0 &&
      (g.state === GameState.RUNNING || g.state === GameState.PAUSED);
    const scheduler = g.spawner.scheduler;
    const records = running ? [...scheduler.committed, ...scheduler.ready] : [];

    for (const ghost of this.ghosts) {
      let sample = running ? ghost.track.sample(records, g.camera.x + ghost.lead) : null;
      ghost.poseAge += dt;

      if (sample) {
        const record = records.find((r) => r.index === sample!.encounter)!;
        const arrival = g.time + ghost.lead / Math.max(1, g.worldSpeed);
        if (record.obstacles.some((o) => o.moving) && Math.abs(arrival - sample.time) > CLOCK_TOLERANCE) sample = null;
      }

      if (!sample || !sample.flying) {
        if (ghost.flying && sample?.crash) {
          this.onPop?.();
          this.bursts.push({
            worldX: sample.crash.cameraX + centreX(cfg),
            y: sample.crash.y + cfg.playerHeight / 2,
            age: 0,
            tint: ghost.tint,
          });
          ghost.presence = 0; // the burst takes over from the body
        }
        ghost.flying = false;
        ghost.presence = Math.max(0, ghost.presence - FADE_RATE * dt);
        continue;
      }

      const target = sample.y + cfg.playerHeight / 2;
      if (!ghost.flying) {
        ghost.offset = 0;
        ghost.setPose("appear");
        ghost.poseAge = 0;
      } else if (sample.encounter !== ghost.encounter) {
        // the next test flight may begin at another height: keep the body where it is and close the gap smoothly
        ghost.offset = ghost.y - target;
      }
      ghost.flying = true;
      ghost.encounter = sample.encounter;
      ghost.offset *= Math.exp(-REJOIN_RATE * dt);
      ghost.y = target + ghost.offset;
      ghost.vy = sample.vy;
      ghost.presence = Math.min(1, ghost.presence + FADE_RATE * dt);

      const appearing = ghost.pose === "appear" && ghost.poseAge < duration("appear");
      if (!appearing && (ghost.poseAge >= MIN_POSE_SECONDS || ghost.pose === "appear")) {
        const from = ghost.pose;
        ghost.setPose(sample.hold ? "rise" : sample.vy > FALL_SPEED ? "fall" : "float");
        // the last frame of appear is the first of float, so the loop picks up one frame in
        if (from === "appear" && ghost.pose === "float") ghost.poseAge = ANIMATIONS.float.seconds;
      }
    }

    for (const burst of this.bursts) burst.age += dt;
    this.bursts = this.bursts.filter((b) => b.age < duration("pop") + 0.25);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    const sheet = ready(this.sheet) ? this.sheet : null;
    const scale = ctx.getTransform().a; // shadows ignore the canvas transform

    for (const burst of this.bursts) {
      const x = burst.worldX - g.camera.x;
      ctx.save();
      ctx.translate(x, burst.y);
      ctx.globalAlpha = OPACITY;
      if (sheet) this.drawCell(ctx, this.tintedSheet(sheet, burst.tint), "pop", burst.age);
      else drawSketchBurst(ctx, burst.age / duration("pop"), burst.tint);
      ctx.restore();
    }

    for (const ghost of this.ghosts) {
      if (ghost.presence <= 0) continue;
      const x = centreX(g.cfg) + ghost.lead;
      // never quite still: a slow bob and a faint flicker on top of whatever the sheet animates
      const bob = Math.sin(this.clock * 2.6 + ghost.lead) * 1.5;
      const flicker = 0.92 + 0.08 * Math.sin(this.clock * 23 + ghost.lead * 0.7);
      ctx.save();
      ctx.translate(x, ghost.y + bob);
      ctx.rotate(Math.max(-0.3, Math.min(0.3, ghost.vy / 1400)));
      ctx.globalAlpha = OPACITY * ghost.presence * flicker;
      ctx.shadowColor = ghost.tint;
      ctx.shadowBlur = 10 * scale;
      if (sheet) {
        ghost.tinted ??= this.tintedSheet(sheet, ghost.tint);
        this.drawCell(ctx, ghost.tinted, ghost.pose, ghost.poseAge);
      } else {
        drawSketch(ctx, ghost.pose, ghost.poseAge, this.clock + ghost.lead, ghost.tint);
      }
      ctx.restore();
    }
  }

  private clear(): void {
    this.bursts = [];
    for (const ghost of this.ghosts) {
      ghost.track.reset();
      ghost.flying = false;
      ghost.presence = 0;
      ghost.encounter = -1;
    }
  }

  private tints = new Map<string, HTMLCanvasElement>();

  /** the sheet pulled toward one pilot's colour; built once per colour */
  private tintedSheet(sheet: HTMLImageElement, tint: string): HTMLCanvasElement {
    let canvas = this.tints.get(tint);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = sheet.naturalWidth;
      canvas.height = sheet.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(sheet, 0, 0);
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.tints.set(tint, canvas);
    }
    return canvas;
  }

  private drawCell(ctx: CanvasRenderingContext2D, sheet: HTMLCanvasElement, name: AnimationName, age: number): void {
    const animation = ANIMATIONS[name];
    const step = Math.floor(age / animation.seconds);
    const frame = animation.loop ? step % animation.frames : Math.min(animation.frames - 1, step);
    ctx.drawImage(
      sheet, frame * CELL, animation.row * CELL, CELL, CELL,
      -PIVOT_X * SCALE, -PIVOT_Y * SCALE, CELL * SCALE, CELL * SCALE,
    );
  }
}

function duration(name: AnimationName): number {
  return ANIMATIONS[name].frames * ANIMATIONS[name].seconds;
}

function centreX(cfg: GameplayConfig): number {
  return cfg.playerScreenX + cfg.playerWidth / 2;
}

/** stand-in body until the sheet exists: a helmet, a visor and a waving tail, drawn around the pivot */
function drawSketch(ctx: CanvasRenderingContext2D, pose: AnimationName, poseAge: number, time: number, tint: string): void {
  const grow = pose === "appear" ? Math.min(1, 0.3 + (0.7 * poseAge) / duration("appear")) : 1;
  const tailLift = pose === "rise" ? 9 : pose === "fall" ? -9 : 0;
  ctx.scale(grow, grow);

  // tail: a ribbon whose wave travels away from the body
  ctx.fillStyle = tint;
  ctx.beginPath();
  const points = 9;
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const x = -6 - t * 26;
    const y = 8 + t * tailLift + Math.sin(time * 9 - t * 5) * 4 * t - (1 - t) * 7;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = points; i >= 0; i--) {
    const t = i / points;
    const x = -6 - t * 26;
    const y = 8 + t * tailLift + Math.sin(time * 9 - t * 5) * 4 * t + (1 - t) * 7;
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // helmet and torso
  ctx.beginPath();
  ctx.ellipse(0, -2, 12, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // visor, with a blink now and then
  const blink = Math.sin(time * 1.9) > 0.97 ? 0.15 : 1;
  ctx.fillStyle = "#f2feff";
  ctx.beginPath();
  ctx.ellipse(4.5, -5, 6, 4.2 * blink, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawSketchBurst(ctx: CanvasRenderingContext2D, progress: number, tint: string): void {
  const t = Math.min(1, progress);
  ctx.globalAlpha *= 1 - t;
  ctx.fillStyle = tint;
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + 0.4;
    const reach = 6 + t * 26;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * reach, Math.sin(angle) * reach, 4 * (1 - t) + 1, 0, Math.PI * 2);
    ctx.fill();
  }
}
