import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Film,
  Gauge,
  Info,
  Layers3,
  MonitorPlay,
  PanelRight,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';

import { TopBar } from '@/components/topbar';
import { drawContain, renderDiffImage } from '@/lib/canvas';
import { computeDiffCore, buildChangeEvents, formatTimecode, FPS, type ChangeEvent } from '../diff';

type Version = 1 | 2;
type VideoFile = { file: File; url: string; duration: number; width: number; height: number };

const fileSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const READY_ENOUGH = 2; // HTMLMediaElement.HAVE_CURRENT_DATA — a frame is decoded and paintable.

// Wait until a video has at least one decoded frame available to draw.
function waitForFrame(video: HTMLVideoElement, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    if (video.readyState >= READY_ENOUGH) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('loadeddata', finish);
      video.removeEventListener('canplay', finish);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    video.addEventListener('loadeddata', finish);
    video.addEventListener('canplay', finish);
  });
}

// Seek one video and resolve only once it has painted the requested frame.
function seekVideo(video: HTMLVideoElement, time: number, timeoutMs = 800): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', finish);
      video.removeEventListener('loadedmetadata', begin);
      window.clearTimeout(timer);
      resolve();
    };
    const begin = () => {
      if (done) return;
      video.removeEventListener('loadedmetadata', begin);
      if (video.readyState >= READY_ENOUGH && Math.abs(video.currentTime - time) < 1e-3) {
        requestAnimationFrame(finish);
        return;
      }
      video.addEventListener('seeked', finish);
      try {
        video.currentTime = time;
      } catch {
        finish();
      }
    };
    const timer = window.setTimeout(finish, timeoutMs);
    if (video.readyState >= 1) begin();
    else video.addEventListener('loadedmetadata', begin);
  });
}

// Frame-lock two videos to the same timestamp so a comparison reflects the same
// moment in both. Without this, motion between mis-aligned frames reads as a change.
async function seekBoth(a: HTMLVideoElement, b: HTMLVideoElement, time: number): Promise<void> {
  await Promise.all([seekVideo(a, time), seekVideo(b, time)]);
}

function DropZone({
  version,
  video,
  onFile,
  onClear,
}: {
  version: Version;
  video: VideoFile | null;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  return (
    <div className={`drop-zone ${video ? 'loaded' : ''}`} data-testid={`drop-zone-version-${version}`}>
      <input
        type="file"
        accept="video/*,.mxf,.mov,.mp4,.webm"
        aria-label={`Load Version ${version} video`}
        data-testid={`input-version-${version}`}
        onChange={(event) => {
          const next = event.target.files?.[0];
          if (next) onFile(next);
          event.currentTarget.value = '';
        }}
      />
      <div className="drop-icon">{video ? <Film size={16} /> : <Upload size={16} />}</div>
      <div className="drop-copy">
        <div className="drop-label">Version {version}</div>
        <div className="drop-file">
          {video ? `${video.file.name} · ${fileSize(video.file.size)}` : 'Choose a local video file'}
        </div>
      </div>
      {video ? (
        <button
          type="button"
          className="button ghost"
          aria-label={`Remove Version ${version}`}
          data-testid={`button-remove-version-${version}`}
          onClick={(event) => {
            event.stopPropagation();
            onClear();
          }}
        >
          <X size={14} />
        </button>
      ) : (
        <span className="drop-hint">Local only</span>
      )}
    </div>
  );
}

function Inspector({
  sensitivity,
  setSensitivity,
  hasVideos,
  onReset,
}: {
  sensitivity: number;
  setSensitivity: (value: number) => void;
  hasVideos: boolean;
  onReset: () => void;
}) {
  return (
    <aside className="inspector" style={{ borderLeft: '1px solid #253541', background: '#0c151d' }}>
      <div className="inspector-inner" style={{ position: 'sticky', top: 0 }}>
        <div className="panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PanelRight size={14} color="#62cceb" />
            <span className="panel-heading">INSPECTOR</span>
          </div>
          <span className="panel-meta">QC-01</span>
        </div>
        <div className="settings-list">
          <div className="setting">
            <div>
              <div className="setting-label">Difference sensitivity</div>
              <div className="setting-description">Pixel threshold for change dots</div>
            </div>
            <div className="setting-control">
              <input
                className="sensitivity"
                type="range"
                min="4"
                max="60"
                value={sensitivity}
                onChange={(event) => setSensitivity(Number(event.target.value))}
                aria-label="Difference sensitivity"
                data-testid="input-sensitivity"
              />
              <span className="sensitivity-value" data-testid="text-sensitivity">{sensitivity}</span>
            </div>
          </div>
          <div className="setting">
            <div>
              <div className="setting-label">Frame rate</div>
              <div className="setting-description">Comparison sampling base</div>
            </div>
            <span style={{ color: '#94aab2', font: '10px var(--app-font-mono)' }}>24.00 fps</span>
          </div>
          <div className="setting">
            <div>
              <div className="setting-label">Color space</div>
              <div className="setting-description">Browser video pipeline</div>
            </div>
            <span style={{ color: '#94aab2', font: '10px var(--app-font-mono)' }}>sRGB</span>
          </div>
        </div>
        <div style={{ borderTop: '1px solid #1e2e38', padding: '13px 12px' }}>
          <button type="button" className="button" style={{ width: '100%', justifyContent: 'center' }} onClick={onReset} disabled={!hasVideos} data-testid="button-reset">
            <RotateCcw size={13} /> Reset comparison
          </button>
        </div>
        <div style={{ margin: '5px 12px 12px', padding: '11px', background: '#101e27', border: '1px solid #243b46', borderRadius: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#8aa9b4', fontSize: 10, fontWeight: 600 }}>
            <Info size={13} color="#55c8ec" /> READOUT
          </div>
          <p style={{ margin: '7px 0 0', color: '#617a84', fontSize: 10, lineHeight: 1.5 }}>
            Blue indicates new or brighter V2 content. Red indicates removed or darker V2 content. Neighborhood filtering suppresses isolated compression noise.
          </p>
        </div>
      </div>
    </aside>
  );
}

export default function VideoComparePage() {
  const [versionOne, setVersionOne] = useState<VideoFile | null>(null);
  const [versionTwo, setVersionTwo] = useState<VideoFile | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sensitivity, setSensitivity] = useState(24);
  const [isRendering, setIsRendering] = useState(false);
  const [isRecomputing, setIsRecomputing] = useState(false);
  const [mismatchWarning, setMismatchWarning] = useState(false);
  // The wipe defaults to 80% closed / 20% open: most of the map shows the diff
  // dots, with a sliver of the submitted version revealed beyond the divider.
  const [wipePos, setWipePos] = useState(0.8);
  const [announcement, setAnnouncement] = useState('Load two local video files to begin.');
  const [changeEvents, setChangeEvents] = useState<ChangeEvent[]>([]);
  const videoOneRef = useRef<HTMLVideoElement>(null);
  const videoTwoRef = useRef<HTMLVideoElement>(null);
  const scanOneRef = useRef<HTMLVideoElement>(null);
  const scanTwoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const computeSeqRef = useRef(0);
  const debounceRef = useRef<number | null>(null);
  const objectUrls = useRef<string[]>([]);
  const draggingRef = useRef(false);

  const hasVideos = Boolean(versionOne && versionTwo);
  const loadedCount = Number(Boolean(versionOne)) + Number(Boolean(versionTwo));

  const loadFile = useCallback((version: Version, file: File) => {
    const url = URL.createObjectURL(file);
    objectUrls.current.push(url);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.src = url;
    probe.onloadedmetadata = () => {
      const loaded: VideoFile = {
        file,
        url,
        duration: probe.duration,
        width: probe.videoWidth,
        height: probe.videoHeight,
      };
      if (version === 1) setVersionOne(loaded);
      else setVersionTwo(loaded);
      setAnnouncement(`Version ${version} loaded. ${file.name} is ready for comparison.`);
      probe.remove();
    };
    probe.onerror = () => {
      setAnnouncement(`Could not read Version ${version}. Try another local video file.`);
      URL.revokeObjectURL(url);
    };
    probe.load();
  }, []);

  const clearFile = useCallback((version: Version) => {
    if (version === 1) setVersionOne(null);
    else setVersionTwo(null);
    setPlaying(false);
    setCurrentTime(0);
    setAnnouncement(`Version ${version} removed.`);
  }, []);

  useEffect(() => {
    return () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (versionOne && versionTwo) {
      setDuration(Math.min(versionOne.duration, versionTwo.duration));
    } else {
      setDuration(versionOne?.duration ?? versionTwo?.duration ?? 0);
    }
  }, [versionOne, versionTwo]);

  useEffect(() => {
    const one = videoOneRef.current;
    const two = videoTwoRef.current;
    if (!one || !two) return;
    const sync = () => {
      setCurrentTime(one.currentTime || 0);
      if (Math.abs(one.currentTime - two.currentTime) > 0.04) two.currentTime = one.currentTime;
    };
    one.addEventListener('timeupdate', sync);
    one.addEventListener('loadedmetadata', sync);
    return () => {
      one.removeEventListener('timeupdate', sync);
      one.removeEventListener('loadedmetadata', sync);
    };
  }, [versionOne, versionTwo]);

  // Real timeline scan: sample the duration, frame-lock an offscreen video pair at
  // each point, and score the whole frame. Runs off the visible players so it never
  // disturbs the user's playhead. Debounced and cancelable so scrubbing sensitivity
  // or swapping files doesn't pile up scans.
  useEffect(() => {
    if (!hasVideos || !versionOne || !versionTwo) {
      setChangeEvents([]);
      setIsRendering(false);
      return;
    }
    let cancelled = false;

    const runScan = async () => {
      const one = scanOneRef.current;
      const two = scanTwoRef.current;
      if (!one || !two) return;
      setIsRendering(true);
      await waitForFrame(one);
      await waitForFrame(two);
      if (cancelled) return;

      const dur = Math.min(one.duration || 0, two.duration || 0);
      if (!dur || !Number.isFinite(dur)) {
        setIsRendering(false);
        return;
      }

      const W = 160;
      const aspect = ((one.videoWidth / one.videoHeight) + (two.videoWidth / two.videoHeight)) / 2 || 16 / 9;
      const H = Math.max(2, Math.round(W / aspect));
      const ca = document.createElement('canvas');
      const cb = document.createElement('canvas');
      ca.width = cb.width = W;
      ca.height = cb.height = H;
      const cxa = ca.getContext('2d', { willReadFrequently: true });
      const cxb = cb.getContext('2d', { willReadFrequently: true });
      if (!cxa || !cxb) {
        setIsRendering(false);
        return;
      }

      const samples: { time: number; fraction: number; direction: number }[] = [];
      const count = Math.min(60, Math.max(16, Math.round(dur * 2)));
      for (let s = 0; s < count; s += 1) {
        if (cancelled) return;
        const t = count > 1 ? (s / (count - 1)) * dur * 0.999 : 0;
        await seekBoth(one, two, t);
        if (cancelled) return;
        drawContain(cxa, one, one.videoWidth, one.videoHeight, W, H);
        drawContain(cxb, two, two.videoWidth, two.videoHeight, W, H);
        const a = cxa.getImageData(0, 0, W, H);
        const b = cxb.getImageData(0, 0, W, H);
        const core = computeDiffCore(a.data, b.data, W, H, sensitivity);
        samples.push({ time: t, fraction: core.changedFraction, direction: core.netDirection });
      }
      if (cancelled) return;
      setChangeEvents(buildChangeEvents(samples));
      setIsRendering(false);
    };

    const startTimer = window.setTimeout(() => {
      void runScan();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
    };
  }, [hasVideos, versionOne, versionTwo, sensitivity]);

  // Draw the live diff map into the right pane: full diff (darkened V1 + dots),
  // then the submitted version (V2) revealed to the right of the wipe divider.
  const drawDifference = useCallback(() => {
    const canvas = canvasRef.current;
    const one = videoOneRef.current;
    const two = videoTwoRef.current;
    if (!canvas || !one || !two || !one.videoWidth || !two.videoWidth) return;

    const aspectA = one.videoWidth / one.videoHeight;
    const aspectB = two.videoWidth / two.videoHeight;
    const mismatch = Math.abs(aspectA - aspectB) > 0.02;
    setMismatchWarning((prev) => (prev === mismatch ? prev : mismatch));

    const width = 640;
    const aspect = (aspectA + aspectB) / 2 || 16 / 9;
    const height = Math.max(2, Math.round(width / aspect));
    canvas.width = width;
    canvas.height = height;
    const sourceA = document.createElement('canvas');
    const sourceB = document.createElement('canvas');
    sourceA.width = sourceB.width = width;
    sourceA.height = sourceB.height = height;
    const ctxA = sourceA.getContext('2d', { willReadFrequently: true });
    const ctxB = sourceB.getContext('2d', { willReadFrequently: true });
    const output = canvas.getContext('2d');
    if (!ctxA || !ctxB || !output) return;

    drawContain(ctxA, one, one.videoWidth, one.videoHeight, width, height);
    drawContain(ctxB, two, two.videoWidth, two.videoHeight, width, height);
    const a = ctxA.getImageData(0, 0, width, height);
    const b = ctxB.getImageData(0, 0, width, height);

    // Full difference map first.
    const diff = renderDiffImage(a.data, b.data, width, height, sensitivity);
    output.drawImage(diff, 0, 0);

    // Wipe reveal: submitted version (V2) to the right of the divider.
    const split = Math.round(wipePos * width);
    output.save();
    output.beginPath();
    output.rect(split, 0, width - split, height);
    output.clip();
    output.drawImage(sourceB, 0, 0);
    output.restore();

    // Divider + handle.
    output.fillStyle = 'rgba(220, 240, 250, .92)';
    output.fillRect(split - 1, 0, 2, height);
    output.fillStyle = '#9be7ff';
    output.beginPath();
    output.arc(split, height / 2, 7, 0, Math.PI * 2);
    output.fill();
    output.strokeStyle = '#123c4d';
    output.lineWidth = 2;
    output.stroke();
  }, [sensitivity, wipePos]);

  // Recompute the difference map on a frame-locked pair. Debounced so seek
  // scrubbing coalesces; a per-request token drops stale async results. During
  // playback this fires between timeupdate events, so the map tracks the playhead.
  useEffect(() => {
    if (!hasVideos) return;
    const one = videoOneRef.current;
    const two = videoTwoRef.current;
    if (!one || !two) return;
    const seq = (computeSeqRef.current += 1);
    setIsRecomputing(true);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const target = Math.min(currentTime, duration || currentTime || 0);
      void seekBoth(one, two, target).then(() => {
        if (seq !== computeSeqRef.current) return;
        drawDifference();
        setIsRecomputing(false);
      });
    }, 80);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [hasVideos, currentTime, duration, drawDifference]);

  // Redraw instantly on wipe drag / sensitivity change without seeking — the
  // current frames are already painted, only the divider moved.
  useEffect(() => {
    if (!hasVideos) return;
    drawDifference();
  }, [wipePos, sensitivity, hasVideos, drawDifference]);

  const updateWipe = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setWipePos(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)));
  }, []);

  const togglePlayback = useCallback(() => {
    const one = videoOneRef.current;
    const two = videoTwoRef.current;
    if (!one || !two || !hasVideos) {
      setAnnouncement('Load both versions before starting playback.');
      return;
    }
    if (playing) {
      one.pause();
      two.pause();
      setPlaying(false);
      setAnnouncement('Playback paused.');
    } else {
      void Promise.all([one.play(), two.play()])
        .then(() => {
          setPlaying(true);
          setAnnouncement('Synchronized playback running.');
        })
        .catch(() => setAnnouncement('Playback is unavailable until both videos are ready.'));
    }
  }, [hasVideos, playing]);

  const seek = useCallback((time: number) => {
    const next = Math.max(0, Math.min(duration || 0, time));
    if (videoOneRef.current) videoOneRef.current.currentTime = next;
    if (videoTwoRef.current) videoTwoRef.current.currentTime = next;
    setCurrentTime(next);
  }, [duration]);

  const step = useCallback((frames: number) => {
    setPlaying(false);
    videoOneRef.current?.pause();
    videoTwoRef.current?.pause();
    seek(currentTime + frames / FPS);
  }, [currentTime, seek]);

  const reset = useCallback(() => {
    setPlaying(false);
    videoOneRef.current?.pause();
    videoTwoRef.current?.pause();
    seek(0);
    setWipePos(0.8);
    setAnnouncement('Comparison reset to first frame.');
  }, [seek]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      // The diff canvas owns the arrow keys for the wipe divider.
      if (event.target instanceof HTMLCanvasElement) return;
      if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
      if (event.code === 'ArrowLeft') step(-1);
      if (event.code === 'ArrowRight') step(1);
      if (event.code === 'Home') seek(0);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step, togglePlayback, seek]);

  const timelineEvents = useMemo(() => changeEvents.map((event) => ({ ...event, left: duration ? (event.time / duration) * 100 : 0 })), [changeEvents, duration]);
  const progress = duration ? (currentTime / duration) * 100 : 0;
  const dimensions = versionOne && versionTwo
    ? `${versionOne.width || 1920} × ${versionOne.height || 1080}`
    : '—';
  const showAligning = isRecomputing && !playing;

  return (
    <div className="app-shell dark">
      <TopBar
        active="video"
        shortcuts={[['Space', 'Play / pause synchronized playback'], ['← / →', 'Step one frame backward / forward'], ['Home', 'Return to first frame'], ['Drag', 'Drag the wipe divider to reveal the submitted version']]}
        aboutText="A focused local review surface for editorial video version checks. Video files are loaded with local object URLs and are never uploaded."
      />

      <div className="workspace">
        <main className="main-column">
          <div className="main-header">
            <div>
              <div className="eyebrow">POST-PRODUCTION / QC WORKSTATION</div>
              <h1 className="page-title">Video version comparison</h1>
              <p className="page-caption">Verify intentional changes. Catch everything else.</p>
            </div>
            <div className="header-actions">
              <button type="button" className="button" onClick={reset} disabled={!hasVideos} data-testid="button-header-reset"><RotateCcw size={13} /> Reset</button>
            </div>
          </div>

          <div className="content">
            <div className="load-strip">
              <DropZone version={1} video={versionOne} onFile={(file) => loadFile(1, file)} onClear={() => clearFile(1)} />
              <DropZone version={2} video={versionTwo} onFile={(file) => loadFile(2, file)} onClear={() => clearFile(2)} />
            </div>

            <section className="viewer-frame" aria-label="Video comparison viewer">
              <div className="viewer-head">
                <div className="viewer-title"><MonitorPlay size={14} color="#55c7ed" /> COMPARISON VIEWER <span style={{ color: '#506771', font: '9px var(--app-font-mono)' }}>/DIFF MAP</span></div>
              </div>
              <div className="compare-stage">
                {hasVideos ? (
                  <div className="diff-split">
                    <div className="diff-split-v1">
                      <span className="pane-label">V1 · MASTER</span>
                      <video ref={videoOneRef} src={versionOne?.url} preload="auto" playsInline aria-label="Version 1 video" data-testid="video-version-1" />
                    </div>
                    <div className="diff-split-right">
                      <canvas
                        ref={canvasRef}
                        className="diff-canvas"
                        aria-label="Difference map with wipe — drag the divider to wipe the dots off and reveal the submitted version"
                        data-testid="canvas-difference-map"
                        tabIndex={0}
                        style={{ cursor: 'ew-resize', touchAction: 'none', outline: 'none' }}
                        onPointerDown={(event) => {
                          draggingRef.current = true;
                          (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
                          updateWipe(event.clientX);
                        }}
                        onPointerMove={(event) => {
                          if (draggingRef.current) updateWipe(event.clientX);
                        }}
                        onPointerUp={() => { draggingRef.current = false; }}
                        onPointerCancel={() => { draggingRef.current = false; }}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft') setWipePos((p) => Math.max(0, p - 0.02));
                          if (event.key === 'ArrowRight') setWipePos((p) => Math.min(1, p + 0.02));
                        }}
                      />
                      <span className="pane-label">DIFF MAP</span>
                      <span className="pane-label" style={{ left: 'auto', right: 10 }}>REVEAL V2</span>
                      {showAligning && (
                        <div className="diff-recompute" data-testid="status-recomputing"><i className="pulse" /> ALIGNING FRAMES</div>
                      )}
                      {mismatchWarning && (
                        <div className="diff-mismatch" data-testid="status-mismatch"><AlertTriangle size={11} /> Aspect ratios differ — alignment is approximate</div>
                      )}
                      <div className="diff-legend">
                        <span><i className="legend-chip blue" />New / brighter</span>
                        <span><i className="legend-chip red" />Removed / darker</span>
                        <span className="legend-mode">WIPE {Math.round(wipePos * 100)}% · {Math.round((1 - wipePos) * 100)}% OPEN</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="empty-viewer">
                    <div className="empty-inner">
                      <div className="empty-glyph"><Layers3 size={19} /></div>
                      <div className="empty-title">Comparison viewer is standing by</div>
                      <div className="empty-copy">Load both versions to see the master next to a live difference map.</div>
                    </div>
                  </div>
                )}
              </div>
              <div className="viewer-foot">
                <span><strong>{loadedCount}/2</strong> versions loaded</span>
                <span>{dimensions} · {duration ? `${duration.toFixed(2)} sec` : 'Awaiting media'}</span>
                <span className="foot-notice">{isRendering ? <span className="processing"><i className="pulse" /> ANALYZING</span> : hasVideos ? 'SYNC READY' : 'SELECT FILES TO BEGIN'}</span>
              </div>
            </section>

            <div className="transport" aria-label="Playback controls">
              <div className="transport-buttons">
                <button type="button" onClick={() => seek(0)} aria-label="Go to beginning" title="Go to beginning" data-testid="button-go-beginning"><SkipBack size={14} /></button>
                <button type="button" className="frame-button" onClick={() => step(-1)} aria-label="Previous frame" title="Previous frame" data-testid="button-previous-frame"><ChevronLeft size={15} /></button>
                <button type="button" className="play-button" onClick={togglePlayback} aria-label={playing ? 'Pause playback' : 'Play playback'} title={playing ? 'Pause' : 'Play'} data-testid="button-play-pause">{playing ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}</button>
                <button type="button" className="frame-button" onClick={() => step(1)} aria-label="Next frame" title="Next frame" data-testid="button-next-frame"><ChevronRight size={15} /></button>
                <button type="button" onClick={() => seek(duration)} aria-label="Go to end" title="Go to end" data-testid="button-go-end"><SkipForward size={14} /></button>
              </div>
              <div className="seek-wrap">
                <input className="seek" type="range" min="0" max={duration || 1} step="0.001" value={Math.min(currentTime, duration || 1)} onChange={(event) => seek(Number(event.target.value))} aria-label="Playback position" data-testid="input-seek" />
              </div>
              <div className="transport-time" data-testid="text-timecode">{formatTimecode(currentTime)} <span>/ {formatTimecode(duration)}</span></div>
            </div>

            <div className="lower-grid">
              <section className="panel" aria-label="Change timeline">
                <div className="panel-head"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Gauge size={14} color="#62cceb" /><span className="panel-heading">CHANGE TIMELINE</span></div><span className="panel-meta">{changeEvents.length} EVENTS</span></div>
                {isRendering ? (
                  <div className="timeline" data-testid="status-processing"><div className="skeleton" style={{ height: 28 }} /><div className="skeleton" style={{ height: 10, width: '40%', marginTop: 10 }} /></div>
                ) : hasVideos ? (
                  <>
                    <div className="timeline">
                      <div className="timeline-track">
                        <div className="timeline-fill" style={{ width: `${progress}%` }} />
                        {timelineEvents.map((event) => <button type="button" className={`event-mark ${event.kind}`} key={event.id} style={{ left: `${event.left}%` }} onClick={() => seek(event.time)} aria-label={`Jump to ${event.label}`} title={event.label} data-testid={`button-event-${event.id}`} />)}
                        <div className="timeline-cursor" style={{ left: `${progress}%` }} />
                      </div>
                      <div className="timeline-scale"><span>00:00:00</span><span>{formatTimecode(duration / 2, false)}</span><span>{formatTimecode(duration, false)}</span></div>
                    </div>
                    <div className="event-list">
                      {changeEvents.map((event) => <button type="button" className="event-row" key={event.id} onClick={() => seek(event.time)} data-testid={`row-event-${event.id}`}><span className="event-time">{formatTimecode(event.time)}</span><span className="event-name">{event.label}</span><span className={`event-kind ${event.kind}`}>{event.kind === 'blue' ? 'ADDED' : 'REMOVED'}</span></button>)}
                      {changeEvents.length === 0 && <div className="no-events">No material changes detected at this sensitivity.</div>}
                    </div>
                  </>
                ) : <div className="no-events"><SlidersHorizontal size={16} style={{ marginBottom: 7, opacity: .7 }} /><br />Load both files to populate the change timeline.</div>}
              </section>
              <section className="panel" aria-label="Comparison settings">
                <div className="panel-head"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Settings2 size={14} color="#62cceb" /><span className="panel-heading">READOUT SETTINGS</span></div></div>
                 <div style={{ padding: '11px 12px', color: '#677d86', fontSize: 10, lineHeight: 1.55 }}>The master plays on the left; the right pane shows a live difference map (darkened V1 with change dots) at the same frame. Drag the wipe divider to reveal the submitted frame under the dots — it opens 20% by default.</div>
                <div style={{ borderTop: '1px solid #1e2f38', padding: '11px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}><AlertTriangle size={13} color="#d68568" style={{ flex: '0 0 auto', marginTop: 1 }} /><span style={{ color: '#927a6d', fontSize: 10, lineHeight: 1.45 }}>Pixel comparison is a visual aid, not a substitute for a calibrated review.</span></div>
              </section>
            </div>
          </div>
        </main>
        <Inspector sensitivity={sensitivity} setSensitivity={setSensitivity} hasVideos={hasVideos} onReset={reset} />
      </div>
      {versionOne && versionTwo && (
        <div aria-hidden="true" style={{ position: 'absolute', left: -99999, top: 0, width: 1, height: 1, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <video ref={videoTwoRef} src={versionTwo.url} playsInline preload="auto" data-testid="video-version-2-hidden" />
          <video ref={scanOneRef} src={versionOne.url} muted playsInline preload="auto" data-testid="video-scan-1" />
          <video ref={scanTwoRef} src={versionTwo.url} muted playsInline preload="auto" data-testid="video-scan-2" />
        </div>
      )}
      <div className="sr-only" role="status" aria-live="polite" data-testid="status-announcement">{announcement}</div>
    </div>
  );
}
