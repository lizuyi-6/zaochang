import React, { useState } from 'react';
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Download,
  Flag,
  Keyboard,
  LocateFixed,
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
import { CAMERA_ZOOM_STEPS } from './camera';
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
}> = (p) => {
  const [exportOpen, setExportOpen] = useState(false);
  const [zoomTip, setZoomTip] = useState<'in' | 'out' | null>(null);

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
              className="wb-chrome-btn"
              onClick={() => setExportOpen(!exportOpen)}
              aria-label="Export"
            >
              <Download size={17} />
              {p.showDownloadDot && (
                <span className="wb-red-dot" />
              )}
            </button>
            {exportOpen && (
              <ExportMenu
                style={{ position: 'absolute', right: 0, top: 52 }}
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

      {/* Bottom bar transport / action controls with flex layout */}
      <footer className="wb-bottom-bar" aria-label="Playback and conversation actions">
        {/* Bottom-left transport */}
        <div className="wb-cluster wb-cluster-bottom-left">
          <button className="wb-chrome-btn" onClick={p.onTogglePause} aria-label={p.paused ? 'Resume' : 'Pause'}>
            {p.paused || p.idle ? <Play size={17} style={{ marginLeft: 2 }} /> : <Pause size={17} />}
          </button>
          <MuteButton muted={p.muted} onToggle={p.onToggleMute} />
        </div>

        {/* Bottom-right conversation buttons */}
        <div className="wb-cluster wb-cluster-bottom-right">
          {p.panelOpen ? (
            <button className="wb-fab" onClick={p.onTogglePanel} aria-label="Collapse conversation">
              <MessageCircleMore size={18} />
            </button>
          ) : (
            <div className="wb-fab-group">
              <button className="wb-fab mic-off" onClick={p.onMicFab} aria-label="Microphone">
                <MicOff size={17} />
              </button>
              <button className="wb-fab" onClick={p.onTogglePanel} aria-label="Type">
                <Keyboard size={17} />
              </button>
              <button className="wb-fab" onClick={p.onTogglePanel} aria-label="Open conversation">
                <MessageCircleMore size={18} />
              </button>
            </div>
          )}
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
        className="wb-chrome-btn"
        style={{ color: muted ? '#111' : '#525252' }}
        onClick={onToggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
      </button>
      {(hover || muted) && (
        <div className="wb-tooltip below-caret" style={{ left: '50%', transform: 'translateX(-50%)', bottom: 52 }}>
          {muted ? 'Unmute' : 'Mute'}
        </div>
      )}
    </div>
  );
};
