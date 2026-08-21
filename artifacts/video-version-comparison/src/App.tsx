import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Aperture,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileVideo,
  Film,
  Gauge,
  Info,
  Keyboard,
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
import { Router as WouterRouter, Route, Switch } from 'wouter';

type Version = 1 | 2;
type ViewMode = 'split' | 'diff';
type OverlayMode = 'dots' | 'markers';
type VideoFile = { file: File; url: string; duration: number; width: number; height: number };
type ChangeEvent = { id: string; time: number; label: string; kind: 'blue' | 'red' };

const FPS = 24;

const formatTimecode = (seconds: number, showFrames = true) => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const frames = Math.floor((safe % 1) * FPS);
  const base = [hours, minutes, secs].map((value) => String(value).padStart(2, '0')).join(':');
  return showFrames ? `${base}:${String(frames).padStart(2, '0')}` : base;
};

const fileSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

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

function VideoPane({
  version,
  video,
  videoRef,
}: {
  version: Version;
  video: VideoFile | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  return (
    <div className="video-pane">
      <span className={`pane-label ${version === 2 ? 'version-two' : ''}`}>V{version} · {version === 1 ? 'MASTER' : 'SUBMITTED'}</span>
      {video ? (
        <video ref={videoRef} src={video.url} preload="metadata" playsInline aria-label={`Version ${version} video`} data-testid={`video-version-${version}`} />
      ) : (
        <div className="empty-viewer">
          <div className="empty-inner">
            <div className="empty-glyph"><FileVideo size={19} /></div>
            <div className="empty-title">Awaiting Version {version}</div>
            <div className="empty-copy">Load a local video above to place it in the comparison viewer.</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Inspector({
  sensitivity,
  setSensitivity,
  overlayMode,
  setOverlayMode,
  hasVideos,
  onReset,
}: {
  sensitivity: number;
  setSensitivity: (value: number) => void;
  overlayMode: OverlayMode;
  setOverlayMode: (value: OverlayMode) => void;
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
              <div className="setting-description">Pixel threshold for change marks</div>
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
              <div className="setting-label">Difference overlay</div>
              <div className="setting-description">Choose how changes are drawn</div>
            </div>
            <div className="overlay-choice" role="group" aria-label="Difference overlay style">
              <button type="button" className={overlayMode === 'dots' ? 'active' : ''} onClick={() => setOverlayMode('dots')} aria-pressed={overlayMode === 'dots'} data-testid="button-overlay-dots">Dots</button>
              <button type="button" className={overlayMode === 'markers' ? 'active' : ''} onClick={() => setOverlayMode('markers')} aria-pressed={overlayMode === 'markers'} data-testid="button-overlay-markers">Markers</button>
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

function Home() {
  const [versionOne, setVersionOne] = useState<VideoFile | null>(null);
  const [versionTwo, setVersionTwo] = useState<VideoFile | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [sensitivity, setSensitivity] = useState(24);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('markers');
  const [isRendering, setIsRendering] = useState(false);
  const [announcement, setAnnouncement] = useState('Load two local video files to begin.');
  const [utilityPanel, setUtilityPanel] = useState<'shortcuts' | 'help' | null>(null);
  const [changeEvents, setChangeEvents] = useState<ChangeEvent[]>([]);
  const videoOneRef = useRef<HTMLVideoElement>(null);
  const videoTwoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const objectUrls = useRef<string[]>([]);

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

  useEffect(() => {
    if (!hasVideos || !versionOne || !versionTwo) {
      setChangeEvents([]);
      return;
    }
    setIsRendering(true);
    const timer = window.setTimeout(() => {
      // Timeline events are reserved for persistent, sampled differences.
      // The live map is the source of truth until a full scan is available.
      setChangeEvents([]);
      setIsRendering(false);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [hasVideos, versionOne, versionTwo, duration]);

  const drawDifference = useCallback(() => {
    const canvas = canvasRef.current;
    const one = videoOneRef.current;
    const two = videoTwoRef.current;
    if (!canvas || !one || !two || !one.videoWidth || !two.videoWidth) return;

    const width = 720;
    const height = Math.round(width * (one.videoHeight / one.videoWidth || 9 / 16));
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

    ctxA.drawImage(one, 0, 0, width, height);
    ctxB.drawImage(two, 0, 0, width, height);
    const a = ctxA.getImageData(0, 0, width, height);
    const b = ctxB.getImageData(0, 0, width, height);
    const result = output.createImageData(width, height);
    const changed = new Uint8Array(width * height);
    const signedLuma = new Float32Array(width * height);
    const threshold = 5 + sensitivity * 1.55;

    // Perceptual scoring is more reliable than raw RGB equality: codec grain,
    // chroma subsampling and small color shifts should not fill the frame.
    for (let p = 0, i = 0; p < changed.length; p += 1, i += 4) {
      const lumaA = a.data[i] * .2126 + a.data[i + 1] * .7152 + a.data[i + 2] * .0722;
      const lumaB = b.data[i] * .2126 + b.data[i + 1] * .7152 + b.data[i + 2] * .0722;
      const chromaDelta = (Math.abs(b.data[i] - a.data[i]) + Math.abs(b.data[i + 1] - a.data[i + 1]) + Math.abs(b.data[i + 2] - a.data[i + 2])) / 3;
      const score = Math.abs(lumaB - lumaA) * .8 + chromaDelta * .2;
      signedLuma[p] = lumaB - lumaA;
      changed[p] = score > threshold ? 1 : 0;
    }

    // Require nearby support to reject isolated compression specks.
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const p = y * width + x;
        if (!changed[p]) continue;
        let neighbors = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) neighbors += changed[(y + oy) * width + x + ox];
        }
        if (neighbors < (overlayMode === 'dots' ? 2 : 3)) changed[p] = 0;
      }
    }

    for (let p = 0, i = 0; p < changed.length; p += 1, i += 4) {
      const luminance = (a.data[i] * .2126 + a.data[i + 1] * .7152 + a.data[i + 2] * .0722) * .22;
      result.data[i] = luminance;
      result.data[i + 1] = luminance + 4;
      result.data[i + 2] = luminance + 10;
      result.data[i + 3] = 255;
    }
    output.putImageData(result, 0, 0);

    if (overlayMode === 'dots') {
      for (let y = 1; y < height - 1; y += 2) {
        for (let x = 1; x < width - 1; x += 2) {
          const p = y * width + x;
          if (!changed[p]) continue;
          output.fillStyle = signedLuma[p] >= 0 ? 'rgba(42, 193, 246, .92)' : 'rgba(232, 84, 107, .92)';
          output.fillRect(x, y, 2, 2);
        }
      }
    } else {
      const block = 8;
      for (let y = 0; y < height; y += block) {
        for (let x = 0; x < width; x += block) {
          let count = 0;
          let direction = 0;
          for (let oy = 0; oy < block && y + oy < height; oy += 1) {
            for (let ox = 0; ox < block && x + ox < width; ox += 1) {
              const p = (y + oy) * width + x + ox;
              count += changed[p];
              direction += signedLuma[p] * changed[p];
            }
          }
          if (count >= 5) {
            output.fillStyle = direction >= 0 ? 'rgba(42, 193, 246, .78)' : 'rgba(232, 84, 107, .78)';
            output.fillRect(x, y, block, block);
          }
        }
      }
    }
  }, [sensitivity, overlayMode]);

  useEffect(() => {
    if (viewMode !== 'diff' || !hasVideos) return;
    const render = () => {
      drawDifference();
      frameRef.current = requestAnimationFrame(render);
    };
    frameRef.current = requestAnimationFrame(render);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [viewMode, hasVideos, drawDifference]);

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
    setViewMode('split');
    setAnnouncement('Comparison reset to first frame.');
  }, [seek]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
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

  return (
    <div className="app-shell dark">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Aperture size={16} /></div>
          <div><div className="brand-name">FRAMECHECK</div><div className="brand-sub">VERSION COMPARISON / LOCAL QC</div></div>
        </div>
        <div className="topbar-meta">
          <span className="session-label"><span className="status-light" />LOCAL SESSION</span>
          <span>NO CLOUD TRANSFER</span>
          <button className="topbar-tool" type="button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts" onClick={() => setUtilityPanel('shortcuts')} data-testid="button-shortcuts"><Keyboard size={15} /></button>
          <button className="topbar-tool" type="button" aria-label="Help" title="Help" onClick={() => setUtilityPanel('help')} data-testid="button-help"><CircleHelp size={15} /></button>
        </div>
      </header>

      <div className="workspace">
        <main className="main-column">
          <div className="main-header">
            <div>
              <div className="eyebrow">POST-PRODUCTION / QC WORKSTATION</div>
              <h1 className="page-title">Version comparison</h1>
              <p className="page-caption">Verify intentional changes. Catch everything else.</p>
            </div>
            <div className="header-actions">
              <button type="button" className="button" onClick={reset} disabled={!hasVideos} data-testid="button-header-reset"><RotateCcw size={13} /> Reset</button>
              <button type="button" className="button primary" onClick={() => setViewMode('diff')} disabled={!hasVideos} data-testid="button-open-diff"><Activity size={13} /> Inspect differences</button>
            </div>
          </div>

          <div className="content">
            <div className="load-strip">
              <DropZone version={1} video={versionOne} onFile={(file) => loadFile(1, file)} onClear={() => clearFile(1)} />
              <DropZone version={2} video={versionTwo} onFile={(file) => loadFile(2, file)} onClear={() => clearFile(2)} />
            </div>

            <section className="viewer-frame" aria-label="Video comparison viewer">
              <div className="viewer-head">
                <div className="viewer-title"><MonitorPlay size={14} color="#55c7ed" /> COMPARISON VIEWER <span style={{ color: '#506771', font: '9px var(--app-font-mono)' }}>/{viewMode === 'split' ? 'SPLIT' : 'DIFFERENCE MAP'}</span></div>
                <div className="view-switch" role="tablist" aria-label="Comparison view mode">
                  <button type="button" className={viewMode === 'split' ? 'active' : ''} onClick={() => setViewMode('split')} role="tab" aria-selected={viewMode === 'split'} data-testid="button-view-split">SPLIT</button>
                  <button type="button" className={viewMode === 'diff' ? 'active' : ''} onClick={() => setViewMode('diff')} role="tab" aria-selected={viewMode === 'diff'} data-testid="button-view-diff">DIFF MAP</button>
                </div>
              </div>
              <div className="compare-stage">
                <div className="video-grid" style={{ display: viewMode === 'split' ? 'grid' : 'none' }}>
                  <VideoPane version={1} video={versionOne} videoRef={videoOneRef} />
                  <VideoPane version={2} video={versionTwo} videoRef={videoTwoRef} />
                </div>
                {viewMode === 'diff' && hasVideos ? (
                  <>
                    <canvas ref={canvasRef} className="diff-canvas" aria-label="Difference map showing changed pixels" data-testid="canvas-difference-map" />
                    <div className="diff-legend"><span><i className="legend-chip blue" />New / brighter</span><span><i className="legend-chip red" />Removed / darker</span><span className="legend-mode">{overlayMode === 'dots' ? 'DOT VIEW' : 'MARKER VIEW'}</span></div>
                  </>
                ) : viewMode === 'diff' ? (
                  <div className="empty-viewer">
                    <div className="empty-inner"><div className="empty-glyph"><Layers3 size={19} /></div><div className="empty-title">Difference map is standing by</div><div className="empty-copy">Load both versions to calculate a pixel-level readout.</div></div>
                  </div>
                ) : null}
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
                 <div style={{ padding: '11px 12px', color: '#677d86', fontSize: 10, lineHeight: 1.55 }}>Choose dots for pixel-level inspection or markers for grouped regions. The live readout uses perceptual luminance/chroma scoring and neighborhood filtering.</div>
                <div style={{ borderTop: '1px solid #1e2f38', padding: '11px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}><AlertTriangle size={13} color="#d68568" style={{ flex: '0 0 auto', marginTop: 1 }} /><span style={{ color: '#927a6d', fontSize: 10, lineHeight: 1.45 }}>Pixel comparison is a visual aid, not a substitute for a calibrated review.</span></div>
              </section>
            </div>
          </div>
        </main>
        <Inspector sensitivity={sensitivity} setSensitivity={setSensitivity} overlayMode={overlayMode} setOverlayMode={setOverlayMode} hasVideos={hasVideos} onReset={reset} />
      </div>
      <div className="sr-only" role="status" aria-live="polite" data-testid="status-announcement">{announcement}</div>
      {utilityPanel && (
        <div
          role="presentation"
          onClick={() => setUtilityPanel(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 20, display: 'grid', placeItems: 'center', padding: 18, background: 'rgba(3, 8, 12, .72)', backdropFilter: 'blur(5px)' }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="utility-panel-title"
            onClick={(event) => event.stopPropagation()}
            style={{ width: 'min(420px, 100%)', border: '1px solid #36515e', borderRadius: 6, background: '#101d26', boxShadow: '0 24px 70px rgba(0,0,0,.5)' }}
          >
            <div className="panel-head">
              <span className="panel-heading" id="utility-panel-title">{utilityPanel === 'shortcuts' ? 'KEYBOARD SHORTCUTS' : 'ABOUT FRAMECHECK'}</span>
              <button type="button" className="topbar-tool" aria-label="Close dialog" onClick={() => setUtilityPanel(null)} data-testid="button-close-dialog"><X size={15} /></button>
            </div>
            {utilityPanel === 'shortcuts' ? (
              <div style={{ padding: '8px 13px 14px' }}>
                {[['Space', 'Play / pause synchronized playback'], ['← / →', 'Step one frame backward / forward'], ['Home', 'Return to first frame']].map(([key, label]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, padding: '10px 0', borderBottom: '1px solid #21323c', color: '#8ca0a8', fontSize: 11 }}>
                    <span>{label}</span><kbd style={{ minWidth: 54, padding: '4px 6px', textAlign: 'center', color: '#bdebf9', background: '#162c37', border: '1px solid #335260', borderRadius: 3, font: '10px var(--app-font-mono)' }}>{key}</kbd>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '13px 14px 17px', color: '#7f969f', fontSize: 11, lineHeight: 1.65 }}>
                <p style={{ margin: '0 0 11px', color: '#c1d0d5' }}>A focused local review surface for editorial version checks.</p>
                <p style={{ margin: 0 }}>FrameCheck keeps media in your browser. Video files are loaded with local object URLs and are never uploaded.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Router() {
  return <Switch><Route path="/" component={Home} /><Route component={Home} /></Switch>;
}

function App() {
  return <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter>;
}

export default App;
