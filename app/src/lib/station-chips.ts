import { lineChipColors } from "./lines";

// Sizes in CSS px. MapLibre text can't draw colored boxes, so a station's line chips are drawn
// on a canvas and placed in its label as an image.
const HEIGHT = 11;
const PAD_X = 5;
const GAP = 2;
const RADIUS = 2.5;
const FONT_PX = 8;

/** The chips for one station side by side, or null where there is no canvas (tests). */
export function drawStationChips(codes: string[], pixelRatio: number): ImageData | null {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  const font = `600 ${FONT_PX}px ${getComputedStyle(document.body).fontFamily}`;
  ctx.font = font;
  const widths = codes.map((c) => Math.ceil(ctx.measureText(c).width) + 2 * PAD_X);
  const width = widths.reduce((a, b) => a + b, 0) + GAP * (codes.length - 1);

  // Resizing the canvas resets its state, so the font is set again after.
  ctx.canvas.width = Math.ceil(width * pixelRatio);
  ctx.canvas.height = Math.ceil(HEIGHT * pixelRatio);
  ctx.scale(pixelRatio, pixelRatio);
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let x = 0;
  codes.forEach((code, i) => {
    const { background, color } = lineChipColors(code);
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(x, 0, widths[i], HEIGHT, RADIUS);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(code, x + widths[i] / 2, HEIGHT / 2);
    x += widths[i] + GAP;
  });
  return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
}
