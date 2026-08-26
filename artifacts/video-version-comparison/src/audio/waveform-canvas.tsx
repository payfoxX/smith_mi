import { useEffect, useRef } from 'react';

import {
  CLASS_ADDED,
  CLASS_COMMON,
  CLASS_REMOVED,
  CLASS_SILENCE,
  type AudioDiffResult,
  type WindowAnalysis,
} from './dsp';

// Class → CSS color. Blue = new (added), red = removed, grey = common,
// near-black = silence. Shared by the lane tints and the legend.
export const CLASS_COLORS: Record<number, string> = {
  [CLASS_SILENCE]: '#0c161d',
  [CLASS_COMMON]: '#7d8e97',
  [CLASS_ADDED]: '#2fc6f0',
  [CLASS_REMOVED]: '#f16672',
};

// Class → RGB for the spectral map (rendered via ImageData for speed).
const CLASS_RGB: Record<number, [number, number, number]> = {
  [CLASS_SILENCE]: [13, 22, 30],
  [CLASS_COMMON]: [120, 136, 145],
  [CLASS_ADDED]: [58, 197, 250],
  [CLASS_REMOVED]: [241, 102, 114],
};

export const CLASS_LABELS: Record<number, string> = {
  [CLASS_SILENCE]: 'Silence',
  [CLASS_COMMON]: 'Common',
  [CLASS_ADDED]: 'Added',
  [CLASS_REMOVED]: 'Removed',
};

function windowIndexAtTime(time: number, sampleRate: number, hopSize: number): number {
  return Math.max(0, Math.floor((time * sampleRate) / hopSize));
}

type LaneProps = {
  samples: Float32Array;
  sampleRate: number;
  duration: number;
  windows: WindowAnalysis[];
  hopSize: number;
  /** Base waveform colour — V1 vs V2 get distinct greys/teals. */
  color: string;
  playhead: number;
  onSeek?: (time: number) => void;
};

// One version's waveform, tinted per analysis window by its diff class. Click
// anywhere to seek.
export function WaveformLane({
  samples,
  sampleRate,
  duration,
  windows,
  hopSize,
  color,
  playhead,
  onSeek,
}: LaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef<LaneProps>({ samples, sampleRate, duration, windows, hopSize, color, playhead, onSeek });
  propsRef.current = { samples, sampleRate, duration, windows, hopSize, color, playhead, onSeek };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const draw = () => {
      const props = propsRef.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const totalFrames = Math.floor(props.duration * props.sampleRate);
      if (totalFrames <= 0 || props.samples.length === 0) return;

      // Background tint per window class.
      for (let x = 0; x < width; x += 1) {
        const t = ((x + 0.5) / width) * props.duration;
        const wi = windowIndexAtTime(t, props.sampleRate, props.hopSize);
        const cls = props.windows[wi]?.cls ?? CLASS_SILENCE;
        if (cls === CLASS_SILENCE) continue;
        ctx.fillStyle = CLASS_COLORS[cls];
        ctx.globalAlpha = 0.13;
        ctx.fillRect(x, 0, 1, height);
      }
      ctx.globalAlpha = 1;

      // Centre line.
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      ctx.fillRect(0, height / 2 - 0.5, width, 1);

      // Peak waveform.
      const mid = height / 2;
      const ampScale = height * 0.44;
      ctx.fillStyle = color;
      for (let x = 0; x < width; x += 1) {
        const s0 = Math.min(
          props.samples.length,
          Math.floor((x / width) * totalFrames),
        );
        const s1 = Math.min(
          props.samples.length,
          Math.floor(((x + 1) / width) * totalFrames),
        );
        if (s1 <= s0) continue;
        let min = 0;
        let max = 0;
        for (let i = s0; i < s1; i += 1) {
          const v = props.samples[i];
          if (v < min) min = v;
          if (v > max) max = v;
        }
        const yTop = mid - max * ampScale;
        const yBot = mid - min * ampScale;
        ctx.fillRect(x, yTop, 1, Math.max(1, yBot - yTop));
      }

      // Playhead.
      const px = (props.playhead / props.duration) * width;
      ctx.fillStyle = 'rgba(216, 246, 255, .95)';
      ctx.fillRect(px, 0, 1, height);
      ctx.fillStyle = '#d9f7ff';
      ctx.beginPath();
      ctx.moveTo(px - 3, 0);
      ctx.lineTo(px + 3, 0);
      ctx.lineTo(px, 4);
      ctx.closePath();
      ctx.fill();
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="wave-lane"
      style={{ position: 'relative', height: '100%', minHeight: 0 }}
      onPointerDown={(event) => {
        if (!onSeek) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        onSeek((x / rect.width) * duration);
      }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
}

type StripProps = {
  windows: WindowAnalysis[];
  sampleRate: number;
  hopSize: number;
  duration: number;
  playhead: number;
  onSeek?: (time: number) => void;
};

// A solid per-window colour strip — the at-a-glance added/removed/common map.
export function DiffStrip({ windows, sampleRate, hopSize, duration, playhead, onSeek }: StripProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef<StripProps>({ windows, sampleRate, hopSize, duration, playhead, onSeek });
  propsRef.current = { windows, sampleRate, hopSize, duration, playhead, onSeek };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const draw = () => {
      const props = propsRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      if (props.duration <= 0) return;

      for (let x = 0; x < width; x += 1) {
        const t = ((x + 0.5) / width) * props.duration;
        const wi = windowIndexAtTime(t, props.sampleRate, props.hopSize);
        ctx.fillStyle = CLASS_COLORS[props.windows[wi]?.cls ?? CLASS_SILENCE];
        ctx.fillRect(x, 0, 1, height);
      }

      const px = (props.playhead / props.duration) * width;
      ctx.fillStyle = 'rgba(240, 252, 255, .95)';
      ctx.fillRect(px - 0.5, 0, 1, height);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="diff-strip"
      style={{ position: 'relative', height: '100%', minHeight: 0, cursor: onSeek ? 'pointer' : 'default' }}
      onPointerDown={(event) => {
        if (!onSeek) return;
        const rect = event.currentTarget.getBoundingClientRect();
        onSeek(((event.clientX - rect.left) / rect.width) * duration);
      }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
}

type SpectralProps = {
  result: AudioDiffResult;
  playhead: number;
  onSeek?: (time: number) => void;
};

// Frequency × time difference map. Each cell is a log-frequency band classified
// added (blue) / removed (red) / common (grey) / silence (dark). Low frequency
// sits at the bottom. Rendered as raw ImageData so it stays fast with thousands
// of windows, then CSS upscales.
export function SpectralMap({ result, playhead, onSeek }: SpectralProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef<SpectralProps>({ result, playhead, onSeek });
  propsRef.current = { result, playhead, onSeek };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const draw = () => {
      const { result: r, playhead: head } = propsRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0 || r.windows.length === 0) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);

      const cols = Math.min(r.windows.length, 2200);
      const bandCount = r.bands.length;
      const cellH = 3;
      const mapW = cols;
      const mapH = bandCount * cellH;

      canvas.width = Math.round(mapW * dpr);
      canvas.height = Math.round(mapH * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const image = ctx.createImageData(mapW, mapH);
      const data = image.data;
      for (let x = 0; x < cols; x += 1) {
        const wi = Math.floor((x / cols) * r.windows.length);
        const bandClasses = r.windows[wi]?.bandClasses;
        if (!bandClasses) continue;
        for (let b = 0; b < bandCount; b += 1) {
          const [cr, cg, cb] = CLASS_RGB[bandClasses[b]] ?? CLASS_RGB[CLASS_SILENCE];
          const row = mapH - 1 - b * cellH; // low freq at the bottom
          for (let dy = 0; dy < cellH; dy += 1) {
            const base = ((row - dy) * mapW + x) * 4;
            data[base] = cr;
            data[base + 1] = cg;
            data[base + 2] = cb;
            data[base + 3] = 255;
          }
        }
      }
      const offscreen = document.createElement('canvas');
      offscreen.width = mapW;
      offscreen.height = mapH;
      offscreen.getContext('2d')?.putImageData(image, 0, 0);

      ctx.scale(dpr, dpr);
      ctx.drawImage(offscreen, 0, 0, mapW, mapH);

      // Playhead line.
      const px = (head / r.duration) * mapW;
      ctx.fillStyle = 'rgba(240, 252, 255, .95)';
      ctx.fillRect(px, 0, 1, mapH);

      // Frequency ticks on the right edge.
      ctx.fillStyle = 'rgba(180, 210, 222, .7)';
      ctx.font = '8px "IBM Plex Mono", monospace';
      for (const hz of [100, 1000, 10000]) {
        if (hz > r.bands[r.bands.length - 1].endHz) continue;
        const t = Math.log(hz / r.bands[0].startHz) / Math.log(r.bands[r.bands.length - 1].endHz / r.bands[0].startHz);
        const y = mapH - 1 - t * mapH;
        ctx.fillText(`${hz >= 1000 ? `${hz / 1000}k` : hz}`, mapW - 22, y - 2);
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="spectral-map"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0, cursor: onSeek ? 'pointer' : 'default' }}
      onPointerDown={(event) => {
        if (!onSeek) return;
        const rect = event.currentTarget.getBoundingClientRect();
        onSeek(((event.clientX - rect.left) / rect.width) * result.duration);
      }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', imageRendering: 'pixelated' }} />
    </div>
  );
}
