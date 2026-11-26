/** full-screen states of the player view: start screen, shop, pause and the end of a run */

import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../config/gameplayConfig.js";
import { LOADOUT_ITEMS, type Game, type LoadoutItem } from "../game/Game.js";
import { POWERUP_COLORS, POWERUP_ORDER, type Hud } from "./Hud.js";
import { loadImage, ready } from "./images.js";
import {
  PLAYER_DEAD_REVIVE_BOUNDS,
  PLAYER_LOADOUT_BOUNDS,
  PLAYER_LOADOUT_PANEL_BOUNDS,
  PLAYER_PAUSE_RESTART_BOUNDS,
  PLAYER_PAUSE_TOGGLE_BOUNDS,
  PLAYER_RESTART_BUTTON_BOUNDS,
  PLAYER_RESULTS_MENU_BOUNDS,
  PLAYER_SHOP_MENU_BOUNDS,
  PLAYER_SHOP_OWNED_BOUNDS,
  PLAYER_START_BUTTON_BOUNDS,
  SHOP_IMAGE_SCALE,
} from "./layout.js";
import { drawAngularPanel, drawGeometricFrame } from "./panels.js";

const FONT = "Menlo, Consolas, monospace";

/** seconds after the body stops: the panel appears, the numbers count up, the stamp lands */
const RESULTS_DELAY = 0.15;
const COUNT_UP_AT = 0.45;
export const NEW_BEST_AT = 1.25;
/** the results react to input only after this long, so a held thrust cannot skip them */
export const RESULTS_INPUT_AT = 0.45;
export const NEW_BEST_STAMP = { x: CANVAS_WIDTH / 2 - 62, y: 324 };

const HAZARD_NAMES: Record<string, string> = {
  GATE: "A LASER GATE",
  BLOCK_TOP: "CEILING MACHINERY",
  BLOCK_BOTTOM: "FLOOR MACHINERY",
  FLOATING: "FLOATING DEBRIS",
  MOVING: "A PATROL DRONE",
};

const LOADOUT_LABELS: Record<LoadoutItem, string> = {
  shield: "SHIELD",
  doubleCoins: "2X COINS",
  booster: "BOOSTER",
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (v: number): number => 1 - Math.pow(1 - clamp01(v), 3);

export class Menus {
  private titleImage = loadImage("assets/ui/tittle.png");
  private howToPlayImage = loadImage("assets/ui/how_to_play.png");
  private shopImage = loadImage("assets/ui/shop.png");
  private blankBarImage = loadImage("assets/ui/blanck_bar.png");
  private bestScorePanelImage = loadImage("assets/ui/bestscore_panel.png");
  private startButtonImage = loadImage("assets/ui/start_game_button.png");
  private gameOverImage = loadImage("assets/ui/gameover.png");
  private restartButtonImage = loadImage("assets/ui/restart_button.png");
  private playPauseImage = loadImage("assets/ui/play_pause.png");
  private pauseRestartImage = loadImage("assets/ui/restart.png");
  private coinImage = loadImage("assets/effects/coin.png");

  constructor(private game: Game, private hud: Hud) {}

  drawStartScreen(ctx: CanvasRenderingContext2D): void {
    if (this.game.shopOpen) {
      this.drawShop(ctx);
      return;
    }

    ctx.fillStyle = "rgba(5, 7, 14, 0.62)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawGeometricFrame(ctx, 12, 12, CANVAS_WIDTH - 24, CANVAS_HEIGHT - 24, 20, "rgba(94, 240, 255, 0.62)");
    drawGeometricFrame(ctx, 20, 20, CANVAS_WIDTH - 40, CANVAS_HEIGHT - 40, 15, "rgba(184, 93, 255, 0.26)");

    if (ready(this.titleImage)) ctx.drawImage(this.titleImage, (CANVAS_WIDTH - 300) / 2, 12, 300, 141);
    if (ready(this.howToPlayImage)) ctx.drawImage(this.howToPlayImage, 28, 174, 490, 265);
    if (ready(this.bestScorePanelImage)) {
      const panelX = 565;
      ctx.drawImage(this.bestScorePanelImage, panelX, 246, 357, 98);
      ctx.save();
      ctx.font = `bold 26px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#f6f0ff";
      ctx.shadowColor = "#5ef0ff";
      ctx.shadowBlur = 8;
      ctx.fillText(String(this.game.bestScore), panelX + 235, 298);
      ctx.restore();
    }
    if (ready(this.startButtonImage)) {
      const button = PLAYER_START_BUTTON_BOUNDS;
      ctx.drawImage(this.startButtonImage, button.x, button.y, button.w, button.h);
    }
    this.drawShopMenuButton(ctx);
    this.drawLoadout(ctx);
    this.hud.drawCoinCount(ctx, CANVAS_WIDTH - 116, 34, "left");
  }

  /** the power-ups to bring into the next run; a picked one is spent the moment the run starts */
  private drawLoadout(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    const panel = PLAYER_LOADOUT_PANEL_BOUNDS;
    drawAngularPanel(ctx, panel.x, panel.y, panel.w, panel.h, 10, "rgba(8, 10, 34, 0.84)", "rgba(94, 240, 255, 0.45)");

    ctx.save();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillStyle = "#5ef0ff";
    ctx.fillText("LOADOUT", panel.x + 20, panel.y + 30);
    ctx.font = `bold 9px ${FONT}`;
    ctx.fillStyle = "#8f93b8";
    ctx.fillText("PICK FOR THE NEXT RUN", panel.x + 20, panel.y + 50);
    ctx.fillText("CLICK OR KEYS 1 2 3", panel.x + 20, panel.y + 64);

    LOADOUT_ITEMS.forEach((item, index) => {
      const slot = PLAYER_LOADOUT_BOUNDS[index];
      const owned = g.shopInventory[item];
      const picked = g.loadout[item];
      const color = POWERUP_COLORS[item];
      const images = this.hud.powerupImages[item];
      const image = picked ? images.selected : images.normal;

      ctx.save();
      ctx.globalAlpha = owned > 0 || picked ? 1 : 0.35;
      if (picked) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
      }
      if (ready(image)) ctx.drawImage(image, slot.x, slot.y, slot.w, slot.h);
      ctx.restore();

      ctx.textAlign = "right";
      ctx.font = `bold 11px ${FONT}`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#0a0b20";
      ctx.fillStyle = owned > 0 ? "#f6f0ff" : "#7d819c";
      ctx.strokeText(`x${owned}`, slot.x + slot.w + 14, slot.y + 8);
      ctx.fillText(`x${owned}`, slot.x + slot.w + 14, slot.y + 8);

      ctx.textAlign = "center";
      ctx.font = `bold 10px ${FONT}`;
      ctx.fillStyle = picked ? color : owned > 0 ? "#c9cbe6" : "#7d819c";
      ctx.fillText(picked ? "READY" : LOADOUT_LABELS[item], slot.x + slot.w / 2, slot.y + slot.h + 12);
    });
    ctx.restore();
  }

  drawPauseOverlay(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "rgba(5, 7, 14, 0.72)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawGeometricFrame(ctx, CANVAS_WIDTH / 2 - 210, 230, 420, 230, 24, "rgba(94, 240, 255, 0.82)");

    ctx.save();
    ctx.font = `bold 34px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f6f0ff";
    ctx.shadowColor = "#5ef0ff";
    ctx.shadowBlur = 12;
    ctx.fillText("PAUSED", CANVAS_WIDTH / 2, 290);
    ctx.restore();

    const toggle = PLAYER_PAUSE_TOGGLE_BOUNDS;
    if (ready(this.playPauseImage)) ctx.drawImage(this.playPauseImage, toggle.x, toggle.y, toggle.w, toggle.h);
    const restart = PLAYER_PAUSE_RESTART_BOUNDS;
    if (ready(this.pauseRestartImage)) ctx.drawImage(this.pauseRestartImage, restart.x, restart.y, restart.w, restart.h);
  }

  /** end of a run: appears once the body has stopped, then counts the run up */
  drawResults(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    const t = g.crash?.settled ? g.crash.restTime : 0;
    const appear = easeOut((t - RESULTS_DELAY) / 0.28);
    if (appear <= 0) return;

    ctx.save();
    ctx.globalAlpha = appear;
    ctx.fillStyle = "rgba(5, 7, 14, 0.66)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.translate(0, (1 - appear) * 26);

    const cx = CANVAS_WIDTH / 2;
    drawGeometricFrame(ctx, cx - 230, 66, 460, 468, 24, "rgba(184, 93, 255, 0.74)");
    if (ready(this.gameOverImage)) ctx.drawImage(this.gameOverImage, cx - 136, 78, 272, 120);

    // the run, counted up
    const count = easeOut((t - COUNT_UP_AT) / 0.7);
    const rows: Array<{ label: string; value: string; color: string; size: number }> = [
      { label: "DISTANCE", value: `${Math.round((g.camera.x / 10) * count)} m`, color: "#f6f0ff", size: 17 },
      { label: "COINS", value: String(Math.round(g.coinsCollected * count)), color: "#ffe28a", size: 17 },
      { label: "SCORE", value: String(Math.round(g.score * count)), color: "#5ef0ff", size: 24 },
      { label: "BEST", value: String(g.bestScore), color: "#b7a8e8", size: 17 },
    ];
    const left = cx - 170;
    const right = cx + 170;
    drawAngularPanel(ctx, left - 20, 204, 380, 144, 10, "rgba(8, 10, 34, 0.9)", "rgba(94, 240, 255, 0.5)");
    rows.forEach((row, index) => {
      const y = 228 + index * 32;
      ctx.font = `bold 13px ${FONT}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = "#8f93b8";
      ctx.fillText(row.label, left, y);
      ctx.font = `bold ${row.size}px ${FONT}`;
      ctx.textAlign = "right";
      ctx.fillStyle = row.color;
      ctx.fillText(row.value, right, y);
    });

    const stamp = clamp01((t - NEW_BEST_AT) / 0.16);
    if (g.newBest && stamp > 0) {
      const scale = 2.2 - 1.2 * easeOut(stamp);
      ctx.save();
      ctx.translate(NEW_BEST_STAMP.x, NEW_BEST_STAMP.y);
      ctx.rotate(-0.08);
      ctx.scale(scale, scale);
      ctx.globalAlpha = appear * stamp;
      ctx.font = `bold 15px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const width = ctx.measureText("NEW BEST!").width + 18;
      drawAngularPanel(ctx, -width / 2, -13, width, 26, 6, "rgba(40, 26, 4, 0.95)", "#FFD45E");
      ctx.fillStyle = "#FFD45E";
      ctx.shadowColor = "#FFD45E";
      ctx.shadowBlur = 10;
      ctx.fillText("NEW BEST!", 0, 1);
      ctx.restore();
    }

    const killer = g.deathInfo ? HAZARD_NAMES[g.deathInfo.obstacleType] ?? "A HAZARD" : "";
    if (killer) {
      ctx.font = `bold 12px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ff8a80";
      ctx.fillText(`TAKEN OUT BY ${killer}`, cx, 368);
    }

    if (ready(this.restartButtonImage)) {
      const button = PLAYER_RESTART_BUTTON_BOUNDS;
      ctx.drawImage(this.restartButtonImage, button.x, button.y, button.w, button.h);
    }

    const revives = g.shopInventory.revive;
    if (revives > 0) {
      const revive = PLAYER_DEAD_REVIVE_BOUNDS;
      const image = this.hud.powerupImages.revive.selected;
      if (ready(image)) ctx.drawImage(image, revive.x, revive.y, revive.w, revive.h);
      ctx.font = `bold 11px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`REVIVE x${revives}`, revive.x + revive.w / 2, revive.y + revive.h + 9);
    }

    const menu = PLAYER_RESULTS_MENU_BOUNDS;
    drawAngularPanel(ctx, menu.x, menu.y, menu.w, menu.h, 8, "rgba(8, 10, 34, 0.9)", "rgba(184, 93, 255, 0.8)");
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f6f0ff";
    ctx.fillText("MENU", menu.x + menu.w / 2, menu.y + menu.h / 2 + 1);

    ctx.globalAlpha = appear * (0.55 + 0.35 * Math.sin(t * 4));
    ctx.font = `bold 11px ${FONT}`;
    ctx.fillStyle = "#b7a8e8";
    ctx.fillText("SPACE  RETRY      ESC  MENU", cx, 518);
    ctx.restore();
  }

  private drawShopMenuButton(ctx: CanvasRenderingContext2D): void {
    const button = PLAYER_SHOP_MENU_BOUNDS;
    if (ready(this.blankBarImage)) {
      const imageHeight = (button.w * this.blankBarImage.naturalHeight) / this.blankBarImage.naturalWidth;
      ctx.drawImage(this.blankBarImage, button.x, button.y - (imageHeight - button.h) / 2, button.w, imageHeight);
    }
    const midY = button.y + button.h / 2;
    ctx.save();
    ctx.font = `bold 17px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f6f0ff";
    ctx.shadowColor = "#5ef0ff";
    ctx.shadowBlur = 7;
    ctx.fillText("POWER-UP SHOP", button.x + button.w / 2, midY);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(94, 240, 255, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(button.x + 20, midY);
    ctx.lineTo(button.x + 28, midY - 7);
    ctx.lineTo(button.x + 36, midY);
    ctx.moveTo(button.x + button.w - 20, midY);
    ctx.lineTo(button.x + button.w - 28, midY + 7);
    ctx.lineTo(button.x + button.w - 36, midY);
    ctx.stroke();
    ctx.restore();
  }

  private drawShop(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    ctx.fillStyle = "#10102d";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    if (ready(this.shopImage)) {
      const width = this.shopImage.naturalWidth * SHOP_IMAGE_SCALE;
      const height = this.shopImage.naturalHeight * SHOP_IMAGE_SCALE;
      ctx.drawImage(this.shopImage, (CANVAS_WIDTH - width) / 2, (CANVAS_HEIGHT - height) / 2, width, height);
    }

    if (ready(this.coinImage)) ctx.drawImage(this.coinImage, 811, 53, 32, 32);
    ctx.save();
    ctx.font = `bold 22px ${FONT}`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffe28a";
    ctx.fillText(String(g.totalCoins), 854, 70);
    ctx.restore();

    POWERUP_ORDER.forEach((item, index) => {
      const count = g.shopInventory[item];
      if (count < 1) return;
      const bounds = PLAYER_SHOP_OWNED_BOUNDS[index];
      drawAngularPanel(ctx, bounds.x, bounds.y, bounds.w, bounds.h, 6, "rgba(8, 12, 38, 0.94)", "#5ef0ff");
      ctx.save();
      ctx.font = `bold 10px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`OWNED x${count}`, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
      ctx.restore();
    });

    if (g.shopMessage) {
      const color = g.shopMessage === "NOT ENOUGH COINS" ? "#ff8396" : "#8effcb";
      drawAngularPanel(ctx, 342, 88, 276, 34, 8, "rgba(8, 12, 38, 0.94)", color);
      ctx.save();
      ctx.font = `bold 15px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      ctx.fillText(g.shopMessage, CANVAS_WIDTH / 2, 105);
      ctx.restore();
    }
  }
}
