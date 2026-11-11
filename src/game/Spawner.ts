/**
 * obstacle generation on a world distance timeline
 *
 * Two generators share one cursor (`nextSpawnX`) and one obstacle id counter:
 *   weighted  the v0.1 baseline: each obstacle is an independent seeded draw
 *   search    the encounter scheduler: 2–4 obstacle encounters chosen by
 *             agent-evaluated evolutionary search (procedural/)
 * Geometry comes from the seed and world x; the single-obstacle validator reads
 * live player state afterwards and only marks, never rewrites.
 */

import type { GameplayConfig } from "../config/gameplayConfig.js";
import { computeDifficulty, moverSpeedAt, openingAt, spacingAt, worldSpeedAt } from "./Difficulty.js";
import { Obstacle, ObstacleType, type ObstaclePart } from "./Obstacle.js";
import { EncounterScheduler } from "./procedural/EncounterScheduler.js";
import { SeededRandom } from "./Random.js";
import { validateObstacle } from "./Validator.js";
import type { World } from "./World.js";

/** first obstacle world x leaves time to test the controls */
export const FIRST_SPAWN_X = 1000;

export class Spawner {
  /** next obstacle (or encounter) world x, also shown in debug output */
  nextSpawnX = FIRST_SPAWN_X;
  private nextId = 1;
  private rng = new SeededRandom(1);
  /** recent validator rejections */
  rejectedLog: string[] = [];
  readonly scheduler: EncounterScheduler;
  private lastMode = -1;

  constructor(private cfg: GameplayConfig, private world: World) {
    this.scheduler = new EncounterScheduler(cfg);
  }

  /** encounterMode is a number so it round-trips through the JSON config */
  get searchMode(): boolean {
    return this.cfg.encounterMode >= 1;
  }

  reset(seed: number): void {
    this.rng = new SeededRandom(seed);
    this.nextSpawnX = FIRST_SPAWN_X;
    this.nextId = 1;
    this.rejectedLog = [];
    this.lastMode = this.cfg.encounterMode;
    this.scheduler.reset(seed, FIRST_SPAWN_X, 1, this.searchMode);
  }

  /** search work between frames; wall-clock budget only, never a result change */
  backgroundWork(maxMs: number): void {
    if (this.searchMode) this.scheduler.backgroundWork(maxMs);
  }

  /** append every obstacle inside the current spawn horizon */
  update(
    cameraX: number,
    playerY: number,
    playerVy: number,
    worldSpeed: number,
    out: Obstacle[],
  ): void {
    const horizon = cameraX + this.cfg.playerScreenX + this.cfg.spawnAheadDistance;

    if (this.cfg.encounterMode !== this.lastMode) {
      // live mode switch: the new generator continues from the current cursor
      this.lastMode = this.cfg.encounterMode;
      if (this.searchMode) this.scheduler.reset(this.cfg.seed, this.nextSpawnX, this.nextId, true);
    }

    if (this.searchMode) {
      for (const obs of this.scheduler.update(horizon, out)) {
        this.validate(obs, playerY, playerVy, cameraX, worldSpeed);
        this.nextId = obs.id + 1;
      }
      this.nextSpawnX = this.scheduler.nextPlannedStartX();
      return;
    }

    while (this.nextSpawnX < horizon) {
      const obs = this.generate(this.nextSpawnX);
      this.validate(obs, playerY, playerVy, cameraX, worldSpeed);
      out.push(obs);

      // draw spacing after geometry so frame batching does not change rng order
      const d = computeDifficulty(this.nextSpawnX - this.cfg.playerScreenX, this.cfg);
      const baseSpacing = Math.max(60, spacingAt(d, this.cfg, this.rng));
      // Three challenges, then a breath: local pacing interrupts the steadily
      // rising global pressure. Convert seconds to distance at the obstacle's
      // scheduled speed, so the budget stays deterministic across spawn frames.
      // No extra random draw: recovery is an authored rhythm, not random luck.
      obs.recoveryAfter = obs.id % 3 === 0 ? Math.max(0, this.cfg.recoveryTime) : 0;
      this.nextSpawnX += baseSpacing + worldSpeedAt(d, this.cfg) * obs.recoveryAfter;
    }
  }

  /** single-obstacle reaction and reachability check; marks the obstacle and logs a rejection */
  private validate(obs: Obstacle, playerY: number, playerVy: number, cameraX: number, worldSpeed: number): void {
    const v = validateObstacle(obs, playerY, playerVy, cameraX, worldSpeed, this.cfg, this.world);
    obs.possible = v.possible;
    obs.rejectReason = v.reason;
    obs.spawnReactionTime = v.reactionTime;
    if (!v.possible) {
      this.rejectedLog.push(`#${obs.id} ${obs.type} @${obs.worldX.toFixed(0)}px — ${v.reason}`);
      if (this.rejectedLog.length > 12) this.rejectedLog.shift();
      console.warn("[spawner:validator]", this.rejectedLog[this.rejectedLog.length - 1]);
    }
  }

  /** Distance (px) from camera until the next spawn point is reached. */
  nextSpawnIn(cameraX: number): number {
    return this.nextSpawnX - cameraX;
  }

  private generate(worldX: number): Obstacle {
    const cfg = this.cfg;
    const w = this.world;
    // world position fixes difficulty even if this obstacle spawns on a different frame
    const d = computeDifficulty(worldX - cfg.playerScreenX, cfg);

    const type = this.rng.pickWeighted({
      GATE: 3.5,
      BLOCK_TOP: 2.8,
      BLOCK_BOTTOM: 2.8,
      FLOATING: 2.4,
      MOVING: d > 0.1 ? 2.1 : 0.6, // movers appear once the run has some speed, but still show up in later waves
    } as Record<ObstacleType, number>);

    const ceil = w.ceilingY();
    const floor = w.floorY();
    const corridor = floor - ceil;
    const W = cfg.obstacleWidth;
    const id = this.nextId++;

    switch (type) {
      case ObstacleType.GATE: {
        const margin = 24 + this.rng.range(0, 24);
        const opening = Math.min(openingAt(d, cfg, this.rng) * this.rng.range(0.85, 1.2), corridor - margin * 2);
        const cMin = ceil + margin + opening / 2;
        const cMax = floor - margin - opening / 2;
        const center = cMax > cMin ? this.rng.range(cMin, cMax) : (ceil + floor) / 2;
        const gapTop = center - opening / 2;
        const gapBottom = center + opening / 2;
        const parts: ObstaclePart[] = [];
        if (gapTop - ceil > 0) parts.push({ dx: 0, y: ceil, w: W, h: gapTop - ceil });
        if (floor - gapBottom > 0) parts.push({ dx: 0, y: gapBottom, w: W, h: floor - gapBottom });
        return new Obstacle(id, type, worldX, W, parts, gapTop, gapBottom);
      }
      case ObstacleType.BLOCK_TOP: {
        const h = corridor * this.rng.range(0.22, 0.68);
        return new Obstacle(id, type, worldX, W, [{ dx: 0, y: ceil, w: W, h }]);
      }
      case ObstacleType.BLOCK_BOTTOM: {
        const h = corridor * this.rng.range(0.22, 0.68);
        return new Obstacle(id, type, worldX, W, [{ dx: 0, y: floor - h, w: W, h }]);
      }
      case ObstacleType.FLOATING: {
        const h = this.rng.range(36, 140);
        const y = this.rng.range(ceil + corridor * 0.12, floor - corridor * 0.12 - h);
        return new Obstacle(id, type, worldX, W, [{ dx: 0, y, w: W, h }]);
      }
      case ObstacleType.MOVING: {
        const variant = this.rng.pickWeighted({
          DRONE: 3,
          TESLA: 2,
          LASER_EMITTER: 1,
        } as Record<string, number>);
        if (variant === "LASER_EMITTER") {
          const scale = 0.62;
          const spriteWidth = 215 * scale;
          const spriteHeight = 189 * scale;
          const baseY = floor - spriteHeight;
          const parts: ObstaclePart[] = [
            { dx: 0, y: baseY, w: 90 * scale, h: spriteHeight },
            { dx: 48 * scale, y: baseY + 50 * scale, w: 167 * scale, h: 14 * scale },
            { dx: 48 * scale, y: baseY + 104 * scale, w: 167 * scale, h: 15 * scale },
          ];
          return new Obstacle(id, type, worldX, spriteWidth, parts, null, null, null, "laserEmitter");
        }

        const h = this.rng.range(30, 110);
        // keep both movement extremes inside the corridor while widening the motion profile
        const ampMax = Math.max(0, corridor / 2 - h / 2 - 18);
        const amp = Math.min(cfg.movingHazardAmplitude * this.rng.range(0.75, 1.25), ampMax);
        const baseY = this.rng.range(ceil + h + amp, floor - h - amp);
        return new Obstacle(id, type, worldX, W, [{ dx: 0, y: baseY, w: W, h }], null, null, {
          baseY,
          amplitude: amp,
          speed: moverSpeedAt(d, cfg) * this.rng.range(0.8, 1.3),
          phase: this.rng.range(0, Math.PI * 2),
        });
      }
    }
  }
}
