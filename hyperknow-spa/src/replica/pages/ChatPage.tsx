import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  ThumbsUp,
  ThumbsDown,
  Plus,
  BookOpen,
  SlidersHorizontal,
  AudioWaveform,
  Gauge,
  ChevronDown,
  ArrowUp,
  Languages,
  Share,
  Volume2,
  Square,
  X,
  FileText,
} from 'lucide-react';
import type { PageProps } from '../types';
import { chatUserMessage } from '../data';
import { chatLive, pingBackend, translateLive } from '../backend';
import { L } from '../i18n/content';
import { LANGUAGES, useI18n } from '../i18n';
import { AvatarCat } from '../illustrations';
import { SupportModal } from '../SupportModal';
import { listenOnce, shareLink, tts, copyText } from '../actions';
import { uploadMaterial } from '../materials';
import { toast } from '../toast';
import './ChatPage.css';

/** staggered fade-in delay for pipeline rows */
const stagger = (i: number): React.CSSProperties => ({ animationDelay: `${i * 120}ms` });

/** 追加的对话消息(参考流水线之后)。 */
interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
  /** 用户消息随附的材料(上传到主站 /api/uploads 后的引用) */
  attachments?: Array<{ name: string; url: string }>;
}

type MenuKind = 'none' | 'translate' | 'tools' | 'mode' | 'status';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];

/** Deep chat view — user prompt + agent pipeline markers + composer. */
export const ChatPage: React.FC<PageProps> = ({ state, set }) => {
  const { t } = useI18n();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [input, setInput] = useState('');
  const [menu, setMenu] = useState<MenuKind>('none');
  const [supportOpen, setSupportOpen] = useState(false);
  const [feedback, setFeedback] = useState<Record<number, 'up' | 'down'>>({});
  const [translations, setTranslations] = useState<Record<number, { lang: string; text: string; loading: boolean }>>({});
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [ping, setPing] = useState<{ state: 'checking' | 'ok' | 'offline'; ms?: number }>({ state: 'checking' });
  const [attachments, setAttachments] = useState<Array<{ name: string; url: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const seededRef = useRef(false);
  const colEndRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** 本屏绑定的后端会话(从历史打开 → 预置;新发消息 → conversation_created 回填) */
  const convIdRef = useRef<string | null>(null);
  const conversationsRef = useRef(state.conversations);
  conversationsRef.current = state.conversations;

  /* 从历史/侧边栏打开的会话:回放其消息(按造场账户隔离的数据)。
   * 依赖 activeConversationId:在同一页切换会话也要换内容;新发消息不会改它。 */
  useEffect(() => {
    const id = state.activeConversationId;
    if (!id) return;
    const conv = conversationsRef.current?.find((c) => c.id === id);
    if (conv) {
      convIdRef.current = conv.id;
      setMsgs(conv.messages.map((m) => ({ role: m.role, text: m.text })));
    }
  }, [state.activeConversationId]);

  /* 朗读状态跟随播放器(播完自动熄灭按钮) */
  useEffect(() => tts.subscribe((on) => !on && setSpeakingIdx(null)), []);

  /* 演示交换(参考截图的 ping 问答+流水线)只在纯演示态展示;一旦有真实会话内容即隐藏 */
  const showDemoExchange = msgs.length === 0 && !state.activeConversationId;

  const lastAssistantIdx = (() => {
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'assistant' && msgs[i].text.trim()) return i;
    return -1;
  })();

  const send = (raw: string) => {
    const text = raw.trim();
    if ((!text && attachments.length === 0) || streaming) return;
    const attached = attachments;
    setInput('');
    setAttachments([]);
    setMsgs((m) => [...m, { role: 'user', text, attachments: attached.length ? attached : undefined }]);
    setMsgs((m) => [...m, { role: 'assistant', text: '' }]);
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    /* 附件以引用形式并入发给导师的正文(后端暂不解析文件本体) */
    const wire = attached.length
      ? `${text}${text ? '\n\n' : ''}${attached.map((a) => `[Attachment: ${a.name} — ${a.url}]`).join('\n')}`
      : text;
    (async () => {
      let acc = '';
      const result = await chatLive(
        wire,
        {
          onChunk: (chunk) => {
            acc += chunk;
            setMsgs((m) => {
              const next = [...m];
              next[next.length - 1] = { role: 'assistant', text: acc };
              return next;
            });
          },
          onConversationId: (id) => {
            convIdRef.current = id;
          },
          onRemaining: (remaining) => {
            set({
              energy: remaining,
              identity: {
                username: state.identity?.username || 'You',
                email: state.identity?.email || '',
                tier: state.identity?.tier || 'FREE',
                credits: remaining,
              },
            });
          },
        },
        { signal: ctrl.signal, conversationId: convIdRef.current ?? undefined, mode: state.replyMode },
      );
      if (!result.ok) {
        const fallback =
          result.reason === 'insufficient'
            ? L(
                'Out of credits — every day brings 20 free credits (2 per chat, 10 per course), resetting at midnight Beijing time.',
                '积分不足——每天免费获得 20 积分（对话 2/次、课程 10/次），北京时间零点自动重置。',
              )
            : result.reason === 'offline'
              ? L(
                  'Offline demo mode — the live tutor is not reachable from here. Course generation still works from its prebuilt library.',
                  '离线演示模式——此处未连接线上导师。课程生成仍可通过预生成库使用。',
                )
              : L('The tutor hit an error. Please try again in a moment.', '导师服务出了点问题，请稍后再试。');
        setMsgs((m) => {
          const next = [...m];
          next[next.length - 1] = { role: 'assistant', text: fallback };
          return next;
        });
      } else if (state.autoSpeak && acc.trim()) {
        void tts.speak(acc, state.voice, state.speed);
      }
      setStreaming(false);
    })();
  };

  /* 首页即时协助带进来的原话:作为追加对话真实发送 */
  useEffect(() => {
    if (state.chatNote && !seededRef.current) {
      seededRef.current = true;
      const note = state.chatNote;
      set({ chatNote: '' });
      send(note);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    colEndRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs]);

  /* ---------------- 真实动作:复制 / 翻译 / 朗读 / 语音 / 附件 / 状态 ---------------- */

  const copyMessage = async (idx: number) => {
    const text = msgs[idx]?.text ?? '';
    if (!text.trim()) return;
    const ok = await copyText(text);
    toast(ok ? t('chatResponse.copied') : L('Could not copy', '复制失败'));
  };

  const readAloud = async (idx: number) => {
    const text = msgs[idx]?.text ?? '';
    if (!text.trim()) return;
    if (speakingIdx === idx) {
      tts.stop();
      setSpeakingIdx(null);
      return;
    }
    setSpeakingIdx(idx);
    await tts.speak(text, state.voice, state.speed);
  };

  const translateMessage = async (idx: number, lang: string) => {
    setMenu('none');
    const text = msgs[idx]?.text ?? '';
    if (!text.trim()) return;
    setTranslations((prev) => ({ ...prev, [idx]: { lang, text: '', loading: true } }));
    const result = await translateLive(text, lang, {
      onChunk: (chunk) =>
        setTranslations((prev) => {
          const cur = prev[idx];
          if (!cur) return prev;
          return { ...prev, [idx]: { ...cur, text: cur.text + chunk } };
        }),
      onRemaining: (remaining) => {
        set({
          energy: remaining,
          identity: {
            username: state.identity?.username || 'You',
            email: state.identity?.email || '',
            tier: state.identity?.tier || 'FREE',
            credits: remaining,
          },
        });
      },
    });
    if (result.ok) {
      setTranslations((prev) => ({ ...prev, [idx]: { lang, text: result.text, loading: false } }));
      return;
    }
    setTranslations((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
    toast(
      result.reason === 'insufficient'
        ? L('Out of credits — translation costs 2 credits', '积分不足——翻译消耗 2 积分')
        : L('Translation failed — please try again', '翻译失败，请重试'),
    );
  };

  const startVoice = () => {
    setMenu('none');
    if (listening) return;
    const started = listenOnce(
      (text) => setInput((prev) => (prev ? `${prev} ${text}` : text)),
      () => setListening(false),
    );
    if (started) setListening(true);
  };

  const pickAttachment = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const material = await uploadMaterial(`chat:${state.identity?.email ?? 'demo'}`, file);
    setUploading(false);
    if (!material) {
      toast(L('Upload failed — please try again', '上传失败，请重试'));
      return;
    }
    setAttachments((prev) => [...prev, { name: material.name, url: material.url }]);
    toast(L(`Attached “${material.name}”`, `已附加《${material.name}》`));
  };

  const openStatus = () => {
    if (menu === 'status') {
      setMenu('none');
      return;
    }
    setMenu('status');
    setPing({ state: 'checking' });
    void pingBackend().then((ms) => setPing(ms === null ? { state: 'offline' } : { state: 'ok', ms }));
  };

  const translateTargets = LANGUAGES.filter((l) => l.code !== 'en');

  return (
  <div className="hk-page cp-page">
    {/* covers the global shell header, which the real product hides on this screen */}
    <div className="cp-header-veil" />

    {/* floating top-right utility cluster */}
    <div className="cp-utility">
      <button
        className="cp-util-btn"
        type="button"
        title={L('Translate', '翻译')}
        onClick={() => (lastAssistantIdx >= 0 ? setMenu(menu === 'translate' ? 'none' : 'translate') : toast(L('Send a message first, then translate the reply.', '先发送一条消息，再翻译回复。')))}
      >
        <Languages size={15} />
      </button>
      <button
        className="cp-util-btn"
        type="button"
        title={t('chatResponse.share')}
        onClick={() => void shareLink(window.location.href, L('Lattice conversation', '见界对话'))}
      >
        <Share size={15} />
      </button>
      <button className="cp-issue" type="button" onClick={() => setSupportOpen(true)}>
        {t('chatResponse.haveAnIssue')}
      </button>
      <AvatarCat size={34} />
    </div>

    {/* 翻译目标语言菜单 */}
    {menu === 'translate' && (
      <>
        <div className="cp-menu-veil" onClick={() => setMenu('none')} />
        <div className="hk-menu cp-menu" style={{ top: 62, right: 108 }}>
          <div className="hk-menu-label">{L('Translate the last reply', '翻译最后一条回复')}</div>
          {translateTargets.map((l) => (
            <button key={l.code} className="hk-menu-item" onClick={() => void translateMessage(lastAssistantIdx, l.code)}>
              {l.nativeLabel}
              <span className="hk-menu-hint">{L('2 credits', '2 积分')}</span>
            </button>
          ))}
        </div>
      </>
    )}

    {/* conversation column */}
    <div className="cp-column">
      {showDemoExchange && (
        <>
          <div className="cp-bubble-row">
            {/* 参考截图的演示交换;真实输入走下方追加对话 */}
            <div className="cp-bubble">{chatUserMessage()}</div>
          </div>

          <div className="cp-pipeline">
            <div className="cp-stage" style={stagger(0)}>
              <span>{t('chatResponse.stepTitles.get_skills_step')}</span>
              <Check size={12} />
            </div>

            <div className="cp-chips" style={stagger(1)}>
              <span className="cp-chip">conceptExplanation</span>
              <span className="cp-chip">systematicLearning</span>
            </div>

            <div className="cp-stage dark" style={stagger(2)}>
              <span>{t('chatResponse.stepTitles.action_plan_step')}</span>
              <Check size={12} />
            </div>

            <div className="cp-stage" style={stagger(3)}>
              <span>{t('chatResponse.stepTitles.memory_recall_step')}</span>
              <Check size={12} />
            </div>

            <div className="cp-memory" style={stagger(4)}>
              <span className="cp-chip">{t('chatResponse.statusMessages.memoryRetrievedLabel')}</span>
              <span className="cp-memory-note">{L('(no relevant memory)', '（无相关记忆）')}</span>
            </div>

            <div className="cp-fork" style={stagger(5)}>
              <div className="cp-stage">
                <span>{t('chatResponse.stepTitles.search_web_step')}</span>
                <Check size={12} />
              </div>
              <div className="cp-stage">
                <span>{L('Searching Papers', '检索论文')}</span>
                <Check size={12} />
              </div>
            </div>

            <div className="cp-dot" style={stagger(6)} />

            <div className="cp-actions" style={stagger(7)}>
              <button
                type="button"
                title={t('chatResponse.copy')}
                onClick={() => void copyText(chatUserMessage()).then((ok) => toast(ok ? t('chatResponse.copied') : L('Could not copy', '复制失败')))}
              >
                <Copy size={16} />
              </button>
              <button type="button" title={L('Good response', '回答有帮助')} onClick={() => toast(L('Thanks for the feedback', '感谢反馈'))}>
                <ThumbsUp size={16} />
              </button>
              <button type="button" title={L('Bad response', '回答没帮助')} onClick={() => toast(L('Thanks — we will use this to improve', '感谢反馈，我们会据此改进'))}>
                <ThumbsDown size={16} />
              </button>
            </div>
          </div>
        </>
      )}

      {/* 追加对话:用户发送的真实消息 + 导师回复(在线流式/离线演示) */}
      {msgs.map((m, i) => (
        <div key={i} className={`cp-bubble-row ${m.role === 'user' ? ' user' : ''}`}>
          <div className={`cp-bubble ${m.role === 'user' ? ' user' : ''}`}>
            {m.text}
            {m.attachments && m.attachments.length > 0 && (
              <div className="cp-bubble-files">
                {m.attachments.map((a) => (
                  <span className="cp-bubble-file" key={a.url || a.name}>
                    <FileText size={12} />
                    {a.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* 每条导师回复的操作行(复制/翻译/朗读/评价) */}
      {msgs.map((m, i) =>
        m.role === 'assistant' && m.text.trim() && !streaming ? (
          <div className="cp-msg-actions" key={`a${i}`}>
            <button type="button" title={t('chatResponse.copy')} onClick={() => void copyMessage(i)}>
              <Copy size={14} />
            </button>
            <button
              type="button"
              title={L('Translate', '翻译')}
              className={translations[i] ? 'on' : ''}
              onClick={() => setMenu(menu === 'translate' ? 'none' : 'translate')}
            >
              <Languages size={14} />
            </button>
            <button type="button" title={L('Read aloud', '朗读')} className={speakingIdx === i ? 'on' : ''} onClick={() => void readAloud(i)}>
              {speakingIdx === i ? <Square size={12} fill="currentColor" /> : <Volume2 size={14} />}
            </button>
            <button
              type="button"
              title={L('Good response', '回答有帮助')}
              className={feedback[i] === 'up' ? 'on' : ''}
              onClick={() => {
                setFeedback((f) => ({ ...f, [i]: 'up' }));
                toast(L('Thanks for the feedback', '感谢反馈'));
              }}
            >
              <ThumbsUp size={14} />
            </button>
            <button
              type="button"
              title={L('Bad response', '回答没帮助')}
              className={feedback[i] === 'down' ? 'on' : ''}
              onClick={() => {
                setFeedback((f) => ({ ...f, [i]: 'down' }));
                toast(L('Thanks — we will use this to improve', '感谢反馈，我们会据此改进'));
              }}
            >
              <ThumbsDown size={14} />
            </button>
          </div>
        ) : null,
      )}

      {/* 译文(不落库,消耗 2 积分) */}
      {Object.entries(translations).map(([key, tr]) => {
        const idx = Number(key);
        return (
          <div className="cp-translation" key={`t${key}`}>
            <div className="cp-translation-head">
              <span>
                <Languages size={13} />
                {LANGUAGES.find((l) => l.code === tr.lang)?.nativeLabel ?? tr.lang}
                {tr.loading && <span className="cp-translation-dots">…</span>}
              </span>
              <button
                type="button"
                onClick={() =>
                  setTranslations((prev) => {
                    const next = { ...prev };
                    delete next[idx];
                    return next;
                  })
                }
                aria-label={L('Close translation', '关闭译文')}
              >
                <X size={13} />
              </button>
            </div>
            <div className="cp-translation-body">{tr.text || L('Translating…', '翻译中…')}</div>
          </div>
        );
      })}
      <div ref={colEndRef} />
    </div>

    {/* bottom composer */}
    <div className="cp-composer-wrap">
      {attachments.length > 0 && (
        <div className="hk-attach-row">
          {attachments.map((a, i) => (
            <span className="hk-attach-chip" key={`${a.url}-${i}`}>
              <FileText size={12} />
              {a.name}
              <button type="button" onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} aria-label={L('Remove', '移除')}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="cp-composer">
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.xls,.xlsx,image/*"
          onChange={(e) => {
            void pickAttachment(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button
          className="cp-plus"
          type="button"
          title={L('Add attachment', '添加附件')}
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Plus size={16} />
        </button>
        <button
          className="cp-icon"
          type="button"
          title={L('Past conversations', '历史会话')}
          onClick={() => set({ screen: 'history' })}
        >
          <BookOpen size={16} />
        </button>
        <button className="cp-tools" type="button" onClick={() => setMenu(menu === 'tools' ? 'none' : 'tools')}>
          <SlidersHorizontal size={14} />
          <span>{t('home.tools')}</span>
        </button>
        <button
          className={`cp-icon${listening ? ' on' : ''}`}
          type="button"
          title={L('Voice input', '语音输入')}
          onClick={startVoice}
        >
          <AudioWaveform size={16} />
        </button>
        <input
          className="cp-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send(input);
          }}
          placeholder={listening ? L('Listening…', '正在听…') : t('home.inputPlaceholder')}
        />
        <button className="cp-mode" type="button" onClick={() => setMenu(menu === 'mode' ? 'none' : 'mode')}>
          <Gauge size={12} />
          <span>{state.replyMode === 'fast' ? t('home.speedModeFast') : t('home.speedModeNormal')}</span>
          <ChevronDown size={12} />
        </button>
        <button className="cp-status" type="button" title={L('Connection status', '连接状态')} onClick={openStatus}>
          <span className={`cp-status-dot${ping.state === 'offline' ? ' off' : ''}`} />
        </button>
        <button
          className="cp-send"
          type="button"
          title={t('chatResponse.send')}
          disabled={(!input.trim() && attachments.length === 0) || streaming}
          onClick={() => send(input)}
        >
          <ArrowUp size={14} />
        </button>
      </div>

      {/* 工具菜单:朗读开关 / 语音输入 / 语速 —— 全部真实生效 */}
      {menu === 'tools' && (
        <>
          <div className="cp-menu-veil" onClick={() => setMenu('none')} />
          <div className="hk-menu cp-menu" style={{ bottom: 78, left: 220 }}>
            <button className="hk-menu-item" onClick={() => set({ autoSpeak: !state.autoSpeak })}>
              <Volume2 size={14} />
              {L('Read replies aloud', '自动朗读回复')}
              <span className={`hk-menu-hint${state.autoSpeak ? ' on' : ''}`}>
                {state.autoSpeak ? L('On', '开') : L('Off', '关')}
              </span>
            </button>
            <button className="hk-menu-item" onClick={startVoice}>
              <AudioWaveform size={14} />
              {L('Voice input', '语音输入')}
            </button>
            <div className="hk-menu-label">{L('Speech speed', '朗读语速')}</div>
            {SPEEDS.map((sp) => (
              <button
                key={sp}
                className={`hk-menu-item${state.speed === sp ? ' active' : ''}`}
                onClick={() => {
                  set({ speed: sp });
                  setMenu('none');
                }}
              >
                {sp}×
              </button>
            ))}
          </div>
        </>
      )}

      {/* 回复模式菜单(standard/fast,随请求透传后端) */}
      {menu === 'mode' && (
        <>
          <div className="cp-menu-veil" onClick={() => setMenu('none')} />
          <div className="hk-menu cp-menu" style={{ bottom: 78, right: 170 }}>
            {(['standard', 'fast'] as const).map((m) => (
              <button
                key={m}
                className={`hk-menu-item${state.replyMode === m ? ' active' : ''}`}
                onClick={() => {
                  set({ replyMode: m });
                  setMenu('none');
                  toast(
                    m === 'fast'
                      ? L('Fast mode on — new replies use it', '快速模式已开启——下一条回复生效')
                      : L('Standard mode on', '已切换为标准模式'),
                  );
                }}
              >
                <Gauge size={14} />
                {m === 'fast' ? L('Fast', '快速') : t('home.speedModeNormal')}
              </button>
            ))}
          </div>
        </>
      )}

      {/* 状态面板:真实探测后端往返延迟 + 余额 */}
      {menu === 'status' && (
        <>
          <div className="cp-menu-veil" onClick={() => setMenu('none')} />
          <div className="hk-menu cp-menu" style={{ bottom: 78, right: 138, minWidth: 230 }}>
            <div className="hk-menu-label">{L('Connection', '连接状态')}</div>
            <div className="hk-menu-item" style={{ cursor: 'default' }}>
              <span className={`cp-status-dot${ping.state === 'offline' ? ' off' : ''}`} />
              {ping.state === 'checking'
                ? L('Checking…', '检测中…')
                : ping.state === 'ok'
                  ? L(`Tutor online · ${ping.ms} ms`, `导师在线 · ${ping.ms} 毫秒`)
                  : L('Offline — demo mode', '离线——演示模式')}
            </div>
            <div className="hk-menu-item" style={{ cursor: 'default' }}>
              <span className="cp-status-dot" style={{ background: '#E5A23C' }} />
              {L('Credits', '积分')}
              <span className="hk-menu-hint">{state.identity ? state.identity.credits : '—'}</span>
            </div>
            <button
              className="hk-menu-item"
              onClick={() => {
                setPing({ state: 'checking' });
                void pingBackend().then((ms) => setPing(ms === null ? { state: 'offline' } : { state: 'ok', ms }));
              }}
            >
              {L('Re-check', '重新检测')}
            </button>
          </div>
        </>
      )}
    </div>

    {supportOpen && <SupportModal onClose={() => setSupportOpen(false)} title={t('chatResponse.haveAnIssue')} />}
  </div>
  );
};
