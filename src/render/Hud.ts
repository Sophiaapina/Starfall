/** what the player reads during a run: score, coins, power-ups, pause and the sound toggles */

import { CANVAS_WIDTH } from "../config/gameplayConfig.js";
import { BOOSTER_SECONDS, GameState, LOADOUT_ITEMS, type Game, type ShopItem } from "../game/Game.js";
import { loadImage, ready } from "./images.js";
import {
  PLAYER_MUSIC_BUTTON_BOUNDS,
  PLAYER_PAUSE_BUTTON_BOUNDS,
  PLAYER_POWERUP_SLOT_BOUNDS,
  PLAYER_SOUND_BUTTON_BOUNDS,
  type Bounds,
} from "./layout.js";
import { drawAngularPanel } from "./panels.js";

export const POWERUP_ORDER: readonly ShopItem[] = ["revive", "shield", "doubleCoins", "booster"];

export const POWERUP_NAMES: Record<ShopItem, string> = {
  revive: "REVIVE",
  shield: "SHIELD",
  doubleCoins: "DOUBLE COINS",
  booster: "BOOSTER",
};

export const POWERUP_COLORS: Record<ShopItem, string> = {
  revive: "#8EFFCB",
  shield: "#5EEBFF",
  doubleCoins: "#FFD45E",
  booster: "#C678FF",
};

const FONT = "Menlo, Consolas, monospace";
const NOTICE_SECONDS = 1.8;

export class Hud {
  private scoreImage = loadImage("assets/ui/score.png");
  private coinImage = loadImage("assets/effects/coin.png");
  private pauseButtonImage = loadImage("assets/ui/Puase_button.png");
  private musicButtonImage = loadImage("assets/ui/music.png");
  private soundButtonImage = loadImage("assets/ui/sonido.png");
  readonly powerupImages: Record<ShopItem, { normal: HTMLImageElement; selected: HTMLImageElement }>;

  private notice = "";
  private noticeColor = "#5EEBFF";
  private noticeLeft = 0;

  constructor(
    private game: Game,
    private isMusicEnabled: () => boolean,
    private isSoundEnabled: () => boolean,
  ) {
    const button = (normal: string, selected: string) => ({
      normal: loadImage(`assets/effects/botones_powerups/${normal}`),
      selected: loadImage(`assets/effects/botones_powerups/${selected}`),
    });
    this.powerupImages = {
      revive: button("boton_1_revive_normal.png", "boton_1_revive_seleccionado.png"),
      shield: button("boton_2_shield_normal.png", "boton_2_shield_seleccionado.png"),
      doubleCoins: button("boton_3_coins_normal.png", "boton_3_coins_seleccionado.png"),
      booster: button("boton_4_booster_normal.png", "boton_4_booster_seleccionado.png"),
    };
  }

  /** short banner under the top edge, for power-up changes */
  notify(text: string, color: string): void {
    this.notice = text;
    this.noticeColor = color;
    this.noticeLeft = NOTICE_SECONDS;
  }

  clear(): void {
    this.noticeLeft = 0;
  }

  update(dt: number): void {
    this.noticeLeft = Math.max(0, this.noticeLeft - dt);
  }

  /** score and coin wallet, top right */
  drawScore(ctx: CanvasRenderingContext2D): void {
    const w = 190;
    const h = 72;
    const x = CANVAS_WIDTH - w - 18;
    const y = 12;

    if (ready(this.scoreImage)) ctx.drawImage(this.scoreImage, x, y, w, h);
    ctx.save();
    ctx.font = `bold 18px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#5ef0ff";
    ctx.shadowColor = "#5ef0ff";
    ctx.shadowBlur = 8;
    ctx.fillText(String(this.game.score), x + 155, y + 38);
    ctx.restore();

    this.drawCoinCount(ctx, x - 14, 34, "right");
  }

  /** coin icon and wallet total; with align "right" the text ends at x, otherwise the icon starts there */
  drawCoinCount(ctx: CanvasRenderingContext2D, x: number, y: number, align: "left" | "right", size = 18): void {
    const text = String(this.game.totalCoins);
    ctx.save();
    ctx.font = `bold ${size}px ${FONT}`;
    ctx.textBaseline = "middle";
    const icon = size + 12;
    const left = align === "right" ? x - ctx.measureText(text).width - icon - 6 : x;
    if (ready(this.coinImage)) ctx.drawImage(this.coinImage, left, y - icon / 2, icon, icon);
    ctx.fillStyle = "#ffe28a";
    ctx.textAlign = "left";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(8, 8, 26, 0.7)";
    ctx.strokeText(text, left + icon + 6, y);
    ctx.fillText(text, left + icon + 6, y);
    ctx.restore();
  }

  /** the power-ups at work in this run, in the floor rail; the booster shows how much burn is left */
  drawPowerups(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    let slot = 0;
    for (const item of LOADOUT_ITEMS) {
      if (!g.isPowerupActive(item)) continue;
      const bounds = PLAYER_POWERUP_SLOT_BOUNDS[slot++];
      const image = this.powerupImages[item].selected;
      if (ready(image)) ctx.drawImage(image, bounds.x, bounds.y, bounds.w, bounds.h);
      if (item !== "booster") continue;

      const left = Math.max(0, Math.min(1, g.boosterSeconds / BOOSTER_SECONDS));
      ctx.fillStyle = "rgba(20, 22, 38, 0.9)";
      ctx.fillRect(bounds.x + 4, bounds.y - 5, bounds.w - 8, 4);
      ctx.fillStyle = POWERUP_COLORS.booster;
      ctx.fillRect(bounds.x + 4, bounds.y - 5, (bounds.w - 8) * left, 4);
    }
    this.drawNotice(ctx);
  }

  drawPauseButton(ctx: CanvasRenderingContext2D): void {
    const button = PLAYER_PAUSE_BUTTON_BOUNDS;
    if (ready(this.pauseButtonImage)) ctx.drawImage(this.pauseButtonImage, button.x, button.y, button.w, button.h);
  }

  drawAudioButtons(ctx: CanvasRenderingContext2D): void {
    this.drawToggle(ctx, this.musicButtonImage, PLAYER_MUSIC_BUTTON_BOUNDS, this.isMusicEnabled());
    this.drawToggle(ctx, this.soundButtonImage, PLAYER_SOUND_BUTTON_BOUNDS, this.isSoundEnabled());
  }

  private drawToggle(ctx: CanvasRenderingContext2D, image: HTMLImageElement, button: Bounds, enabled: boolean): void {
    if (ready(image)) ctx.drawImage(image, button.x, button.y, button.w, button.h);
    if (enabled) return;
    ctx.save();
    ctx.strokeStyle = "#ff5265";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(button.x + 12, button.y + 12);
    ctx.lineTo(button.x + button.w - 12, button.y + button.h - 12);
    ctx.stroke();
    ctx.restore();
  }

  private drawNotice(ctx: CanvasRenderingContext2D): void {
    if (this.noticeLeft <= 0 || this.game.state !== GameState.RUNNING) return;
    const width = 300;
    const height = 42;
    const x = (CANVAS_WIDTH - width) / 2;
    const y = 88;

    ctx.save();
    ctx.globalAlpha = Math.min(1, this.noticeLeft / 0.4);
    drawAngularPanel(ctx, x, y, width, height, 8, "rgba(10, 12, 30, 0.92)", this.noticeColor);
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = this.noticeColor;
    ctx.shadowColor = this.noticeColor;
    ctx.shadowBlur = 12;
    ctx.fillText(this.notice, CANVAS_WIDTH / 2, y + height / 2);
    ctx.restore();
  }
}
