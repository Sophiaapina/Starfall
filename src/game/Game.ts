/**
 * owns simulation state and the fixed step order
 * ready -> running -> paused or dead, and restart always returns to ready
 */

import type { GameplayConfig } from "../config/gameplayConfig.js";
import { Camera } from "./Camera.js";
import { findCollision } from "./Collision.js";
import { CoinSpawner } from "./CoinSpawner.js";
import { computeDifficulty, worldSpeedAt } from "./Difficulty.js";
import { Input } from "./Input.js";
import { mapPlace } from "./MapLook.js";
import { Obstacle, type EncounterTag } from "./Obstacle.js";
import { Player, PlayerState } from "./Player.js";
import { Spawner } from "./Spawner.js";
import { World } from "./World.js";

export enum GameState {
  READY = "READY",
  RUNNING = "RUNNING",
  PAUSED = "PAUSED",
  DEAD = "DEAD",
}

export type PlayerTheme = "player" | "admin";
export type ShopItem = "revive" | "shield" | "doubleCoins" | "booster";
/** power-ups picked on the start screen; a revive is offered after the crash instead */
export type LoadoutItem = Exclude<ShopItem, "revive">;
export const LOADOUT_ITEMS: readonly LoadoutItem[] = ["shield", "doubleCoins", "booster"];

export interface ShopInventory {
  revive: number;
  shield: number;
  doubleCoins: number;
  booster: number;
}

const MAX_PENDING_EVENTS = 256;
/** a hazard cleared by less than this many pixels counts as a near miss */
const NEAR_MISS_GAP = 14;
/** coins taken within this many seconds of each other extend a streak */
const COIN_STREAK_WINDOW = 0.4;

/** the body is thrown upward by at least this much on the fatal hit, px/s */
const CRASH_POP_SPEED = 260;
const CRASH_SPIN = 10;
/** fraction of downward speed kept by each bounce, and the slowest impact that still bounces */
const CRASH_RESTITUTION = 0.42;
const CRASH_BOUNCE_MIN_SPEED = 170;
const CRASH_MAX_BOUNCES = 3;
/** deceleration while sliding on the floor, px/s^2 */
const CRASH_FRICTION = 430;
/** hazards this close ahead of a revived player are cleared, px */
const REVIVE_CLEARANCE = 520;

/** the booster: seconds of burn and the scroll speed it holds, px/s */
export const BOOSTER_SECONDS = 5;
const BOOSTER_SPEED = 1500;
/** how fast the extra speed fades once the burn ends, 1/s */
const SURGE_DECAY = 4;
/** seconds nothing can hurt the player after the booster burns out, and after a shield breaks */
const BOOSTER_GRACE = 1.2;
const SHIELD_GRACE = 0.7;

const SHOP_PRICES: Record<ShopItem, number> = {
  revive: 200,
  shield: 150,
  doubleCoins: 250,
  booster: 300,
};

export interface DeathInfo {
  obstacleId: number;
  obstacleType: string;
  playerVy: number;
  worldSpeed: number;
  distance: number;
  difficulty: number;
  spawnReactionTime: number;
  /** search metadata of the obstacle that was hit; null for the weighted spawner */
  encounter: EncounterTag | null;
}

/**
 * things that happened in a fixed step, for sound and effects
 * the simulation only reports them; nothing here feeds back into a later step
 */
export type GameEvent =
  /** screen position of the coin; amount is what one coin was worth; streak counts coins taken in quick succession */
  | { type: "coin"; x: number; y: number; amount: number; streak: number }
  /** a hazard was passed with only `gap` pixels to spare; x and y are where it came closest */
  | { type: "nearMiss"; x: number; y: number; gap: number }
  /** a hazard was touched; savedBy names the power-up that absorbed it, null when the run ended */
  | { type: "hit"; obstacleType: string; savedBy: "shield" | null }
  /** a hazard was broken while nothing could hurt the player; x and y are where they met */
  | { type: "smash"; x: number; y: number; obstacleType: string }
  | { type: "powerup"; item: ShopItem; active: boolean }
  /** feet touched the floor; speed is the downward speed just before, px/s */
  | { type: "land"; speed: number }
  /** thrust started while standing on the floor */
  | { type: "takeoff" }
  /** the tumbling body hit the floor after a fatal hit; speed is the downward speed, px/s */
  | { type: "bounce"; speed: number }
  /** the body has stopped sliding and the run is over */
  | { type: "crashEnd" };

/**
 * what happens between the fatal hit and the results: the body tumbles, bounces and slides
 * to a stop while the world keeps scrolling with it, so the slide still adds distance
 */
export interface Crash {
  /** seconds since the hit */
  time: number;
  /** forward speed of the body in px/s; the camera follows at this speed */
  speed: number;
  /** body angle in radians, clockwise */
  rotation: number;
  /** radians per second while airborne */
  spin: number;
  bounces: number;
  grounded: boolean;
  /** the body has stopped */
  settled: boolean;
  /** seconds since it stopped */
  restTime: number;
}

/** debug layers controlled by F1 through F6 */
export interface DebugFlags {
  overlay: boolean;
  colliders: boolean;
  grid: boolean;
  vectors: boolean;
  trajectory: boolean;
  telemetry: boolean;
  /** encounter brackets, entry states, feasibility witness and agent traces */
  encounters: boolean;
}

export class Game {
  readonly world: World;
  readonly camera = new Camera();
  readonly player: Player;
  readonly spawner: Spawner;
  readonly coinSpawner: CoinSpawner;
  readonly input = new Input();

  private pendingEvents: GameEvent[] = [];

  /** events since the last call, oldest first */
  consumeEvents(): GameEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  private emit(event: GameEvent): void {
    // headless runs never read events, so the list must not grow without bound
    if (this.pendingEvents.length >= MAX_PENDING_EVENTS) this.pendingEvents.shift();
    this.pendingEvents.push(event);
  }

  /** closest vertical approach to each hazard currently level with the player, by obstacle id */
  private brushes = new Map<number, { gap: number; y: number }>();
  private coinStreak = 0;
  private lastCoinTime = -Infinity;

  obstacles: Obstacle[] = [];
  state: GameState = GameState.READY;
  private resumedFrom: GameState = GameState.READY;

  time = 0;
  difficulty = 0;
  worldSpeed = 0;
  deathInfo: DeathInfo | null = null;
  /** set by a fatal hit, cleared by restart and revive */
  crash: Crash | null = null;
  coinsCollected = 0;
  totalCoins = 0;
  /** highest score of any run on this browser */
  bestScore = 0;
  /** true once this run has passed the best score it started against */
  newBest = false;
  shopOpen = false;
  shopMessage = "";
  readonly shopInventory: ShopInventory;
  /** coins picked up this run before any multiplier; the score counts these, the wallet gets coinsCollected */
  coinsPicked = 0;
  coinMultiplier = 1;
  /** what the next run starts with: picked on the start screen, spent when the run begins */
  readonly loadout: Record<LoadoutItem, boolean> = { shield: false, doubleCoins: false, booster: false };
  /** seconds of booster burn left */
  boosterSeconds = 0;
  /** seconds of protection left after the booster or a broken shield */
  graceSeconds = 0;
  /** scroll speed above the difficulty curve, px/s: held by the booster, fading afterwards */
  private surge = 0;
  private shieldArmed = false;

  /** fixed steps executed in this run */
  stepCount = 0;
  /** seed of the next random run, known early so its opening can be searched before the retry */
  private nextSeed = 0;

  playerTheme: PlayerTheme = "player";

  debug: DebugFlags = {
    overlay: true,
    colliders: true,
    grid: false,
    vectors: true,
    trajectory: false,
    telemetry: false,
    encounters: true,
  };

  constructor(readonly cfg: GameplayConfig) {
    this.world = new World(cfg);
    this.player = new Player(cfg, this.world);
    this.spawner = new Spawner(cfg, this.world);
    this.coinSpawner = new CoinSpawner(cfg, this.world);
    this.totalCoins = this.loadTotalCoins();
    this.bestScore = this.loadBestScore();
    this.shopInventory = this.loadShopInventory();
    this.restart(cfg.seed);
    // the first death already has a different planet waiting; the results screen can search its opening
    this.nextSeed = differentPlaceSeed(cfg.seed);
  }

  /** reset all run state with the given seed */
  restart(seed: number = this.cfg.seed): void {
    this.saveBestScore(); // a run left from the pause menu still counts
    this.newBest = false;
    this.pendingEvents = [];
    this.brushes.clear();
    this.coinStreak = 0;
    this.lastCoinTime = -Infinity;
    this.cfg.seed = seed;
    this.camera.x = 0;
    this.time = 0;
    this.difficulty = 0;
    this.worldSpeed = this.cfg.worldStartSpeed;
    this.obstacles = [];
    this.deathInfo = null;
    this.crash = null;
    this.coinsCollected = 0;
    this.coinsPicked = 0;
    this.shopOpen = false;
    this.shopMessage = "";
    this.coinMultiplier = 1;
    this.boosterSeconds = 0;
    this.graceSeconds = 0;
    this.surge = 0;
    this.shieldArmed = false;
    this.stepCount = 0;
    this.player.reset();
    this.input.reset();
    this.spawner.reset(seed);
    this.coinSpawner.reset(seed);
    this.state = GameState.READY;
  }

  /** a new seed and a new map: the next planet is a different one from the run just left */
  restartWithRandomSeed(): number {
    const seed = this.nextSeed;
    this.nextSeed = differentPlaceSeed(seed);
    this.restart(seed);
    return seed;
  }

  start(): void {
    if (this.state === GameState.READY && !this.shopOpen) this.beginRun();
  }

  /** the run begins: everything picked on the start screen is spent and takes effect */
  private beginRun(): void {
    this.state = GameState.RUNNING;
    let spent = false;
    for (const item of LOADOUT_ITEMS) {
      if (!this.loadout[item]) continue;
      this.loadout[item] = false;
      if (this.shopInventory[item] < 1) continue;
      this.shopInventory[item]--;
      spent = true;
      if (item === "shield") {
        this.shieldArmed = true;
      } else if (item === "doubleCoins") {
        this.coinMultiplier = 2;
      } else {
        this.boosterSeconds = BOOSTER_SECONDS;
        this.emit({ type: "powerup", item, active: true });
      }
    }
    if (spent) this.saveShopInventory();
  }

  /** pick or drop a power-up for the next run; only an owned one can be picked, and only before the run */
  toggleLoadout(item: LoadoutItem): boolean {
    if (this.state !== GameState.READY) return false;
    if (!this.loadout[item] && this.shopInventory[item] < 1) return false;
    this.loadout[item] = !this.loadout[item];
    return true;
  }

  /** distance in tens of pixels plus 100 per coin picked up; a coin multiplier pays the wallet, not the score */
  get score(): number {
    return Math.max(0, Math.floor(this.camera.x / 10)) + this.coinsPicked * 100;
  }

  /** nothing can hurt the player: the booster is burning or its protection has not run out */
  get invulnerable(): boolean {
    return this.boosterSeconds > 0 || this.graceSeconds > 0;
  }

  purchaseShopItem(item: ShopItem): boolean {
    const price = SHOP_PRICES[item];
    if (this.totalCoins < price) {
      this.shopMessage = "NOT ENOUGH COINS";
      return false;
    }

    this.totalCoins -= price;
    this.shopInventory[item]++;
    this.shopMessage = "PURCHASE COMPLETE";
    this.saveTotalCoins();
    this.saveShopInventory();
    return true;
  }

  reviveFromGameOver(): boolean {
    const fatalObstacleId = this.deathInfo?.obstacleId;
    if (this.state !== GameState.DEAD || fatalObstacleId === undefined || this.shopInventory.revive < 1) {
      return false;
    }

    this.shopInventory.revive--;
    // the slide carried the player past the hazard that was hit, so clear the stretch ahead instead
    const safeX = this.camera.x + this.cfg.playerScreenX + REVIVE_CLEARANCE;
    this.obstacles = this.obstacles.filter((obstacle) => obstacle.worldX > safeX);
    this.crash = null;
    this.brushes.clear();
    this.player.y = (this.world.ceilingY() + this.world.floorY() - this.cfg.playerHeight) / 2;
    this.player.vy = 0;
    this.player.ay = 0;
    this.player.thrusting = false;
    this.input.release();
    this.deathInfo = null;
    this.state = GameState.RUNNING;
    this.saveShopInventory();
    return true;
  }

  isPowerupActive(item: ShopItem): boolean {
    switch (item) {
      case "revive": return false;
      case "shield": return this.shieldArmed;
      case "doubleCoins": return this.coinMultiplier === 2;
      case "booster": return this.boosterSeconds > 0;
    }
  }

  setPlayerTheme(theme: PlayerTheme): void {
    this.playerTheme = theme;
  }

  togglePause(): void {
    if (this.state === GameState.PAUSED) {
      this.state = this.resumedFrom;
    } else if (this.state === GameState.RUNNING || this.state === GameState.READY) {
      this.resumedFrom = this.state;
      this.state = GameState.PAUSED;
    }
  }

  /** pause if needed and advance one fixed step */
  stepOnce(): void {
    if (this.state === GameState.RUNNING) {
      this.resumedFrom = GameState.RUNNING;
      this.state = GameState.PAUSED;
    }
    if (this.state === GameState.PAUSED) this.simulate(this.cfg.fixedDt);
  }

  /** encounter search between frames; main passes a wall-clock budget, verification passes Infinity */
  backgroundWork(maxMs: number): void {
    // after a crash the simulation is nearly idle, so the next run's opening gets a double share
    if (this.state === GameState.DEAD) this.spawner.backgroundWork(maxMs * 2, true);
    else this.spawner.backgroundWork(maxMs);
  }

  /** normal fixed step entry used by main */
  step(dt: number): void {
    if (this.state === GameState.DEAD) {
      this.simulateCrash(dt);
      return;
    }
    if (this.state !== GameState.RUNNING && this.state !== GameState.READY) return;
    this.simulate(dt);
  }

  /** jump to the end of the crash; the distance and coins of the skipped slide still count */
  skipCrash(): void {
    for (let i = 0; i < 1200 && this.crash && !this.crash.settled; i++) this.simulateCrash(this.cfg.fixedDt);
  }

  private simulateCrash(dt: number): void {
    const crash = this.crash;
    if (!crash) return;
    if (crash.settled) {
      crash.restTime += dt;
      return;
    }
    const p = this.player;
    if (crash.time === 0) {
      // the hit step itself leaves the player state as the collision found it; the throw starts here
      p.thrusting = false;
      p.vy = Math.min(p.vy, 0) - CRASH_POP_SPEED;
    }
    crash.time += dt;
    this.time += dt;

    const top = this.world.ceilingY();
    const bottom = this.world.floorY() - this.cfg.playerHeight;
    p.vy = Math.min(p.vy + this.cfg.gravity * dt, this.cfg.maxFallSpeed);
    p.y += p.vy * dt;
    if (p.y < top) {
      p.y = top;
      if (p.vy < 0) p.vy = 0;
    }
    crash.grounded = false;
    if (p.y >= bottom) {
      p.y = bottom;
      if (p.vy > CRASH_BOUNCE_MIN_SPEED && crash.bounces < CRASH_MAX_BOUNCES) {
        this.emit({ type: "bounce", speed: p.vy });
        p.vy = -p.vy * CRASH_RESTITUTION;
        crash.bounces++;
        crash.speed *= 0.8;
        crash.spin *= 0.7;
      } else {
        p.vy = 0;
        crash.grounded = true;
      }
    }

    if (crash.grounded) {
      crash.speed = Math.max(0, crash.speed - CRASH_FRICTION * dt);
      // come to rest lying flat, whichever way round is nearer
      const flat = Math.round((crash.rotation - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
      crash.rotation += (flat - crash.rotation) * Math.min(1, dt * 14);
    } else {
      crash.speed *= Math.exp(-0.3 * dt);
      crash.rotation += crash.spin * dt;
    }
    this.camera.x += crash.speed * dt;
    this.collectCoins();

    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      this.newBest = true;
    }
    if (crash.grounded && crash.speed <= 0) {
      crash.settled = true;
      this.saveBestScore();
      this.emit({ type: "crashEnd" });
    }
  }

  private collectCoins(): void {
    const pickups = this.coinSpawner.collectWithPositions(this.player.rect(), this.camera.x);
    if (pickups.length === 0) return;
    const earned = pickups.length * this.coinMultiplier;
    this.coinsPicked += pickups.length;
    this.coinsCollected += earned;
    this.totalCoins += earned;
    this.saveTotalCoins();
    for (const pickup of pickups) {
      this.coinStreak = this.time - this.lastCoinTime <= COIN_STREAK_WINDOW ? this.coinStreak + 1 : 1;
      this.lastCoinTime = this.time;
      this.emit({ type: "coin", x: pickup.x, y: pickup.y, amount: this.coinMultiplier, streak: this.coinStreak });
    }
  }

  private simulate(dt: number): void {
    if (this.state === GameState.READY && this.shopOpen) {
      this.input.release();
      return;
    }

    // 1 input
    this.input.update(dt);
    const thrustHeld = this.input.isDown;

    // ready keeps the world still until the first held input
    if (this.state === GameState.READY) {
      if (!thrustHeld) return;
      this.beginRun();
    }

    // 2 difficulty and world speed
    this.difficulty = computeDifficulty(this.camera.x, this.cfg);
    const cruise = worldSpeedAt(this.difficulty, this.cfg);
    if (this.boosterSeconds > 0) {
      this.surge = Math.max(0, BOOSTER_SPEED - cruise);
      this.boosterSeconds = Math.max(0, this.boosterSeconds - dt);
      if (this.boosterSeconds === 0) {
        this.graceSeconds = BOOSTER_GRACE;
        this.emit({ type: "powerup", item: "booster", active: false });
      }
    } else {
      // the burst eases back to cruising speed, and the protection outlasts most of it
      this.surge = this.surge > 1 ? this.surge * Math.exp(-SURGE_DECAY * dt) : 0;
      this.graceSeconds = Math.max(0, this.graceSeconds - dt);
    }
    this.worldSpeed = cruise + this.surge;

    // 3 player physics
    const stateBefore = this.player.state;
    const vyBefore = this.player.vy;
    this.player.update(dt, thrustHeld);
    if (this.player.state !== stateBefore) {
      if (this.player.state === PlayerState.FLOOR_CONTACT) {
        this.emit({ type: "land", speed: vyBefore });
      } else if (stateBefore === PlayerState.FLOOR_CONTACT && thrustHeld) {
        this.emit({ type: "takeoff" });
      }
    }

    // 4 world scroll
    this.camera.x += this.worldSpeed * dt;
    this.time += dt;

    // 5 spawn and cleanup
    this.spawner.update(this.camera.x, this.player.y, this.player.vy, this.worldSpeed, this.obstacles);
    this.coinSpawner.update(this.obstacles, this.camera.x, this.player.y);
    this.collectCoins();

    if (this.obstacles.length > 0 && this.obstacles[0].isGone(this.camera.x)) {
      // obstacles are ordered by world x, so only the first one can expire
      this.obstacles.shift();
    }

    // 6 hazard collision and state update
    const hit = findCollision(this.player.rect(), this.obstacles, this.camera.x, this.time);
    if (hit) {
      if (this.invulnerable) {
        // the booster goes straight through: the hazard breaks and the run carries on
        const body = this.player.rect();
        this.obstacles = this.obstacles.filter((obstacle) => obstacle.id !== hit.obstacle.id);
        this.emit({
          type: "smash",
          x: (Math.max(body.x, hit.rect.x) + Math.min(body.x + body.w, hit.rect.x + hit.rect.w)) / 2,
          y: (Math.max(body.y, hit.rect.y) + Math.min(body.y + body.h, hit.rect.y + hit.rect.h)) / 2,
          obstacleType: hit.obstacle.type,
        });
      } else if (this.shieldArmed) {
        this.shieldArmed = false;
        this.graceSeconds = SHIELD_GRACE;
        this.obstacles = this.obstacles.filter((obstacle) => obstacle.id !== hit.obstacle.id);
        this.emit({ type: "hit", obstacleType: hit.obstacle.type, savedBy: "shield" });
      } else {
        this.emit({ type: "hit", obstacleType: hit.obstacle.type, savedBy: null });
        this.state = GameState.DEAD;
        this.spawner.prepare(this.nextSeed);
        this.crash = {
          time: 0, speed: this.worldSpeed, rotation: 0, spin: CRASH_SPIN,
          bounces: 0, grounded: false, settled: false, restTime: 0,
        };
        this.deathInfo = {
          obstacleId: hit.obstacle.id,
          obstacleType: hit.obstacle.type,
          playerVy: this.player.vy,
          worldSpeed: this.worldSpeed,
          distance: this.camera.x,
          difficulty: this.difficulty,
          spawnReactionTime: hit.obstacle.spawnReactionTime,
          encounter: hit.obstacle.encounter,
        };
      }
    }

    if (this.invulnerable) this.brushes.clear(); // no close calls while nothing can hurt
    else if (!hit) this.trackNearMisses();

    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      this.newBest = true;
    }
    this.stepCount++;
  }

  /**
   * reports a hazard once it is behind the player if it was cleared by a small margin
   * feedback only: nothing in the run depends on it
   */
  private trackNearMisses(): void {
    const player = this.player.rect();
    const level = new Set<number>();
    for (const obs of this.obstacles) {
      const sx = obs.worldX - this.camera.x;
      if (sx > player.x + player.w) break; // ordered by world x, so nothing further is level yet
      if (sx + obs.width < player.x) continue;
      level.add(obs.id);
      for (const rect of obs.getRects(this.camera.x, this.time)) {
        if (rect.x + rect.w < player.x || rect.x > player.x + player.w) continue;
        const below = rect.y - (player.y + player.h);
        const above = player.y - (rect.y + rect.h);
        const gap = Math.max(below, above);
        const known = this.brushes.get(obs.id);
        if (gap >= 0 && (!known || gap < known.gap)) {
          this.brushes.set(obs.id, { gap, y: below >= above ? player.y + player.h : player.y });
        }
      }
    }
    for (const [id, brush] of this.brushes) {
      if (level.has(id)) continue;
      this.brushes.delete(id);
      if (brush.gap < NEAR_MISS_GAP) {
        this.emit({ type: "nearMiss", x: player.x + player.w / 2, y: brush.y, gap: brush.gap });
      }
    }
  }

  private loadBestScore(): number {
    try {
      const saved = Number(localStorage.getItem("starfall-best-score"));
      return Number.isFinite(saved) && saved >= 0 ? saved : 0;
    } catch {
      return 0;
    }
  }

  private saveBestScore(): void {
    try {
      localStorage.setItem("starfall-best-score", String(this.bestScore));
    } catch {
      // the best score still holds for this session if browser storage is unavailable
    }
  }

  private loadTotalCoins(): number {
    try {
      const saved = Number(localStorage.getItem("starfall-total-coins"));
      return Number.isSafeInteger(saved) && saved >= 0 ? saved : 0;
    } catch {
      return 0;
    }
  }

  private saveTotalCoins(): void {
    try {
      localStorage.setItem("starfall-total-coins", String(this.totalCoins));
    } catch {
      // The run still counts coins if browser storage is unavailable.
    }
  }

  private loadShopInventory(): ShopInventory {
    const empty = { revive: 0, shield: 0, doubleCoins: 0, booster: 0 };
    try {
      const saved = JSON.parse(localStorage.getItem("starfall-shop-inventory") ?? "null") as Partial<ShopInventory> | null;
      if (!saved) return empty;
      return {
        revive: validItemCount(saved.revive),
        shield: validItemCount(saved.shield),
        doubleCoins: validItemCount(saved.doubleCoins),
        booster: validItemCount(saved.booster),
      };
    } catch {
      return empty;
    }
  }

  private saveShopInventory(): void {
    try {
      localStorage.setItem("starfall-shop-inventory", JSON.stringify(this.shopInventory));
    } catch {
      // Purchased effects remain available for the current session.
    }
  }

}

/** Math.random only picks a seed and never builds obstacle geometry or the map */
function randomSeed(): number {
  return (Math.random() * 0x7fffffff) | 0;
}

/** a seed whose planet is not `avoid`'s, so a death does not drop the player back on the same map */
function differentPlaceSeed(avoid: number): number {
  const place = mapPlace(avoid);
  let seed = randomSeed();
  for (let i = 0; i < 24 && mapPlace(seed) === place; i++) seed = randomSeed();
  return seed;
}

function validItemCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
