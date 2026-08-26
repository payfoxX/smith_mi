// Unit tests for the DOM-free difference kernel. These pin the accuracy-critical
// behaviour the UI depends on: no false positives on identical or globally-shifted
// frames, real localized changes flagged in the right place and direction, codec
// speckle rejected, sensitivity monotonic, and timeline events grouped correctly.
//
// Run with:  node --test src/diff.test.ts   (Node 24 strips the types natively)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  openMask,
  computeDiffCore,
  buildChangeEvents,
  formatTimecode,
  type ChangeSample,
} from './diff.ts';

type RGB = [number, number, number];

// A solid WxH RGBA frame filled with one colour (alpha 255).
function img(width: number, height: number, fill: RGB): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = 255;
  }
  return data;
}

// Paint an opaque rectangle into an existing frame.
function fillRect(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  rgb: RGB,
): void {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }
}

const sum = (arr: Uint8Array | Uint8ClampedArray): number => arr.reduce((s, v) => s + v, 0);

// --- computeDiffCore: false-positive rejection ---------------------------

test('identical frames produce zero changes', () => {
  const W = 40;
  const H = 30;
  const a = img(W, H, [100, 120, 140]);
  const b = img(W, H, [100, 120, 140]);
  const core = computeDiffCore(a, b, W, H, 24);
  assert.equal(core.changedFraction, 0);
  assert.equal(core.netDirection, 0);
  assert.ok(core.changed.every((v) => v === 0));
});

test('a uniform brightness shift is compensated, not flagged', () => {
  const W = 40;
  const H = 30;
  const a = img(W, H, [100, 100, 100]);
  const b = img(W, H, [130, 130, 130]); // +30 across the whole frame (re-encode/regrade)
  const core = computeDiffCore(a, b, W, H, 24);
  assert.equal(core.changedFraction, 0, 'global offset must not light up the frame');
});

test('scattered single-pixel noise is rejected by blur + threshold', () => {
  const W = 80;
  const H = 80;
  const a = img(W, H, [110, 110, 110]);
  const b = img(W, H, [110, 110, 110]);
  const spikes: Array<[number, number]> = [
    [10, 10], [30, 20], [50, 55], [70, 40], [20, 65], [60, 12],
  ];
  for (const [x, y] of spikes) {
    const i = (y * W + x) * 4;
    b[i] = 200; // +90 on a single isolated pixel
    b[i + 1] = 200;
    b[i + 2] = 200;
  }
  const core = computeDiffCore(a, b, W, H, 24);
  assert.equal(core.changedFraction, 0, 'isolated speckle should never survive');
});

// --- computeDiffCore: real changes flagged correctly ---------------------

test('a localized brighter region is flagged where it is, in the added direction', () => {
  const W = 120;
  const H = 120;
  const a = img(W, H, [100, 100, 100]);
  const b = img(W, H, [100, 100, 100]);
  fillRect(b, W, 40, 40, 40, 40, [180, 180, 180]); // +80 block, 40x40
  const core = computeDiffCore(a, b, W, H, 24);

  assert.ok(core.changedFraction > 0.05, `expected a sizeable region, got ${core.changedFraction}`);
  assert.ok(core.changedFraction < 0.2, `region should stay local, got ${core.changedFraction}`);
  assert.ok(core.netDirection > 0, 'brighter V2 => netDirection > 0 (added / blue)');

  assert.equal(core.changed[60 * W + 60], 1, 'the rectangle centre is flagged');
  assert.equal(core.changed[2 * W + 2], 0, 'far background is left clean');
});

test('a localized darker region is flagged in the removed direction', () => {
  const W = 120;
  const H = 120;
  const a = img(W, H, [100, 100, 100]);
  const b = img(W, H, [100, 100, 100]);
  fillRect(b, W, 40, 40, 40, 40, [20, 20, 20]); // -80 block
  const core = computeDiffCore(a, b, W, H, 24);
  assert.ok(core.netDirection < 0, 'darker V2 => netDirection < 0 (removed / red)');
  assert.equal(core.changed[60 * W + 60], 1, 'the rectangle centre is flagged');
});

test('higher sensitivity detects a faint change that lower sensitivity misses', () => {
  const W = 120;
  const H = 120;
  const a = img(W, H, [100, 100, 100]);
  const b = img(W, H, [100, 100, 100]);
  fillRect(b, W, 40, 40, 40, 40, [112, 112, 112]); // faint +12 block
  const low = computeDiffCore(a, b, W, H, 6);
  const high = computeDiffCore(a, b, W, H, 60);
  assert.equal(low.changedFraction, 0, 'least-sensitive setting ignores the faint change');
  assert.ok(high.changedFraction > 0, 'most-sensitive setting catches it');
  assert.ok(high.changedFraction > low.changedFraction, 'sensitivity is not inverted');
});

// --- openMask: morphology -----------------------------------------------

test('openMask removes an isolated pixel but preserves a solid block', () => {
  const W = 12;
  const H = 12;

  const single = new Uint8Array(W * H);
  single[5 * W + 5] = 1;
  assert.equal(sum(openMask(single, W, H)), 0, 'a lone pixel is eroded away');

  const block = new Uint8Array(W * H);
  for (let y = 3; y <= 7; y += 1) {
    for (let x = 3; x <= 7; x += 1) block[y * W + x] = 1;
  }
  const opened = openMask(block, W, H);
  assert.equal(opened[5 * W + 5], 1, 'the block centre survives');
  assert.ok(sum(opened) > 0, 'the block is preserved');
  assert.equal(opened[0], 0, 'the far corner stays empty');
});

// --- buildChangeEvents: timeline grouping --------------------------------

test('buildChangeEvents collapses a contiguous run into one event at its peak', () => {
  const samples: ChangeSample[] = [
    { time: 0.0, fraction: 0.000, direction: 0 },
    { time: 0.5, fraction: 0.010, direction: 5 },
    { time: 1.0, fraction: 0.040, direction: 8 }, // peak of the run
    { time: 1.5, fraction: 0.012, direction: 3 },
    { time: 2.0, fraction: 0.000, direction: 0 }, // drops below threshold -> flush
  ];
  const events = buildChangeEvents(samples);
  assert.equal(events.length, 1);
  assert.equal(events[0].time, 1.0);
  assert.equal(events[0].kind, 'blue');
  assert.match(events[0].label, /4\.0% of frame/);
});

test('buildChangeEvents separates distinct runs and colours by direction', () => {
  const samples: ChangeSample[] = [
    { time: 0.5, fraction: 0.020, direction: -4 }, // run 1: removed
    { time: 1.0, fraction: 0.002, direction: 0 },  // gap below threshold
    { time: 1.5, fraction: 0.030, direction: 9 },  // run 2: added
  ];
  const events = buildChangeEvents(samples);
  assert.equal(events.length, 2);
  assert.equal(events[0].kind, 'red');
  assert.equal(events[1].kind, 'blue');
});

// --- formatTimecode ------------------------------------------------------

test('formatTimecode renders HH:MM:SS:FF and clamps negatives', () => {
  assert.equal(formatTimecode(0), '00:00:00:00');
  assert.equal(formatTimecode(65.5), '00:01:05:12'); // 0.5s * 24fps = frame 12
  assert.equal(formatTimecode(65.5, false), '00:01:05');
  assert.equal(formatTimecode(-3), '00:00:00:00');
});
