/** the scrolling world: backdrop, ground strip, hazards and coins */

import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../config/gameplayConfig.js";
import type { Game } from "../game/Game.js";
import { ObstacleType, type Obstacle } from "../game/Obstacle.js";
import type { AABB } from "../game/Player.js";
import { HazardKit, type HazardShape } from "./HazardKit.js";
import { loadImage, ready } from "./images.js";

/** greybox colours used until the hazard sprites have loaded */
const FALLBACK = {
  obstacle: "#7a828f",
  obstacleMoving: "#8a7fb8",
  obstacleBad: "#e06c75",
};

const OBSTACLE_DIR = "assets/obstacles/obstaculos_png/";

/** the one colour reserved for things that end the run; nothing friendly uses it */
export const DANGER = "#FF5A4D";
/** coins turn on their vertical axis: radians per second, and how far apart in phase neighbours are per world px */
const COIN_SPIN = 3.2;
const COIN_PHASE_PER_PX = 0.02;
/** thickness of the coin's edge as a share of its size, and the colour it shows when turned away */
const COIN_THICKNESS = 0.16;
const COIN_EDGE = "#a8590e";
/** coins are drawn small, so the large painting is reduced once instead of on every draw */
const COIN_TEXTURE = 96;

/** rows of the ground strip that hold its picture, and the row that sits on the floor line */
const GROUND_BAND = { y: 160, h: 80, floor: 200 };
/** the colour distant things fade toward: the dimmed backdrop */
const HAZE = "#120e30";
/**
 * rows of the same ground farther away, far to near: each is smaller, slower and hazier than the next,
 * so the dark strip between the painted horizon and the floor reads as ground receding into the distance
 *   lift   how far above the real floor line its own floor line sits, logical px
 *   start  where along the strip it begins, so the rows never line up
 */
const MIDGROUND = [
  { scale: 0.42, speed: 0.3, lift: 62, haze: 0.86, start: 517 },
  { scale: 0.64, speed: 0.52, lift: 33, haze: 0.7, start: 203 },
];

/** how far off-canvas the glow's source rectangle is drawn, logical px */
const GLOW_SHIFT = 4000;
/** seconds before a hazard scrolls into view that its warning appears on the right edge */
const TELEGRAPH_SECONDS = 0.75;

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

export class WorldLayer {
  private background = loadImage("assets/background/alien_background.png");
  private ground = loadImage("assets/environment/alien_ground.png");
  private coinImage = loadImage("assets/effects/coin.png");
  private laserEmitterImage = loadImage(`${OBSTACLE_DIR}obstacles_09_emisor_laser.png`);
  private obstacleSprites: Record<ObstacleType, HTMLImageElement[]>;
  private kit = new HazardKit();
  /** the ground strip's picture faded toward the haze, one canvas per midground row */
  private midground: HTMLCanvasElement[] | null = null;
  /** the coin's face and its flat edge-coloured silhouette, built once the painting has loaded */
  private coinFace: HTMLCanvasElement | null = null;
  private coinEdge: HTMLCanvasElement | null = null;
  private stars: Star[] = [];

  constructor(private game: Game) {
    for (let i = 0; i < 70; i++) {
      this.stars.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT * 0.5,
        size: Math.random() < 0.2 ? 2 : 1,
        phase: Math.random() * Math.PI * 2,
      });
    }
    const sprites = (names: string[]) => names.map((name) => loadImage(OBSTACLE_DIR + name));
    this.obstacleSprites = {
      [ObstacleType.GATE]: sprites(["obstacles_03_compuerta_laser.png"]),
      // columns: only what the kit has no pieces for; its pipes and crystals replace their paintings
      [ObstacleType.BLOCK_TOP]: sprites(["obstacles_04_bobina_tesla.png"]),
      [ObstacleType.BLOCK_BOTTOM]: sprites(["obstacles_04_bobina_tesla.png"]),
      [ObstacleType.FLOATING]: sprites([
        "obstacles_02_maquina.png",
        "obstacles_05_cristal.png",
        "obstacles_06_dron.png",
        "obstacles_08_cilindro.png",
        "obstacles_10_cristal_grande.png",
        "obstacles_11_generador_electrico.png",
      ]),
      [ObstacleType.MOVING]: sprites([
        "obstacles_04_bobina_tesla.png",
        "obstacles_06_dron.png",
      ]),
    };
  }

  /** sky, the far layer scrolling at 15% of the world speed and dimmed so the play layer stands out, then the receding ground */
  drawBackground(ctx: CanvasRenderingContext2D): void {
    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT * 0.62);
    sky.addColorStop(0, "#07061c");
    sky.addColorStop(1, "#231a55");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const drift = this.game.camera.x * 0.03;
    ctx.fillStyle = "#dfe6ff";
    for (const star of this.stars) {
      const x = (((star.x - drift) % CANVAS_WIDTH) + CANVAS_WIDTH) % CANVAS_WIDTH;
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(this.game.time * 1.7 + star.phase);
      ctx.fillRect(x, star.y, star.size, star.size);
    }
    ctx.globalAlpha = 1;

    const img = this.background;
    if (!ready(img)) return;

    const scale = Math.max(CANVAS_WIDTH / img.naturalWidth, CANVAS_HEIGHT / img.naturalHeight);
    const width = img.naturalWidth * scale;
    const height = img.naturalHeight * scale;
    const offset = (this.game.camera.x * 0.15) % width;

    ctx.drawImage(img, -offset, 0, width, height);
    ctx.drawImage(img, width - offset, 0, width, height);

    ctx.fillStyle = "rgba(9, 7, 30, 0.34)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    this.drawMidground(ctx);
  }

  /** distant rows of the ground strip, each scrolling slower than the one in front of it */
  private drawMidground(ctx: CanvasRenderingContext2D): void {
    if (!ready(this.ground)) return;
    this.midground ??= MIDGROUND.map((row) => hazed(this.ground, row.haze));

    const floorY = this.game.world.floorY();
    MIDGROUND.forEach((row, i) => {
      const image = this.midground![i];
      const width = image.width * row.scale;
      const height = image.height * row.scale;
      const y = floorY - row.lift - (GROUND_BAND.floor - GROUND_BAND.y) * row.scale;
      const offset = (this.game.camera.x * row.speed + row.start) % width;
      for (let x = -offset; x < CANVAS_WIDTH; x += width) {
        ctx.drawImage(image, x, y, width, height);
      }
    });
  }

  /** ground strip centred on the floor line, scrolling with the world */
  drawGround(ctx: CanvasRenderingContext2D): void {
    const img = this.ground;
    if (!ready(img)) return;

    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const y = this.game.world.floorY() - height / 2;
    const offset = this.game.camera.x % width;

    for (let x = -offset; x < CANVAS_WIDTH; x += width) {
      ctx.drawImage(img, x, y, width, height);
    }
  }

  drawObstacles(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    for (const obs of g.obstacles) {
      const sx = obs.worldX - g.camera.x;
      if (sx > CANVAS_WIDTH + 40 || sx + obs.width < -60) continue;

      const rects = obs.getRects(g.camera.x, g.time);
      const pick = pickOf(obs);
      const gate = obs.type === ObstacleType.GATE;
      // art that fills its collider gets a glow behind it; the collider itself stays invisible
      const filled = rects.filter((r) => this.kit.fills(r, this.shapeOf(r), gate, pick));
      this.drawDangerGlow(ctx, filled);
      if (!this.drawObstacleSprite(ctx, obs, rects)) {
        ctx.fillStyle = !obs.possible
          ? FALLBACK.obstacleBad
          : obs.type === ObstacleType.MOVING ? FALLBACK.obstacleMoving : FALLBACK.obstacle;
        ctx.globalAlpha = obs.possible ? 0.92 : 0.72;
        for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.globalAlpha = 1;
      }
    }
    this.drawTelegraphs(ctx);
  }

  /** a hot glow behind exactly the area that kills, for hazards whose art covers it; they never blend into the scenery */
  private drawDangerGlow(ctx: CanvasRenderingContext2D, rects: AABB[]): void {
    const pulse = 0.5 + 0.5 * Math.sin(this.game.time * 7);
    if (!rects.length) return;
    // only the shadow is wanted: the rectangle itself is drawn off-canvas and its shadow is shifted back
    // shadow offset and blur ignore the canvas transform, so both are scaled by hand
    const scale = ctx.getTransform().a;
    ctx.save();
    ctx.fillStyle = DANGER;
    ctx.shadowColor = DANGER;
    ctx.shadowBlur = (9 + 4 * pulse) * scale;
    ctx.shadowOffsetX = GLOW_SHIFT * scale;
    ctx.globalAlpha = 0.75 + 0.25 * pulse;
    for (const r of rects) ctx.fillRect(r.x + 3 - GLOW_SHIFT, r.y + 3, r.w - 6, r.h - 6);
    ctx.restore();
  }

  /** warning bars on the right edge for hazards about to scroll into view */
  private drawTelegraphs(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    if (g.worldSpeed <= 0 || g.boosterSeconds > 0) return; // nothing to warn about while the booster burns
    for (const obs of g.obstacles) {
      const sx = obs.worldX - g.camera.x;
      if (sx < CANVAS_WIDTH) continue;
      const eta = (sx - CANVAS_WIDTH) / g.worldSpeed;
      if (eta > TELEGRAPH_SECONDS) break; // ordered by world x

      const urgency = 1 - eta / TELEGRAPH_SECONDS;
      const blink = 0.55 + 0.45 * Math.sin(g.time * 22);
      ctx.save();
      ctx.globalAlpha = urgency * blink;
      ctx.fillStyle = DANGER;
      ctx.shadowColor = DANGER;
      ctx.shadowBlur = 14;
      for (const r of obs.getRects(g.camera.x, g.time)) {
        ctx.fillRect(CANVAS_WIDTH - 5, r.y, 5, r.h);
        const mid = r.y + r.h / 2;
        ctx.beginPath();
        ctx.moveTo(CANVAS_WIDTH - 24, mid);
        ctx.lineTo(CANVAS_WIDTH - 11, mid - 9);
        ctx.lineTo(CANVAS_WIDTH - 11, mid + 9);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawCoins(ctx: CanvasRenderingContext2D): void {
    if (!ready(this.coinImage)) return;
    if (!this.coinFace || !this.coinEdge) {
      this.coinFace = coinTexture(this.coinImage, null);
      this.coinEdge = coinTexture(this.coinImage, COIN_EDGE);
    }
    const g = this.game;
    for (const coin of g.coinSpawner.coins) {
      if (coin.collected) continue;
      const rect = g.coinSpawner.getScreenRect(coin, g.camera.x);
      if (rect.x > CANVAS_WIDTH || rect.x + rect.w < 0) continue;

      // a turning disc: the face narrows as it turns away and its edge shows on the far side;
      // neighbours are slightly out of step, so a row of coins ripples
      const angle = g.time * COIN_SPIN + coin.worldX * COIN_PHASE_PER_PX;
      const face = rect.w * Math.abs(Math.cos(angle));
      const edge = rect.w * COIN_THICKNESS * Math.abs(Math.sin(angle));
      const side = Math.sin(angle) * Math.cos(angle) >= 0 ? 1 : -1;
      const cx = rect.x + rect.w / 2;
      ctx.drawImage(this.coinEdge, cx - (face + edge) / 2, rect.y, face + edge, rect.h);
      ctx.drawImage(this.coinFace, cx - face / 2 + (side * edge) / 2, rect.y, face, rect.h);
    }
  }

  /** a rectangle attached to the ceiling or the floor is a column; anything else hangs free */
  private shapeOf(rect: AABB): HazardShape {
    const world = this.game.world;
    if (rect.y <= world.ceilingY() + 0.5) return "ceiling";
    if (rect.y + rect.h >= world.floorY() - 0.5) return "floor";
    return "floater";
  }

  /** false when the hazard's sprite has not loaded yet */
  private drawObstacleSprite(ctx: CanvasRenderingContext2D, obs: Obstacle, rects: AABB[]): boolean {
    if (!rects.length) return false;

    if (obs.visualVariant === "laserEmitter") {
      const sprite = this.laserEmitterImage;
      if (!ready(sprite)) return false;
      const left = Math.min(...rects.map((r) => r.x));
      const top = Math.min(...rects.map((r) => r.y));
      const right = Math.max(...rects.map((r) => r.x + r.w));
      const bottom = Math.max(...rects.map((r) => r.y + r.h));
      ctx.drawImage(sprite, left, top, right - left, bottom - top);
      return true;
    }

    // stackable kit art first; whatever the kit leaves alone keeps the painted sprite below
    const pick = pickOf(obs);
    const time = this.game.time;
    const gate = obs.type === ObstacleType.GATE;
    rects = rects.filter((r) => !this.kit.draw(ctx, r, this.shapeOf(r), gate, pick, time));
    if (!rects.length) return true;

    const loaded = this.obstacleSprites[obs.type].filter(ready);
    if (!loaded.length) return false;

    // the variant is picked from the sprites whose shape is closest to the collider, and stays fixed per hazard
    const referenceRect = rects.reduce((largest, rect) => (rect.h > largest.h ? rect : largest));
    const targetRatio = referenceRect.w / referenceRect.h;
    const compatible = loaded
      .map((image) => ({ image, difference: Math.abs(Math.log((image.naturalWidth / image.naturalHeight) / targetRatio)) }))
      .sort((a, b) => a.difference - b.difference)
      .slice(0, Math.min(4, loaded.length));
    const variantIndex = pick % compatible.length;
    const sprite = compatible[variantIndex].image;

    ctx.save();
    ctx.globalAlpha = obs.type === ObstacleType.GATE ? 0.94 : 1;
    for (const r of rects) {
      // the sprite covers the collider and is clipped to it, so what is drawn is exactly what kills
      const scale = Math.max(r.w / sprite.naturalWidth, r.h / sprite.naturalHeight);
      const drawWidth = sprite.naturalWidth * scale;
      const drawHeight = sprite.naturalHeight * scale;
      const x = r.x + (r.w - drawWidth) / 2;
      const shape = this.shapeOf(r);
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      if (shape === "floor") {
        // a column keeps its foot on the surface it grows from, whatever its height
        ctx.drawImage(sprite, x, r.y + r.h - drawHeight, drawWidth, drawHeight);
      } else if (shape === "ceiling") {
        // the same picture upside down, foot on the ceiling
        ctx.translate(0, r.y);
        ctx.scale(1, -1);
        ctx.drawImage(sprite, x, -drawHeight, drawWidth, drawHeight);
      } else {
        ctx.drawImage(sprite, x, r.y + (r.h - drawHeight) / 2, drawWidth, drawHeight);
      }
      ctx.restore();
    }
    ctx.restore();
    return true;
  }
}

/** a number that stays the same for a hazard's whole life; picks its art variant */
function pickOf(obs: Obstacle): number {
  return Math.abs(Math.floor(obs.worldX * 31 + obs.id * 17));
}

/** the picture band of the ground strip with every pixel moved `amount` of the way toward the haze colour */
function hazed(ground: HTMLImageElement, amount: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = ground.naturalWidth;
  canvas.height = GROUND_BAND.h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(ground, 0, -GROUND_BAND.y);
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = amount;
  ctx.fillStyle = HAZE;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/** the coin painting reduced to drawing size; with `tint` every opaque pixel becomes that colour */
function coinTexture(image: HTMLImageElement, tint: string | null): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = COIN_TEXTURE;
  canvas.height = COIN_TEXTURE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, COIN_TEXTURE, COIN_TEXTURE);
  if (tint) {
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, COIN_TEXTURE, COIN_TEXTURE);
  }
  return canvas;
}
