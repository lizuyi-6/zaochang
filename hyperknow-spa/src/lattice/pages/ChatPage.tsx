import React, { useEffect, useRef, useState } from 'react';
import {
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
  RefreshCw,
  SquarePen,
} from 'lucide-react';
import type { PageProps } from '../types';
import { chatLive, pingBackend, translateLive } from '../backend';
import { markupToPlain } from '../markup';
import { AssistantMarkup } from '../AssistantMarkup';
import { L } from '../i18n/content';
import { LANGUAGES, useI18n } from '../i18n';
import { AvatarCat } from '../illustrations';
import { SupportModal } from '../SupportModal';
import { listenOnce, shareLink, tts, copyText } from '../actions';
import { uploadMaterial } from '../materials';
import { toast } from '../toast';
import './ChatPage.css';


/** 追加的对话消息(参考流水线之后)。 */
interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
  /** 用户消息随附的材料(上传到主站 /api/uploads 后的引用) */
  attachments?: Array<{ name: string; url: string }>;
}

type MenuKind = 'none' | 'translate' | 'tools' | 'mode' | 'status';

const SPEEDS = [0.5, 0.75, 0.85, 1, 1.25, 1.5];

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
  const inputRef = useRef<HTMLInputElement>(null);
  /** 本屏绑定的后端会话(从历史打开 → 预置;新发消息 → conversation_created 回填) */
  const convIdRef = useRef<string | null>(null);
  const conversationsRef = useRef(state.conversations);
  conversationsRef.current = state.conversations;
  /* 当前展示会话的身份镜像:流式回调(异步)据此判断"这条 token 还属于屏幕上
   * 的会话吗"——A 流未结束就切到 B 时,A 的迟到 chunk/错误绝不得写进 B 的视图 */
  const activeConvRef = useRef(state.activeConversationId);
  activeConvRef.current = state.activeConversationId;

  /* 从历史/侧边栏打开的会话:回放其消息(按造场账户隔离的数据)。
   * 依赖 activeConversationId:在同一页切换会话也要换内容;新发消息不会改它。
   * 切换会话时中断在途流:旧 stream 不得继续向新会话的视图追加。 */
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    const id = state.activeConversationId;
    if (!id) return;
    const conv = conversationsRef.current?.find((c) => c.id === id);
    if (conv) {
      convIdRef.current = conv.id;
      setMsgs(conv.messages.map((m) => ({ role: m.role, text: m.text })));
    }
  }, [state.activeConversationId]);

  /* 账户身份变化:中断在途流并清空本地消息/会话绑定/译文,
   * 上一账户的会话内容绝不允许滞留到下一账户的视图里(串号防线第二道)。 */
  const identityEmailRef = useRef(state.identity?.email ?? null);
  useEffect(() => {
    const email = state.identity?.email ?? null;
    if (identityEmailRef.current === email) return;
    identityEmailRef.current = email;
    abortRef.current?.abort();
    abortRef.current = null;
    convIdRef.current = null;
    setStreaming(false);
    setMsgs([]);
    setTranslations({});
    setFeedback({});
    setSpeakingIdx(null);
  }, [state.identity?.email]);

  /* 朗读状态跟随播放器(播完自动熄灭按钮) */
  useEffect(() => tts.subscribe((on) => !on && setSpeakingIdx(null)), []);

  /* 演示交换(参考截图的 ping 问答+流水线)只在纯演示态展示;一旦有真实会话内容即隐藏 */

  const lastAssistantIdx = (() => {
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'assistant' && msgs[i].text.trim()) return i;
    return -1;
  })();

  const send = (raw: string, forcedAttachments?: Array<{ name: string; url: string }>) => {
    const text = raw.trim();
    if ((!text && attachments.length === 0) || streaming) return;
    setMenu('none'); // 发送即收起所有菜单,不留孤儿浮层
    const attached = forcedAttachments ?? attachments;
    setInput('');
    setAttachments([]);
    setMsgs((m) => [...m, { role: 'user', text, attachments: attached.length ? attached : undefined }]);
    setMsgs((m) => [...m, { role: 'assistant', text: '' }]);
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const convAtSend = activeConvRef.current;
    /** 本会话专属更新:切会话/卸载后,旧流的迟到回调全部丢弃 */
    const stillMine = () => activeConvRef.current === convAtSend;
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
            if (!stillMine()) return;
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
        { signal: ctrl.signal, conversationId: convIdRef.current ?? undefined, mode: state.replyMode, model: state.chatModel },
      );
      if (!stillMine()) return;
      /* 工程未开 strict:真值检查不收窄判别联合,必须用字面量判别 */
      if (result.ok === false) {
        const fallback =
          result.reason === 'insufficient'
            ? L(
                'Out of credits — every day brings 20 free credits (2 per chat, 10 per course), resetting at midnight Beijing time.',
                '积分不足——每天免费获得 20 积分（对话 2/次、课程 10/次），北京时间零点自动重置。',
              )
              : L('The tutor hit an error. Please try again in a moment.', '导师服务出了点问题，请稍后再试。');
        setMsgs((m) => {
          const next = [...m];
          /* 流中断但已有半截正文:保留正文并标注中断点;整段替换会把用户正读到的内容吞掉 */
          const partial = next[next.length - 1]?.text ?? '';
          next[next.length - 1] = {
            role: 'assistant',
            text: partial.trim()
              ? `${partial}\n\n${L('— The reply was cut off here. Use ⟳ below to regenerate.', '——回复在此中断，可用下方 ⟳ 重新生成。')}`
              : fallback,
          };
          return next;
        });
      } else if (state.autoSpeak && acc.trim()) {
        void tts.speak(markupToPlain(acc), state.voice, state.speed);
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
  /* 自动跟随门控:用户往上翻阅时不得被每个流式 chunk 拽回底部;
   * 只有本就停在列底部附近才自动跟随。滚动容器是会话列本身(页内滚动布局)。 */
  const followRef = useRef(true);
  const columnRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = columnRef.current;
    if (!el) return;
    const onScroll = () => {
      followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (followRef.current) colEndRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs, streaming]);

  /* ---------------- 真实动作:复制 / 翻译 / 朗读 / 语音 / 附件 / 状态 ---------------- */

  /** 重新生成某条导师回复:回退到它前面的用户消息,原样重发(附件一并带回到发送路径)。 */
  const regenerateFrom = (assistantIdx: number) => {
    if (streaming) return;
    let userIdx = -1;
    for (let i = Math.min(assistantIdx, msgs.length - 1); i >= 0; i--) {
      if (msgs[i].role === 'user') {
        userIdx = i;
        break;
      }
    }
    if (userIdx < 0) return;
    const source = msgs[userIdx];
    setMsgs((m) => m.slice(0, userIdx));
    followRef.current = true;
    send(source.text, source.attachments);
  };

  const copyMessage = async (idx: number) => {
    const text = markupToPlain(msgs[idx]?.text ?? '');
    if (!text.trim()) return;
    const ok = await copyText(text);
    toast(ok ? t('chatResponse.copied') : L('Could not copy', '复制失败'));
  };

  const readAloud = async (idx: number) => {
    const text = markupToPlain(msgs[idx]?.text ?? '');
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
    if (result.ok === true) {
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

  /** 页内新开对话:中断在途流、清空本地消息与会话绑定,回到开场欢迎屏。 */
  const startNewConversation = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    convIdRef.current = null;
    setStreaming(false);
    setMsgs([]);
    setTranslations({});
    setFeedback({});
    setSpeakingIdx(null);
    setInput('');
    followRef.current = true;
    if (state.activeConversationId) set({ activeConversationId: null });
  };

  return (
  <div className="hk-page cp-page">
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
    <div className="cp-column" ref={columnRef}>
      {/* 新对话开场欢迎屏:登录用户空态显示——问候 + 可点建议(填入输入框),
       * 替代此前"一片空白难判是否新对话"的观感;欢迎屏在任何空态显示。 */}
      {msgs.length === 0 && !streaming && (
        <div className="cp-welcome">
          <AvatarCat size={64} ring />
          <h2 className="cp-welcome-title">
            {state.identity?.username
              ? L(`Hi ${state.identity.username}, I'm Lattice.`, `你好，${state.identity.username}！我是见界。`)
              : L("Hi, I'm Lattice.", '你好，我是见界。')}
          </h2>
          <p className="cp-welcome-sub">
            {L(
              'Your personal tutor for anything — ask a question, paste notes, or pick a starter below.',
              '你的私人学习导师——直接提问、粘贴笔记，或从下面的 starters 开始。',
            )}
          </p>
          <div className="cp-welcome-chips">
            {(
              [
                [
                  'Teach me a concept I choose, step by step, with a diagram.',
                  '一步步给我讲透一个概念，并配上图示。',
                ],
                [
                  'Turn a piece of news I paste into a mini interactive lesson.',
                  '把我贴进来的一则新闻变成一节互动小课。',
                ],
                [
                  'Help me review a topic before an exam — key points first.',
                  '帮我考前复习一个主题——先抓重点。',
                ],
                [
                  'Quiz me with 5 questions on any topic and grade me.',
                  '就任意主题出 5 道题考我，并给我打分。',
                ],
              ] as const
            ).map(([en, zh]) => (
              <button
                key={en}
                type="button"
                className="cp-welcome-chip"
                onClick={() => {
                  setInput(L(en, zh));
                  inputRef.current?.focus();
                }}
              >
                {L(en, zh)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 追加对话:用户发送的真实消息 + 导师回复(在线流式)。
          导师回复走富文本渲染(Markdown + content-section 容器),用户消息保持纯文本。 */}
      {msgs.map((m, i) => (
        <div key={i} className={`cp-bubble-row ${m.role === 'user' ? ' user' : ''}`}>
          <div className={`cp-bubble ${m.role === 'user' ? ' user' : ''}`}>
            {m.role === 'assistant' && !m.text && streaming && i === msgs.length - 1 ? (
              /* 首个 chunk 到达前的思考气泡:左侧不再是空白,卡没卡一眼可见 */
              <span className="cp-typing" role="status" aria-label={L('The tutor is thinking…', '导师正在思考…')}>
                <span className="cp-typing-dot" />
                <span className="cp-typing-dot" />
                <span className="cp-typing-dot" />
                <span className="cp-typing-label">{L('Thinking…', '正在思考…')}</span>
              </span>
            ) : m.role === 'assistant' ? (
              <AssistantMarkup text={m.text} />
            ) : (
              m.text
            )}
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
              title={L('Regenerate this reply', '重新生成这条回复')}
              onClick={() => regenerateFrom(i)}
            >
              <RefreshCw size={14} />
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
            <div className="cp-translation-body">{tr.text ? <AssistantMarkup text={tr.text} /> : L('Translating…', '翻译中…')}</div>
          </div>
        );
      })}
      <div ref={colEndRef} className="cp-col-end" />
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
          title={L('New conversation', '新对话')}
          onClick={startNewConversation}
        >
          <SquarePen size={16} />
        </button>
        <button
          className="cp-icon"
          type="button"
          title={L('Past conversations', '历史会话')}
          onClick={() => set({ screen: 'history' })}
        >
          <BookOpen size={16} />
        </button>
        <div className="cp-anchor">
          <button className="cp-tools" type="button" onClick={() => setMenu(menu === 'tools' ? 'none' : 'tools')}>
            <SlidersHorizontal size={14} />
            <span>{t('home.tools')}</span>
          </button>
          {/* 工具菜单:朗读开关 / 语音输入 / 语速 —— 锚定按钮正上方,不再写死坐标 */}
          {menu === 'tools' && (
            <>
              <div className="cp-menu-veil" onClick={() => setMenu('none')} />
              <div className="hk-menu cp-menu cp-menu-anchored">
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
                      tts.setPlaybackRate(sp);
                      setMenu('none');
                    }}
                  >
                    {sp}×
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button
          className={`cp-icon${listening ? ' on' : ''}`}
          type="button"
          title={L('Voice input', '语音输入')}
          onClick={startVoice}
        >
          <AudioWaveform size={16} />
        </button>
        <input
          ref={inputRef}
          className="cp-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send(input);
          }}
          placeholder={listening ? L('Listening…', '正在听…') : t('home.inputPlaceholder')}
        />
        <div className="cp-anchor">
          <button className="cp-mode" type="button" onClick={() => setMenu(menu === 'mode' ? 'none' : 'mode')}>
            <Gauge size={12} />
            <span>{state.chatModel === 'pro' ? L('Lattice Pro', '见界 Pro') : L('Lattice Flash', '见界 Flash')}</span>
            <ChevronDown size={12} />
          </button>
          {/* 回复模式菜单:锚定到模式按钮正上方 */}
          {menu === 'mode' && (
            <>
              <div className="cp-menu-veil" onClick={() => setMenu('none')} />
              <div className="hk-menu cp-menu cp-menu-anchored">
                {(['flash', 'pro'] as const).map((m) => (
                  <button
                    key={m}
                    className={`hk-menu-item cp-model-item${state.chatModel === m ? ' active' : ''}`}
                    onClick={() => {
                      set({ chatModel: m });
                      setMenu('none');
                      toast(
                        m === 'pro'
                          ? L('Lattice Pro on — applies to new replies', '见界 Pro 已启用——下一条回复生效')
                          : L('Lattice Flash on — applies to new replies', '见界 Flash 已启用——下一条回复生效'),
                      );
                    }}
                  >
                    {m === 'pro' ? (
                      <>
                        <span className="cp-model-line">
                          <span className="cp-model-name">{L('Lattice Pro', '见界 Pro')}</span>
                          <span className="cp-model-badge">{L('Launch offer', '限时')}</span>
                          <span className="cp-model-price">
                            <del>5</del> {L('2 cr', '2 积分')}
                          </span>
                        </span>
                        <span className="cp-model-desc">
                          {L(
                            'Deeper reasoning. Thinking takes longer — replies may feel slower. Launch period: same cost as Flash.',
                            '更深推理。思考时间会变长，回答时可能感觉卡顿。新上线期间消耗对齐 Flash。',
                          )}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="cp-model-line">
                          <span className="cp-model-name">{L('Lattice Flash', '见界 Flash')}</span>
                          <span className="cp-model-price">{L('2 cr', '2 积分')}</span>
                        </span>
                        <span className="cp-model-desc">
                          {L('Fast replies. Great for everyday questions and course tutoring.', '速度快。适合日常问答与课程辅导。')}
                        </span>
                      </>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="cp-anchor">
          <button className="cp-status" type="button" title={L('Connection status', '连接状态')} onClick={openStatus}>
            <span className={`cp-status-dot${ping.state === 'offline' ? ' off' : ''}`} />
          </button>
          {/* 状态面板:真实探测后端往返延迟 + 余额,锚定到状态点正上方 */}
          {menu === 'status' && (
            <>
              <div className="cp-menu-veil" onClick={() => setMenu('none')} />
              <div className="hk-menu cp-menu cp-menu-anchored cp-menu-status">
                <div className="hk-menu-label">{L('Connection', '连接状态')}</div>
                <div className="hk-menu-item" style={{ cursor: 'default' }}>
                  <span className={`cp-status-dot${ping.state === 'offline' ? ' off' : ''}`} />
                  {ping.state === 'checking'
                    ? L('Checking…', '检测中…')
                    : ping.state === 'ok'
                      ? L(`Tutor online · ${ping.ms} ms`, `导师在线 · ${ping.ms} 毫秒`)
                      : L('Tutor offline', '导师离线')}
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

    </div>

    {supportOpen && <SupportModal onClose={() => setSupportOpen(false)} title={t('chatResponse.haveAnIssue')} />}
  </div>
  );
};
