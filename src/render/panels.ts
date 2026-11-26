/** the cut-corner frames shared by the HUD and the menus */

function cutCornerPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, cut: number): void {
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + width - cut, y);
  ctx.lineTo(x + width, y + cut);
  ctx.lineTo(x + width, y + height - cut);
  ctx.lineTo(x + width - cut, y + height);
  ctx.lineTo(x + cut, y + height);
  ctx.lineTo(x, y + height - cut);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
}

/** filled panel with a thin outline */
export function drawAngularPanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number,
  cut: number, fill: string, stroke: string,
): void {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  cutCornerPath(ctx, x, y, width, height, cut);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** outline only, with four short accent bars on the edges */
export function drawGeometricFrame(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number,
  cut: number, color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  cutCornerPath(ctx, x, y, width, height, cut);
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 24, y + 1);
  ctx.lineTo(x + 64, y + 1);
  ctx.moveTo(x + width - 64, y + height - 1);
  ctx.lineTo(x + width - 24, y + height - 1);
  ctx.moveTo(x + 1, y + height - 68);
  ctx.lineTo(x + 1, y + height - 28);
  ctx.moveTo(x + width - 1, y + 28);
  ctx.lineTo(x + width - 1, y + 68);
  ctx.stroke();
  ctx.restore();
}
