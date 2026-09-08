import React, { useState } from 'react';
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Download,
  Flag,
  Keyboard,
  MessageCircleMore,
  MicOff,
  Minus,
  Pause,
  Play,
  Plus,
  Settings,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { ExportMenu } from './Popups';
import { getIntroCopy } from './lessonScript';
import type { ExportFormat, ExportPage } from '../boardExport';

const ZOOM_STEPS = [1, 1.15, 1.3, 1.56];

export const WhiteboardChrome: React.FC<{
  panelOpen: boolean;
  zoom: number;
  onZoom: (z: number) => void;
  /** 当前板书页(1 或 2)与翻页;板书左右各占一页 */
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  onExport: (format: ExportFormat, page: ExportPage) => void;
  paused: boolean;
  idle: boolean; // waiting on user / finished → play triangle
  onTogglePause: () => void;
  muted: boolean;
  onToggleMute: () => void;
  onExit: () => void;
  onOpenSettings: () => void;
  onOpenFeedback: () => void;
  onOpenConn: () => void;
  connOpen: boolean;
  onTogglePanel: () => void;
  showDownloadDot: boolean;
  onMicFab: () => void;
  voiceOn: boolean;
  /** 伪生成课程时覆盖顶部课节 chip 标题 */
  titleOverride?: string;
}> = (p) => {
  const [exportOpen, setExportOpen] = useState(false);
  const [zoomTip, setZoomTip] = useState<'in' | 'out' | null>(null);

  const zoomIdx = ZOOM_STEPS.reduce((best, z, i) => (Math.abs(z - p.zoom) < Math.abs(ZOOM_STEPS[best] - p.zoom) ? i : best), 0);
  const zoomLabel = `${Math.round(p.zoom * 100)}%`;

  // right-group geometry depends on panel state (positions at 1600×900)
  const g = p.panelOpen
    ? { zoomL: 787, pageL: 940, c1: 1062, c2: 1115, c3: 1173 }
    : { zoomL: 1158, pageL: 1300, c1: 1418, c2: 1470, c3: 1524 };

  return (
    <>
      {/* left cluster */}
      <button className="wb-chrome-btn" style={{ left: 34, top: 26 }} onClick={p.onExit} aria-label="Exit session">
        <X size={18} />
      </button>
      <div className="wb-pill wb-title-pill" style={{ left: 93, top: 27 }}>
        <span>{p.titleOverride ?? getIntroCopy().title}</span>
        <button
          onClick={p.onOpenConn}
          aria-label="Connection status"
          style={{ border: 'none', background: 'none', padding: 0, display: 'flex', color: '#34C98E', cursor: 'pointer' }}
        >
          <AudioLines size={16} />
        </button>
      </div>

      {/* right cluster */}
      <div className="wb-pill zoom" style={{ left: g.zoomL, top: 27 }}>
        <button
          className="seg"
          onClick={() => p.onZoom(ZOOM_STEPS[Math.max(0, zoomIdx - 1)])}
          onMouseEnter={() => setZoomTip('out')}
          onMouseLeave={() => setZoomTip(null)}
          aria-label="Zoom out"
        >
          <Minus size={15} />
        </button>
        <span className="lbl">{zoomLabel}</span>
        <button
          className="seg"
          onClick={() => p.onZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, zoomIdx + 1)])}
          onMouseEnter={() => setZoomTip('in')}
          onMouseLeave={() => setZoomTip(null)}
          aria-label="Zoom in"
        >
          <Plus size={15} />
        </button>
        {zoomTip && (
          <div className="wb-tooltip" style={{ left: zoomTip === 'in' ? 82 : -6, top: 52 }}>
            {zoomTip === 'in' ? 'Zoom in' : 'Zoom out'}
          </div>
        )}
      </div>
      <div className="wb-pill page" style={{ left: g.pageL, top: 27 }}>
        <button className="seg" onClick={() => p.onPage(p.page - 1)} disabled={p.page <= 1} aria-label="Previous page">
          <ChevronLeft size={15} />
        </button>
        <span className="lbl">{p.page}/{p.pageCount}</span>
        <button className="seg" onClick={() => p.onPage(p.page + 1)} disabled={p.page >= p.pageCount} aria-label="Next page">
          <ChevronRight size={15} />
        </button>
      </div>
      <button
        className="wb-chrome-btn"
        style={{ left: g.c1, top: 26 }}
        onClick={() => setExportOpen(!exportOpen)}
        aria-label="Export"
      >
        <Download size={17} />
        {p.showDownloadDot && (
          <span style={{ position: 'absolute', top: 9, right: 10, width: 7, height: 7, borderRadius: '50%', background: '#E5484D', border: '1.5px solid #fff' }} />
        )}
      </button>
      {exportOpen && (
        <ExportMenu
          style={{ left: g.c1 - 115, top: 78 }}
          onClose={() => setExportOpen(false)}
          onExport={p.onExport}
        />
      )}
      <button className="wb-chrome-btn" style={{ left: g.c2, top: 26 }} onClick={p.onOpenFeedback} aria-label="Have an issue?">
        <Flag size={16} />
      </button>
      <button className="wb-chrome-btn" style={{ left: g.c3, top: 26 }} onClick={p.onOpenSettings} aria-label="Session settings">
        <Settings size={17} />
      </button>

      {/* bottom-left transport */}
      <button className="wb-chrome-btn" style={{ left: 33, top: 829, width: 46, height: 46 }} onClick={p.onTogglePause} aria-label={p.paused ? 'Resume' : 'Pause'}>
        {p.paused || p.idle ? <Play size={17} style={{ marginLeft: 2 }} /> : <Pause size={17} />}
      </button>
      <MuteButton muted={p.muted} onToggle={p.onToggleMute} />

      {/* bottom-right */}
      {p.panelOpen ? (
        <button className="wb-fab" style={{ left: 1159, top: 829 }} onClick={p.onTogglePanel} aria-label="Collapse conversation">
          <MessageCircleMore size={18} />
        </button>
      ) : (
        <>
          <button className="wb-fab mic-off" style={{ left: 1414, top: 829 }} onClick={p.onMicFab} aria-label="Microphone">
            <MicOff size={17} />
          </button>
          <button className="wb-fab" style={{ left: 1461, top: 829 }} onClick={p.onTogglePanel} aria-label="Type">
            <Keyboard size={17} />
          </button>
          <button className="wb-fab" style={{ left: 1518, top: 829 }} onClick={p.onTogglePanel} aria-label="Open conversation">
            <MessageCircleMore size={18} />
          </button>
        </>
      )}
    </>
  );
};

const MuteButton: React.FC<{ muted: boolean; onToggle: () => void }> = ({ muted, onToggle }) => {
  const [hover, setHover] = useState(false);
  return (
    <>
      <button
        className="wb-chrome-btn"
        style={{ left: 86, top: 830, color: muted ? '#111' : '#525252' }}
        onClick={onToggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
      </button>
      {(hover || muted) && (
        <div className="wb-tooltip" style={{ left: 77, top: 799 }}>
          {muted ? 'Unmute' : 'Mute'}
        </div>
      )}
    </>
  );
};
