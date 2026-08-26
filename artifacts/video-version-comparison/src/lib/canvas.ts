// Shared canvas helpers for the media comparison pages.

import { computeDiffCore } from '../diff';

export type DiffOverlayMode = 'dots' | 'markers';

// Draw a source (video frame or image) into a WxH canvas using "contain" fit.
// `sw`/`sh` are the source's intrinsic dimensions. When the two compared
// sources share an aspect ratio the frame fills exactly; when they differ,
// identical black bars are added to each so the bars cancel to zero difference.
export function drawContain(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  W: number,
  H: number,
): void {
  const vw = sw || W;
  const vh = sh || H;
  const scale = Math.min(W / vw, H / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(source, 0, 0, vw, vh, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

// Paint changed pixels blue (V2 brighter) / red (V2 darker) into an ImageData.
function fillChangedDots(
  result: ImageData,
  changed: Uint8Array,
  signedLuma: Float32Array,
): void {
  for (let p = 0, i = 0; p < changed.length; p += 1, i += 4) {
    if (changed[p]) {
      if (signedLuma[p] >= 0) {
        result.data[i] = 42;
        result.data[i + 1] = 193;
        result.data[i + 2] = 246;
      } else {
        result.data[i] = 232;
        result.data[i + 1] = 84;
        result.data[i + 2] = 107;
      }
      result.data[i + 3] = 255;
    }
  }
}

// Group nearby changed pixels into translucent 8px blocks (marker mode).
function paintBlockMarkers(
  ctx: CanvasRenderingContext2D,
  changed: Uint8Array,
  signedLuma: Float32Array,
  width: number,
  height: number,
): void {
  const block = 8;
  const minCover = Math.ceil(block * block * 0.25); // a block lights up at >=25% coverage
  for (let y = 0; y < height; y += block) {
    for (let x = 0; x < width; x += block) {
      let count = 0;
      let direction = 0;
      for (let oy = 0; oy < block && y + oy < height; oy += 1) {
        for (let ox = 0; ox < block && x + ox < width; ox += 1) {
          const p = (y + oy) * width + x + ox;
          if (changed[p]) {
            count += 1;
            direction += signedLuma[p];
          }
        }
      }
      if (count >= minCover) {
        ctx.fillStyle =
          direction >= 0
            ? 'rgba(42, 193, 246, .72)'
            : 'rgba(232, 84, 107, .72)';
        ctx.fillRect(x, y, block, block);
      }
    }
  }
}

// Render the blue/red difference map from two RGBA pixel buffers. Shared by the
// video frame diff and the image comparison page so both keep identical coloring.
// Blue = V2 brighter (added), red = V2 darker (removed); base is darkened V1.
export function renderDiffImage(
  aData: Uint8ClampedArray,
  bData: Uint8ClampedArray,
  width: number,
  height: number,
  sensitivity: number,
  overlayMode: DiffOverlayMode,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const output = canvas.getContext('2d');
  if (!output) return canvas;

  const { changed, signedLuma } = computeDiffCore(
    aData,
    bData,
    width,
    height,
    sensitivity,
  );

  const dotMode = overlayMode === 'dots';
  const result = output.createImageData(width, height);
  for (let p = 0, i = 0; p < changed.length; p += 1, i += 4) {
    if (!dotMode || !changed[p]) {
      const luminance =
        (aData[i] * 0.2126 + aData[i + 1] * 0.7152 + aData[i + 2] * 0.0722) *
        0.22;
      result.data[i] = luminance;
      result.data[i + 1] = luminance + 4;
      result.data[i + 2] = luminance + 10;
    }
    result.data[i + 3] = 255;
  }
  if (dotMode) fillChangedDots(result, changed, signedLuma);
  output.putImageData(result, 0, 0);

  if (!dotMode) paintBlockMarkers(output, changed, signedLuma, width, height);
  return canvas;
}

// Render ONLY the difference marks (dots or markers) onto a transparent canvas
// so they can be composited over the real image. Used by the image wipe view,
// where dragging the divider wipes the marks off the underlying image.
export function renderDiffOverlay(
  aData: Uint8ClampedArray,
  bData: Uint8ClampedArray,
  width: number,
  height: number,
  sensitivity: number,
  overlayMode: DiffOverlayMode,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const { changed, signedLuma } = computeDiffCore(
    aData,
    bData,
    width,
    height,
    sensitivity,
  );

  if (overlayMode === 'dots') {
    const result = ctx.createImageData(width, height);
    fillChangedDots(result, changed, signedLuma);
    ctx.putImageData(result, 0, 0);
  } else {
    paintBlockMarkers(ctx, changed, signedLuma, width, height);
  }
  return canvas;
}
