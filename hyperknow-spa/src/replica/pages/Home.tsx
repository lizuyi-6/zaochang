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
import { Logo, PlanetDoodle, CourseCover, Handshake, WelcomeReader, Ufo } from '../illustrations';
import { Modal, DarkPill } from '../ui';
import { useI18n, TRich } from '../i18n';
import { L } from '../i18n/content';
import { WhatsNewModal } from '../WhatsNewModal';
import { copyText, listenOnce, tts } from '../actions';
import { uploadMaterial } from '../materials';
import { toast } from '../toast';
import { fetchCourseInquiry, normalizeDepth, type InquiryQuestion, type CourseBriefParams } from '../backend';
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

/** 0ms 瞬间生成初始推荐问询，默认全中文友好，绝不转圈卡顿 */
export function buildDefaultInquiryQuestions(prompt: string, isZh: boolean): InquiryQuestion[] {
  const isCodeOrTech = /(vue|react|angular|svelte|next|nuxt|vite|webpack|typescript|javascript|python|rust|golang|go|java|c\+\+|linux|docker|k8s|ai|llm|deep learning|machine learning|code|api|web|algorithm|database|微积分|物理|数学|代码|编程|算法)/i.test(prompt);

  if (isZh) {
    return [
      {
        id: 'goal',
        field: 'goal',
        prompt: `你学习《${prompt}》的核心目标是什么？`,
        recommended: isCodeOrTech ? '掌握核心概念与实战落地应用' : '系统掌握核心原理与实际应用',
        options: isCodeOrTech
          ? ['掌握核心概念与实战落地应用', '快速攻克考试与核心考点', '完成生产级实战项目', '深入底层原理与系统架构']
          : ['系统掌握核心原理与实际应用', '快速攻克考试与核心考点', '通识科普与宏观视野建立', '深入经典理论与专业推导'],
      },
      {
        id: 'background',
        field: 'background',
        prompt: '你当前的相关知识储备与先修基础如何？',
        recommended: '具备基础好奇心的初学者',
        options: [
          '零基础跨专业入门',
          '具备基础好奇心的初学者',
          '具备一定基础的进阶学习者',
          '寻求专题突破的资深从业者',
        ],
      },
      {
        id: 'duration',
        field: 'duration',
        prompt: '你的预期学习周期与时间预算？',
        recommended: '标准节奏（2-4 周，自适应学习）',
        options: [
          '高效冲刺（1-3 天速成）',
          '标准节奏（2-4 周，自适应学习）',
          '系统大课（1-2 个月深度掌握）',
        ],
      },
      {
        id: 'depth',
        field: 'depth',
        prompt: '希望达到什么样的知识深度？',
        recommended: '系统实战（理论兼顾实操）',
        options: [
          '核心通识（二八法则快速入门）',
          '系统实战（理论兼顾实操）',
          '严谨学术（完整逻辑推导）',
          '工业级深度（解决复杂实际问题）',
        ],
      },
      {
        id: 'preference',
        field: 'preference',
        prompt: '你偏好的白板授课与互动形式？',
        recommended: '项目实操结合白板板书图解',
        options: [
          '项目实操结合白板板书图解',
          '苏格拉底式启发提问与逐步推导',
          '微课切片结合高频随堂测验',
          '真实案例拆解与踩坑复盘',
        ],
      },
    ];
  }

  return [
    {
      id: 'goal',
      field: 'goal',
      prompt: `What is your primary learning goal for "${prompt}"?`,
      recommended: isCodeOrTech ? 'Master core principles and practical skills' : 'Comprehensive deep dive and understanding',
      options: isCodeOrTech
        ? ['Master core principles and practical skills', 'Build production-ready projects', 'Pass technical interviews & exams', 'Deep architectural mastery']
        : ['Comprehensive deep dive and understanding', 'Academic & exam preparation', 'Practical everyday application', 'Quick conceptual overview'],
    },
    {
      id: 'background',
      field: 'background',
      prompt: 'What is your current background / prerequisite knowledge?',
      recommended: 'Beginner with foundational curiosity',
      options: [
        'Complete beginner (zero prior knowledge)',
        'Beginner with foundational curiosity',
        'Intermediate practitioner with basic experience',
        'Advanced practitioner seeking specialized mastery',
      ],
    },
    {
      id: 'duration',
      field: 'duration',
      prompt: 'What is your available time budget / learning pace?',
      recommended: 'Standard (2-4 weeks, self-paced)',
      options: [
        'Crash course (1-3 days intensive)',
        'Standard (2-4 weeks, self-paced)',
        'Deep curriculum (1-2 months structured)',
      ],
    },
    {
      id: 'depth',
      field: 'depth',
      prompt: 'What target depth level are you aiming for?',
      recommended: 'Practical & Comprehensive',
      options: [
        'Foundational Overview (80/20 essentials)',
        'Practical & Comprehensive',
        'Rigorous & Theoretical',
        'System Design & Production-grade',
      ],
    },
    {
      id: 'preference',
      field: 'preference',
      prompt: 'What is your preferred pedagogical and visual style?',
      recommended: 'Project-based hands-on with visual whiteboard diagrams',
      options: [
        'Project-based hands-on with visual whiteboard diagrams',
        'Socratic dialogue and step-by-step proofs',
        'Bite-sized micro-lessons with frequent quizzes',
        'Case study driven with real-world breakdowns',
      ],
    },
  ];
}

/** Home — Craft Courses / Instant Assistance (1600×900 reference geometry). */
export const Home = ({ state, set }: PageProps) => {
  const { t, lng } = useI18n();
  const [phIdx, setPhIdx] = useState(0);
  const [topic, setTopic] = useState('');
  const [note, setNote] = useState('');
  const [menu, setMenu] = useState<'none' | 'source' | 'notes' | 'persona' | 'tools' | 'speed'>('none');
  const [notesDraft, setNotesDraft] = useState('');
  const [attachments, setAttachments] = useState<Array<{ name: string; url: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);
  const [newsOffset, setNewsOffset] = useState(0);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 课程前置问询状态 (3-5 问询推荐继续，最多 2 轮智能追问)
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [inquiryPendingPrompt, setInquiryPendingPrompt] = useState('');
  const [inquiryQuestions, setInquiryQuestions] = useState<InquiryQuestion[]>([]);
  const [inquiryAnswers, setInquiryAnswers] = useState<Record<string, string>>({});
  const [inquiryRound, setInquiryRound] = useState(0);
  const [inquiryFollowUpAllowed, setInquiryFollowUpAllowed] = useState(true);
  const [inquiryLoading, setInquiryLoading] = useState(false);

  // rotate the Craft Courses prompt placeholder through the topic examples
  useEffect(() => {
    const t = setInterval(() => setPhIdx((i) => (i + 1) % placeholders().length), 3500);
    return () => clearInterval(t);
  }, []);

  const attachLine = () => attachments.map((a) => `[Attachment: ${a.name} — ${a.url}]`).join('\n');

  const submitTopic = () => {
    const prompt = topic.trim();
    if (!prompt) return;
    const withFiles = attachLine();
    const finalPrompt = withFiles ? `${prompt}\n\n${withFiles}` : prompt;
    setInquiryPendingPrompt(finalPrompt);
    setInquiryRound(0);

    // 默认全中文友好问询：除非界面语言明确是纯英文(en)，否则无论输入 vue/react/python 等纯英文，问询一律使用地道中文！
    const isZh = lng ? !lng.toLowerCase().startsWith('en') : true;
    const initialQuestions = buildDefaultInquiryQuestions(prompt, isZh);
    setInquiryQuestions(initialQuestions);
    setInquiryFollowUpAllowed(true);

    const initialAnswers: Record<string, string> = {};
    for (const q of initialQuestions) {
      initialAnswers[q.field] = q.recommended;
    }
    setInquiryAnswers(initialAnswers);
    setInquiryLoading(false);
    setInquiryOpen(true);
  };

  const confirmGenerationWithBrief = (customBrief?: CourseBriefParams) => {
    const isZh = lng ? !lng.toLowerCase().startsWith('en') : true;
    const rawDepth = inquiryAnswers.depth;
    const normalizedDepth = normalizeDepth(rawDepth);
    const finalBrief: CourseBriefParams = customBrief || {
      version: inquiryRound + 1,
      goal: inquiryAnswers.goal,
      background: inquiryAnswers.background,
      duration: inquiryAnswers.duration,
      depth: normalizedDepth,
      preference: inquiryAnswers.preference,
      language: inquiryAnswers.language || (isZh ? 'zh-CN' : 'en-US'),
      visual: inquiryAnswers.visual || 'Hand-drawn whiteboard diagrams & cards',
    };
    setInquiryOpen(false);
    setAttachments([]);
    set({
      generating: true,
      genQuery: inquiryPendingPrompt,
      courseBrief: finalBrief,
      generated: null,
    });
  };

  const handleSmartFollowUp = async () => {
    if (inquiryRound >= 2 || !inquiryFollowUpAllowed) return;
    setInquiryLoading(true);
    try {
      const res = await fetchCourseInquiry({
        topic: inquiryPendingPrompt || topic,
        brief: {
          version: inquiryRound + 1,
          ...inquiryAnswers,
        },
        answers: inquiryAnswers,
        followUpRound: inquiryRound + 1,
      });
      if (res && res.questions && res.questions.length > 0) {
        setInquiryQuestions(res.questions);
        setInquiryFollowUpAllowed(res.followUpAllowed);
        setInquiryRound((r) => r + 1);
        const updated = { ...inquiryAnswers };
        for (const q of res.questions) {
          if (!updated[q.field]) updated[q.field] = q.recommended;
        }
        setInquiryAnswers(updated);
      } else {
        setInquiryFollowUpAllowed(false);
        toast(L('Current recommendations are fully calibrated.', '当前问询已对齐最佳配置'));
      }
    } catch {
      setInquiryFollowUpAllowed(false);
    } finally {
      setInquiryLoading(false);
    }
  };
  const submitNote = () => {
    const text = note.trim();
    if (!text) return;
    const withFiles = attachLine();
    setAttachments([]);
    set({ screen: 'chat', chatNote: withFiles ? `${text}\n\n${withFiles}` : text });
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
    const ok = await copyText(`${window.location.origin}/?utm_source=hyperknow&utm_medium=invite`);
    toast(ok ? L('Invite link copied — share it with a friend', '邀请链接已复制——发给朋友吧') : L('Could not copy the link', '复制链接失败'));
  };

  const news = newsFeed();
  const rotatedNews = [...news.slice(newsOffset), ...news.slice(0, newsOffset)];

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
                <div className="hm-toolbar-right">
                  <span className="hm-cost">
                    <Sparkles size={14} color="#6B7280" />
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
                      <CourseCover kind={c.cover} />
                    </div>
                    <div className="hm-course-body">
                      <div className="hm-provider">
                        <span className="hm-provider-logo">
                          <Logo size={18} />
                        </span>
                        <span className="hm-provider-name">{t('home.courseTicket.defaultAuthor', { brand: L('Lattice', '见界') })}</span>
                        <BadgeCheck size={15} style={{ fill: '#3B82F6', color: '#fff' }} />
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
                      {[0.5, 0.75, 1, 1.25, 1.5].map((sp) => (
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
                      {state.replyMode === 'fast' ? t('home.speedModeFast') : t('home.speedModeNormal')}
                      <ChevronDown size={14} />
                    </button>
                    {menu === 'speed' && (
                      <div className="hk-menu hm-menu hm-menu-up">
                        {(['standard', 'fast'] as const).map((m) => (
                          <button
                            key={m}
                            className={`hk-menu-item${state.replyMode === m ? ' active' : ''}`}
                            onClick={() => {
                              set({ replyMode: m });
                              setMenu('none');
                            }}
                          >
                            {m === 'fast' ? t('home.speedModeFast') : t('home.speedModeNormal')}
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
                  className="hm-news-next"
                  onClick={() => {
                    setNewsOffset((i) => (i + 1) % Math.max(news.length, 1));
                    toast(L('Trends refreshed', '趋势已刷新'));
                  }}
                >
                  <RotateCcw size={13} />
                  {t('home.refreshTrendsBatch')}
                </span>
              </div>
              <div className="hm-news-list">
                {rotatedNews.map((n) => (
                  <div className="hm-news-row" key={n}>
                    <Spline size={14} />
	                    {n}
	                  </div>
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

      {/* welcome-back takeover */}
      {state.welcomeBack && (
        <div className="hm-welcome">
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

      {/* 课程前置问询 Modal (3-5 问询推荐继续，最多 2 轮智能追问) */}
      {inquiryOpen && (
        <Modal onClose={() => setInquiryOpen(false)} scrim="dark-blur" width={640}>
          <div className="hm-inquiry-box">
            <div className="hm-inquiry-head">
              <div>
                <div className="hm-inquiry-title">
                  <Sparkles size={16} />
                  <span>{L('Curriculum Customization Brief', '定制课程前置问询')}</span>
                  <span className="hm-inquiry-round-tag">
                    {inquiryRound > 0 ? L(`Follow-up ${inquiryRound}/2`, `智能追问 ${inquiryRound}/2`) : L('3-5 Inquiries', '3-5 项推荐')}
                  </span>
                </div>
                <div className="hm-inquiry-sub">
                  {L('Confirm your learning goal, background, and visual preference. You can proceed directly with recommendations.', '定制你的目标、基础、时间与板书偏好。可一键采用推荐继续，亦可自由修改。')}
                </div>
              </div>
              <button
                type="button"
                className="hm-inquiry-close"
                onClick={() => setInquiryOpen(false)}
                aria-label={L('Close', '关闭')}
              >
                <X size={16} />
              </button>
            </div>

            {inquiryLoading ? (
              <div className="hm-inquiry-loading">
                <Sparkle className="hm-spin" size={24} />
                <span>{L('Tailoring learning inquiries for your topic...', '正在针对该主题智能生成问询...')}</span>
              </div>
            ) : (
              <div className="hm-inquiry-body">
                {inquiryQuestions.map((q, qIdx) => {
                  const currentVal = inquiryAnswers[q.field] ?? q.recommended;
                  return (
                    <div className="hm-inquiry-q" key={q.id || qIdx} style={{ '--q-idx': qIdx } as React.CSSProperties}>
                      <div className="hm-inquiry-q-prompt">
                        <span className="hm-inquiry-q-num">{qIdx + 1}</span>
                        <span>{q.prompt}</span>
                      </div>
                      <div className="hm-inquiry-options">
                        {q.options.map((opt) => {
                          const isSelected = currentVal === opt;
                          return (
                            <button
                              type="button"
                              key={opt}
                              className={`hm-inquiry-opt-chip${isSelected ? ' selected' : ''}`}
                              onClick={() => setInquiryAnswers((prev) => ({ ...prev, [q.field]: opt }))}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        type="text"
                        className="hm-inquiry-input"
                        placeholder={L(`Custom ${String(q.field)} (or pick above)`, `自定义${String(q.field)}（或点击上方选项）`)}
                        value={inquiryAnswers[q.field] ?? ''}
                        onChange={(e) => setInquiryAnswers((prev) => ({ ...prev, [q.field]: e.target.value }))}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            <div className="hm-inquiry-footer">
              <div className="hm-inquiry-footer-left">
                <button
                  type="button"
                  className="hm-inquiry-ghost-btn"
                  onClick={() => confirmGenerationWithBrief()}
                >
                  {L('Skip (Use Defaults)', '跳过定制 (直接生成)')}
                </button>
                {inquiryFollowUpAllowed && inquiryRound < 2 && (
                  <button
                    type="button"
                    className="hm-inquiry-followup-btn"
                    onClick={() => void handleSmartFollowUp()}
                    disabled={inquiryLoading}
                  >
                    <Sparkles size={13} />
                    {L('Smart Clarification', '智能追问澄清')}
                  </button>
                )}
              </div>
              <div className="hm-inquiry-footer-right">
                <DarkPill
                  style={{ height: 38, padding: '0 18px', fontWeight: 600 }}
                  onClick={() => confirmGenerationWithBrief()}
                >
                  <Check size={14} style={{ marginRight: 6 }} />
                  {L('Continue with Recommended', '推荐继续')}
                </DarkPill>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {whatsNewOpen && <WhatsNewModal onClose={() => setWhatsNewOpen(false)} />}
    </div>
  );
};
