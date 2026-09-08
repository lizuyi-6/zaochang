import React, { useEffect, useRef } from 'react';
import {
  ArrowUp,
  Circle,
  CircleAlert,
  CircleHelp,
  Highlighter,
  Pencil,
  Plus,
  MicOff,
  Mic,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import type { PanelEntry, Rich } from './lessonScript';
import { getSystemEndText } from './lessonScript';
import { useI18n } from '../i18n';
import { L } from '../i18n/content';

export type VoiceState = 'off' | 'preparing' | 'listening';
export type PlayStatus = 'explaining' | 'yourturn' | 'ended' | 'idle';

const ChipIcon: React.FC<{ icon: NonNullable<PanelEntry['chipIcon']> }> = ({ icon }) => {
  switch (icon) {
    case 'pencil': return <Pencil />;
    case 'circle': return <Circle />;
    case 'highlight': return <Highlighter />;
    case 'sparkle': return <Sparkles />;
    case 'help': return <CircleHelp />;
  }
};

function renderRich(r: Rich): React.ReactNode {
  return r.map((s, i) => (
    <span key={i} style={{ fontStyle: s.i ? 'italic' : undefined, fontWeight: s.b ? 600 : undefined }}>
      {s.t}
    </span>
  ));
}

export const ConversationPanel: React.FC<{
  entries: PanelEntry[];
  status: PlayStatus;
  systemEnd: boolean;
  voice: VoiceState;
  inputValue: string;
  onInput: (v: string) => void;
  onSend: () => void;
  onMic: () => void;
  onAddImage: () => void;
  onClose: () => void;
  placeholder: string;
  canSend: boolean;
}> = ({
  entries,
  status,
  systemEnd,
  voice,
  inputValue,
  onInput,
  onSend,
  onMic,
  onAddImage,
  onClose,
  placeholder,
  canSend,
}) => {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, status, systemEnd]);

  /* auto-grow composer (long typed answers expand upward, ref 35/56) */
  useEffect(() => {
    const el = taRef.current;
    if (el) {
      el.style.height = '0px';
      el.style.height = Math.min(el.scrollHeight, 118) + 'px';
    }
  }, [inputValue]);

  return (
    <div className="wb-panel">
      <div className="wb-panel-head">
        <h3>{t('courseSession.conversationRecord')}</h3>
        <button onClick={onClose} aria-label="Close conversation">
          <X size={15} />
        </button>
      </div>
      <div className="wb-panel-scroll" ref={scrollRef}>
        {entries.map((e) => {
          if (e.kind === 'chip') {
            return (
              <div className="wb-chip" key={e.id}>
                {e.chipIcon && <ChipIcon icon={e.chipIcon} />}
                <span>{e.chipText}</span>
              </div>
            );
          }
          if (e.kind === 'user') {
            return (
              <div className="wb-user" key={e.id}>
                {e.text ? renderRich(e.text) : null}
              </div>
            );
          }
          if (e.kind === 'image') {
            return (
              <div className="wb-user wb-user-image" key={e.id}>
                {e.url ? <img src={e.url} alt={e.name ?? ''} /> : null}
                {e.name ? <span className="wb-user-image-name">{e.name}</span> : null}
              </div>
            );
          }
          return (
            <p className="wb-msg" key={e.id}>
              {e.text ? renderRich(e.text) : null}
            </p>
          );
        })}
        {systemEnd ? (
          <div className="wb-system-end">
            <CircleAlert size={12} />
            <span>{getSystemEndText()}</span>
          </div>
        ) : status === 'explaining' ? (
          <div className="wb-status">
            <span className="dots">•••</span>
            <span>{t('courseSession.narratingReply')}</span>
          </div>
        ) : status === 'yourturn' ? (
          <div className="wb-status">
            <CircleHelp size={12} />
            <span>{t('whiteboard.action.askOpen')}</span>
          </div>
        ) : null}
      </div>
      <div className="wb-composer-wrap">
        {voice === 'preparing' && <div className="wb-voice-strip">{L('Getting the microphone ready...', '正在准备麦克风…')}</div>}
        {voice === 'listening' && <div className="wb-voice-strip">{L('Voice input on — the tutor is listening', '语音输入已开启——老师正在听')}</div>}
        <div className={`wb-composer${voice !== 'off' ? ' joined' : ''}`}>
          <button
            className={`plus${voice === 'listening' ? ' dim' : ''}`}
            aria-label="Add image"
            onClick={onAddImage}
            disabled={voice === 'listening'}
          >
            <Plus size={15} />
          </button>
          <textarea
            rows={1}
            ref={taRef}
            value={inputValue}
            onChange={(e) => onInput(e.target.value)}
            placeholder={voice === 'listening' ? t('courseSession.voiceListeningPlaceholder') : placeholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <button
            className={`mic${voice === 'listening' ? ' on' : voice === 'preparing' ? ' prep' : ''}`}
            onClick={onMic}
            aria-label="Voice input"
          >
            {voice !== 'off' ? <Mic size={15} /> : <MicOff size={15} />}
          </button>
          {status === 'explaining' && voice !== 'listening' ? (
            <button className="send stop" aria-label="Stop">
              <Square size={13} fill="currentColor" />
            </button>
          ) : voice === 'listening' ? (
            <button className="send stop" onClick={onMic} aria-label="Stop listening">
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button className={`send${canSend ? ' active' : ''}`} onClick={onSend} aria-label="Send">
              <ArrowUp size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
