// Pure, DOM-free difference kernel shared by the live overlay and the timeline
// scan. Kept separate from the React component so the accuracy-critical math can
// be unit-tested in isolation (see diff.test.ts).

// Separable 3x3 box blur over RGB. Suppresses codec grain and sub-pixel edge
// shimmer between two encodes so only real content differences survive.
export function boxBlur3(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const n = width * height;
  const tmp = new Float32Array(n * 4);
  const out = new Float32Array(n * 4);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const i = (row + x) * 4;
      const xm = x > 0 ? i - 4 : i;
      const xp = x < width - 1 ? i + 4 : i;
      tmp[i] = (data[xm] + data[i] + data[xp]) / 3;
      tmp[i + 1] = (data[xm + 1] + data[i + 1] + data[xp + 1]) / 3;
      tmp[i + 2] = (data[xm + 2] + data[i + 2] + data[xp + 2]) / 3;
    }
  }
  const stride = width * 4;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const i = (row + x) * 4;
      const ym = y > 0 ? i - stride : i;
      const yp = y < height - 1 ? i + stride : i;
      out[i] = (tmp[ym] + tmp[i] + tmp[yp]) / 3;
      out[i + 1] = (tmp[ym + 1] + tmp[i + 1] + tmp[yp + 1]) / 3;
      out[i + 2] = (tmp[ym + 2] + tmp[i + 2] + tmp[yp + 2]) / 3;
    }
  }
  return out;
}

// Morphological opening (erosion then dilation) on a binary mask, double-buffered
// so reads never see partially-updated results. Removes isolated speckle while
// keeping genuine connected regions intact.
export function openMask(changed: Uint8Array, width: number, height: number): Uint8Array {
  const eroded = new Uint8Array(changed.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const p = y * width + x;
      if (!changed[p]) continue;
      const c =
        changed[p - 1] + changed[p + 1] + changed[p - width] + changed[p + width] +
        changed[p - width - 1] + changed[p - width + 1] + changed[p + width - 1] + changed[p + width + 1];
      if (c >= 3) eroded[p] = 1;
    }
  }
  const dilated = new Uint8Array(changed.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const p = y * width + x;
      if (!eroded[p]) continue;
      dilated[p] = 1;
      dilated[p - 1] = 1;
      dilated[p + 1] = 1;
      dilated[p - width] = 1;
      dilated[p + width] = 1;
      dilated[p - width - 1] = 1;
      dilated[p - width + 1] = 1;
      dilated[p + width - 1] = 1;
      dilated[p + width + 1] = 1;
    }
  }
  return dilated;
}

export type DiffCore = {
  changed: Uint8Array;
  signedLuma: Float32Array;
  changedFraction: number;
  netDirection: number;
};

// Blurs both frames, compensates for a uniform exposure/color shift, scores each
// pixel perceptually, thresholds by sensitivity (4..60, higher = more sensitive),
// then opens the mask. `netDirection` > 0 means V2 is brighter (added), < 0 darker.
export function computeDiffCore(
  aData: Uint8ClampedArray,
  bData: Uint8ClampedArray,
  width: number,
  height: number,
  sensitivity: number,
): DiffCore {
  const n = width * height;
  const ba = boxBlur3(aData, width, height);
  const bb = boxBlur3(bData, width, height);

  // Uniform per-channel offset (re-encode exposure / color cast) — subtract it so
  // a global shift does not flag the whole frame.
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let p = 0, i = 0; p < n; p += 1, i += 4) {
    sumR += bb[i] - ba[i];
    sumG += bb[i + 1] - ba[i + 1];
    sumB += bb[i + 2] - ba[i + 2];
  }
  const offR = sumR / n;
  const offG = sumG / n;
  const offB = sumB / n;

  // Higher sensitivity → lower threshold → detects smaller changes.
  const norm = (Math.max(4, Math.min(60, sensitivity)) - 4) / 56;
  const threshold = 26 - norm * 18; // ~26 (least sensitive) .. ~8 (most sensitive)

  const signedLuma = new Float32Array(n);
  const changed = new Uint8Array(n);
  for (let p = 0, i = 0; p < n; p += 1, i += 4) {
    const dR = bb[i] - offR - ba[i];
    const dG = bb[i + 1] - offG - ba[i + 1];
    const dB = bb[i + 2] - offB - ba[i + 2];
    const dLuma = dR * 0.2126 + dG * 0.7152 + dB * 0.0722;
    const chroma = (Math.abs(dR) + Math.abs(dG) + Math.abs(dB)) / 3;
    const score = Math.abs(dLuma) * 0.8 + chroma * 0.2;
    signedLuma[p] = dLuma;
    changed[p] = score > threshold ? 1 : 0;
  }

  const opened = openMask(changed, width, height);
  let count = 0;
  let direction = 0;
  for (let p = 0; p < n; p += 1) {
    if (opened[p]) {
      count += 1;
      direction += signedLuma[p];
    }
  }
  return { changed: opened, signedLuma, changedFraction: count / n, netDirection: direction };
}
