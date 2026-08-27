import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Info,
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
import {
  ANALYSIS_RATE,
  DEFAULT_FFT_SIZE,
  DEFAULT_HOP_SIZE,
  MAX_ANALYSIS_SECONDS,
  compareAudio,
  resample,
  type AudioDiffResult,
} from '../audio/dsp';
import {
  CLASS_COLORS,
  CLASS_LABELS,
  DiffStrip,
  SpectralMap,
  WaveformLane,
} from '../audio/waveform-canvas';

type Version = 1 | 2;
type ViewMode = 'wave' | 'spectral';
type AudioFile = {
  file: File;
  url: string;
  buffer: AudioBuffer;
  mono: Float32Array;
  duration: number;
  truncated: boolean;
};

const fileSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// mm:ss.d — audio-grade readout with tenths instead of video frames.
const formatAudioTime = (seconds: number) => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const d = Math.floor((safe % 1) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${d}`;
};

let decodeContext: OfflineAudioContext | null = null;
function getDecodeContext(): OfflineAudioContext {
  if (!decodeContext) decodeContext = new OfflineAudioContext(1, 1, ANALYSIS_RATE);
  return decodeContext;
}

function DropZone({
  version,
  audio,
  onFile,
  onClear,
}: {
  version: Version;
  audio: AudioFile | null;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  return (
    <div className={`drop-zone ${audio ? 'loaded' : ''}`} data-testid={`drop-zone-version-${version}`}>
      <input
        type="file"
        accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac"
        aria-label={`Load Version ${version} audio`}
        data-testid={`input-version-${version}`}
        onChange={(event) => {
          const next = event.target.files?.[0];
          if (next) onFile(next);
          event.currentTarget.value = '';
        }}
      />
      <div className="drop-icon">{audio ? <AudioLines size={16} /> : <Upload size={16} />}</div>
      <div className="drop-copy">
        <div className="drop-label">Version {version}</div>
        <div className="drop-file">
          {audio ? `${audio.file.name} · ${fileSize(audio.file.size)}` : 'Choose a local audio file'}
        </div>
      </div>
      {audio ? (
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

function AudioInspector({
  sensitivity,
  setSensitivity,
  levelMatch,
  setLevelMatch,
  analysis,
  readout,
  hasAudio,
  onReset,
}: {
  sensitivity: number;
  setSensitivity: (value: number) => void;
  levelMatch: boolean;
  setLevelMatch: (value: boolean) => void;
  analysis: AudioDiffResult | null;
  readout: { cls: number; centroid1: number; centroid2: number } | null;
  hasAudio: boolean;
  onReset: () => void;
}) {
  return (
    <aside className="inspector" style={{ borderLeft: '1px solid #253541', background: '#0c151d' }}>
      <div className="inspector-inner" style={{ position: 'sticky', top: 0 }}>
        <div className="panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Info size={14} color="#62cceb" />
            <span className="panel-heading">INSPECTOR</span>
          </div>
          <span className="panel-meta">AUDIO-01</span>
        </div>
        <div className="settings-list">
          <div className="setting">
            <div>
              <div className="setting-label">Analysis sensitivity</div>
              <div className="setting-description">dB gap for a change to count</div>
            </div>
            <div className="setting-control">
              <input
                className="sensitivity"
                type="range"
                min="2"
                max="12"
                step="0.5"
                value={sensitivity}
                onChange={(event) => setSensitivity(Number(event.target.value))}
                aria-label="Analysis sensitivity"
                data-testid="input-sensitivity"
              />
              <span className="sensitivity-value" data-testid="text-sensitivity">{sensitivity.toFixed(1)} dB</span>
            </div>
          </div>
          <div className="setting">
            <div>
              <div className="setting-label">Auto level match</div>
              <div className="setting-description">Compensate loudness differences</div>
            </div>
            <button
              type="button"
              className={`toggle ${levelMatch ? 'on' : ''}`}
              role="switch"
              aria-checked={levelMatch}
              aria-label="Auto level match"
              onClick={() => setLevelMatch(!levelMatch)}
              data-testid="toggle-level-match"
            />
          </div>
          <div className="setting">
            <div>
              <div className="setting-label">FFT window</div>
              <div className="setting-description">Spectral analysis resolution</div>
            </div>
            <span style={{ color: '#94aab2', font: '10px var(--app-font-mono)' }}>{DEFAULT_FFT_SIZE} / {(DEFAULT_FFT_SIZE / ANALYSIS_RATE * 1000).toFixed(1)} ms</span>
          </div>
          <div className="setting">
            <div>
              <div className="setting-label">Analysis rate</div>
              <div className="setting-description">Mono downmix, resampled</div>
            </div>
            <span style={{ color: '#94aab2', font: '10px var(--app-font-mono)' }}>{(ANALYSIS_RATE / 1000).toFixed(2)} kHz</span>
          </div>
        </div>
        <div style={{ borderTop: '1px solid #1e2e38', padding: '13px 12px' }}>
          <button type="button" className="button" style={{ width: '100%', justifyContent: 'center' }} onClick={onReset} disabled={!hasAudio} data-testid="button-reset">
            <RotateCcw size={13} /> Reset comparison
          </button>
        </div>
        <div style={{ margin: '5px 12px 12px', padding: '11px', background: '#101e27', border: '1px solid #243b46', borderRadius: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#8aa9b4', fontSize: 10, fontWeight: 600 }}>
            <Info size={13} color="#55c8ec" /> READOUT
          </div>
          {analysis ? (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 7, font: '10px var(--app-font-mono)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7fa3ae' }}>
                <span>Playhead class</span>
                <span style={{ color: readout ? CLASS_COLORS[readout.cls] : '#7fa3ae' }}>
                  {readout ? CLASS_LABELS[readout.cls] : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7fa3ae' }}>
                <span>Centroid V1 / V2</span>
                <span>{readout && readout.centroid1 > 0 ? `${readout.centroid1.toFixed(0)}` : '—'} / {readout && readout.centroid2 > 0 ? `${readout.centroid2.toFixed(0)}` : '—'} Hz</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7fa3ae' }}>
                <span>Added / Removed</span>
                <span style={{ color: '#9fd9ec' }}>{formatAudioTime(analysis.stats.addedSeconds)} / <span style={{ color: '#f0a5ad' }}>{formatAudioTime(analysis.stats.removedSeconds)}</span></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7fa3ae' }}>
                <span>Common / Pitch</span>
                <span>{formatAudioTime(analysis.stats.commonSeconds)} / {analysis.stats.pitchShiftSeconds.toFixed(1)}s</span>
              </div>
            </div>
          ) : (
            <p style={{ margin: '7px 0 0', color: '#617a84', fontSize: 10, lineHeight: 1.5 }}>
              Load both versions to compute the spectral readout.
            </p>
          )}
        </div>
        <div style={{ margin: '0 12px 12px', padding: '11px', background: '#101e27', border: '1px solid #243b46', borderRadius: 4 }}>
          <p style={{ margin: 0, color: '#617a84', fontSize: 10, lineHeight: 1.55 }}>
            Blue = frequencies new to V2. Red = frequencies lost from V1. Grey = shared content. Amber marks pitch / tone shifts.
          </p>
        </div>
      </div>
    </aside>
  );
}

export default function AudioComparePage() {
  const [versionOne, setVersionOne] = useState<AudioFile | null>(null);
  const [versionTwo, setVersionTwo] = useState<AudioFile | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('wave');
  const [sensitivity, setSensitivity] = useState(6);
  const [levelMatch, setLevelMatch] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [announcement, setAnnouncement] = useState('Load two local audio files to begin.');
  const [analysis, setAnalysis] = useState<AudioDiffResult | null>(null);
  const audioOneRef = useRef<HTMLAudioElement>(null);
  const audioTwoRef = useRef<HTMLAudioElement>(null);
  const analysisSeqRef = useRef(0);
  const objectUrls = useRef<string[]>([]);

  const hasAudio = Boolean(versionOne && versionTwo);
  const loadedCount = Number(Boolean(versionOne)) + Number(Boolean(versionTwo));
  const truncated = Boolean(versionOne?.truncated || versionTwo?.truncated);

  const loadFile = useCallback(async (version: Version, file: File) => {
    const url = URL.createObjectURL(file);
    objectUrls.current.push(url);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = await getDecodeContext().decodeAudioData(arrayBuffer);
      const channels = Math.min(2, buffer.numberOfChannels);
      const mix = new Float32Array(buffer.length);
      for (let c = 0; c < channels; c += 1) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < buffer.length; i += 1) mix[i] += data[i] / channels;
      }
      const analysis = resample(mix, buffer.sampleRate, ANALYSIS_RATE);
      const maxSamples = MAX_ANALYSIS_SECONDS * ANALYSIS_RATE;
      const truncatedFlag = analysis.length > maxSamples;
      const mono = truncatedFlag ? analysis.slice(0, maxSamples) : analysis;
      const loaded: AudioFile = {
        file,
        url,
        buffer,
        mono,
        duration: mono.length / ANALYSIS_RATE,
        truncated: truncatedFlag,
      };
      if (version === 1) setVersionOne(loaded);
      else setVersionTwo(loaded);
      setAnnouncement(`Version ${version} loaded. ${file.name} is ready for comparison.`);
    } catch {
      setAnnouncement(`Could not decode Version ${version}. Try another local audio file.`);
      URL.revokeObjectURL(url);
    }
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

  // Recompute the spectral difference whenever inputs or settings change.
  // Debounced and token-guarded so rapid slider drags don't pile up work.
  useEffect(() => {
    if (!versionOne || !versionTwo) {
      setAnalysis(null);
      setDuration(0);
      setIsAnalyzing(false);
      return;
    }
    const token = (analysisSeqRef.current += 1);
    setIsAnalyzing(true);
    const timer = window.setTimeout(() => {
      try {
        const result = compareAudio(versionOne.mono, versionTwo.mono, ANALYSIS_RATE, {
          fftSize: DEFAULT_FFT_SIZE,
          hopSize: DEFAULT_HOP_SIZE,
          slackDb: sensitivity,
          levelMatch,
        });
        if (token !== analysisSeqRef.current) return;
        setAnalysis(result);
        setDuration(result.duration);
        setIsAnalyzing(false);
      } catch (error) {
        if (token !== analysisSeqRef.current) return;
        setIsAnalyzing(false);
        console.error('Audio analysis failed:', error);
        setAnnouncement('Analysis failed — try reloading the files or adjusting the sensitivity.');
      }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [versionOne, versionTwo, sensitivity, levelMatch]);

  useEffect(() => {
    const one = audioOneRef.current;
    const two = audioTwoRef.current;
    if (!one || !two) return;
    const sync = () => {
      setCurrentTime(one.currentTime || 0);
      if (Math.abs(one.currentTime - two.currentTime) > 0.08) {
        two.currentTime = one.currentTime;
      }
    };
    one.addEventListener('timeupdate', sync);
    one.addEventListener('loadedmetadata', sync);
    return () => {
      one.removeEventListener('timeupdate', sync);
      one.removeEventListener('loadedmetadata', sync);
    };
  }, [versionOne, versionTwo]);

  const togglePlayback = useCallback(() => {
    const one = audioOneRef.current;
    const two = audioTwoRef.current;
    if (!one && !two) {
      setAnnouncement('Load at least one version before starting playback.');
      return;
    }
    if (playing) {
      one?.pause();
      two?.pause();
      setPlaying(false);
      setAnnouncement('Playback paused.');
    } else {
      const targets = [one, two].filter((el): el is HTMLAudioElement => Boolean(el));
      void Promise.all(targets.map((el) => el.play()))
        .then(() => {
          setPlaying(true);
          setAnnouncement('Synchronized playback running.');
        })
        .catch(() => setAnnouncement('Playback is unavailable until the audio is ready.'));
    }
  }, [playing]);

  const seek = useCallback((time: number) => {
    const next = Math.max(0, Math.min(duration || 0, time));
    if (audioOneRef.current) audioOneRef.current.currentTime = next;
    if (audioTwoRef.current) audioTwoRef.current.currentTime = next;
    setCurrentTime(next);
  }, [duration]);

  const step = useCallback((seconds: number) => {
    setPlaying(false);
    audioOneRef.current?.pause();
    audioTwoRef.current?.pause();
    seek(currentTime + seconds);
  }, [currentTime, seek]);

  const reset = useCallback(() => {
    setPlaying(false);
    audioOneRef.current?.pause();
    audioTwoRef.current?.pause();
    seek(0);
    setViewMode('wave');
    setAnnouncement('Comparison reset to the top of the file.');
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

  const timelineEvents = useMemo(() => (analysis ? analysis.events.map((event) => ({ ...event, left: duration ? (event.time / duration) * 100 : 0 })) : []), [analysis, duration]);
  const progress = duration ? (currentTime / duration) * 100 : 0;

  const readout = useMemo(() => {
    if (!analysis || !duration || analysis.windows.length === 0) return null;
    const wi = Math.min(
      analysis.windows.length - 1,
      Math.floor((currentTime * ANALYSIS_RATE) / analysis.hopSize),
    );
    const w = analysis.windows[Math.max(0, wi)];
    return { cls: w.cls, centroid1: w.centroid1, centroid2: w.centroid2 };
  }, [analysis, currentTime, duration]);

  const eventKindLabel: Record<string, string> = { added: 'ADDED', removed: 'REMOVED', pitch: 'PITCH' };

  return (
    <div className="app-shell dark">
      <TopBar
        active="audio"
        shortcuts={[['Space', 'Play / pause synchronized playback'], ['← / →', 'Step one second backward / forward'], ['Home', 'Return to the top']]}
        aboutText="A focused local review surface for audio version checks. Tonal, pitch, frequency and presence differences are detected from a spectral comparison in your browser — no audio is ever uploaded."
      />

      <div className="workspace">
        <main className="main-column">
          <div className="main-header">
            <div>
              <div className="eyebrow">POST-PRODUCTION / AUDIO QC</div>
              <h1 className="page-title">Audio version comparison</h1>
              <p className="page-caption">Waveforms, spectra and pitch changes — side by side.</p>
            </div>
            <div className="header-actions">
              <button type="button" className="button" onClick={reset} disabled={!hasAudio} data-testid="button-header-reset"><RotateCcw size={13} /> Reset</button>
              <button type="button" className="button primary" onClick={() => setViewMode('spectral')} disabled={!hasAudio} data-testid="button-open-diff"><Activity size={13} /> Open spectral map</button>
            </div>
          </div>

          <div className="content">
            <div className="load-strip">
              <DropZone version={1} audio={versionOne} onFile={(file) => void loadFile(1, file)} onClear={() => clearFile(1)} />
              <DropZone version={2} audio={versionTwo} onFile={(file) => void loadFile(2, file)} onClear={() => clearFile(2)} />
            </div>

            <section className="viewer-frame" aria-label="Audio comparison viewer">
              <div className="viewer-head">
                <div className="viewer-title"><AudioLines size={14} color="#55c7ed" /> COMPARISON VIEWER <span style={{ color: '#506771', font: '9px var(--app-font-mono)' }}>/{viewMode === 'wave' ? 'WAVEFORM' : 'SPECTRAL MAP'}</span></div>
                <div className="view-switch" role="tablist" aria-label="Comparison view mode">
                  <button type="button" className={viewMode === 'wave' ? 'active' : ''} onClick={() => setViewMode('wave')} role="tab" aria-selected={viewMode === 'wave'} data-testid="button-view-wave">WAVEFORM</button>
                  <button type="button" className={viewMode === 'spectral' ? 'active' : ''} onClick={() => setViewMode('spectral')} role="tab" aria-selected={viewMode === 'spectral'} data-testid="button-view-spectral">SPECTRAL MAP</button>
                </div>
              </div>
              <div className="audio-stage">
                {isAnalyzing ? (
                  <div className="empty-viewer">
                    <div className="empty-inner">
                      <div className="processing" style={{ justifyContent: 'center' }}><i className="pulse" /> ANALYZING SPECTRA</div>
                      <div className="empty-copy" style={{ marginTop: 10 }}>Comparing frequency content across the full timeline.</div>
                    </div>
                  </div>
                ) : analysis && versionOne && versionTwo ? (
                  viewMode === 'wave' ? (
                    <div className="wave-view">
                      <div className="wave-row">
                        <span className="pane-label">V1 · MASTER</span>
                        <WaveformLane samples={versionOne.mono} sampleRate={ANALYSIS_RATE} duration={duration} windows={analysis.windows} hopSize={analysis.hopSize} color="#8fd6ea" playhead={currentTime} onSeek={seek} />
                      </div>
                      <div className="wave-row">
                        <span className="pane-label version-two">V2 · SUBMITTED</span>
                        <WaveformLane samples={versionTwo.mono} sampleRate={ANALYSIS_RATE} duration={duration} windows={analysis.windows} hopSize={analysis.hopSize} color="#efb0b4" playhead={currentTime} onSeek={seek} />
                      </div>
                      <div className="wave-diff-row">
                        <span className="pane-label diff-label">Δ</span>
                        <DiffStrip windows={analysis.windows} sampleRate={ANALYSIS_RATE} hopSize={analysis.hopSize} duration={duration} playhead={currentTime} onSeek={seek} />
                      </div>
                    </div>
                  ) : (
                    <SpectralMap result={analysis} playhead={currentTime} onSeek={seek} />
                  )
                ) : (
                  <div className="empty-viewer">
                    <div className="empty-inner">
                      <div className="empty-glyph"><AudioLines size={19} /></div>
                      <div className="empty-title">Audio comparator standing by</div>
                      <div className="empty-copy">Load two versions to display aligned waveforms and a spectral difference map.</div>
                    </div>
                  </div>
                )}
                <div className="diff-legend">
                  <span><i className="legend-chip blue" />Added</span>
                  <span><i className="legend-chip red" />Removed</span>
                  <span><i className="legend-chip grey" />Common</span>
                  <span><i className="legend-chip amber" />Pitch shift</span>
                </div>
              </div>
              <div className="viewer-foot">
                <span><strong>{loadedCount}/2</strong> versions loaded</span>
                <span>{duration ? `${formatAudioTime(duration)} · ${ANALYSIS_RATE / 1000} kHz mono analysis` : 'Awaiting media'}</span>
                <span className="foot-notice">{isAnalyzing ? <span className="processing"><i className="pulse" /> ANALYZING</span> : hasAudio ? 'SPECTRAL SYNC READY' : 'SELECT FILES TO BEGIN'}</span>
              </div>
              {truncated && (
                <div className="diff-mismatch" data-testid="status-truncated"><AlertTriangle size={11} /> Analysis covers the first {formatAudioTime(MAX_ANALYSIS_SECONDS)} of each file</div>
              )}
            </section>

            <div className="transport" aria-label="Playback controls">
              <div className="transport-buttons">
                <button type="button" onClick={() => seek(0)} aria-label="Go to beginning" title="Go to beginning" data-testid="button-go-beginning"><SkipBack size={14} /></button>
                <button type="button" className="frame-button" onClick={() => step(-1)} aria-label="Previous second" title="Previous second" data-testid="button-previous-second"><ChevronLeft size={15} /></button>
                <button type="button" className="play-button" onClick={togglePlayback} aria-label={playing ? 'Pause playback' : 'Play playback'} title={playing ? 'Pause' : 'Play'} data-testid="button-play-pause">{playing ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}</button>
                <button type="button" className="frame-button" onClick={() => step(1)} aria-label="Next second" title="Next second" data-testid="button-next-second"><ChevronRight size={15} /></button>
                <button type="button" onClick={() => seek(duration)} aria-label="Go to end" title="Go to end" data-testid="button-go-end"><SkipForward size={14} /></button>
              </div>
              <div className="seek-wrap">
                <input className="seek" type="range" min="0" max={duration || 1} step="0.001" value={Math.min(currentTime, duration || 1)} onChange={(event) => seek(Number(event.target.value))} aria-label="Playback position" data-testid="input-seek" />
              </div>
              <div className="transport-time" data-testid="text-timecode">{formatAudioTime(currentTime)} <span>/ {formatAudioTime(duration)}</span></div>
            </div>

            <div className="lower-grid">
              <section className="panel" aria-label="Change timeline">
                <div className="panel-head"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Gauge size={14} color="#62cceb" /><span className="panel-heading">CHANGE TIMELINE</span></div><span className="panel-meta">{analysis?.events.length ?? 0} EVENTS</span></div>
                {isAnalyzing ? (
                  <div className="timeline" data-testid="status-processing"><div className="skeleton" style={{ height: 28 }} /><div className="skeleton" style={{ height: 10, width: '40%', marginTop: 10 }} /></div>
                ) : hasAudio && analysis ? (
                  <>
                    <div className="timeline">
                      <div className="timeline-track">
                        <div className="timeline-fill" style={{ width: `${progress}%` }} />
                        {timelineEvents.map((event) => <button type="button" className={`event-mark ${event.kind}`} key={event.id} style={{ left: `${event.left}%` }} onClick={() => seek(event.time)} aria-label={`Jump to ${event.label}`} title={event.label} data-testid={`button-event-${event.id}`} />)}
                        <div className="timeline-cursor" style={{ left: `${progress}%` }} />
                      </div>
                      <div className="timeline-scale"><span>0:00.0</span><span>{formatAudioTime(duration / 2)}</span><span>{formatAudioTime(duration)}</span></div>
                    </div>
                    <div className="event-list">
                      {timelineEvents.map((event) => (
                        <button type="button" className="event-row" key={event.id} onClick={() => seek(event.time)} data-testid={`row-event-${event.id}`}>
                          <span className="event-time">{formatAudioTime(event.time)}</span>
                          <span className="event-name">{event.label}</span>
                          <span className={`event-kind ${event.kind}`}>{eventKindLabel[event.kind]}</span>
                        </button>
                      ))}
                      {timelineEvents.length === 0 && <div className="no-events">No material changes detected at this sensitivity.</div>}
                    </div>
                  </>
                ) : <div className="no-events"><SlidersHorizontal size={16} style={{ marginBottom: 7, opacity: .7 }} /><br />Load both files to populate the change timeline.</div>}
              </section>
              <section className="panel" aria-label="Comparison settings">
                <div className="panel-head"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Settings2 size={14} color="#62cceb" /><span className="panel-heading">READOUT SETTINGS</span></div></div>
                <div style={{ padding: '11px 12px', color: '#677d86', fontSize: 10, lineHeight: 1.55 }}>
                  The comparator aligns both versions on one timeline and scores 72 log-frequency bands per analysis window. Bands present only in V2 read added (blue), only in V1 read removed (red), shared bands read common (grey). A spectral-centroid shift with matching energy reads as a pitch / tone change.
                </div>
                <div style={{ borderTop: '1px solid #1e2f38', padding: '11px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}><AlertTriangle size={13} color="#d68568" style={{ flex: '0 0 auto', marginTop: 1 }} /><span style={{ color: '#927a6d', fontSize: 10, lineHeight: 1.45 }}>Spectral comparison is a listening aid — confirm audible differences by ear.</span></div>
              </section>
            </div>
          </div>
        </main>
        <AudioInspector
          sensitivity={sensitivity}
          setSensitivity={setSensitivity}
          levelMatch={levelMatch}
          setLevelMatch={setLevelMatch}
          analysis={analysis}
          readout={readout}
          hasAudio={hasAudio}
          onReset={reset}
        />
      </div>

      {(versionOne || versionTwo) && (
        <div aria-hidden="true" style={{ position: 'absolute', left: -99999, top: 0, width: 1, height: 1, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          {versionOne && <audio ref={audioOneRef} src={versionOne.url} preload="auto" data-testid="audio-version-1" />}
          {versionTwo && <audio ref={audioTwoRef} src={versionTwo.url} preload="auto" data-testid="audio-version-2" />}
        </div>
      )}

      <div className="sr-only" role="status" aria-live="polite" data-testid="status-announcement">{announcement}</div>
    </div>
  );
}
