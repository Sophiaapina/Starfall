/**
 * everything the player sees: world, astronaut, effects, HUD and menus
 * reads the game and never writes to it; the lab overlays in src/debug draw on top of this
 */

import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../config/gameplayConfig.js";
import { GameState, type Game, type GameEvent } from "../game/Game.js";
import { Effects, FX } from "./Effects.js";
import { Hud, POWERUP_COLORS, POWERUP_NAMES } from "./Hud.js";
import { Menus, NEW_BEST_AT, NEW_BEST_STAMP } from "./Menus.js";
import { PlayerSprite } from "./PlayerSprite.js";
import { WorldLayer } from "./WorldLayer.js";

export class GameRenderer {
  readonly fx = new Effects();
  private world: WorldLayer;
  private player: PlayerSprite;
  private hud: Hud;
  private menus: Menus;
  private lastStepCount = 0;
  private bestStamped = false;
  /** moments that have a sound but are not simulation events */
  onCue: ((cue: "newBest") => void) | null = null;

  constructor(private game: Game, isMusicEnabled: () => boolean, isSoundEnabled: () => boolean) {
    this.world = new WorldLayer(game);
    this.player = new PlayerSprite(game, this.fx);
    this.hud = new Hud(game, isMusicEnabled, isSoundEnabled);
    this.menus = new Menus(game, this.hud);
  }

  /** turn one simulation event into effects */
  handle(event: GameEvent): void {
    switch (event.type) {
      case "coin":
        this.fx.coinPickup(event.x, event.y, event.amount);
        break;
      case "nearMiss":
        this.fx.sparks(event.x, event.y, FX.white, 7, 170);
        this.fx.text(event.x + 34, event.y, "CLOSE!", FX.cyan, 13, 34, 0.6);
        break;
      case "land":
        this.player.landed(event.speed);
        break;
      case "bounce": {
        const at = this.player.pivot();
        const strength = Math.min(1, event.speed / 800);
        this.fx.dust(at.x, this.game.world.floorY(), this.game.crash?.speed ?? 0, strength);
        this.fx.sparks(at.x, this.game.world.floorY() - 4, FX.dust, 6, 200);
        this.fx.shake(0.15 + 0.3 * strength);
        break;
      }
      case "crashEnd":
        break;
      case "takeoff":
        this.player.tookOff();
        break;
      case "powerup": {
        const name = POWERUP_NAMES[event.item];
        if (event.active) this.hud.notify(`${name} ACTIVATED`, POWERUP_COLORS[event.item]);
        else if (event.item === "booster") this.hud.notify(`${name} EXPIRED!`, "#FF8294");
        else this.hud.notify(`${name} DEACTIVATED`, POWERUP_COLORS[event.item]);
        break;
      }
      case "smash":
        this.fx.sparks(event.x, event.y, FX.flame, 14, 420);
        this.fx.sparks(event.x, event.y, FX.white, 8, 300);
        this.fx.ring(event.x, event.y, 10, 84, 0.3, FX.purple, 4);
        this.fx.shake(0.3);
        break;
      case "hit": {
        const at = this.player.pivot();
        if (event.savedBy) {
          const color = POWERUP_COLORS[event.savedBy];
          this.hud.notify(`${POWERUP_NAMES[event.savedBy]} USED!`, color);
          this.fx.ring(at.x, at.y, 14, 90, 0.4, color, 4);
          this.fx.sparks(at.x, at.y, color, 16);
          this.fx.shake(0.4);
        } else {
          this.fx.sparks(at.x, at.y, FX.danger, 22, 340);
          this.fx.ring(at.x, at.y, 12, 130, 0.45, FX.danger, 5);
          this.fx.shake(0.8);
          this.fx.flash("#ffffff", 0.5);
        }
        break;
      }
    }
  }

  /** advance animation by presentation time; pass 0 while the game is paused */
  update(dt: number): void {
    if (this.game.stepCount < this.lastStepCount) {
      // the step counter only goes back on a restart: a new run starts clean
      this.fx.clear();
      this.hud.clear();
    }
    this.lastStepCount = this.game.stepCount;

    this.fx.update(dt);
    this.player.update(dt);
    this.hud.update(dt);

    // the NEW BEST stamp lands once, with a burst
    const stamped = this.game.newBest && (this.game.crash?.restTime ?? 0) >= NEW_BEST_AT;
    if (stamped && !this.bestStamped) {
      this.fx.sparks(NEW_BEST_STAMP.x, NEW_BEST_STAMP.y, FX.gold, 26, 300);
      this.fx.flash(FX.gold, 0.16);
      this.fx.shake(0.22);
      this.onCue?.("newBest");
    }
    this.bestStamped = stamped;
  }

  /** clears the frame and draws the far backdrop; the world stays shaken until finishWorld */
  beginWorld(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.save();
    ctx.translate(this.fx.shakeX, this.fx.shakeY);
    this.world.drawBackground(ctx);
  }

  finishWorld(ctx: CanvasRenderingContext2D): void {
    this.world.drawGround(ctx);
    this.world.drawObstacles(ctx);
    this.world.drawCoins(ctx);
    this.fx.drawBack(ctx);
    this.player.draw(ctx);
    this.fx.drawFront(ctx);
    ctx.restore();
  }

  /** HUD and menus of the player view */
  drawInterface(ctx: CanvasRenderingContext2D): void {
    const state = this.game.state;
    if (state === GameState.READY) {
      this.menus.drawStartScreen(ctx);
    } else {
      this.hud.drawScore(ctx);
      if (state === GameState.DEAD) {
        this.menus.drawResults(ctx);
      } else {
        if (state === GameState.RUNNING) this.hud.drawPowerups(ctx);
        if (state === GameState.PAUSED) this.menus.drawPauseOverlay(ctx);
        else this.hud.drawPauseButton(ctx);
      }
    }
    this.hud.drawAudioButtons(ctx);
    this.fx.drawFlash(ctx);
  }
}
