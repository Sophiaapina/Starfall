import type { GameplayConfig } from "../config/gameplayConfig.js";
import { aabbOverlap } from "./Collision.js";
import type { Obstacle } from "./Obstacle.js";
import type { AABB } from "./Player.js";
import { SeededRandom } from "./Random.js";
import type { World } from "./World.js";

export interface Coin {
  id: number;
  worldX: number;
  centerY: number;
  size: number;
  collected: boolean;
}

export class CoinSpawner {
  readonly coins: Coin[] = [];
  private rng = new SeededRandom(1);
  private nextObstacleId = 1;
  private previousObstacleEndX = 0;
  private nextCoinId = 1;

  constructor(private cfg: GameplayConfig, private world: World) {}

  reset(seed: number): void {
    this.rng = new SeededRandom((seed ^ 0xa511e9b3) >>> 0);
    this.coins.length = 0;
    this.nextObstacleId = 1;
    this.previousObstacleEndX = 0;
    this.nextCoinId = 1;
  }

  update(obstacles: Obstacle[], cameraX: number, playerY: number): void {
    for (const obstacle of obstacles) {
      if (obstacle.id < this.nextObstacleId) continue;

      this.placeForObstacle(obstacle, cameraX, playerY);
      this.previousObstacleEndX = obstacle.worldX + obstacle.width;
      this.nextObstacleId = obstacle.id + 1;
    }

    for (let index = this.coins.length - 1; index >= 0; index--) {
      const coin = this.coins[index];
      if (coin.collected || coin.worldX + coin.size / 2 < cameraX - 40) this.coins.splice(index, 1);
    }
  }

  collect(player: AABB, cameraX: number): number {
    let collected = 0;
    for (const coin of this.coins) {
      if (coin.collected) continue;
      const rect = this.getScreenRect(coin, cameraX);
      if (!aabbOverlap(player, rect)) continue;
      coin.collected = true;
      collected++;
    }
    return collected;
  }
  collectWithPositions(
  player: AABB,
  cameraX: number
): { id: number; x: number; y: number; size: number }[] {
  const pickups: {
    id: number;
    x: number;
    y: number;
    size: number;
  }[] = [];

  for (const coin of this.coins) {
    if (coin.collected) continue;

    const rect = this.getScreenRect(coin, cameraX);

    if (!aabbOverlap(player, rect)) continue;

    coin.collected = true;

    pickups.push({
      id: coin.id,
      x: coin.worldX - cameraX,
      y: coin.centerY,
      size: coin.size,
    });
  }

  return pickups;
}

  getScreenRect(coin: Coin, cameraX: number): AABB {
    return {
      x: coin.worldX - cameraX - coin.size / 2,
      y: coin.centerY - coin.size / 2,
      w: coin.size,
      h: coin.size,
    };
  }

  private placeForObstacle(
    obstacle: Obstacle,
    cameraX: number,
    playerY: number,
  ): void {
    const size = 34;
    const radius = size / 2;

    const minimumX = Math.max(
      this.previousObstacleEndX + radius + 24,
      cameraX + this.cfg.playerScreenX + this.cfg.playerWidth / 2 + 220,
    );

    const maximumX = obstacle.worldX - radius - 120;
    const availableWidth = maximumX - minimumX;

    if (availableWidth < 84) return;

    const intervals = obstacle.freeIntervals(
      0, 0, this.world, this.cfg.playerHeight, true
    );

    if (!intervals.length) return;

    intervals.sort(
      (a, b) =>
        distanceToInterval(playerY, a) -
        distanceToInterval(playerY, b)
    );

    const [minY, maxY] = intervals[0];

    const minCenterY = minY + this.cfg.playerHeight / 2;
    const maxCenterY = maxY + this.cfg.playerHeight / 2;

    // Patrones procedurales de monedas.
    const patterns: number[][][] = [
      [[0, 0], [42, 0], [84, 0]],
      [[0, 30], [42, 10], [84, -10]],
      [[0, -30], [42, -10], [84, 10]],
      [[0, 20], [42, -5], [84, -15], [126, 20]],
      [[0, 36], [42, 18], [84, 0], [126, -18]],
      [[0, -36], [42, -18], [84, 0], [126, 18]],
    ];

    // Seleccionar patrones que caben horizontalmente.
    const fittingPatterns = patterns.filter(
      pattern => pattern[pattern.length - 1][0] <= availableWidth
    );

    if (!fittingPatterns.length) return;

    // Comprobar también que caben verticalmente.
    const validPatterns = fittingPatterns.filter(pattern => {
      const offsets = pattern.map(point => point[1]);
      const minOffset = Math.min(...offsets);
      const maxOffset = Math.max(...offsets);

      const minBase = Math.max(
        minCenterY - minOffset,
        this.world.ceilingY() + radius - minOffset,
      );

      const maxBase = Math.min(
        maxCenterY - maxOffset,
        this.world.floorY() - radius - maxOffset,
      );

      return minBase <= maxBase;
    });

    if (!validPatterns.length) return;

    // La semilla determina el patrón.
    const patternIndex = Math.floor(
      this.rng.range(0, validPatterns.length)
    );

    const pattern = validPatterns[patternIndex];

    const offsets = pattern.map(point => point[1]);
    const minOffset = Math.min(...offsets);
    const maxOffset = Math.max(...offsets);

    const minBaseY = Math.max(
      minCenterY - minOffset,
      this.world.ceilingY() + radius - minOffset,
    );

    const maxBaseY = Math.min(
      maxCenterY - maxOffset,
      this.world.floorY() - radius - maxOffset,
    );

    const baseY = this.rng.range(minBaseY, maxBaseY);

    const patternWidth = pattern[pattern.length - 1][0];

    const startX = this.rng.range(
      minimumX,
      maximumX - patternWidth,
    );

    this.createCoinPattern(startX, baseY, pattern, size);
  }

  private createCoinPattern(
    startX: number,
    centerY: number,
    pattern: number[][],
    size: number,
  ): void {
    for (const [offsetX, offsetY] of pattern) {
      this.coins.push({
        id: this.nextCoinId++,
        worldX: startX + offsetX,
        centerY: centerY + offsetY,
        size,
        collected: false,
      });
    }
  }
}

function distanceToInterval(value: number, interval: [number, number]): number {
  return value < interval[0] ? interval[0] - value : value > interval[1] ? value - interval[1] : 0;
}
