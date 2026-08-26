import { useState } from 'react';
import {
  Aperture,
  AudioLines,
  CircleHelp,
  Film,
  Image as ImageIcon,
  Keyboard,
  X,
} from 'lucide-react';
import { Link } from 'wouter';

export type MediaType = 'video' | 'audio' | 'image';

const DEFAULT_ABOUT =
  'FrameCheck keeps media in your browser. Files are loaded with local object URLs and are never uploaded.';

type TopBarProps = {
  active: MediaType;
  shortcuts?: Array<[string, string]>;
  aboutText?: string;
};

const NAV_ITEMS: Array<{ type: MediaType; label: string; icon: typeof Film }> = [
  { type: 'video', label: 'Video', icon: Film },
  { type: 'audio', label: 'Audio', icon: AudioLines },
  { type: 'image', label: 'Image', icon: ImageIcon },
];

export function TopBar({ active, shortcuts, aboutText = DEFAULT_ABOUT }: TopBarProps) {
  const [panel, setPanel] = useState<'shortcuts' | 'help' | null>(null);

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Aperture size={16} /></div>
          <div>
            <div className="brand-name">FRAMECHECK</div>
            <div className="brand-sub">VERSION COMPARISON / LOCAL QC</div>
          </div>
        </div>
        <nav className="media-nav" aria-label="Media type">
          {NAV_ITEMS.map(({ type, label, icon: Icon }) => (
            <Link
              key={type}
              href={`/${type}`}
              className={active === type ? 'active' : ''}
              aria-current={active === type ? 'page' : undefined}
              data-testid={`nav-${type}`}
            >
              <Icon size={13} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="topbar-meta">
          <span className="session-label"><span className="status-light" />LOCAL SESSION</span>
          <span>NO CLOUD TRANSFER</span>
          {shortcuts && (
            <button className="topbar-tool" type="button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts" onClick={() => setPanel('shortcuts')} data-testid="button-shortcuts"><Keyboard size={15} /></button>
          )}
          <button className="topbar-tool" type="button" aria-label="Help" title="Help" onClick={() => setPanel('help')} data-testid="button-help"><CircleHelp size={15} /></button>
        </div>
      </header>
      {panel && (
        <div
          role="presentation"
          onClick={() => setPanel(null)}
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
              <span className="panel-heading" id="utility-panel-title">{panel === 'shortcuts' ? 'KEYBOARD SHORTCUTS' : 'ABOUT FRAMECHECK'}</span>
              <button type="button" className="topbar-tool" aria-label="Close dialog" onClick={() => setPanel(null)} data-testid="button-close-dialog"><X size={15} /></button>
            </div>
            {panel === 'shortcuts' && shortcuts ? (
              <div style={{ padding: '8px 13px 14px' }}>
                {shortcuts.map(([key, label]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, padding: '10px 0', borderBottom: '1px solid #21323c', color: '#8ca0a8', fontSize: 11 }}>
                    <span>{label}</span><kbd style={{ minWidth: 54, padding: '4px 6px', textAlign: 'center', color: '#bdebf9', background: '#162c37', border: '1px solid #335260', borderRadius: 3, font: '10px var(--app-font-mono)' }}>{key}</kbd>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '13px 14px 17px', color: '#7f969f', fontSize: 11, lineHeight: 1.65 }}>
                <p style={{ margin: '0 0 11px', color: '#c1d0d5' }}>A focused local review surface for editorial version checks.</p>
                <p style={{ margin: 0 }}>{aboutText}</p>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
