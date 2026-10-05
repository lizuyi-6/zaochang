import { useEffect, useRef, useState } from 'react';
import {
  Plus,
  ArrowUp,
  GraduationCap,
  NotebookPen,
  Sparkles,
  Sparkle,
  Store,
  ArrowUpRight,
  CircleHelp,
  Flame,
  Star,
  AudioLines,
  SlidersHorizontal,
  ChevronDown,
  Spline,
  RotateCcw,
  BookOpen,
  FileText,
  Glasses,
  Telescope,
  Users,
  Layers,
  LayoutGrid,
  BadgeCheck,
  Volume2,
  X,
  Check,
} from 'lucide-react';
import type { PageProps } from '../types';
import { placeholders, newsFeed, homeCourses } from '../data';
import { fetchDailyFeed, type DailyFeedItem } from '../backend';
import { Logo, PlanetDoodle, CourseCover, Handshake, WelcomeReader, Ufo } from '../illustrations';
import { DarkPill } from '../ui';
import { useI18n, TRich } from '../i18n';
import { L } from '../i18n/content';
import { WhatsNewModal } from '../WhatsNewModal';
import { copyText, listenOnce, tts } from '../actions';
import { uploadMaterial } from '../materials';
import { toast } from '../toast';
import './Home.css';

/** 能力 chips 预填的提问模板(点一下就把输入框变成一条可编辑的真实提问) */
const CAP_PROMPTS: Record<string, [string, string]> = {
  conceptExplanation: [
    'Explain the concept of “…” from first principles, with a concrete example and a common misconception.',
    '从第一性原理解释“…”这个概念，给出一个具体例子和一个常见误区。',
  ],
  studyMaterials: [
    'Generate personalized study materials for “…” — outline, flashcards, and 5 practice questions.',
    '为“…”生成个性化学习资料——提纲、抽认卡和 5 道练习题。',
  ],
  longFiles: [
    'Digest the long document I attach and give me a structured summary with key claims and open questions.',
    '消化我附上的长文档，给出结构化摘要，包括关键论点与待解问题。',
  ],
  problemSolving: [
    'Walk me through solving this problem step by step, then give me two similar problems to try.',
    '带我一步步解这道题，然后给我两道相似的题练手。',
  ],
  visualLearning: [
    'Visualize “…” with a diagram, then explain what each part means.',
    '用图示把“…”可视化，然后解释每一部分的含义。',
  ],
};

/** 人格预设(选择后作为前缀写进输入框,由用户确认后再发送) */
const PERSONAS: Array<[string, string]> = [
  ['Socratic tutor', '苏格拉底式导师'],
  ['Explain like I am 12', '像给 12 岁孩子讲解'],
  ['Exam coach', '应试教练'],
  ['Research partner', '研究伙伴'],
];

/** Home — Craft Courses / Instant Assistance (1600×900 reference geometry). */
export const Home = ({ state, set }: PageProps) => {
  const { t } = useI18n();
  const [phIdx, setPhIdx] = useState(0);
  const [topic, setTopic] = useState('');
  const [note, setNote] = useState('');
  const [menu, setMenu] = useState<'none' | 'source' | 'notes' | 'persona' | 'tools' | 'speed' | 'model'>('none');
  const [notesDraft, setNotesDraft] = useState('');
  const [attachments, setAttachments] = useState<Array<{ name: string; url: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);
  const [newsOffset, setNewsOffset] = useState(0);
  const [liveNews, setLiveNews] = useState<DailyFeedItem[] | null>(null);
  const [feedRound, setFeedRound] = useState(0);
  const [feedLoading, setFeedLoading] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // rotate the Craft Courses prompt placeholder through the topic examples
  useEffect(() => {
    const t = setInterval(() => setPhIdx((i) => (i + 1) % placeholders().length), 3500);
    return () => clearInterval(t);
  }, []);

  // 「欢迎回来」接管层每会话只弹一次:刷新/切页返回不再重弹(welcomeBack 默认 true 常驻
  // 会让用户每次刷新都被全屏层拦住,误以为按钮失灵)
  useEffect(() => {
    if (!state.welcomeBack) return;
    if (sessionStorage.getItem('hk-welcome-shown')) {
      set({ welcomeBack: false });
    } else {
      sessionStorage.setItem('hk-welcome-shown', '1');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attachLine = () => attachments.map((a) => `[Attachment: ${a.name} — ${a.url}]`).join('\n');

  const submitTopic = () => {
    const prompt = topic.trim();
    if (!prompt) return;
    const withFiles = attachLine();
    const finalPrompt = withFiles ? `${prompt}\n\n${withFiles}` : prompt;
    // 定制问询升级为独立对话页(与即时协助同构):命题带过去,不再首页弹窗
    set({ screen: 'create', createPrompt: finalPrompt });
  };

  const submitNote = () => {
    const text = note.trim();
    if (!text) return;
    const withFiles = attachLine();
    setAttachments([]);
    // 首页发出的是全新提问:清掉残留的会话选择,否则会续在旧会话尾巴上
    set({ screen: 'chat', chatNote: withFiles ? `${text}\n\n${withFiles}` : text, activeConversationId: null });
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const material = await uploadMaterial(`home:${state.identity?.email ?? 'demo'}`, file);
    setUploading(false);
    if (!material) {
      toast(L('Upload failed — please try again', '上传失败，请重试'));
      return;
    }
    setAttachments((prev) => [...prev, { name: material.name, url: material.url }]);
    toast(L(`Attached “${material.name}”`, `已附加《${material.name}》`));
  };

  const startVoice = (apply: (text: string) => void) => {
    setMenu('none');
    if (listening) return;
    const started = listenOnce(apply, () => setListening(false));
    if (started) setListening(true);
  };

  const copyInvite = async () => {
    const ok = await copyText(`${window.location.origin}/?utm_source=lattice&utm_medium=invite`);
    toast(ok ? L('Invite link copied — share it with a friend', '邀请链接已复制——发给朋友吧') : L('Could not copy the link', '复制链接失败'));
  };

  // 「今日值得学」动态资讯源:阶跃联网搜索现查(后端按日+轮缓存),失败回退静态列表
  useEffect(() => {
    let alive = true;
    void fetchDailyFeed(0).then((items) => {
      if (alive && items) setLiveNews(items);
    });
    return () => {
      alive = false;
    };
  }, []);

  const shuffleNews = async () => {
    // 有真实动态源:换一批 = 拉取新轮(新检索词出新内容);失败退回池内轮转
    if (liveNews && liveNews.length > 0) {
      setFeedLoading(true);
      const next = await fetchDailyFeed(feedRound + 1);
      setFeedLoading(false);
      if (next && next.length > 0) {
        setLiveNews(next);
        setFeedRound((r) => r + 1);
        setNewsOffset(0);
        toast(L('Trends refreshed', '趋势已刷新'));
        return;
      }
    }
    const pool = liveNews?.length ?? news.length;
    setNewsOffset((i) => (i + 1) % Math.max(pool, 1));
    toast(L('Trends refreshed', '趋势已刷新'));
  };

  const news = newsFeed();
  const rotatedNews = [...news.slice(newsOffset), ...news.slice(0, newsOffset)];
  // 动态源条目截窗(5 条一批,换一批翻页池),静态兜底保持原轮转
  const liveWindow = liveNews ? liveNews.slice(newsOffset, newsOffset + 5) : [];
  const visibleNews: Array<{ key: string; title: string; url: string; source: string }> =
    liveNews && liveWindow.length > 0
      ? liveWindow.map((it) => ({ key: it.url, title: it.title, url: it.url, source: it.source }))
      : rotatedNews.map((n) => ({
          key: n,
          title: n,
          // 静态兜底也点得开:跳 Google 搜索该标题
          url: `https://www.google.com/search?q=${encodeURIComponent(n)}`,
          source: '',
        }));

  return (
    <div className="hk-page with-sidebar">
      <input
        ref={fileRef}
        type="file"
        hidden
        accept=".pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.xls,.xlsx,image/*"
        onChange={(e) => {
          void pickFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div className="hk-page-inner hm-inner">
        {/* centered mode tabs */}
        <div className="hm-tabs-row">
          <div className="hk-mode-tabs">
            <button
              className={`hk-mode-tab${state.homeTab === 'craft' ? ' active' : ''}`}
              onClick={() => set({ homeTab: 'craft' })}
            >
              {t('home.modeTabs.craftCourses')}
            </button>
            <button
              className={`hk-mode-tab${state.homeTab === 'instant' ? ' active' : ''}`}
              onClick={() => set({ homeTab: 'instant' })}
            >
              {t('home.modeTabs.instantAssistance')}
            </button>
          </div>
        </div>

        {state.homeTab === 'craft' ? (
          <>
            {/* heading */}
            <h1 className="hm-h1">
              <TRich text={t('home.craftCoursesTitle')} orbie={<PlanetDoodle size={34} />} />
            </h1>
            <p className="hm-sub">{t('home.craftCoursesDescription')}</p>

            {/* prompt card */}
            <div className="hm-prompt-card">
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
              <div className="hm-input-wrap">
                <input
                  className="hm-input"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitTopic();
                  }}
                />
                {!topic && (
                  <div className="hm-placeholder" key={phIdx}>
                    <span className="hm-placeholder-text">{placeholders()[phIdx]}</span>
                    <span className="hm-kbd">tab</span>
                  </div>
                )}
              </div>
              <div className="hm-toolbar">
                <button
                  className="hm-circle-btn"
                  aria-label={L('Add attachment', '添加附件')}
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  <Plus size={18} />
                </button>
                <div className="hm-menu-anchor">
                  <button className="hm-chip" style={{ marginLeft: 12 }} onClick={() => setMenu(menu === 'source' ? 'none' : 'source')}>
                    <GraduationCap size={16} />
                    {t('home.courseSourceSelf')}
                    <ChevronDown size={13} />
                  </button>
                  {menu === 'source' && (
                    <div className="hk-menu hm-menu">
                      <div className="hk-menu-label">{L('Course source', '课程来源')}</div>
                      <button className="hk-menu-item active" onClick={() => setMenu('none')}>
                        <Check size={13} />
                        {t('home.courseSourceSelf')}
                      </button>
                      <button
                        className="hk-menu-item"
                        onClick={() => {
                          setMenu('none');
                          set({ screen: 'marketplace' });
                        }}
                      >
                        <Store size={13} />
                        {t('home.marketplace.title')}
                      </button>
                    </div>
                  )}
                </div>
                <div className="hm-menu-anchor">
                  <button className="hm-chip icon-only" aria-label={L('Notes', '笔记')} onClick={() => setMenu(menu === 'notes' ? 'none' : 'notes')}>
                    <NotebookPen size={16} />
                  </button>
                  {menu === 'notes' && (
                    <div className="hk-menu hm-menu hm-menu-notes">
                      <div className="hk-menu-label">{L('Paste your notes', '粘贴你的笔记')}</div>
                      <textarea
                        className="hm-notes-text"
                        value={notesDraft}
                        onChange={(e) => setNotesDraft(e.target.value)}
                        placeholder={L('Paste lecture notes, an outline, or a passage…', '粘贴课堂笔记、提纲或一段文字…')}
                        rows={5}
                      />
                      <button
                        className="hk-menu-item"
                        disabled={!notesDraft.trim()}
                        onClick={() => {
                          setTopic(notesDraft.trim());
                          setMenu('none');
                        }}
                      >
                        {L('Use as the course prompt', '用作课程提示词')}
                      </button>
                    </div>
                  )}
                </div>
                <div className="hm-menu-anchor">
                  <button className="hm-chip" onClick={() => setMenu(menu === 'model' ? 'none' : 'model')}>
                    <Layers size={15} />
                    {state.chatModel === 'pro' ? L('LATTICE Pro', '见界 Pro') : L('LATTICE Flash', '见界 Flash')}
                    <ChevronDown size={13} />
                  </button>
                  {menu === 'model' && (
                    <div className="hk-menu hm-menu hm-menu-up">
                      {(['flash', 'pro'] as const).map((m) => (
                        <button
                          key={m}
                          className={`hk-menu-item cp-model-item${state.chatModel === m ? ' active' : ''}`}
                          onClick={() => {
                            set({ chatModel: m });
                            setMenu('none');
                            toast(
                              m === 'pro'
                                ? L('LATTICE Pro on — applies to new courses', '见界 Pro 已启用——新课程生效')
                                : L('LATTICE Flash on — applies to new courses', '见界 Flash 已启用——新课程生效'),
                            );
                          }}
                        >
                          {m === 'pro' ? (
                            <>
                              <span className="cp-model-line">
                                <span className="cp-model-name">{L('LATTICE Pro', '见界 Pro')}</span>
                                <span className="cp-model-badge">{L('Launch offer', '限时')}</span>
                                <span className="cp-model-price">
                                  <del>5</del> {L('2 cr', '2 积分')}
                                </span>
                              </span>
                              <span className="cp-model-desc">
                                {L(
                                  'Deeper reasoning for course content. Thinking takes longer.',
                                  '课程内容更深推理。思考时间会变长。',
                                )}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="cp-model-line">
                                <span className="cp-model-name">{L('LATTICE Flash', '见界 Flash')}</span>
                                <span className="cp-model-price">{L('2 cr', '2 积分')}</span>
                              </span>
                              <span className="cp-model-desc">
                                {L('Fast course crafting.', '课程打造更快。')}
                              </span>
                            </>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="hm-toolbar-right">
                  <span className="hm-cost">
                    <Sparkles size={14} color="#6E6152" />
                    10
                  </span>
                  <button
                    className="hm-send"
                    disabled={!topic.trim()}
                    onClick={submitTopic}
                    aria-label={t('canvasFileExplorer.generateCourse')}
                  >
                    <ArrowUp size={18} />
                  </button>
                </div>
              </div>
            </div>

            {/* below-card helpers */}
            <div className="hm-lms">
              <TRich text={t('home.craftCourseLmsImport')} classes={{ span: 'hm-lms-link' }} />
            </div>
            <div className="hm-help">
              <CircleHelp size={14} />
              {t('home.craftCourseStartHelp')}
            </div>

            {/* marketplace */}
            <div className="hm-market">
              <div className="hm-market-head">
                <span className="hm-market-title">
                  <Store size={18} />
                  {t('home.marketplace.title')}
                </span>
                <span className="hm-viewall" onClick={() => set({ screen: 'marketplace' })}>
                  {t('home.marketplace.viewAll')}
                  <ArrowUpRight size={14} />
                </span>
              </div>
              <div className="hm-market-grid">
                {homeCourses().map((c) => (
                  <div className="hm-course" key={c.id} onClick={() => set({ screen: 'marketplace' })}>
                    <div className="hm-course-cover">
                      <CourseCover kind={c.cover} seed={c.id} />
                    </div>
                    <div className="hm-course-body">
                      <div className="hm-provider">
                        <span className="hm-provider-logo">
                          <Logo size={18} />
                        </span>
                        <span className="hm-provider-name">{t('home.courseTicket.defaultAuthor', { brand: L('Lattice', '见界') })}</span>
                        <BadgeCheck size={15} style={{ fill: 'var(--color-primary)', color: 'var(--white)' }} />
                      </div>
                      <div className="hm-course-title">{c.title}</div>
                      <div className="hm-course-desc">{c.description}</div>
                      <div className="hm-course-meta">
                        <span className="hm-diff">{t(`home.courseTicket.badges.difficulty.${c.difficulty.toLowerCase()}`)}</span>
                        <span className="hm-lessons">{c.lessons} {t('home.courseTicket.lessonsLabel').toLowerCase()}</span>
                      </div>
                      <div className="hm-course-foot">
                        <span className="hm-onboard">
                          <Flame size={14} />
                          <b>{c.onboarded}</b>&nbsp;{t('home.courseTicket.onboardedLabel')}
                        </span>
                        <span className="hm-rating">
                          <Star size={14} style={{ fill: '#FACC15', color: '#FACC15' }} />
                          <b>{c.rating}</b>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* instant assistance heading */}
            <div className="hm-instant-head">
              <Ufo size={62} />
              <span className="hm-instant-title">{t('home.letsReviewNotes')}</span>
            </div>

            {/* input card */}
            <div className="hm-prompt-card hm-instant-card">
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
              <div className="hm-input-wrap">
                <input
                  className="hm-input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitNote();
                  }}
                />
                {!note && (
                  <div className="hm-placeholder">
                    <span className="hm-placeholder-text">{t('home.rollingPlaceholderHints.0')}</span>
                  </div>
                )}
              </div>
              <div className="hm-toolbar">
                <button
                  className="hm-circle-btn"
                  aria-label={L('Add attachment', '添加附件')}
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  <Plus size={18} />
                </button>
                <div className="hm-menu-anchor">
                  <button className="hm-chip icon-only" aria-label={L('Persona', '人格')} onClick={() => setMenu(menu === 'persona' ? 'none' : 'persona')}>
                    <Users size={16} />
                  </button>
                  {menu === 'persona' && (
                    <div className="hk-menu hm-menu">
                      <div className="hk-menu-label">{L('Answer as', '以什么身份回答')}</div>
                      {PERSONAS.map(([en, zh]) => (
                        <button
                          className="hk-menu-item"
                          key={en}
                          onClick={() => {
                            const persona = L(en, zh);
                            setNote((prev) => (prev ? `${persona}: ${prev}` : `${persona}: `));
                            setMenu('none');
                          }}
                        >
                          {L(en, zh)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="hm-menu-anchor">
                  <button className="hm-chip" onClick={() => setMenu(menu === 'tools' ? 'none' : 'tools')}>
                    <SlidersHorizontal size={15} />
                    {t('home.tools')}
                  </button>
                  {menu === 'tools' && (
                    <div className="hk-menu hm-menu">
                      <button className="hk-menu-item" onClick={() => set({ autoSpeak: !state.autoSpeak })}>
                        <Volume2 size={14} />
                        {L('Read replies aloud', '自动朗读回复')}
                        <span className={`hk-menu-hint${state.autoSpeak ? ' on' : ''}`}>
                          {state.autoSpeak ? L('On', '开') : L('Off', '关')}
                        </span>
                      </button>
                      <button className="hk-menu-item" onClick={() => startVoice((text) => setNote((prev) => (prev ? `${prev} ${text}` : text)))}>
                        <AudioLines size={14} />
                        {L('Voice input', '语音输入')}
                      </button>
                      <div className="hk-menu-label">{L('Speech speed', '朗读语速')}</div>
                      {[0.5, 0.75, 0.85, 1, 1.25, 1.5].map((sp) => (
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
                      <button
                        className="hk-menu-item"
                        onClick={() => {
                          tts.stop();
                          setMenu('none');
                        }}
                      >
                        {L('Stop reading', '停止朗读')}
                      </button>
                    </div>
                  )}
                </div>
                <button
                  className={`hm-ghost-icon${listening ? ' on' : ''}`}
                  aria-label={L('Voice input', '语音输入')}
                  onClick={() => startVoice((text) => setNote((prev) => (prev ? `${prev} ${text}` : text)))}
                >
                  <AudioLines size={18} />
                </button>
                <div className="hm-toolbar-right">
                  <div className="hm-menu-anchor">
                    <button className="hm-speed" onClick={() => setMenu(menu === 'speed' ? 'none' : 'speed')}>
                      <Layers size={16} />
                      {state.chatModel === 'pro' ? L('LATTICE Pro', '见界 Pro') : L('LATTICE Flash', '见界 Flash')}
                      <ChevronDown size={14} />
                    </button>
                    {menu === 'speed' && (
                      <div className="hk-menu hm-menu hm-menu-up">
                        {(['flash', 'pro'] as const).map((m) => (
                          <button
                            key={m}
                            className={`hk-menu-item cp-model-item${state.chatModel === m ? ' active' : ''}`}
                            onClick={() => {
                              set({ chatModel: m });
                              setMenu('none');
                              toast(
                                m === 'pro'
                                  ? L('LATTICE Pro on — applies to new replies', '见界 Pro 已启用——下一条回复生效')
                                  : L('LATTICE Flash on — applies to new replies', '见界 Flash 已启用——下一条回复生效'),
                              );
                            }}
                          >
                            {m === 'pro' ? (
                              <>
                                <span className="cp-model-line">
                                  <span className="cp-model-name">{L('LATTICE Pro', '见界 Pro')}</span>
                                  <span className="cp-model-badge">{L('Launch offer', '限时')}</span>
                                  <span className="cp-model-price">
                                    <del>5</del> {L('2 cr', '2 积分')}
                                  </span>
                                </span>
                                <span className="cp-model-desc">
                                  {L(
                                    'Deeper reasoning. Thinking takes longer — replies may feel slower.',
                                    '更深推理。思考时间会变长，回答时可能感觉卡顿。',
                                  )}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="cp-model-line">
                                  <span className="cp-model-name">{L('LATTICE Flash', '见界 Flash')}</span>
                                  <span className="cp-model-price">{L('2 cr', '2 积分')}</span>
                                </span>
                                <span className="cp-model-desc">
                                  {L('Fast replies. Great for everyday questions.', '速度快。适合日常问答。')}
                                </span>
                              </>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    className="hm-send"
                    disabled={!note.trim()}
                    onClick={submitNote}
                    aria-label={t('chatResponse.askOrbie.sendAriaLabel')}
                  >
                    <ArrowUp size={18} />
                  </button>
                </div>
              </div>
            </div>

            {/* capability chips — 点击把输入框变成一条可编辑的提问 */}
            <div className="hm-caps">
              <div className="hm-caps-row">
                <button className="hm-cap" onClick={() => setNote(L(...CAP_PROMPTS.conceptExplanation))}>
                  <Telescope size={16} />
                  {t('home.actionButtons.conceptExplanation')}
                  <span className="hm-badge upgraded">{t('home.badges.upgraded')}</span>
                </button>
                <button className="hm-cap" onClick={() => setNote(L(...CAP_PROMPTS.studyMaterials))}>
                  <BookOpen size={16} />
                  {t('home.actionButtons.studyMaterials')}
                </button>
                <button className="hm-cap" onClick={() => setNote(L(...CAP_PROMPTS.longFiles))}>
                  <FileText size={16} />
                  {t('home.actionButtons.longFiles')}
                </button>
              </div>
              <div className="hm-caps-row">
                <button className="hm-cap" onClick={() => setNote(L(...CAP_PROMPTS.problemSolving))}>
                  <Glasses size={16} />
                  {t('home.actionButtons.problemSolving')}
                </button>
                <button className="hm-cap" onClick={() => setNote(L(...CAP_PROMPTS.visualLearning))}>
                  <LayoutGrid size={16} />
                  {t('home.actionButtons.visualLearning')}
                  <span className="hm-badge new">{t('home.badges.new')}</span>
                </button>
              </div>
            </div>

            {/* news feed */}
            <div className="hm-news">
              <div className="hm-news-head">
                <span className="hm-news-pill active">
                  <Sparkles size={13} />
                  {t('home.latestStuffToLearn')}
                </span>
                <span className="hm-news-pill" onClick={() => setWhatsNewOpen(true)}>
                  <Sparkle size={13} />
                  {t('whatsNew.modalTitle')}
                </span>
                <span
                  className={`hm-news-next${feedLoading ? ' loading' : ''}`}
                  onClick={() => {
                    if (feedLoading) return;
                    void shuffleNews();
                  }}
                >
                  <RotateCcw size={13} />
                  {t('home.refreshTrendsBatch')}
                </span>
              </div>
              <div className="hm-news-list">
                {visibleNews.map((n) => (
                  <button
                    type="button"
                    className="hm-news-row"
                    key={n.key}
                    title={n.title}
                    onClick={() => {
                      // 产品语义:点热点=把这条变成即时协助里的一段学习提问,不跳外链
                      const prompt = L(
                        `I want to truly understand the story behind this news: “${n.title}”. Walk me through it as an interactive lesson — background, key concepts, why it matters, and questions worth asking next.`,
                        `我想真正读懂这条新闻背后的门道：「${n.title}」。请用互动课的方式带我梳理——来龙去脉、关键概念、为什么重要、以及接下来值得追问的问题。`,
                      );
                      set({ homeTab: 'instant' });
                      setNote(prompt);
                      window.setTimeout(() => document.querySelector<HTMLInputElement>('.hm-input')?.focus(), 120);
                    }}
                  >
                    <Spline size={14} />
                    <span className="hm-news-title">{n.title}</span>
                    {n.source && <span className="hm-news-src">{n.source}</span>}
                  </button>
                ))}
              </div>
	            </div>
	          </>
	        )}

	        {/* affiliate banner — normal flow below primary content */}
	        <div className="hm-affiliate">
	          <div className="hm-affiliate-main">
	            <Handshake size={36} />
	            <div className="hm-affiliate-text">
	              {t('sidebar.affiliatePromoLine1')} {t('sidebar.affiliatePromoLine2')}
	            </div>
	          </div>
	          <button type="button" className="hm-affiliate-join" onClick={() => void copyInvite()}>
	            <ArrowUpRight size={12} />
	            {t('sidebar.affiliatePromoCta')}
	          </button>
	        </div>
	      </div>

      {/* welcome-back takeover:点层任意处即进入;每会话只出现一次(刷新不再重弹) */}
      {state.welcomeBack && (
        <div className="hm-welcome" onClick={() => set({ welcomeBack: false })}>
          <WelcomeReader size={300} />
          <div className="hm-welcome-text">
            <div className="hm-welcome-oh">{t('home.welcomeBack.greeting')}</div>
            <div className="hm-welcome-back">{t('home.welcomeBack.subtitle')}</div>
          </div>
          <DarkPill style={{ width: 190, height: 44 }} onClick={() => set({ welcomeBack: false })}>
            {t('home.welcomeBack.cta')}
          </DarkPill>
        </div>
      )}

      {whatsNewOpen && <WhatsNewModal onClose={() => setWhatsNewOpen(false)} />}
    </div>
  );
};
