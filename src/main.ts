/**
 * browser entry point for input, fixed step timing, rendering, and the panel
 * gameplay code stays outside this file so it can run in Node verification
 */

import { defaultConfig } from "./config/gameplayConfig.js";
import { Game, GameState, LOADOUT_ITEMS, type GameEvent, type ShopItem } from "./game/Game.js";
import { DebugPanel, type LoopControl } from "./debug/DebugPanel.js";
import { DebugRenderer } from "./debug/DebugRenderer.js";
import { Telemetry } from "./debug/Telemetry.js";
import { AudioEngine, type AudioScene } from "./audio/AudioEngine.js";
import { GameRenderer } from "./render/GameRenderer.js";
import { RESULTS_INPUT_AT } from "./render/Menus.js";
import {
  PLAYER_MUSIC_BUTTON_BOUNDS,
  PLAYER_SOUND_BUTTON_BOUNDS,
  PLAYER_DEAD_REVIVE_BOUNDS,
  PLAYER_LOADOUT_BOUNDS,
  PLAYER_PAUSE_BUTTON_BOUNDS,
  PLAYER_PAUSE_RESTART_BOUNDS,
  PLAYER_PAUSE_TOGGLE_BOUNDS,
  PLAYER_RESTART_BUTTON_BOUNDS,
  PLAYER_RESULTS_MENU_BOUNDS,
  PLAYER_SHOP_BACK_BOUNDS,
  PLAYER_SHOP_BUY_BOUNDS,
  PLAYER_SHOP_MENU_BOUNDS,
  PLAYER_START_BUTTON_BOUNDS,
  inside,
} from "./render/layout.js";
import { fitCanvas } from "./viewport.js";

// drawing always uses 960x600 logical pixels; fitCanvas below sizes the backing store
const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

const cfg = defaultConfig();
const game = new Game(cfg);
const audio = new AudioEngine();
game.setPlayerTheme("player");
game.restart(cfg.seed);
const telemetry = new Telemetry();
const view = new GameRenderer(game, () => audio.isMusicEnabled(), () => audio.isSoundEnabled());
const lab = new DebugRenderer(game, telemetry);
view.onCue = (cue) => {
  if (cue === "newBest") {
    audio.play("sting");
    audio.duck(0.45, 1.6);
  }
};

const loop: LoopControl = { timeScale: 1 };
const panelRoot = document.getElementById("panel") as HTMLElement;
const panel = new DebugPanel(panelRoot, game, loop);

// Vite removes this branch and its dynamic import from production builds.
// Candidate inspection is deliberately a development-only experiment.
if (import.meta.env.DEV) {
  void import("./debug/CandidateLab.js").then(({ mountCandidateLab }) => {
    mountCandidateLab(cfg, panelRoot, () => {
      game.input.release();
      if (game.state === GameState.RUNNING) game.togglePause();
    });
  });
}

// development builds expose the live objects to the browser console for inspection and scripted checks
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).starfall = { game, view, audio, loop };
}

// all browser input writes to the same one button state

/** a crash can be skipped only after this long, so the thrust still held at impact does not skip it */
const CRASH_SKIP_AT = 0.25;

/** straight into a new run; the start screen is one more press away with Escape */
function retry(): void {
  audio.play("click");
  game.restartWithRandomSeed();
  game.start();
  telemetry.clear();
  panel.refreshInputs();
}

function backToMenu(): void {
  audio.play("click");
  game.restartWithRandomSeed();
  telemetry.clear();
  panel.refreshInputs();
}

/** one fresh press while dead: skip the tumble first, then retry; false if it was too early to count */
function pressWhileDead(): boolean {
  const crash = game.crash;
  if (!crash) return false;
  if (!crash.settled) {
    if (crash.time >= CRASH_SKIP_AT) game.skipCrash();
    return true;
  }
  if (crash.restTime < RESULTS_INPUT_AT) return true;
  retry();
  return true;
}

/** start screen only: pick or drop one of the power-ups for the next run */
function toggleLoadout(index: number): void {
  if (game.playerTheme !== "player" || game.state !== GameState.READY || game.shopOpen) return;
  if (game.toggleLoadout(LOADOUT_ITEMS[index])) audio.play("click");
}

function isTypingTarget(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
}

window.addEventListener("keydown", (e) => {
  if (import.meta.env.DEV && document.querySelector("#candidate-lab[open]")) return;
  if (isTypingTarget(e)) return;

  audio.unlock();

  switch (e.code) {
    case "Space":
      e.preventDefault(); // space controls thrust instead of page scroll
      if (game.playerTheme === "player" && game.state === GameState.DEAD) {
        if (!e.repeat) pressWhileDead();
        break;
      }
      if (game.playerTheme === "player" && game.state === GameState.READY) game.start();
      game.input.press();
      break;
    case "Enter":
      if (game.playerTheme !== "player" || e.repeat) break;
      if (game.state === GameState.DEAD) pressWhileDead();
      else if (game.state === GameState.READY && !game.shopOpen) game.start();
      break;
    case "Escape":
      if (game.shopOpen) {
        game.shopOpen = false;
        game.shopMessage = "";
      } else if (game.playerTheme === "player" && game.state === GameState.DEAD && game.crash?.settled) {
        backToMenu();
      }
      break;
    case "Digit1":
    case "Digit2":
    case "Digit3":
      toggleLoadout(Number(e.code.slice(-1)) - 1);
      break;
    case "KeyP":
      game.togglePause();
      break;
    case "Period":
      game.stepOnce();
      break;
    case "KeyR":
      game.restart(game.cfg.seed);
      telemetry.clear();
      panel.refreshInputs();
      break;
    case "F1":
      e.preventDefault();
      game.debug.overlay = !game.debug.overlay;
      break;
    case "F2":
      e.preventDefault();
      game.debug.colliders = !game.debug.colliders;
      break;
    case "F3":
      e.preventDefault();
      game.debug.vectors = !game.debug.vectors;
      break;
    case "F4":
      e.preventDefault();
      game.debug.trajectory = !game.debug.trajectory;
      break;
    case "F5":
      e.preventDefault(); // F5 belongs to telemetry in this lab
      game.debug.telemetry = !game.debug.telemetry;
      break;
    case "F6":
      e.preventDefault();
      game.debug.encounters = !game.debug.encounters;
      break;
    case "F7":
      e.preventDefault();
      game.debug.grid = !game.debug.grid;
      break;
    case "F9":
      // the tuning lab is a developer view, so it has a key and no button on the player's screen
      e.preventDefault();
      game.setPlayerTheme(game.playerTheme === "player" ? "admin" : "player");
      panel.refreshInputs();
      break;
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") game.input.release();
});

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  audio.unlock();

  if (game.playerTheme === "player") {
    // button bounds are logical pixels, whatever size the canvas is on screen
    const { x: canvasX, y: canvasY } = viewport.toLogical(e.clientX, e.clientY);

    // El boton de musica funciona en todos los estados.
    if (inside(canvasX, canvasY, PLAYER_MUSIC_BUTTON_BOUNDS)) {
      audio.toggleMusic();
      return;
    }

    if (inside(canvasX, canvasY, PLAYER_SOUND_BUTTON_BOUNDS)) {
      audio.toggleSound();
      return;
    }

    if (game.state === GameState.READY) {
      if (game.shopOpen) {
        if (inside(canvasX, canvasY, PLAYER_SHOP_BACK_BOUNDS)) {
          audio.play("click");
          game.shopOpen = false;
          game.shopMessage = "";
          return;
        }
        const itemByButton: ShopItem[] = ["revive", "shield", "doubleCoins", "booster"];
        PLAYER_SHOP_BUY_BOUNDS.forEach((bounds, index) => {
          if (inside(canvasX, canvasY, bounds)) {
            audio.play("click");
            game.purchaseShopItem(itemByButton[index]);
          }
        });
        return;
      }

      if (inside(canvasX, canvasY, PLAYER_SHOP_MENU_BOUNDS)) {
        audio.play("click");
        game.shopOpen = true;
        game.shopMessage = "";
        return;
      }
      const slot = PLAYER_LOADOUT_BOUNDS.findIndex((bounds) => inside(canvasX, canvasY, bounds));
      if (slot >= 0) {
        toggleLoadout(slot);
        return;
      }
      const button = PLAYER_START_BUTTON_BOUNDS;
      if (inside(canvasX, canvasY, button)) {
        audio.play("click");
        game.start();
      }
      return;
    }

    if (game.state === GameState.DEAD) {
      const crash = game.crash;
      if (!crash?.settled) {
        pressWhileDead(); // a click during the tumble skips to the results
        return;
      }
      if (crash.restTime < RESULTS_INPUT_AT) return;
      if (game.shopInventory.revive > 0 && inside(canvasX, canvasY, PLAYER_DEAD_REVIVE_BOUNDS)) {
        audio.play("click");
        game.reviveFromGameOver();
        telemetry.clear();
      } else if (inside(canvasX, canvasY, PLAYER_RESTART_BUTTON_BOUNDS)) {
        retry();
      } else if (inside(canvasX, canvasY, PLAYER_RESULTS_MENU_BOUNDS)) {
        backToMenu();
      }
      return;
    }

    if (game.state === GameState.PAUSED) {
      if (inside(canvasX, canvasY, PLAYER_PAUSE_TOGGLE_BOUNDS)) {
        audio.play("click");
        game.togglePause();
        game.input.release();
        return;
      }
      if (inside(canvasX, canvasY, PLAYER_PAUSE_RESTART_BOUNDS)) {
        audio.play("click");
        game.restartWithRandomSeed();
        telemetry.clear();
        panel.refreshInputs();
      }
      return;
    }

    if (inside(canvasX, canvasY, PLAYER_PAUSE_BUTTON_BOUNDS)) {
      audio.play("click");
      game.togglePause();
      game.input.release();
      return;
    }
  }

  canvas.setPointerCapture(e.pointerId);
  game.input.press();
});
canvas.addEventListener("pointerup", () => game.input.release());
canvas.addEventListener("pointercancel", () => game.input.release());

// the bars around the game are part of the play surface during a run, so a
// resting thumb or a click beside the canvas still thrusts. menus stay canvas-only
const app = document.getElementById("app") as HTMLElement;
app.addEventListener("pointerdown", (e) => {
  if (e.target === canvas) return; // the canvas handler above owns its presses and buttons
  if (game.playerTheme !== "player" || game.state !== GameState.RUNNING) return;
  e.preventDefault();
  audio.unlock();
  game.input.press();
  app.setPointerCapture(e.pointerId); // keeps the release even if the pointer leaves the window
});
app.addEventListener("pointerup", () => game.input.release());
app.addEventListener("pointercancel", () => game.input.release());

/** one simulation event becomes sound here and effects in the renderer */
function dispatch(event: GameEvent): void {
  view.handle(event);
  switch (event.type) {
    case "coin":
      audio.coin(event.streak);
      break;
    case "nearMiss":
      audio.play("whoosh", { spread: 0.08 });
      break;
    case "land":
      audio.play("thud", { volume: Math.min(1, Math.max(0.2, event.speed / 800)), spread: 0.05 });
      break;
    case "bounce":
      audio.play("thud", { volume: Math.min(1, Math.max(0.3, event.speed / 600)), rate: 0.8, spread: 0.05 });
      break;
    case "smash":
      audio.play("zap", { volume: 0.7, spread: 0.12 });
      break;
    case "hit":
      if (event.savedBy) {
        audio.play("zap");
        audio.duck(0.4, 0.5);
        hitStop = 0.06;
      } else {
        audio.play("collision");
        audio.play("fail");
        hitStop = 0.11;
        deathSlow = DEATH_SLOW_SECONDS;
      }
      break;
    case "powerup":
      if (event.active) audio.play("powerup");
      break;
  }
}

const AUDIO_SCENES: Record<GameState, AudioScene> = {
  [GameState.READY]: "menu",
  [GameState.RUNNING]: "run",
  [GameState.PAUSED]: "paused",
  [GameState.DEAD]: "dead",
};

function draw(): void {
  view.beginWorld(ctx);
  const labView = game.playerTheme === "admin";
  if (labView) lab.drawBehindWorld(ctx);
  view.finishWorld(ctx);
  if (labView) lab.drawOverlays(ctx, { fps, frameDt });
  else view.drawInterface(ctx);
}

// rendering uses frame time while simulation only receives fixed dt

let last = performance.now();
let acc = 0;
let fps = 60;
let frameDt = 1 / 60;
/** seconds the simulation still holds still after an impact, so the hit can be read */
let hitStop = 0;
/** seconds of slow motion left after a fatal hit; time eases back to full speed over this */
let deathSlow = 0;
const DEATH_SLOW_SECONDS = 0.5;

// the cap drops old time when the machine cannot catch up
const MAX_STEPS_PER_FRAME = 480;

function frame(now: number): void {
  const rawDt = Math.min((now - last) / 1000, 0.25); // do not replay a long tab switch
  last = now;
  frameDt = rawDt;
  if (rawDt > 0) fps = fps * 0.92 + (1 / rawDt) * 0.08; // smooth display only

  let scaledDt = rawDt * loop.timeScale;
  if (hitStop > 0) {
    hitStop -= rawDt;
  } else {
    if (deathSlow > 0) {
      scaledDt *= 1 - 0.65 * (deathSlow / DEATH_SLOW_SECONDS);
      deathSlow -= rawDt;
    }
    acc += scaledDt;
  }

  const dt = cfg.fixedDt;
  let steps = 0;
  while (acc >= dt && steps < MAX_STEPS_PER_FRAME && hitStop <= 0) {
    const wasRunning = game.state === GameState.RUNNING || game.state === GameState.READY;
    game.step(dt);
    for (const event of game.consumeEvents()) dispatch(event);

    if (wasRunning && game.state === GameState.RUNNING) telemetry.sample(game);
    acc -= dt;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) acc = 0;
  // events raised outside a step, such as the booster firing when a run starts from a click
  for (const event of game.consumeEvents()) dispatch(event);

  // encounter search runs between frames with a wall-clock budget; it changes
  // when a result is ready, never which encounter is chosen
  game.backgroundWork(cfg.searchFrameBudgetMs);

  audio.update(
    {
      scene: AUDIO_SCENES[game.state],
      thrust: game.player.thrusting,
      booster: game.isPowerupActive("booster"),
      intensity: game.difficulty,
      vy: game.player.vy,
      settled: game.crash?.settled ?? false,
    },
    rawDt,
  );

  // effects and animation run on frame time and hold still with the pause menu
  view.update(game.state === GameState.PAUSED ? 0 : scaledDt);
  draw();
  requestAnimationFrame(frame);
}

// the fit redraws at once after a resize, so it starts after the frame stats exist
const viewport = fitCanvas(canvas, ctx, draw);

requestAnimationFrame(frame);

// status text does not need the render rate
setInterval(() => panel.tick(), 200);
panel.tick();
