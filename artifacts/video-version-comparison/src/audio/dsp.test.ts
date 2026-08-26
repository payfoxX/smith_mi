// Unit tests for the audio difference kernel. These pin the behaviour the UI
// depends on: FFT bin accuracy, resampling, band construction, and — most
// importantly — that identical audio reads as "common", added/removed content
// is flagged in the right direction, loudness differences are compensated, and
// transposed content is caught as a pitch/tone shift.
//
// Run with:  node --test src/audio/dsp.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fft,
  resample,
  buildBands,
  compareAudio,
  windowMagnitudes,
  CLASS_COMMON,
  CLASS_ADDED,
  CLASS_REMOVED,
  formatSeconds,
  type WindowAnalysis,
} from './dsp.ts';

// --- fft ------------------------------------------------------------------

test('fft of a pure sine peaks at the expected bin', () => {
  const N = 256;
  const rate = 8000;
  const freq = 1000; // bin = freq * N / rate = 32
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i += 1) re[i] = Math.sin((2 * Math.PI * freq * i) / rate);
  fft(re, im);
  let peakBin = 0;
  let peak = 0;
  for (let k = 1; k < N / 2; k += 1) {
    const m = Math.hypot(re[k], im[k]);
    if (m > peak) {
      peak = m;
      peakBin = k;
    }
  }
  assert.equal(peakBin, 32, 'peak should land exactly on bin 32');
});

// --- resample --------------------------------------------------------------

test('resample preserves a constant signal and scales length', () => {
  const input = new Float32Array(1000).fill(0.5);
  const out = resample(input, 44100, 22050);
  assert.equal(out.length, 500);
  assert.ok(Math.abs(out[10] - 0.5) < 1e-6);
});

// --- buildBands ------------------------------------------------------------

test('buildBands covers the audible range within Nyquist', () => {
  const bands = buildBands(2048, 22050);
  assert.equal(bands.length, 72);
  assert.ok(bands[0].startHz >= 40);
  assert.ok(bands[0].startHz < 200, 'first band starts low');
  assert.ok(bands[71].endHz <= 11025 * 0.96, 'last band stays below Nyquist');
  for (let i = 1; i < bands.length; i += 1) {
    assert.ok(bands[i].startHz >= bands[i - 1].endHz, 'bands are sorted');
  }
  for (const band of bands) {
    assert.ok(band.endBin > band.startBin, 'every band covers at least one bin');
  }
});

// --- compareAudio helpers --------------------------------------------------

const RATE = 8000;

function sine(freq: number, seconds: number, amp = 0.5): Float32Array {
  const n = Math.floor(seconds * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = amp * Math.sin((2 * Math.PI * freq * i) / RATE);
  }
  return out;
}

function run(a: Float32Array, b: Float32Array, opts = {}) {
  return compareAudio(a, b, RATE, { fftSize: 512, hopSize: 128, ...opts });
}

const classified = (windows: WindowAnalysis[], cls: number) =>
  windows.filter((w) => w.cls === cls).length;

test('identical audio reads as common with no change events', () => {
  const a = sine(440, 0.5);
  const result = run(a, a.slice());
  assert.equal(result.events.length, 0);
  assert.ok(classified(result.windows, CLASS_ADDED) === 0);
  assert.ok(classified(result.windows, CLASS_REMOVED) === 0);
  assert.ok(classified(result.windows, CLASS_COMMON) > 0);
  assert.equal(result.windows.every((w) => !w.pitchShift), true);
});

test('a quieter re-encode is compensated by level matching, not flagged', () => {
  const a = sine(440, 0.5);
  const b = sine(440, 0.5, 0.002); // 48 dB quieter
  const result = run(a, b);
  assert.equal(result.events.length, 0);
  assert.ok(classified(result.windows, CLASS_ADDED) === 0, 'quiet V2 must not read as added');
  assert.ok(classified(result.windows, CLASS_COMMON) > 0);
});

test('content present only in V2 is flagged as added (blue)', () => {
  const a = sine(440, 0.4); // master stops halfway
  const b = new Float32Array(Math.floor(0.8 * RATE));
  b.set(sine(440, 0.4), 0); // V2 keeps the same first half...
  b.set(sine(880, 0.4), Math.floor(0.4 * RATE)); // ...then adds a tone V1 never had

  const result = run(a, b);
  const addedWindows = classified(result.windows, CLASS_ADDED);
  assert.ok(addedWindows > 0, `expected added windows, got ${addedWindows}`);
  assert.ok(result.events.some((e) => e.kind === 'added'), 'expected an added event');
  assert.ok(result.stats.addedSeconds > 0.2, 'trailing content should count as added time');
});

test('content present only in V1 is flagged as removed (red)', () => {
  const a = sine(440, 0.8);
  const b = a.slice(0, Math.floor(0.4 * RATE)); // V2 ends halfway
  const result = run(a, b);
  assert.ok(classified(result.windows, CLASS_REMOVED) > 0, 'expected removed windows');
  assert.ok(result.events.some((e) => e.kind === 'removed'), 'expected a removed event');
  assert.ok(result.stats.removedSeconds > 0.2, 'dropped tail should count as removed time');
});

test('transposed content is caught as a pitch/tone shift, not added/removed', () => {
  // Same rhythm, same loudness, but the second half is played one octave up.
  const a = new Float32Array(Math.floor(0.8 * RATE));
  a.set(sine(220, 0.4), 0);
  a.set(sine(220, 0.4), Math.floor(0.4 * RATE));

  const b = new Float32Array(Math.floor(0.8 * RATE));
  b.set(sine(220, 0.4), 0);
  b.set(sine(440, 0.4), Math.floor(0.4 * RATE)); // octave up

  const result = run(a, b);
  assert.ok(
    result.windows.some((w) => w.pitchShift),
    'expected at least one pitch-shift window in the transposed half',
  );
  assert.ok(
    result.events.some((e) => e.kind === 'pitch'),
    'expected a pitch/tone shift event',
  );
});

test('high sensitivity catches faint changes, low sensitivity ignores them', () => {
  const a = sine(440, 0.5, 0.5);
  const b = sine(440, 0.5, 0.5);
  // A faint extra tone ~11 dB above V1's floor at that frequency — between the
  // two slack settings so only the tighter one should catch it.
  const faint = sine(660, 0.5, 0.00018);
  for (let i = 0; i < b.length; i += 1) b[i] += faint[i];

  const loose = run(a, b, { slackDb: 12 });
  const tight = run(a, b, { slackDb: 8 });
  const addedBands = (result: ReturnType<typeof run>) =>
    result.windows.reduce(
      (sum, w) => sum + Array.from(w.bandClasses).filter((c) => c === CLASS_ADDED).length,
      0,
    );
  assert.equal(addedBands(loose), 0, 'loose slack ignores the faint change');
  assert.ok(addedBands(tight) > 0, 'tighter slack catches it at the band level');
});

// --- windowMagnitudes ------------------------------------------------------

test('windowMagnitudes returns size/2 + 1 bins with a clean peak', () => {
  const N = 256;
  const rate = 8000;
  const freq = 1000;
  const samples = sine(freq, N / rate);
  const mag = windowMagnitudes(samples, 0, N);
  assert.equal(mag.length, N / 2 + 1);
  let peakBin = 0;
  for (let k = 1; k < mag.length; k += 1) {
    if (mag[k] > mag[peakBin]) peakBin = k;
  }
  // Bin 32 = 1000 Hz; allow ±1 for windowing leakage at this resolution.
  assert.ok(Math.abs(peakBin - 32) <= 1, `peak at bin ${peakBin}`);
});

// --- formatSeconds ---------------------------------------------------------

test('formatSeconds renders mm:ss', () => {
  assert.equal(formatSeconds(0), '00:00');
  assert.equal(formatSeconds(65), '01:05');
  assert.equal(formatSeconds(-3), '00:00');
});
