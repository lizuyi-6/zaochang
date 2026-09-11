import React, { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  Cpu,
  CircleAlert,
  Keyboard,
  Loader2,
  LogOut,
  Mic,
  Paperclip,
  Send,
  Star,
  Wrench,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { L } from '../i18n/content';
import { AwardPhone, AwardPopper, DeskWriter, TrophyPerson } from '../illustrations';
import { getAwards, getIntroCopy, type PopupKind } from './lessonScript';
import { audioCheck, openFeedbackMail, type AudioCheckResult } from '../actions';
import { modelCheck, pingBackend } from '../backend';
import { uploadFile } from '../materials';
import { toast } from '../toast';
import type { ExportFormat, ExportPage } from '../boardExport';

/* ---------------- Intro (loading) ---------------- */

const Runner: React.FC = () => (
  <>
    <div className="wb-runner-shadow" />
    <svg className="wb-runner-streaks" width="60" height="60" viewBox="0 0 60 60">
      <path d="M4 14 h34 M12 28 h30 M4 42 h26" stroke="#1A1A1A" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.55" />
    </svg>
    <svg className="wb-runner" width="150" height="150" viewBox="0 0 150 150">
      {/* back leg */}
      <path d="M78 96 q-14 10 -22 26" stroke="#1A1A1A" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M52 124 l-8 4" stroke="#1A1A1A" strokeWidth="6" strokeLinecap="round" />
      {/* front leg */}
      <path d="M84 96 q14 8 18 20" stroke="#1A1A1A" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M103 117 l9 2" stroke="#1A1A1A" strokeWidth="6" strokeLinecap="round" />
      {/* torso: white sweater */}
      <path d="M70 52 q-6 24 8 46 q14 4 22 -2 q6 -26 -6 -44 z" fill="#fff" stroke="#1A1A1A" strokeWidth="2.4" />
      {/* arms clutching book */}
      <path d="M72 62 q16 10 26 12 M88 58 q10 8 12 14" stroke="#1A1A1A" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <rect x="94" y="60" width="24" height="20" rx="3" fill="#C8CF2D" stroke="#1A1A1A" strokeWidth="2" transform="rotate(12 106 70)" />
      <path d="M99 66 l14 3 M99 71 l14 3" stroke="#1A1A1A" strokeWidth="1.2" transform="rotate(12 106 70)" />
      {/* head */}
      <circle cx="86" cy="38" r="14" fill="#fff" stroke="#1A1A1A" strokeWidth="2.4" />
      {/* curly hair */}
      <path d="M72 34 q-4 -12 8 -14 q-2 -6 7 -7 q4 -6 11 -2 q8 -2 9 6 q7 3 3 11 q3 7 -4 10 q-14 -10 -34 -4 z" fill="#1A1A1A" />
      {/* face */}
      <circle cx="91" cy="38" r="1.6" fill="#1A1A1A" />
      <path d="M92 45 q4 2 7 0" stroke="#1A1A1A" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  </>
);

export const IntroOverlay: React.FC<{
  onStart: () => void;
  onClose: () => void;
  /** 伪生成课程时由调用方注入话题化标题/正文 */
  title?: string;
  body?: string;
  /** 直播放讲座计划生成中:CTA 变"准备板书"等待态(不可开讲) */
  preparing?: boolean;
}> = ({ onStart, onClose, title, body, preparing }) => {
  const intro = { ...getIntroCopy(), ...(title ? { title } : {}), ...(body ? { body } : {}) };
  return (
    <div className="wb-intro">
      <button className="wb-intro-close" onClick={onClose} aria-label="Close">
        <X size={16} />
      </button>
      <div className="wb-intro-card">
        <div className="wb-intro-art">
          <Runner />
        </div>
        <div className="wb-intro-body">
          <div className="wb-intro-eyebrow">{intro.eyebrow}</div>
          <h2 className="wb-intro-title">{intro.title}</h2>
          <p className="wb-intro-text">{intro.body}</p>
          <button className="wb-intro-cta" onClick={onStart} disabled={preparing}>
            {preparing ? (
              <>
                <Loader2 size={15} className="wb-spin" />
                {L('Preparing this lecture…', '正在准备本讲板书…')}
              </>
            ) : (
              intro.cta
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ---------------- Talk mode ---------------- */

export const TalkModeOverlay: React.FC<{ onStart: () => void }> = ({ onStart }) => {
  const { t } = useI18n();
  const [sel, setSel] = useState<0 | 1 | null>(null);
  return (
    <div className="hk-overlay dark-blur" style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.16)', backdropFilter: 'blur(6px)' }}>
      <div className="wb-talk-card">
        <h3 className="wb-talk-title">{t('courseSession.voiceMode.title')}</h3>
        <p className="wb-talk-sub">{t('courseSession.voiceMode.subtitle')}</p>
        <button className={`wb-talk-opt${sel === 0 ? ' sel' : ''}`} onClick={() => setSel(0)}>
          <span className="tile"><Keyboard size={15} /></span>
          <span>
            <span className="name">{t('courseSession.voiceMode.textTitle')}</span>
            <span className="desc" style={{ display: 'block' }}>
              {t('courseSession.voiceMode.textDesc')}
            </span>
          </span>
          <span className="radio">{sel === 0 && <Check size={12} />}</span>
        </button>
        <button className={`wb-talk-opt${sel === 1 ? ' sel' : ''}`} onClick={() => setSel(1)}>
          <span className="tile"><Mic size={15} /></span>
          <span>
            <span className="name">
              {t('courseSession.voiceMode.voiceTitle')} <span className="beta">BETA</span>
            </span>
            <span className="desc" style={{ display: 'block' }}>
              {t('courseSession.voiceMode.voiceDesc')}
            </span>
          </span>
          <span className="radio">{sel === 1 && <Check size={12} />}</span>
        </button>
        <button className="wb-talk-cta" disabled={sel === null} onClick={onStart}>
          {t('whiteboard.outline.startLearning')}
        </button>
        <p className="wb-talk-foot">
          {t('courseSession.voiceMode.switchHint')}
          <br />
          {t('courseSession.voiceMode.betaHint')}
        </p>
      </div>
    </div>
  );
};

/* ---------------- Awards & unit complete ---------------- */

export const AwardPopup: React.FC<{ kind: PopupKind; onGotIt: () => void }> = ({ kind, onGotIt }) => {
  const { t } = useI18n();
  if (kind === 'unitComplete') return null;
  const a = getAwards()[kind];
  return (
    <div className="wb-award-card">
      <div className="wb-award-art">{a.art === 'phone' ? <AwardPhone size={150} /> : <AwardPopper size={155} />}</div>
      <div className="wb-award-body">
        <div className="wb-award-label">{t('courseSession.rewardAwardLabel')}</div>
        <h3 className="wb-award-name">{a.name}</h3>
        <p className="wb-award-desc">{a.desc}</p>
        <button className="hk-btn-dark wb-award-right" onClick={onGotIt}>
          {t('courseSession.gotIt')}
        </button>
      </div>
    </div>
  );
};

export const UnitCompletePopup: React.FC<{ onChat: () => void; onHome: () => void }> = ({ onChat, onHome }) => {
  const { t } = useI18n();
  return (
  <div className="wb-award-card" style={{ width: 580, height: 235, top: 'calc(50% + 7px)' }}>
    <div className="wb-award-art">
      <TrophyPerson size={150} />
    </div>
    <div className="wb-award-body">
      <div className="wb-award-label">{t('whiteboard.unitComplete.eyebrow')}</div>
      <h3 className="wb-award-headline">{t('courseSession.unitCompleteTitle')}</h3>
      <p className="wb-award-sub">{t('courseSession.unitCompleteDescription', { percent: 18 })}</p>
      <div className="wb-award-btns">
        <button className="hk-btn-ghost" onClick={onChat}>{t('courseSession.continueInChat')}</button>
        <button className="hk-btn-dark" onClick={onHome}>{t('courseSession.backToHome')}</button>
      </div>
    </div>
  </div>
  );
};

/* ---------------- Exit confirm ---------------- */

const ThinkingArt: React.FC = () => (
  <svg width="80" height="90" viewBox="0 0 80 90">
    <circle cx="40" cy="26" r="14" fill="#fff" stroke="#1A1A1A" strokeWidth="2.2" />
    <path d="M27 20 q-2 -12 11 -13 q3 -5 10 -3 q9 -2 11 6 q6 3 2 10 q-12 -8 -34 0 z" fill="#1A1A1A" />
    <circle cx="44" cy="26" r="1.5" fill="#1A1A1A" />
    <path d="M42 33 q4 2 7 0" stroke="#1A1A1A" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    {/* body */}
    <path d="M26 44 q-6 20 4 40 h20 q10 -22 2 -40 q-12 -6 -26 0 z" fill="#fff" stroke="#1A1A1A" strokeWidth="2.2" />
    {/* hand on chin */}
    <path d="M30 52 q10 -2 14 -12" stroke="#1A1A1A" strokeWidth="4" fill="none" strokeLinecap="round" />
    <circle cx="45" cy="39" r="4" fill="#fff" stroke="#1A1A1A" strokeWidth="1.8" />
    {/* ? mark */}
    <path d="M62 10 q6 -6 10 0 q3 5 -2 8 q-3 2 -3 5" stroke="#1A1A1A" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    <circle cx="67" cy="29" r="1.8" fill="#1A1A1A" />
  </svg>
);

export const ExitConfirm: React.FC<{ onKeep: () => void; onExit: () => void }> = ({ onKeep, onExit }) => {
  const { t } = useI18n();
  return (
  <div
      style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(255,255,255,0.42)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onKeep()}
  >
    <div className="wb-exit-card">
      <ThinkingArt />
      <h3>{t('courseSession.exitConfirmTitle')}</h3>
      <p>{t('courseSession.exitConfirmDesc')}</p>
      <div className="wb-exit-btns">
        <button className="keep" onClick={onKeep}>{t('courseSession.exitConfirmCancel')}</button>
        <button className="exit" onClick={onExit}>
          <LogOut size={14} /> {t('courseSession.exitSession')}
        </button>
      </div>
    </div>
  </div>
  );
};

/* ---------------- Still there? ---------------- */

export const StillThere: React.FC<{ onKeep: () => void; onBack: () => void }> = ({ onKeep, onBack }) => {
  const { t } = useI18n();
  const [snooze, setSnooze] = useState(false);
  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div className="wb-idle-card">
        <div className="wb-idle-left">
          <div className="wb-idle-stars">
            <span className="wb-idle-twinkle">:</span>
            {[0, 1, 2, 3].map((i) => (
              <Star key={i} size={17} fill="#F7CE46" color="#1F2937" strokeWidth={1.4} />
            ))}
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
              <defs>
                <linearGradient id="wb-half-star" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="50%" stopColor="#F7CE46" />
                  <stop offset="50%" stopColor="transparent" />
                </linearGradient>
              </defs>
              <polygon
                points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                fill="url(#wb-half-star)" stroke="#1F2937" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
            <span className="wb-idle-twinkle">:</span>
          </div>
          <DeskWriter size={120} stars={false} />
        </div>
        <div className="wb-idle-right">
          <h3>{t('courseSession.idlePromptTitle')}</h3>
          <p>{t('courseSession.idlePromptMessage')}</p>
          <label className="wb-idle-check" onClick={() => setSnooze(!snooze)}>
            <span
              style={{
                width: 16, height: 16, borderRadius: 4,
                border: snooze ? 'none' : '1.5px solid #D1D5DB',
                background: snooze ? '#4B6694' : '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              }}
            >
              {snooze && <Check size={11} />}
            </span>
            {t('courseSession.idlePromptSnooze')}
          </label>
          <div className="wb-idle-btns">
            <button className="wb-exit-btns keep hk-btn-ghost" style={{ height: 37, borderRadius: 999 }} onClick={onKeep}>
              {t('courseSession.idlePromptKeepInChat')}
            </button>
            <button className="hk-btn-dark" style={{ height: 37, borderRadius: 999, boxShadow: 'none' }} onClick={onBack}>
              {t('courseSession.idlePromptBackToCourses')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------------- Session settings ---------------- */

const VOICES: { id: string; name: string; g: [string, string] }[] = [
  { id: 'warm', name: 'Warm', g: ['#F299A0', '#F5B27C'] },
  { id: 'calm', name: 'Calm', g: ['#A9C6E8', '#8FA9C9'] },
  { id: 'bright', name: 'Bright', g: ['#F2A03C', '#F2BE4E'] },
  { id: 'gentle', name: 'Gentle', g: ['#E29BCB', '#BC9BDC'] },
  { id: 'firm', name: 'Professional', g: ['#7FD1C4', '#6FB6D9'] },
  { id: 'lively', name: 'Lively', g: ['#A3D16E', '#66C97F'] },
];
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export interface SessionSettingsValue {
  voice: string;
  speed: number;
  font: 'handwriting' | 'standard';
  dots: boolean;
}

export const SessionSettings: React.FC<{
  value: SessionSettingsValue;
  onChange: (v: SessionSettingsValue) => void;
  onClose: () => void;
  speaking: boolean;
}> = ({ value, onChange, onClose, speaking }) => {
  const { t } = useI18n();
  const [saved, setSaved] = useState(false);
  const cur = VOICES.find((v) => v.id === value.voice) ?? VOICES[1];
  const update = (patch: Partial<SessionSettingsValue>) => {
    onChange({ ...value, ...patch });
    setSaved(true);
  };
  const speedIdx = SPEEDS.indexOf(value.speed);
  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(15,23,42,0.18)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="wb-settings-card">
        <div className="wb-settings-head">
          <h3>{t('sessionSettings.title')}</h3>
          <button className="wb-settings-close" onClick={onClose} aria-label="Close settings">
            <X size={14} />
          </button>
        </div>

        <div className="wb-ss-label">
          {t('tts.voiceOptions')} <span className="wb-ss-cur">{t(`tts.voice.${cur.id}`)}</span>
        </div>
        <div className="wb-voice-grid">
          {VOICES.map((v) => (
            <button key={v.id} className={`wb-voice${value.voice === v.id ? ' sel' : ''}`} onClick={() => update({ voice: v.id })}>
              <span className="ring">
                <span className="grad" style={{ background: `linear-gradient(135deg, ${v.g[0]}, ${v.g[1]})` }} />
              </span>
              <span className="vn">{t(`tts.voice.${v.id}`)}</span>
            </button>
          ))}
        </div>

        <div className="wb-ss-label">
          {t('tts.voiceSpeed')} <span className="wb-ss-cur">{value.speed}×</span>
        </div>
        <div className="wb-speed">
          <div
            className="wb-speed-track"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
              const idx = Math.round(t * (SPEEDS.length - 1));
              update({ speed: SPEEDS[idx] });
            }}
          >
            <div className="wb-speed-fill" style={{ width: `${(speedIdx / (SPEEDS.length - 1)) * 100}%` }} />
            <div className="wb-speed-thumb" style={{ left: `${(speedIdx / (SPEEDS.length - 1)) * 100}%` }} />
          </div>
          <div className="wb-speed-ticks">
            {SPEEDS.map((s) => (
              <span key={s}>{s}×</span>
            ))}
          </div>
        </div>

        <div className="wb-ss-label">{t('sessionSettings.boardFont')}</div>
        <div className="wb-font-cards">
          <button className={`wb-font-card hand${value.font === 'handwriting' ? ' sel' : ''}`} onClick={() => update({ font: 'handwriting' })}>
            <span className="aa">Aa Bb</span>
            <span className="fl">{t('sessionSettings.font.handwriting')}</span>
          </button>
          <button className={`wb-font-card${value.font === 'standard' ? ' sel' : ''}`} onClick={() => update({ font: 'standard' })}>
            <span className="aa">Aa Bb</span>
            <span className="fl">{t('sessionSettings.font.standard')}</span>
          </button>
        </div>

        <div className="wb-ss-label">{t('sessionSettings.display')}</div>
        <div className="wb-display-row">
          <div>
            <div className="t">{t('sessionSettings.backgroundDots')}</div>
            <div className="s">{t('sessionSettings.backgroundDotsDesc')}</div>
          </div>
          <span
            role="switch"
            aria-checked={value.dots}
            onClick={() => update({ dots: !value.dots })}
            style={{
              width: 36, height: 22, borderRadius: 999, cursor: 'pointer', display: 'inline-block',
              background: value.dots ? '#4C6694' : '#D8DCE3', position: 'relative', transition: 'background 0.15s',
            }}
          >
            <span
              style={{
                position: 'absolute', top: 2, left: value.dots ? 16 : 2, width: 18, height: 18,
                borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.15s',
              }}
            />
          </span>
        </div>

        {speaking && (
          <div className="wb-hint">{t('tts.previewPaused')}</div>
        )}
        {saved && <div className="wb-hint">{t('tts.applyNextRound')}</div>}
      </div>
    </div>
  );
};

/* ---------------- Export menu ---------------- */

export const ExportMenu: React.FC<{
  style: React.CSSProperties;
  onClose: () => void;
  onExport: (format: ExportFormat, page: ExportPage) => void;
}> = ({ style, onClose, onExport }) => {
  const { t } = useI18n();
  const item = (format: ExportFormat, page: ExportPage) => () => {
    onClose();
    onExport(format, page);
  };
  return (
  <div className="wb-export-menu" style={style} onMouseLeave={onClose}>
    <div className="grp">{t('courseSession.exportCurrentPage')}</div>
    <div className="it" onClick={item('jpg', 'current')}>JPG</div>
    <div className="it" onClick={item('pdf', 'current')}>PDF</div>
    <div className="grp" style={{ marginTop: 8 }}>{t('courseSession.exportAllPages')}</div>
    <div className="it" onClick={item('jpg', 'all')}>JPG</div>
    <div className="it" onClick={item('pdf', 'all')}>PDF</div>
  </div>
  );
};

/* ---------------- Feedback ---------------- */

export const FeedbackModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [attach, setAttach] = useState<{ name: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (file: File) => {
    setUploading(true);
    const material = await uploadFile(file);
    setUploading(false);
    if (!material) {
      toast(L('Upload failed — please try again', '上传失败，请重试'));
      return;
    }
    setAttach({ name: material.name, url: material.url });
  };

  const submit = () => {
    const body = attach
      ? `${text.trim()}\n\n${L('Attachment', '附件')}: ${attach.name}${attach.url ? ` — ${attach.url}` : ''}`
      : text;
    if (openFeedbackMail(body, t('courseFeedback.title'))) onClose();
  };

  return (
  <div
    style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(15,23,42,0.18)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    onClick={(e) => e.target === e.currentTarget && onClose()}
  >
    <div className="wb-feedback-card">
      <div className="wb-feedback-head">
        <Wrench size={15} /> {t('courseFeedback.title')}
        <button onClick={onClose} aria-label="Close feedback"><X size={15} /></button>
      </div>
      <div className="wb-feedback-info">
        <CircleAlert size={15} /> {t('chatResponse.yourFeedback')}
      </div>
      <textarea
        placeholder={L('Type your message...', '输入你的消息…')}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button className="wb-feedback-attach" onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? <Loader2 size={14} className="wb-spin" /> : <Paperclip size={14} />}
        {attach ? attach.name : t('chatResponse.addAttachmentHint')}
      </button>
      <input
        ref={fileRef}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void pick(file);
        }}
      />
      <div className="wb-feedback-foot">
        <button className="wb-feedback-submit" disabled={!text.trim() || uploading} onClick={submit}>
          {t('chatResponse.submitReport')} <Send size={14} />
        </button>
      </div>
    </div>
  </div>
  );
};

/* ---------------- Connection panel ---------------- */

type Latency = number | null | 'checking';

export const ConnectionPanel: React.FC<{ onClose: () => void; muted: boolean; speaking: boolean }> = ({
  onClose,
  muted,
  speaking,
}) => {
  const { t } = useI18n();
  const [latency, setLatency] = useState<Latency>('checking');
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [ago, setAgo] = useState(0);
  const [audio, setAudio] = useState<AudioCheckResult | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [model, setModel] = useState<{ ok: boolean; ms?: number; reason?: string } | null>(null);
  const [modelBusy, setModelBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  const check = async () => {
    setLatency('checking');
    const ms = await pingBackend();
    setLatency(ms);
    setUpdatedAt(Date.now());
    setAgo(0);
  };

  useEffect(() => {
    void check();
    const iv = window.setInterval(() => void check(), 30_000);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const iv = window.setInterval(() => {
      setAgo((n) => (updatedAt ? Math.round((Date.now() - updatedAt) / 1000) : n));
    }, 1000);
    return () => window.clearInterval(iv);
  }, [updatedAt]);

  const cooling = Date.now() < cooldownUntil;
  const status = latency === 'checking' ? 'unknown' : latency === null ? 'offline' : latency > 1500 ? 'slow' : 'ok';
  const latencyText = latency === 'checking' ? t('netCheck.checking') : latency === null ? '—' : `${latency} ms`;

  const runAudio = async () => {
    if (audioBusy || cooling) return;
    setAudioBusy(true);
    setAudio(null);
    const result = await audioCheck({ muted, speakAloud: !speaking });
    setAudio(result);
    setAudioBusy(false);
    setCooldownUntil(Date.now() + 15_000);
  };

  const runModel = async () => {
    if (modelBusy || cooling) return;
    setModelBusy(true);
    setModel(null);
    const result = await modelCheck();
    setModel(result.ok ? { ok: true, ms: result.latencyMs } : { ok: false, reason: result.reason });
    setModelBusy(false);
    setCooldownUntil(Date.now() + 15_000);
  };

  const audioMetric = (label: string, value: string) => (
    <div className="wb-conn-row" key={label}>
      <span className="k">{label}</span>
      <span className="v">{value}</span>
    </div>
  );

  return (
  <div className="wb-conn" onMouseLeave={onClose}>
    <div className="wb-conn-head">
      <span className={`dot${latency === null ? ' off' : ''}`} />
      <h4>{t(`netCheck.status.${status}.title`)}</h4>
    </div>
    <p className="wb-conn-sub">{t(`netCheck.status.${status}.detail`)}</p>
    <div className="wb-conn-rows">
      <div className="wb-conn-row">
        <span className="k">{t('netCheck.metric.latency')}</span>
        <span className="v">{latencyText}<span className="suf">{t('netCheck.metric.viaSession')}</span></span>
      </div>
      <div className="wb-conn-row"><span className="k">{t('netCheck.metric.server')}</span><span className="v">{latencyText}</span></div>
      <div className="wb-conn-row">
        <span className="k">{t('netCheck.metric.realtime')}</span>
        <span className={`v${latency === null ? '' : ' open'}`}>
          {latency === null ? t('netCheck.metric.realtimeBlocked') : t('netCheck.metric.realtimeOk')}
        </span>
      </div>
    </div>
    <div className="wb-conn-adv">{t('netCheck.advanced.title')}</div>
    <button className="wb-conn-btn" onClick={() => void runAudio()} disabled={audioBusy || cooling}>
      {audioBusy ? <Loader2 size={15} className="wb-spin" /> : <AudioLines size={15} />}
      {audioBusy ? t('netCheck.advanced.running') : t('netCheck.advanced.audio')}
    </button>
    {audio && (
      <div className="wb-conn-result">
        <div className="ttl">{t(`netCheck.audio.${audio.status}.title`)}</div>
        <div className="dsc">{t(`netCheck.audio.${audio.status}.detail`)}</div>
        {typeof audio.synthMs === 'number' && audioMetric(t('netCheck.audio.metricSynth'), `${audio.synthMs} ms`)}
        {typeof audio.speedKbps === 'number' && audioMetric(t('netCheck.audio.metricSpeed'), `${audio.speedKbps} kbps`)}
        {audioMetric(t('netCheck.audio.metricNeeded'), `${audio.neededKbps} kbps`)}
        {!audio.played && audio.status !== 'muted' && <div className="note">{t('netCheck.audio.playbackSkipped')}</div>}
      </div>
    )}
    <button className="wb-conn-btn" onClick={() => void runModel()} disabled={modelBusy || cooling}>
      {modelBusy ? <Loader2 size={15} className="wb-spin" /> : <Cpu size={15} />}
      {modelBusy ? t('netCheck.advanced.running') : t('netCheck.advanced.model')}
    </button>
    {model && (
      <div className="wb-conn-result">
        <div className="ttl">{t(`netCheck.model.${model.ok ? 'ok' : model.reason}.title`)}</div>
        <div className="dsc">{t(`netCheck.model.${model.ok ? 'ok' : model.reason}.detail`)}</div>
        {model.ok && typeof model.ms === 'number' && audioMetric(t('netCheck.model.metricMinimal'), `${model.ms} ms`)}
        {!model.ok && audioMetric(t('netCheck.model.metricMinimal'), t('netCheck.model.noAnswer'))}
        <div className="note">{t('netCheck.model.privacyNote')}</div>
      </div>
    )}
    <div className="wb-conn-foot">
      <span className="upd">
        {updatedAt === null
          ? t('netCheck.checking')
          : ago < 3
            ? t('netCheck.updatedJustNow')
            : t('netCheck.updatedAgo', { seconds: ago })}
      </span>
      <button className="again" onClick={() => void check()}>{t('netCheck.recheck')}</button>
    </div>
    <p className="wb-conn-note">{t('netCheck.autoNote')}</p>
  </div>
  );
};

/* ---------------- Quick check (board bottom) ---------------- */

export const QuickCheck: React.FC<{
  question: string;
  options: string[];
  selected: number | null;
  onSelect: (i: number) => void;
  centerX?: number;
}> = ({ question, options, selected, onSelect }) => {
  const { t } = useI18n();
  return (
  <div className="wb-quickcheck">
    <div className="q">{question}</div>
    <div className="opts">
      {options.map((o, i) => (
        <button
          key={o}
          className={`opt${selected === i ? ' sel' : selected !== null ? ' dim' : ''}`}
          onClick={() => onSelect(i)}
        >
          {o}
          {selected === i && <Check size={14} />}
        </button>
      ))}
    </div>
    <div className="helper">{t('courseSession.ask.orTypeHint')}</div>
  </div>
  );
};

/* ---------------- Listening pill ---------------- */

export const ListenPill: React.FC<{ centerX?: number }> = () => {
  const { t } = useI18n();
  return (
  <div className="wb-listen-pill">
    <span className="dot" /> {t('courseSession.interjectListening')}
  </div>
  );
};
