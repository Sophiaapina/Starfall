/**
 * the place a seed is played in
 *
 * The obstacle course already comes from the seed. This is the rest of the map:
 * which stretch of the planet the run starts on, and what colour that sky is.
 * The opening seed keeps the planet as it was painted. Every other seed is another map.
 */

import { CANVAS_HEIGHT, CANVAS_WIDTH, defaultConfig } from "../config/gameplayConfig.js";
import { SeededRandom } from "./Random.js";

export interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

interface Place {
  skyTop: string;
  skyBottom: string;
  /** dim wash over the painted horizon, so the play layer still reads */
  wash: string;
  /** colour distant ground fades toward */
  haze: string;
  star: string;
  /** hue-rotate degrees on the painted backdrop and ground; 0 is the art as drawn */
  hue: number;
}

/** four planets far enough apart that a new one reads as a new place, not a tint */
const PLACES: readonly Place[] = [
  { skyTop: "#07061c", skyBottom: "#231a55", wash: "rgba(9, 7, 30, 0.34)", haze: "#120e30", star: "#dfe6ff", hue: 0 },
  { skyTop: "#100804", skyBottom: "#2a160e", wash: "rgba(28, 12, 6, 0.34)", haze: "#1c100c", star: "#ffe8cc", hue: 120 },
  { skyTop: "#040e08", skyBottom: "#0e2814", wash: "rgba(6, 18, 8, 0.36)", haze: "#0c1a10", star: "#e7ffe8", hue: 200 },
  { skyTop: "#040c14", skyBottom: "#0c2438", wash: "rgba(4, 14, 24, 0.36)", haze: "#0c1828", star: "#e4f7ff", hue: 280 },
];

/** the run the game opens on; the same value as defaultConfig().seed */
const HOME_SEED = defaultConfig().seed >>> 0;

export interface MapLook {
  seed: number;
  place: number;
  skyTop: string;
  skyBottom: string;
  wash: string;
  haze: string;
  star: string;
  hue: number;
  /** mirror the painted strip, so the landmarks sit on the other side */
  flip: boolean;
  /** 0–1, where along the backdrop the run begins */
  backdropPhase: number;
  /** px added to the ground scroll, so the crystals underfoot change with the seed */
  groundPhase: number;
  stars: Star[];
}

function stream(seed: number): SeededRandom {
  return new SeededRandom(((seed >>> 0) ^ 0x6c62272e) >>> 0);
}

/** which planet this seed plays on; the opening seed is always the painted one */
export function mapPlace(seed: number): number {
  if ((seed >>> 0) === HOME_SEED) return 0;
  return stream(seed).int(0, PLACES.length - 1);
}

export function mapLook(seed: number): MapLook {
  const normalized = seed >>> 0;
  const rng = stream(normalized);
  const home = normalized === HOME_SEED;
  const place = home ? 0 : rng.int(0, PLACES.length - 1);
  const chosen = PLACES[place];
  const stars: Star[] = [];
  for (let i = 0; i < 70; i++) {
    stars.push({
      x: rng.range(0, CANVAS_WIDTH),
      y: rng.range(0, CANVAS_HEIGHT * 0.46),
      size: rng.next() < 0.2 ? 2 : 1,
      phase: rng.range(0, Math.PI * 2),
    });
  }
  return {
    seed: normalized,
    place,
    ...chosen,
    flip: home ? false : rng.next() < 0.5,
    backdropPhase: home ? 0 : rng.next(),
    groundPhase: home ? 0 : rng.range(0, 10000),
    stars,
  };
}
