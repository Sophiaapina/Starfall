/**
 * fits the fixed 960x600 logical canvas to whatever box the page layout gives it
 *
 * css decides the on-screen size and the letterboxing. this file keeps the
 * backing store sharp at that size and converts pointer positions back to
 * logical pixels, so gameplay and drawing code never see the window size
 */

import { CANVAS_HEIGHT, CANVAS_WIDTH, clamp } from "./config/gameplayConfig.js";

/**
 * most backing-store pixels drawn per logical pixel
 * 3 gives 2880x1800, which bounds fill cost on 4K and retina screens; above
 * that the browser upscales the finished frame
 */
const MAX_RENDER_SCALE = 3;

export interface Viewport {
  /** browser client coordinates to logical canvas coordinates */
  toLogical(clientX: number, clientY: number): { x: number; y: number };
}

/**
 * `redraw` runs right after the backing store changes size, because resizing
 * clears the canvas and the next animation frame would arrive one paint late
 */
export function fitCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  redraw: () => void,
): Viewport {
  let scale = canvas.width / CANVAS_WIDTH;

  keepShadowBlurLogical(ctx, () => scale);

  const apply = (): void => {
    const cssWidth = canvas.clientWidth;
    if (cssWidth === 0) return; // not laid out yet

    const wanted = clamp((cssWidth * window.devicePixelRatio) / CANVAS_WIDTH, 1, MAX_RENDER_SCALE);
    const width = Math.round(CANVAS_WIDTH * wanted);
    const height = Math.round(CANVAS_HEIGHT * wanted);
    if (canvas.width === width && canvas.height === height) return;

    // assigning the size clears the canvas and resets every context setting
    canvas.width = width;
    canvas.height = height;
    scale = width / CANVAS_WIDTH;
    ctx.setTransform(scale, 0, 0, height / CANVAS_HEIGHT, 0, 0);
    // image smoothing stays at the default: "high" measured 20 fps at this size, the default holds 60
    redraw();
  };

  // window resizes, the debug panel opening, and device rotation all change the css box
  new ResizeObserver(apply).observe(canvas);

  // a monitor change or browser zoom can change the pixel ratio and leave the css box alone
  const watchPixelRatio = (): void => {
    window
      .matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      .addEventListener("change", () => { apply(); watchPixelRatio(); }, { once: true });
  };
  watchPixelRatio();

  apply();

  return {
    toLogical(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left) * (CANVAS_WIDTH / rect.width),
        y: (clientY - rect.top) * (CANVAS_HEIGHT / rect.height),
      };
    },
  };
}

/**
 * shadow blur is the one drawing setting the canvas spec leaves outside the
 * transform. glows written for 960 px would thin out as the backing store
 * grows, so the value is scaled here and callers keep using logical pixels
 */
function keepShadowBlurLogical(ctx: CanvasRenderingContext2D, scale: () => number): void {
  const native = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "shadowBlur");
  const read = native?.get;
  const write = native?.set;
  if (!read || !write) return;

  Object.defineProperty(ctx, "shadowBlur", {
    configurable: true,
    get: () => (read.call(ctx) as number) / scale(),
    set: (blur: number) => write.call(ctx, blur * scale()),
  });
}
