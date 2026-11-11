/**
 * browser entry point for input, fixed step timing, rendering, and the panel
 * gameplay code stays outside this file so it can run in Node verification
 */

import { CANVAS_HEIGHT, CANVAS_WIDTH, defaultConfig } from "./config/gameplayConfig.js";
import { Game, GameState, type ShopItem } from "./game/Game.js";
import { DebugPanel, type LoopControl } from "./debug/DebugPanel.js";
import {
  DebugRenderer,
  PLAYER_ADMIN_BUTTON_BOUNDS,
  PLAYER_MUSIC_BUTTON_BOUNDS,
  PLAYER_SOUND_BUTTON_BOUNDS,
  PLAYER_DEAD_REVIVE_BOUNDS,
  PLAYER_PAUSE_BUTTON_BOUNDS,
  PLAYER_PAUSE_RESTART_BOUNDS,
  PLAYER_PAUSE_TOGGLE_BOUNDS,
  PLAYER_POWERUP_BUTTON_BOUNDS,
  PLAYER_RESTART_BUTTON_BOUNDS,
  PLAYER_SHOP_BACK_BOUNDS,
  PLAYER_SHOP_BUY_BOUNDS,
  PLAYER_SHOP_MENU_BOUNDS,
  PLAYER_START_BUTTON_BOUNDS,
} from "./debug/DebugRenderer.js";
import { Telemetry } from "./debug/Telemetry.js";
import { AudioManager } from "./game/AudioManager.js";

const canvas = document.getElementById("game") as HTMLCanvasElement;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
const ctx = canvas.getContext("2d")!;

const cfg = defaultConfig();
const game = new Game(cfg);
const audio = new AudioManager();
game.setPlayerTheme("player");
game.restart(cfg.seed);
const telemetry = new Telemetry();
const renderer = new DebugRenderer(
  game,
  telemetry,
  () => audio.isMusicEnabled(),
  () => audio.isSoundEnabled(),
);

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

// all browser input writes to the same one button state

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
      if (game.playerTheme === "player" && game.state === GameState.READY) game.start();
      game.input.press();
      break;
    case "Enter":
      if (game.playerTheme === "player" && game.state === GameState.READY && !game.shopOpen) game.start();
      break;
    case "Escape":
      if (game.shopOpen) {
        game.shopOpen = false;
        game.shopMessage = "";
      }
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
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") game.input.release();
});

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  audio.unlock();
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (game.playerTheme === "player") {
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = x * scaleX;
    const canvasY = y * scaleY;

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
      const button = PLAYER_START_BUTTON_BOUNDS;
      if (inside(canvasX, canvasY, button)) {
        audio.play("click");
        game.start();
      }
      return;
    }

    if (game.state === GameState.DEAD) {
      if (game.shopInventory.revive > 0 && inside(canvasX, canvasY, PLAYER_DEAD_REVIVE_BOUNDS)) {
        audio.play("click");
        game.reviveFromGameOver();
        telemetry.clear();
        return;
      }
      const button = PLAYER_RESTART_BUTTON_BOUNDS;
      if (inside(canvasX, canvasY, button)) {
        audio.play("click");
        game.restartWithRandomSeed();
        telemetry.clear();
        panel.refreshInputs();
      }
      return;
    }

    if (game.state === GameState.RUNNING) {
      const powerupIndex = PLAYER_POWERUP_BUTTON_BOUNDS.findIndex((bounds) => inside(canvasX, canvasY, bounds));
      if (powerupIndex >= 0) {
        audio.play("click");
        game.activatePowerup(( ["revive", "shield", "doubleCoins", "booster"] as ShopItem[])[powerupIndex]);
        game.input.release();
        return;
      }
    }

    if (game.state === GameState.PAUSED) {
      const toggle = PLAYER_PAUSE_TOGGLE_BOUNDS;
      if (canvasX >= toggle.x && canvasX <= toggle.x + toggle.w && canvasY >= toggle.y && canvasY <= toggle.y + toggle.h) {
        audio.play("click");
        game.togglePause();
        game.input.release();
        return;
      }
      const restart = PLAYER_PAUSE_RESTART_BOUNDS;
      if (canvasX >= restart.x && canvasX <= restart.x + restart.w && canvasY >= restart.y && canvasY <= restart.y + restart.h) {
        audio.play("click");
        game.restartWithRandomSeed();
        telemetry.clear();
        panel.refreshInputs();
      }
      return;
    }

    const pauseButton = PLAYER_PAUSE_BUTTON_BOUNDS;
    if (canvasX >= pauseButton.x && canvasX <= pauseButton.x + pauseButton.w && canvasY >= pauseButton.y && canvasY <= pauseButton.y + pauseButton.h) {
      audio.play("click");
      game.togglePause();
      game.input.release();
      return;
    }

    const adminButton = PLAYER_ADMIN_BUTTON_BOUNDS;
    if (canvasX >= adminButton.x && canvasX <= adminButton.x + adminButton.w && canvasY >= adminButton.y && canvasY <= adminButton.y + adminButton.h) {
      audio.play("click");
      game.setPlayerTheme("admin");
      panel.refreshInputs();
      return;
    }
  }

  canvas.setPointerCapture(e.pointerId);
  game.input.press();
});
canvas.addEventListener("pointerup", () => game.input.release());
canvas.addEventListener("pointercancel", () => game.input.release());

function inside(x: number, y: number, bounds: { x: number; y: number; w: number; h: number }): boolean {
  return x >= bounds.x && x <= bounds.x + bounds.w && y >= bounds.y && y <= bounds.y + bounds.h;
}

// rendering uses frame time while simulation only receives fixed dt

let last = performance.now();
let acc = 0;
let fps = 60;
let frameDt = 1 / 60;

// the cap drops old time when the machine cannot catch up
const MAX_STEPS_PER_FRAME = 480;

function frame(now: number): void {
  const rawDt = Math.min((now - last) / 1000, 0.25); // do not replay a long tab switch
  last = now;
  frameDt = rawDt;
  if (rawDt > 0) fps = fps * 0.92 + (1 / rawDt) * 0.08; // smooth display only

  acc += rawDt * loop.timeScale;

  const dt = cfg.fixedDt;
  let steps = 0;
  while (acc >= dt && steps < MAX_STEPS_PER_FRAME) {
    const wasRunning = game.state === GameState.RUNNING || game.state === GameState.READY;
    game.step(dt);

    for (const event of game.consumeAudioEvents()) {
      audio.play(event);
    }

    if (wasRunning && game.state === GameState.RUNNING) telemetry.sample(game);
    acc -= dt;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) acc = 0;

  // encounter search runs between frames with a wall-clock budget; it changes
  // when a result is ready, never which encounter is chosen
  game.backgroundWork(cfg.searchFrameBudgetMs);

  audio.updateBooster(game.isPowerupActive("booster"), rawDt);

  renderer.render(ctx, { fps, frameDt });
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// status text does not need the render rate
setInterval(() => panel.tick(), 200);
panel.tick();
