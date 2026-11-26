/**
 * where the player view's buttons sit, in logical canvas pixels
 * drawing and click handling both read these, so a button is always pressed where it is shown
 */

import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../config/gameplayConfig.js";

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function inside(x: number, y: number, b: Bounds): boolean {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

/** results screen: retry in the middle, revive beside it when one is owned, menu underneath */
export const PLAYER_RESTART_BUTTON_BOUNDS: Bounds = { x: (CANVAS_WIDTH - 241) / 2, y: 392, w: 241, h: 65 };
export const PLAYER_DEAD_REVIVE_BOUNDS: Bounds = { x: (CANVAS_WIDTH + 241) / 2 + 18, y: 396, w: 58, h: 58 };
export const PLAYER_RESULTS_MENU_BOUNDS: Bounds = { x: (CANVAS_WIDTH - 150) / 2, y: 468, w: 150, h: 34 };
export const PLAYER_START_BUTTON_BOUNDS: Bounds = { x: 623, y: 374, w: 241, h: 65 };
export const PLAYER_SHOP_MENU_BOUNDS: Bounds = { x: 623, y: 455, w: 241, h: 56 };
/** start screen: the power-ups to bring into the next run, in a strip under the how-to-play panel */
export const PLAYER_LOADOUT_PANEL_BOUNDS: Bounds = { x: 40, y: 448, w: 466, h: 88 };
export const PLAYER_LOADOUT_BOUNDS: readonly Bounds[] = [0, 1, 2].map((i) => ({ x: 204 + i * 100, y: 454, w: 56, h: 56 }));

/** the shop screen is one 1806x1112 image; its buttons are measured on that image */
export const SHOP_IMAGE_SCALE = CANVAS_WIDTH / 1806;
const SHOP_IMAGE_Y = (CANVAS_HEIGHT - 1112 * SHOP_IMAGE_SCALE) / 2;
const shopImageBounds = (left: number, top: number, right: number, bottom: number): Bounds => ({
  x: left * SHOP_IMAGE_SCALE,
  y: SHOP_IMAGE_Y + top * SHOP_IMAGE_SCALE,
  w: (right - left) * SHOP_IMAGE_SCALE,
  h: (bottom - top) * SHOP_IMAGE_SCALE,
});

export const PLAYER_SHOP_BACK_BOUNDS = shopImageBounds(748, 98, 1062, 170);
export const PLAYER_SHOP_OWNED_BOUNDS: readonly Bounds[] = [
  { x: 160, y: 126, w: 92, h: 27 },
  { x: 384, y: 126, w: 92, h: 27 },
  { x: 608, y: 126, w: 92, h: 27 },
  { x: 832, y: 126, w: 92, h: 27 },
];
export const PLAYER_SHOP_BUY_BOUNDS: readonly Bounds[] = [
  shopImageBounds(102, 938, 445, 1012),
  shopImageBounds(523, 938, 866, 1012),
  shopImageBounds(942, 938, 1285, 1012),
  shopImageBounds(1363, 938, 1706, 1012),
];

/**
 * in-run buttons live in the floor band, the bottom strip the player can never fly into,
 * so nothing sits in the flight column or in front of incoming hazards
 */
const RAIL_Y = CANVAS_HEIGHT - 51;

export const PLAYER_MUSIC_BUTTON_BOUNDS: Bounds = { x: 16, y: RAIL_Y, w: 44, h: 44 };
export const PLAYER_SOUND_BUTTON_BOUNDS: Bounds = { x: 68, y: RAIL_Y, w: 44, h: 44 };
export const PLAYER_PAUSE_BUTTON_BOUNDS: Bounds = { x: CANVAS_WIDTH - 138, y: RAIL_Y, w: 122, h: 44 };
/** what is active this run, filled from the pause button leftwards; these show state and take no clicks */
export const PLAYER_POWERUP_SLOT_BOUNDS: readonly Bounds[] = [0, 1, 2].map((i) => ({
  x: CANVAS_WIDTH - 198 - i * 56,
  y: RAIL_Y - 2,
  w: 48,
  h: 48,
}));

export const PLAYER_PAUSE_TOGGLE_BOUNDS: Bounds = { x: CANVAS_WIDTH / 2 - 112, y: 348, w: 186, h: 78 };
export const PLAYER_PAUSE_RESTART_BOUNDS: Bounds = { x: CANVAS_WIDTH / 2 + 88, y: 352, w: 73, h: 70 };
