import React, { useRef, useState } from 'react';
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Download,
  Flag,
  LocateFixed,
  MessageCircleMore,
  Mic,
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
import { getIntroCopy, type Rich } from './lessonScript';
import { CaptionBar } from './CaptionBar';
import { CAMERA_ZOOM_STEPS } from './camera';
import type { PlayStatus } from './Panel';
import type { ExportFormat, ExportPage } from '../boardExport';

export const WhiteboardChrome: React.FC<{
  panelOpen: boolean;
  zoom: number;
  onZoom: (z: number) => void;
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  onExport: (format: ExportFormat, page: ExportPage) => void;
  paused: boolean;
  idle: boolean;
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
  titleOverride?: string;
  isFollowing?: boolean;
  onResumeFollow?: () => void;
  caption?: Rich | null;
  capShown?: number;
  typing?: boolean;
  quickCheckActive?: boolean;
  status?: PlayStatus;
}> = (p) => {
  const [exportOpen, setExportOpen] = useState(false);
  /* 导出菜单用 fixed 定位按按钮矩形现算:工具条簇是 overflow:auto 的窄条,
   * 绝对定位的菜单会被裁剪成一条缝(线上实测)。 */
  const [exportPos, setExportPos] = useState<{ top: number; right: number }>({ top: 52, right: 12 });
  const exportAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [zoomTip, setZoomTip] = useState<'in' | 'out' | null>(null);

  const toggleExport = () => {
    if (exportOpen) {
      setExportOpen(false);
      return;
    }
    const rect = exportAnchorRef.current?.getBoundingClientRect();
    if (rect) setExportPos({ top: rect.bottom + 8, right: Math.max(12, window.innerWidth - rect.right) });
    setExportOpen(true);
  };

  const zoomIdx = CAMERA_ZOOM_STEPS.reduce(
    (best, z, i) => (Math.abs(z - p.zoom) < Math.abs(CAMERA_ZOOM_STEPS[best] - p.zoom) ? i : best),
    0,
  );
  const zoomLabel = `${Math.round(p.zoom * 100)}%`;

  return (
    <>
      {/* Top bar header container with flex layout */}
      <header className="wb-top-bar" aria-label="Whiteboard toolbar">
        {/* Left cluster */}
        <div className="wb-cluster wb-cluster-left">
          <button className="wb-chrome-btn" onClick={p.onExit} aria-label="Exit session">
            <X size={18} />
          </button>
          <div className="wb-pill wb-title-pill">
            <span className="wb-title-text">{p.titleOverride ?? getIntroCopy().title}</span>
            <button
              onClick={p.onOpenConn}
              aria-label="Connection status"
              className="wb-conn-btn"
            >
              <AudioLines size={16} />
            </button>
          </div>
        </div>

        {/* Right cluster */}
        <div className="wb-cluster wb-cluster-right">
          {p.isFollowing === false && p.onResumeFollow && (
            <button
              className="wb-pill wb-follow-pill"
              onClick={p.onResumeFollow}
              title="Resume camera following tutor"
              aria-label="Resume camera following tutor"
            >
              <LocateFixed size={15} />
              <span>Resume Focus</span>
            </button>
          )}

          <div className="wb-pill zoom">
            <button
              className="seg"
              onClick={() => p.onZoom(CAMERA_ZOOM_STEPS[Math.max(0, zoomIdx - 1)])}
              onMouseEnter={() => setZoomTip('out')}
              onMouseLeave={() => setZoomTip(null)}
              aria-label="Zoom out"
            >
              <Minus size={15} />
            </button>
            <span className="lbl">{zoomLabel}</span>
            <button
              className="seg"
              onClick={() => p.onZoom(CAMERA_ZOOM_STEPS[Math.min(CAMERA_ZOOM_STEPS.length - 1, zoomIdx + 1)])}
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

          <div className="wb-pill page">
            <button className="seg" onClick={() => p.onPage(p.page - 1)} disabled={p.page <= 1} aria-label="Previous page">
              <ChevronLeft size={15} />
            </button>
            <span className="lbl">{p.page}/{p.pageCount}</span>
            <button className="seg" onClick={() => p.onPage(p.page + 1)} disabled={p.page >= p.pageCount} aria-label="Next page">
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="wb-btn-anchor">
            <button
              ref={exportAnchorRef}
              className="wb-chrome-btn"
              onClick={toggleExport}
              aria-label="Export"
              aria-expanded={exportOpen}
            >
              <Download size={17} />
              {p.showDownloadDot && (
                <span className="wb-red-dot" />
              )}
            </button>
            {exportOpen && (
              <ExportMenu
                style={{ position: 'fixed', top: exportPos.top, right: exportPos.right }}
                onClose={() => setExportOpen(false)}
                onExport={p.onExport}
              />
            )}
          </div>

          <button className="wb-chrome-btn" onClick={p.onOpenFeedback} aria-label="Have an issue?">
            <Flag size={16} />
          </button>
          <button className="wb-chrome-btn" onClick={p.onOpenSettings} aria-label="Session settings">
            <Settings size={17} />
          </button>
        </div>
      </header>

      {/* Unified Caption & Player Dock */}
      <footer className="wb-unified-dock-container" aria-label="Playback and conversation actions">
        <div className="wb-unified-dock">
          {/* Left: Playback controls */}
          <div className="wb-dock-transport">
            <button
              className="wb-dock-btn"
              onClick={p.onTogglePause}
              aria-label={p.paused ? 'Resume' : 'Pause'}
              title={p.paused ? 'Resume' : 'Pause'}
            >
              {p.paused || p.idle ? <Play size={18} style={{ marginLeft: 2 }} /> : <Pause size={18} />}
            </button>
            <MuteButton muted={p.muted} onToggle={p.onToggleMute} />
          </div>

          {/* Center: Live caption / status */}
          <div className="wb-dock-caption-area">
            {p.caption ? (
              <CaptionBar caption={p.caption} shown={p.capShown ?? 0} typing={p.typing ?? false} />
            ) : (
              <div className="wb-dock-caption-placeholder">
                {p.quickCheckActive ? (
                  <span className="wb-dock-qc-hint">Check your understanding above</span>
                ) : p.paused ? (
                  <span className="wb-dock-paused-hint">Paused</span>
                ) : p.status === 'explaining' ? (
                  <span className="wb-dock-explaining-hint">Tutor explaining...</span>
                ) : null}
              </div>
            )}
          </div>

          {/* Right: Interaction actions */}
          <div className="wb-dock-actions">
            <button
              className={`wb-dock-btn${p.voiceOn ? ' active' : ''}`}
              onClick={p.onMicFab}
              aria-label={p.voiceOn ? 'Microphone on' : 'Microphone off'}
              title={p.voiceOn ? 'Microphone on' : 'Microphone off'}
            >
              {p.voiceOn ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <button
              className={`wb-dock-btn${p.panelOpen ? ' panel-active' : ''}`}
              onClick={p.onTogglePanel}
              aria-label={p.panelOpen ? 'Close transcript' : 'Open transcript'}
              title={p.panelOpen ? 'Close transcript' : 'Open transcript'}
            >
              <MessageCircleMore size={18} />
            </button>
          </div>
        </div>
      </footer>
    </>
  );
};

const MuteButton: React.FC<{ muted: boolean; onToggle: () => void }> = ({ muted, onToggle }) => {
  const [hover, setHover] = useState(false);
  return (
    <div className="wb-btn-anchor">
      <button
        className="wb-dock-btn"
        style={{ color: muted ? '#DC2626' : undefined }}
        onClick={onToggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label={muted ? 'Unmute' : 'Mute'}
        title={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      {(hover || muted) && (
        <div className="wb-tooltip below-caret" style={{ left: '50%', transform: 'translateX(-50%)', bottom: 52 }}>
          {muted ? 'Unmute' : 'Mute'}
        </div>
      )}
    </div>
  );
};
