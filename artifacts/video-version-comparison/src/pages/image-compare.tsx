import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Gauge,
  Image as ImageIcon,
  Info,
  Layers3,
  MonitorPlay,
  PanelRight,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';

import { TopBar } from '@/components/topbar';
import { drawContain, renderDiffImage, type DiffOverlayMode } from '@/lib/canvas';

type Version = 1 | 2;
type ViewMode = 'split' | 'diff' | 'wipe';
type ImageFile = { file: File; url: string; width: number; height: number };

const fileSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function DropZone({
  version,
  image,
  onFile,
  onClear,
}: {
  version: Version;
  image: ImageFile | null;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  return (
    <div className={`drop-zone ${image ? 'loaded' : ''}`} data-testid={`drop-zone-version-${version}`}>
      <input
        type="file"
        accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp"
        aria-label={`Load Version ${version} image`}
        data-testid={`input-version-${version}`}
        onChange={(event) => {
          const next = event.target.files?.[0];
          if (next) onFile(next);
          event.currentTarget.value = '';
        }}
      />
      <div className="drop-icon">{image ? <ImageIcon size={16} /> : <Upload size={16} />}</div>
      <div className="drop-copy">
        <div className="drop-label">Version {version}</div>
        <div className="drop-file">
          {image ? `${image.file.name} · ${fileSize(image.file.size)}` : 'Choose a local image file'}
        </div>
      </div>
      {image ? (
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

function ImagePane({
  version,
  image,
  imgRef,
}: {
  version: Version;
  image: ImageFile | null;
  imgRef: React.RefObject<HTMLImageElement | null>;
}) {
  return (
    <div className="video-pane">
      <span className={`pane-label ${version === 2 ? 'version-two' : ''}`}>V{version} · {version === 1 ? 'MASTER' : 'SUBMITTED'}</span>
      {image ? (
        <img ref={imgRef} src={image.url} alt={`Version ${version} image`} data-testid={`image-version-${version}`} />
      ) : (
        <div className="empty-viewer">
          <div className="empty-inner">
            <div className="empty-glyph"><ImageIcon size={19} /></div>
            <div className="empty-title">Awaiting Version {version}</div>
            <div className="empty-copy">Load a local image above to place it in the comparison viewer.</div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageInspector({
  sensitivity,
  setSensitivity,
  overlayMode,
  setOverlayMode,
  hasImages,
  onReset,
}: {
  sensitivity: number;
  setSensitivity: (value: number) => void;
  overlayMode: DiffOverlayMode;
  setOverlayMode: (value: DiffOverlayMode) => void;
  hasImages: boolean;
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
          <span className="panel-meta">QC-IMG</span>
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
              <div className="setting-label">Color space</div>
              <div className="setting-description">Pixel pipeline</div>
            </div>
            <span style={{ color: '#94aab2', font: '10px var(--app-font-mono)' }}>sRGB</span>
          </div>
        </div>
        <div style={{ borderTop: '1px solid #1e2e38', padding: '13px 12px' }}>
          <button type="button" className="button" style={{ width: '100%', justifyContent: 'center' }} onClick={onReset} disabled={!hasImages} data-testid="button-reset">
            <RotateCcw size={13} /> Reset comparison
          </button>
        </div>
        <div style={{ margin: '5px 12px 12px', padding: '11px', background: '#101e27', border: '1px solid #243b46', borderRadius: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#8aa9b4', fontSize: 10, fontWeight: 600 }}>
            <Info size={13} color="#55c8ec" /> READOUT
          </div>
          <p style={{ margin: '7px 0 0', color: '#617a84', fontSize: 10, lineHeight: 1.5 }}>
            Blue indicates new or brighter V2 pixels. Red indicates removed or darker V2 pixels. Neighborhood filtering suppresses isolated compression noise.
          </p>
        </div>
      </div>
    </aside>
  );
}

export default function ImageComparePage() {
  const [versionOne, setVersionOne] = useState<ImageFile | null>(null);
  const [versionTwo, setVersionTwo] = useState<ImageFile | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [sensitivity, setSensitivity] = useState(24);
  const [overlayMode, setOverlayMode] = useState<DiffOverlayMode>('markers');
  const [isRendering, setIsRendering] = useState(false);
  const [mismatchWarning, setMismatchWarning] = useState(false);
  const [wipePos, setWipePos] = useState(0.5);
  const [announcement, setAnnouncement] = useState('Load two local image files to begin.');
  const imgOneRef = useRef<HTMLImageElement>(null);
  const imgTwoRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wipeRef = useRef<HTMLCanvasElement>(null);
  const objectUrls = useRef<string[]>([]);
  const draggingRef = useRef(false);

  const hasImages = Boolean(versionOne && versionTwo);
  const loadedCount = Number(Boolean(versionOne)) + Number(Boolean(versionTwo));

  const loadFile = useCallback((version: Version, file: File) => {
    const url = URL.createObjectURL(file);
    objectUrls.current.push(url);
    const probe = document.createElement('img');
    probe.onload = () => {
      const loaded: ImageFile = { file, url, width: probe.naturalWidth, height: probe.naturalHeight };
      if (version === 1) setVersionOne(loaded);
      else setVersionTwo(loaded);
      setAnnouncement(`Version ${version} loaded. ${file.name} is ready for comparison.`);
      probe.remove();
    };
    probe.onerror = () => {
      setAnnouncement(`Could not read Version ${version}. Try another local image file.`);
      URL.revokeObjectURL(url);
    };
    probe.src = url;
  }, []);

  const clearFile = useCallback((version: Version) => {
    if (version === 1) setVersionOne(null);
    else setVersionTwo(null);
    setAnnouncement(`Version ${version} removed.`);
  }, []);

  useEffect(() => {
    return () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  // Difference map.
  useEffect(() => {
    if (viewMode !== 'diff' || !versionOne || !versionTwo) return;
    const canvas = canvasRef.current;
    const one = imgOneRef.current;
    const two = imgTwoRef.current;
    if (!canvas || !one || !two || !one.naturalWidth || !two.naturalWidth) return;
    setIsRendering(true);

    const aspectA = one.naturalWidth / one.naturalHeight;
    const aspectB = two.naturalWidth / two.naturalHeight;
    setMismatchWarning(Math.abs(aspectA - aspectB) > 0.02);

    const width = 1000;
    const aspect = (aspectA + aspectB) / 2 || 1;
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
    if (!ctxA || !ctxB || !output) {
      setIsRendering(false);
      return;
    }

    drawContain(ctxA, one, one.naturalWidth, one.naturalHeight, width, height);
    drawContain(ctxB, two, two.naturalWidth, two.naturalHeight, width, height);
    const a = ctxA.getImageData(0, 0, width, height);
    const b = ctxB.getImageData(0, 0, width, height);

    const diff = renderDiffImage(a.data, b.data, width, height, sensitivity, overlayMode);
    output.drawImage(diff, 0, 0);
    setIsRendering(false);
  }, [viewMode, versionOne, versionTwo, sensitivity, overlayMode]);

  // Wipe view — V1 on the left of the divider, V2 on the right.
  useEffect(() => {
    if (viewMode !== 'wipe' || !versionOne || !versionTwo) return;
    const canvas = wipeRef.current;
    const one = imgOneRef.current;
    const two = imgTwoRef.current;
    if (!canvas || !one || !two || !one.naturalWidth || !two.naturalWidth) return;

    const aspectA = one.naturalWidth / one.naturalHeight;
    const aspectB = two.naturalWidth / two.naturalHeight;
    const width = 1000;
    const aspect = (aspectA + aspectB) / 2 || 1;
    const height = Math.max(2, Math.round(width / aspect));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    drawContain(ctx, one, one.naturalWidth, one.naturalHeight, width, height);
    ctx.save();
    const split = Math.round(wipePos * width);
    ctx.beginPath();
    ctx.rect(split, 0, width - split, height);
    ctx.clip();
    drawContain(ctx, two, two.naturalWidth, two.naturalHeight, width, height);
    ctx.restore();

    ctx.fillStyle = 'rgba(220, 240, 250, .92)';
    ctx.fillRect(split - 1, 0, 2, height);
    ctx.fillStyle = '#9be7ff';
    ctx.beginPath();
    ctx.arc(split, height / 2, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#123c4d';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [viewMode, versionOne, versionTwo, wipePos]);

  const updateWipe = useCallback((clientX: number) => {
    const canvas = wipeRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setWipePos(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)));
  }, []);

  const reset = useCallback(() => {
    setViewMode('split');
    setWipePos(0.5);
    setAnnouncement('Comparison reset.');
  }, []);

  const dimensions = versionOne && versionTwo
    ? `${versionOne.width} × ${versionOne.height}`
    : '—';

  return (
    <div className="app-shell dark">
      <TopBar
        active="image"
        shortcuts={[['Drag', 'Drag the wipe divider to compare'], ['← / →', 'Move the wipe divider']]}
        aboutText="A focused local review surface for image version checks. Images are loaded with local object URLs and are never uploaded."
      />

      <div className="workspace">
        <main className="main-column">
          <div className="main-header">
            <div>
              <div className="eyebrow">POST-PRODUCTION / STILLS QC</div>
              <h1 className="page-title">Image version comparison</h1>
              <p className="page-caption">Pixel-level difference mapping for stills and plates.</p>
            </div>
            <div className="header-actions">
              <button type="button" className="button" onClick={reset} disabled={!hasImages} data-testid="button-header-reset"><RotateCcw size={13} /> Reset</button>
              <button type="button" className="button primary" onClick={() => setViewMode('diff')} disabled={!hasImages} data-testid="button-open-diff"><Activity size={13} /> Inspect differences</button>
            </div>
          </div>

          <div className="content">
            <div className="load-strip">
              <DropZone version={1} image={versionOne} onFile={(file) => loadFile(1, file)} onClear={() => clearFile(1)} />
              <DropZone version={2} image={versionTwo} onFile={(file) => loadFile(2, file)} onClear={() => clearFile(2)} />
            </div>

            <section className="viewer-frame" aria-label="Image comparison viewer">
              <div className="viewer-head">
                <div className="viewer-title"><MonitorPlay size={14} color="#55c7ed" /> COMPARISON VIEWER <span style={{ color: '#506771', font: '9px var(--app-font-mono)' }}>/{viewMode === 'split' ? 'SPLIT' : viewMode === 'diff' ? 'DIFFERENCE MAP' : 'WIPE'}</span></div>
                <div className="view-switch" role="tablist" aria-label="Comparison view mode">
                  <button type="button" className={viewMode === 'split' ? 'active' : ''} onClick={() => setViewMode('split')} role="tab" aria-selected={viewMode === 'split'} data-testid="button-view-split">SPLIT</button>
                  <button type="button" className={viewMode === 'diff' ? 'active' : ''} onClick={() => setViewMode('diff')} role="tab" aria-selected={viewMode === 'diff'} data-testid="button-view-diff">DIFF MAP</button>
                  <button type="button" className={viewMode === 'wipe' ? 'active' : ''} onClick={() => setViewMode('wipe')} role="tab" aria-selected={viewMode === 'wipe'} data-testid="button-view-wipe">WIPE</button>
                </div>
              </div>
              <div className="compare-stage">
                <div className="video-grid" style={{ display: viewMode === 'split' ? 'grid' : 'none' }}>
                  <ImagePane version={1} image={versionOne} imgRef={imgOneRef} />
                  <ImagePane version={2} image={versionTwo} imgRef={imgTwoRef} />
                </div>
                {viewMode === 'diff' && hasImages ? (
                  <>
                    <canvas ref={canvasRef} className="diff-canvas" aria-label="Difference map showing changed pixels" data-testid="canvas-difference-map" />
                    {isRendering && (
                      <div className="diff-recompute" data-testid="status-recomputing"><i className="pulse" /> SCORING PIXELS</div>
                    )}
                    {mismatchWarning && (
                      <div className="diff-mismatch" data-testid="status-mismatch"><AlertTriangle size={11} /> Aspect ratios differ — alignment is approximate</div>
                    )}
                    <div className="diff-legend"><span><i className="legend-chip blue" />New / brighter</span><span><i className="legend-chip red" />Removed / darker</span><span className="legend-mode">{overlayMode === 'dots' ? 'DOT VIEW' : 'MARKER VIEW'}</span></div>
                  </>
                ) : viewMode === 'diff' ? (
                  <div className="empty-viewer">
                    <div className="empty-inner"><div className="empty-glyph"><Layers3 size={19} /></div><div className="empty-title">Difference map is standing by</div><div className="empty-copy">Load both versions to calculate a pixel-level readout.</div></div>
                  </div>
                ) : null}
                {viewMode === 'wipe' && hasImages ? (
                  <canvas
                    ref={wipeRef}
                    className="wipe-canvas"
                    aria-label="Wipe comparison — drag the divider to reveal each version"
                    data-testid="canvas-wipe"
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
                ) : viewMode === 'wipe' ? (
                  <div className="empty-viewer">
                    <div className="empty-inner"><div className="empty-glyph"><ImageIcon size={19} /></div><div className="empty-title">Wipe is standing by</div><div className="empty-copy">Load both versions, then drag the divider to compare.</div></div>
                  </div>
                ) : null}
              </div>
              <div className="viewer-foot">
                <span><strong>{loadedCount}/2</strong> versions loaded</span>
                <span>{dimensions} {versionOne && versionTwo ? `· ${Math.round((versionOne.width / versionOne.height) * 100) / 100} aspect` : '· Awaiting media'}</span>
                <span className="foot-notice">{hasImages ? 'PIXEL SYNC READY' : 'SELECT FILES TO BEGIN'}</span>
              </div>
            </section>

            <div className="lower-grid">
              <section className="panel" aria-label="Difference summary">
                <div className="panel-head"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Gauge size={14} color="#62cceb" /><span className="panel-heading">DIFFERENCE SUMMARY</span></div></div>
                <div style={{ padding: '13px 12px', color: '#677d86', fontSize: 10, lineHeight: 1.55 }}>
                  {viewMode === 'diff' && hasImages ? (
                    <>
                      The map above is computed at a fixed 1000px analysis width with contain-fit alignment, so both files are compared at the same scale. Blue pixels are new or brighter in V2; red pixels are removed or darker. The markers overlay groups nearby changes into reviewable regions.
                    </>
                  ) : (
                    <>
                      Switch to <strong>Diff map</strong> for a pixel-level readout, or <strong>Wipe</strong> to drag a divider across both versions. Both images are contain-fit to the same canvas so differing aspect ratios stay aligned.
                    </>
                  )}
                </div>
                <div style={{ borderTop: '1px solid #1e2f38', padding: '11px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}><AlertTriangle size={13} color="#d68568" style={{ flex: '0 0 auto', marginTop: 1 }} /><span style={{ color: '#927a6d', fontSize: 10, lineHeight: 1.45 }}>Pixel comparison is a visual aid, not a substitute for a calibrated review.</span></div>
              </section>
              <section className="panel" aria-label="Comparison settings">
                <div className="panel-head"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Settings2 size={14} color="#62cceb" /><span className="panel-heading">READOUT SETTINGS</span></div></div>
                <div style={{ padding: '11px 12px', color: '#677d86', fontSize: 10, lineHeight: 1.55 }}>Choose dots for pixel-level inspection or markers for grouped regions. The live readout uses perceptual luminance/chroma scoring and neighborhood filtering.</div>
                <div style={{ borderTop: '1px solid #1e2f38', padding: '11px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}><AlertTriangle size={13} color="#d68568" style={{ flex: '0 0 auto', marginTop: 1 }} /><span style={{ color: '#927a6d', fontSize: 10, lineHeight: 1.45 }}>A global exposure difference is compensated automatically; localized differences are not.</span></div>
              </section>
            </div>
          </div>
        </main>
        <ImageInspector sensitivity={sensitivity} setSensitivity={setSensitivity} overlayMode={overlayMode} setOverlayMode={setOverlayMode} hasImages={hasImages} onReset={reset} />
      </div>

      <div className="sr-only" role="status" aria-live="polite" data-testid="status-announcement">{announcement}</div>
    </div>
  );
}
