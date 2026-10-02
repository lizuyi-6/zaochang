import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ArrowLeft,
  ArrowUp,
  SquarePen,
  GraduationCap,
  Globe,
  X,
  Square,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import type { PageProps } from '../types';
import {
  fetchCourseInquiry,
  normalizeDepth,
  generateCourseLive,
  type InquiryQuestion,
  type CourseBriefParams,
  type BlueprintData,
  type CourseGenProgressData,
  type CourseUnitProgressData,
  type GenStepId,
} from '../backend';
import { buildDefaultInquiryQuestions } from '../courseInquiry';
import { courseFromBackend, type GeneratedCourse } from '../generate';
import { courseJoinKey, markCourseJoined } from '../courseJoinMemory';
import { useI18n } from '../i18n';
import { L } from '../i18n/content';
import { AvatarCat, Astronaut, DeskWriter, RocketGirl, Ufo } from '../illustrations';
import { SupportModal } from '../SupportModal';
import { placeholders } from '../data';
import { toast } from '../toast';
import './CreatePage.css';

/**
 * 课程创建页 v2(cr-) — 参考代理活动流重做(2026-10):
 * 一条连续 feed 讲完整个建课过程 —
 *   用户命题气泡 → 「询问学习需求」步骤条 → AI 实时出题逐题作答(单选 pill + 其他…
 *   + 跳过/继续/提交回复) → 「搜索课程大纲」步骤 + 检索来源组 → 蓝图卡(进度→等待确认)
 *   → 蓝图预览侧板(单元树,勾选计费单元) → 确认后逐单元展开条目 → 课程已就绪。
 * 底部条:取消生成(中)+ 已耗时|阶段 pill(右) + 「刷新或离开会中断 · 7 天内不再提示」。
 * 学习小贴士卡随生成轮换。上游故障降级模板/检查点恢复逻辑与旧课程工坊一致。
 */

type Phase = 'intake' | 'generating';

const TIPS: Array<[string, string, React.FC<{ size?: number }>]> = [
  ['Upload your own files to enrich any course.', '上传你自己的文件，用你的资料丰富任意课程内容。', DeskWriter],
  ['Finished a course? Practice to make it stick.', '学完一门课程了吗？别忘了去练习巩固所学的内容。', Astronaut],
  ['Share a course with a friend in one click.', '喜欢某门课程？一键分享给朋友吧。', RocketGirl],
  ['Ask the tutor anything about this topic anytime.', '随时向导师提问任何与该主题相关的问题。', Ufo],
];

const DEPTH_STAGES: Array<{ key: string; en: string; zh: string; activeFor: string[] }> = [
  { key: 'intuition', en: 'Build intuition', zh: '建立直觉', activeFor: ['overview'] },
  { key: 'definition', en: 'Formal definitions', zh: '正式定义', activeFor: ['overview', 'systematic'] },
  { key: 'derivation', en: 'Derivations', zh: '公式推导', activeFor: ['systematic'] },
  { key: 'theory', en: 'Advanced theory', zh: '进阶理论', activeFor: ['deep'] },
  { key: 'applied', en: 'Applied practice', zh: '应用实操', activeFor: ['deep', 'systematic'] },
];

const fmtElapsed = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const hostOf = (link: string): string => {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return link.slice(0, 40);
  }
};

/** 步骤条目:粗标题 + 进行中省略号/完成对勾 */
const StepRow: React.FC<{ title: string; state: 'loading' | 'done'; sub?: string }> = ({ title, state, sub }) => (
  <div className={`cr-step ${state}`}>
    <span className="cr-step-ico" aria-hidden="true">
      {state === 'done' ? <Check size={14} strokeWidth={3} /> : <span className="cr-step-dot" />}
    </span>
    <span className="cr-step-body">
      <span className="cr-step-title">
        {title}
        {state === 'loading' ? ' …' : ''}
      </span>
      {sub ? <span className="cr-step-sub">{sub}</span> : null}
    </span>
  </div>
);

export const CreatePage: React.FC<PageProps> = ({ state, set }) => {
  const { lng } = useI18n();
  const isZh = lng ? !lng.toLowerCase().startsWith('en') : true;

  /* ---------- 会话与问询(intake) ---------- */
  const [topic, setTopic] = useState('');
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [intakeSource, setIntakeSource] = useState<'ai' | 'template'>('ai');
  const [questions, setQuestions] = useState<InquiryQuestion[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customDraft, setCustomDraft] = useState('');
  const [intakeDone, setIntakeDone] = useState(false);

  /* ---------- 生成(generating;原课程工坊逻辑迁入) ---------- */
  const [phase, setPhase] = useState<Phase>('intake');
  const [insufficient, setInsufficient] = useState(false);
  const [genFailed, setGenFailed] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [stepStatus, setStepStatus] = useState<Partial<Record<GenStepId, 'loading' | 'completed'>>>({});
  const [research, setResearch] = useState<CourseGenProgressData | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [blueprint, setBlueprint] = useState<BlueprintData | null>(null);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [waiting, setWaiting] = useState(false);
  const [stage2, setStage2] = useState(false);
  const [unit, setUnit] = useState({ cur: 0, total: 0, title: '' });
  const [unitDone, setUnitDone] = useState<Array<{ id: string; title: string }>>([]);
  const [ready, setReady] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);
  const [navHintOff, setNavHintOff] = useState(() => {
    const at = Number(localStorage.getItem('hk_gen_nav_hint_at') ?? 0);
    return Number.isFinite(at) && Date.now() - at < 7 * 24 * 3600 * 1000;
  });

  /* ---------- 蓝图侧板 / 杂项 ---------- */
  const [panelOpen, setPanelOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [input, setInput] = useState('');

  const runRef = useRef(0);
  const seededRef = useRef(false);
  const colEndRef = useRef<HTMLDivElement | null>(null);
  const columnRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);

  /* 生成请求生命周期(原 GenerationOverlay 语义,逐字保留) */
  const stage1CtrlRef = useRef<AbortController | null>(null);
  const stage2CtrlRef = useRef<AbortController | null>(null);
  const stage2BusyRef = useRef(false);
  const finishedRef = useRef(false);
  /** 生成在途标记:卸载(刷新/离开)时据此登记检查点,断点可从「课程」页恢复 */
  const inGenRef = useRef(false);
  const remainingRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const finishTimerRef = useRef<number | null>(null);
  const blueprintUuidRef = useRef('');
  const [blueprintUuid, setBlueprintUuid] = useState('');
  const updateBlueprintUuid = (uuid: string) => {
    blueprintUuidRef.current = uuid;
    setBlueprintUuid(uuid);
  };

  const writebackCredits = (remaining: number) => {
    remainingRef.current = remaining;
    set({
      energy: remaining,
      identity: {
        username: state.identity?.username || 'You',
        email: state.identity?.email || '',
        tier: state.identity?.tier || 'FREE',
        credits: remaining,
      },
    });
  };

  /* 已耗时计时:挂起即走,完成/失败/取消暂停 */
  const clockRunning = phase === 'generating' && !ready && !genFailed && !insufficient && !cancelled;
  useEffect(() => {
    if (!clockRunning) return;
    const iv = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 1000);
    return () => window.clearInterval(iv);
  }, [clockRunning]);

  /* 小贴士轮换(仅生成中) */
  useEffect(() => {
    if (phase !== 'generating' || ready || genFailed || insufficient || cancelled) return;
    const iv = window.setInterval(() => setTipIdx((i) => (i + 1) % TIPS.length), 12000);
    return () => window.clearInterval(iv);
  }, [phase, ready, genFailed, insufficient, cancelled]);

  /* 自动跟随:用户上翻阅读时不被新条目拽回底部 */
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
    if (followRef.current) colEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [questions, qIdx, phase, stepStatus, research, blueprint, waiting, unitDone.length, unit.cur, ready, genFailed, insufficient, cancelled, intakeLoading]);

  useEffect(() => () => {
    stage1CtrlRef.current?.abort();
    stage2CtrlRef.current?.abort();
    if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
    if (inGenRef.current) registerCheckpoint();
  }, []);

  /* ---------- 完成 / 取消 / 检查点(原课程工坊语义) ---------- */
  const finish = (gen: GeneratedCourse, persisted = false) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    inGenRef.current = false;
    const latestCredits = remainingRef.current;
    const genUuid = (gen as { courseUuid?: string }).courseUuid;
    markCourseJoined(state.identity?.email ?? 'demo', courseJoinKey(genUuid));
    set({
      generating: false,
      generated: gen,
      screen: 'courseJourney',
      courseJoined: true,
      genResume: null,
      ...(genUuid ? { activeCourseUuid: genUuid } : {}),
      ...(persisted ? { marketStale: true } : {}),
      ...(typeof latestCredits === 'number'
        ? {
            energy: latestCredits,
            identity: {
              username: state.identity?.username || 'You',
              email: state.identity?.email || '',
              tier: state.identity?.tier || 'FREE',
              credits: latestCredits,
            },
          }
        : {}),
    });
  };

  const registerCheckpoint = () => {
    if (blueprintUuidRef.current) set({ genResume: { uuid: blueprintUuidRef.current, query: topic } });
  };

  /** 整页放弃:问询中=直接回空态;生成中=先中断再回空态 */
  const abandonAll = () => {
    if (phase === 'generating' && !ready && !genFailed && !insufficient && !cancelled) {
      finishedRef.current = true;
      inGenRef.current = false;
      stage1CtrlRef.current?.abort();
      stage2CtrlRef.current?.abort();
      if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
      set({ generating: false });
      registerCheckpoint();
    }
    runRef.current += 1;
    setTopic('');
    setQuestions([]);
    setQIdx(0);
    setAnswers({});
    setCustomDraft('');
    setIntakeDone(false);
    setIntakeLoading(false);
    setPhase('intake');
    setInsufficient(false);
    setGenFailed(false);
    setCancelled(false);
    setReady(false);
    setWaiting(false);
    setStage2(false);
    setBlueprint(null);
    setPanelOpen(false);
    setUnitDone([]);
    setUnit({ cur: 0, total: 0, title: '' });
    setStepStatus({});
    setResearch(null);
    setElapsedMs(0);
    seededRef.current = false;
    followRef.current = true;
  };

  /* ---------- Stage 2:确认蓝图后逐单元生成(原逻辑) ---------- */
  const confirmAndStartStage2 = async (customUnits?: string[]) => {
    if (stage2BusyRef.current || finishedRef.current) return;
    stage2BusyRef.current = true;
    inGenRef.current = true;
    const ctrl = new AbortController();
    stage2CtrlRef.current = ctrl;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setWaiting(false);
    setStage2(true);
    setGenFailed(false);
    setCancelled(false);
    setStepStatus((s) => ({ ...s, generating_initial_syllabus: 'completed' }));

    const unitsToGenerate = customUnits || selectedUnits;

    let result: Awaited<ReturnType<typeof generateCourseLive>>;
    try {
      result = await generateCourseLive(
        { resumeUuid: blueprintUuid, action: 'confirm_blueprint', selectedUnits: unitsToGenerate, model: state.chatModel },
        {
          onUnitProgress: (data: CourseUnitProgressData) => {
            if (finishedRef.current) return;
            setUnit((cur) => ({ cur: Math.max(cur.cur, data.unit_index), total: Math.max(cur.total, data.total_units), title: data.title || cur.title }));
            if (data.completed && data.title) {
              setUnitDone((prev) => (prev.some((p) => p.id === data.unit_id) ? prev : [...prev, { id: data.unit_id ?? `u${data.unit_index}`, title: data.title as string }]));
            }
          },
          onRemaining: (remaining) => {
            if (finishedRef.current) return;
            writebackCredits(remaining);
          },
        },
        ctrl.signal,
      );
    } finally {
      stage2BusyRef.current = false;
      stage2CtrlRef.current = null;
    }

    if (finishedRef.current) return;
    if (result.ok && 'course' in result) {
      setReady(true);
      const gen = courseFromBackend(result.course, topic);
      finishTimerRef.current = window.setTimeout(() => finish(gen), 1000);
    } else {
      registerCheckpoint();
      setGenFailed(true);
    }
  };

  /* ---------- Stage 1:蓝图阶段(原逻辑) ---------- */
  const startGeneration = (query: string, brief: CourseBriefParams) => {
    finishedRef.current = false;
    inGenRef.current = true;
    remainingRef.current = null;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setPhase('generating');
    setCancelled(false);
    setInsufficient(false);
    setGenFailed(false);
    setReady(false);
    setBlueprint(null);
    setWaiting(false);
    setStage2(false);
    setStepStatus({});
    setResearch(null);
    setUnitDone([]);
    setUnit({ cur: 0, total: 0, title: '' });
    set({ generating: true, genQuery: query, courseBrief: brief, generated: null });
    followRef.current = true;

    const run = runRef.current;
    updateBlueprintUuid('');
    const ctrl = new AbortController();
    stage1CtrlRef.current = ctrl;

    (async () => {
      const result = await generateCourseLive(
        { query, brief, idempotencyKey: crypto.randomUUID(), requireConfirmation: true, model: state.chatModel },
        {
          onStep: (id, status, data) => {
            if (runRef.current !== run) return;
            setStepStatus((s) => ({ ...s, [id]: status }));
            if (id === 'researching_the_web' && data) {
              setResearch((prev) => ({ ...prev, ...(data as CourseGenProgressData) }));
            }
          },
          onProgress: (_message, data) => {
            if (runRef.current !== run) return;
            if (data) setResearch(data);
          },
          onBlueprint: (bp, reqConfirm, uuid) => {
            if (runRef.current !== run) return;
            setBlueprint(bp);
            if (uuid) updateBlueprintUuid(uuid);
            const allIds = bp.units?.map((u) => u.unitId).filter(Boolean) as string[] | undefined;
            if (allIds) setSelectedUnits(allIds);
            if (reqConfirm) {
              setWaiting(true);
              setPanelOpen(true);
            }
          },
          onRemaining: (remaining) => {
            if (runRef.current !== run) return;
            writebackCredits(remaining);
          },
        },
        ctrl.signal,
      );

      if (runRef.current !== run || finishedRef.current) return;
      /* 工程未开 strict:真值检查不收窄判别联合,必须用字面量判别 */
      if (result.ok === true) {
        if ('requiresConfirmation' in result && result.requiresConfirmation) {
          setWaiting(true);
          setStepStatus((s) => ({ ...s, generating_initial_syllabus: 'completed' }));
          setPanelOpen(true);
        } else if ('course' in result) {
          setReady(true);
          const gen = courseFromBackend(result.course, query);
          finishTimerRef.current = window.setTimeout(() => finish(gen, true), 1000);
        }
      } else if (result.reason === 'insufficient') {
        setInsufficient(true);
      } else {
        registerCheckpoint();
        setGenFailed(true);
      }
    })();
  };

  /* ---------- 问询(intake):AI 实时出题,逐题作答 ---------- */
  const startIntake = (prompt: string) => {
    const run = ++runRef.current;
    setTopic(prompt);
    setQuestions([]);
    setQIdx(0);
    setAnswers({});
    setCustomDraft('');
    setIntakeDone(false);
    setIntakeLoading(true);
    followRef.current = true;
    void (async () => {
      const res = await fetchCourseInquiry({
        topic: prompt,
        brief: { version: 0, language: isZh ? 'zh-CN' : 'en-US' },
        followUpRound: 0,
        model: state.chatModel,
        timeoutMs: 20000,
      });
      if (runRef.current !== run) return;
      if (res && res.questions && res.questions.length > 0) {
        setQuestions(res.questions);
        setIntakeSource(res.source ?? 'ai');
      } else {
        setQuestions(buildDefaultInquiryQuestions(prompt, isZh));
        setIntakeSource('template');
        toast(L('AI intake is unavailable right now — using the standard questionnaire.', 'AI 实时出题暂时不可用，已改用标准问询。'));
      }
      setIntakeLoading(false);
    })();
  };

  const submitIntake = () => {
    /* 未作答字段此刻才采用 AI 推荐值(表单不预置;作答过的永远以用户为准) */
    const merged: Record<string, string> = { ...answers };
    for (const q of questions) {
      if (!merged[q.field] || !merged[q.field].trim()) merged[q.field] = q.recommended;
    }
    const brief: CourseBriefParams = {
      version: 1,
      goal: merged.goal,
      background: merged.background,
      duration: merged.duration,
      depth: normalizeDepth(merged.depth),
      preference: merged.preference,
      language: merged.language || (isZh ? 'zh-CN' : 'en-US'),
      visual: merged.visual || 'Hand-drawn whiteboard diagrams & cards',
    };
    setIntakeDone(true);
    setCustomDraft('');
    startGeneration(topic, brief);
  };

  const advanceQuestion = () => {
    const q = questions[qIdx];
    if (q && customDraft.trim()) {
      setAnswers((prev) => ({ ...prev, [q.field]: customDraft.trim() }));
    }
    setCustomDraft('');
    if (qIdx < questions.length - 1) {
      setQIdx((i) => i + 1);
    } else {
      submitIntake();
    }
  };

  const skipQuestion = () => {
    const q = questions[qIdx];
    if (q) {
      setAnswers((prev) => {
        const next = { ...prev };
        delete next[q.field];
        return next;
      });
    }
    setCustomDraft('');
    if (qIdx < questions.length - 1) {
      setQIdx((i) => i + 1);
    } else {
      submitIntake();
    }
  };

  /* ---------- 进场播种 ---------- */
  useEffect(() => {
    if (seededRef.current) return;
    const seed = state.createPrompt.trim();
    const handoff = state.genResumeUuid;
    if (handoff) {
      /* Courses 页「继续生成」交接:直接落到中断态,由用户点恢复(不重跑蓝图重复扣积分) */
      seededRef.current = true;
      set({ genResumeUuid: undefined });
      updateBlueprintUuid(handoff);
      if (state.genQuery) setTopic(state.genQuery);
      setPhase('generating');
      setGenFailed(true);
      setCancelled(false);
      return;
    }
    if (!seed) return;
    seededRef.current = true;
    set({ createPrompt: '' });
    startIntake(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- 渲染辅助 ---------- */
  const researchState = stepStatus.researching_the_web;
  const syllabusState = stepStatus.generating_initial_syllabus;
  const sourcePairs = research?.titles?.length
    ? research.titles.map((t, i) => ({ title: t, link: research.links?.[i] ?? '' }))
    : [];

  const totalLectures =
    blueprint?.totalLectures || blueprint?.units?.reduce((acc, u) => acc + (u.lectureCount || 3), 0) || 0;
  const depthValue = String(normalizeDepth(answers.depth));

  const phaseLabel = insufficient
    ? L('Out of credits', '积分不足')
    : genFailed || cancelled
      ? L('Interrupted', '已中断')
      : ready
        ? L('Ready', '已就绪')
        : phase === 'intake'
          ? intakeDone
            ? L('Starting…', '正在开始…')
            : L('Waiting for you', '等你回答')
          : waiting
            ? L('Awaiting confirmation', '等你确认')
            : stage2
              ? L('Writing outline', '撰写大纲')
              : syllabusState === 'loading'
                ? L('Drawing structure', '绘制结构')
                : L('Researching', '调研资料');

  const tip = TIPS[tipIdx % TIPS.length];
  const TipIcon = tip[2];

  return (
    <div className={`hk-page cr-page${panelOpen ? ' panel-open' : ''}`}>
      {/* floating top-right utility cluster */}
      <div className="cr-utility">
        <button
          className="cr-util-btn"
          type="button"
          title={L('Back to home', '返回首页')}
          onClick={() => {
            abandonAll();
            set({ screen: 'home', homeTab: 'craft' });
          }}
        >
          <ArrowLeft size={15} />
        </button>
        <button
          className="cr-util-btn"
          type="button"
          title={L('Start a new course', '新开课程')}
          onClick={abandonAll}
        >
          <SquarePen size={15} />
        </button>
        <button className="cr-issue" type="button" onClick={() => setSupportOpen(true)}>
          {L('Contact the founders', '联系创始人')}
        </button>
        <AvatarCat size={34} />
      </div>

      {/* conversation / activity feed */}
      <div className="cr-column" ref={columnRef}>
        {!topic ? (
          <div className="cr-welcome">
            <GraduationCap size={44} strokeWidth={1.4} />
            <h2 className="cr-welcome-title">{L('Craft your next course', '打造你的下一门课')}</h2>
            <p className="cr-welcome-sub">
              {L(
                'Type what you want to learn below. Lattice researches, asks a few tailored questions, then builds the course on your whiteboard.',
                '在下方输入你想学的内容。见界会先检索资料、问几个为你定制的问题，然后在白板上为你开课。',
              )}
            </p>
            <div className="cr-welcome-chips">
              {placeholders().slice(0, 4).map((p) => (
                <button
                  key={p}
                  type="button"
                  className="cr-welcome-chip"
                  onClick={() => {
                    setInput(p);
                    inputRef.current?.focus();
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* 用户命题气泡 */}
            <div className="cr-bubble-row user">
              <div className="cr-bubble user">{topic}</div>
            </div>

            {/* 问询步骤条:AI 出题中转圈,题目送达即 ✓(作答属于题目块自身) */}
            <StepRow
              title={L(`Ask about your goals to tailor “${topic}”`, `询问学习需求以定制《${topic}》课程`)}
              state={intakeLoading ? 'loading' : 'done'}
              sub={
                intakeLoading
                  ? L('Tailoring questions to your topic…', '正在针对你的主题实时出题…')
                  : intakeSource === 'template'
                    ? L('AI unavailable — standard questionnaire', 'AI 暂不可用——已用标准问询')
                    : undefined
              }
            />

            {/* 逐题作答:已答的题保留展示,当前题带操作;未来题不出现 */}
            {questions.slice(0, intakeDone ? questions.length : qIdx + 1).map((q, qi) => {
              const isCurrent = !intakeDone && qi === qIdx;
              const value = answers[q.field] ?? '';
              const showActions = isCurrent;
              const isLast = qi === questions.length - 1;
              const canContinue = isCurrent && (!!value.trim() || !!customDraft.trim());
              return (
                <div className="cr-qblock" key={q.id || qi}>
                  <div className="cr-qhead">
                    <span className="cr-qtitle">{q.prompt}</span>
                    <span className="cr-qtag">{L('Single choice', '单选题')}</span>
                  </div>
                  <div className="cr-opts">
                    {q.options.map((opt) => {
                      const sp = opt.indexOf(' ');
                      const head = sp > 0 && sp <= 9 ? opt.slice(0, sp) : '';
                      const rest = head ? opt.slice(sp + 1) : opt;
                      const on = value === opt;
                      return (
                        <button
                          type="button"
                          key={opt}
                          className={`cr-opt${on ? ' on' : ''}`}
                          onClick={() => {
                            if (!isCurrent) return;
                            setAnswers((prev) => ({ ...prev, [q.field]: opt }));
                            setCustomDraft('');
                          }}
                        >
                          {on && <Check size={13} strokeWidth={3} className="cr-opt-check" />}
                          {head ? (
                            <>
                              <b>{head}</b> <span>{rest}</span>
                            </>
                          ) : (
                            <span>{rest}</span>
                          )}
                        </button>
                      );
                    })}
                    {isCurrent && (
                      <input
                        type="text"
                        className="cr-opt-other"
                        placeholder={L('Other…', '其他…')}
                        value={customDraft}
                        onChange={(e) => setCustomDraft(e.target.value)}
                      />
                    )}
                  </div>
                  {showActions && (
                    <div className="cr-qactions">
                      <button type="button" className="cr-skip" onClick={skipQuestion}>
                        {L('Skip', '跳过')}
                      </button>
                      <button
                        type="button"
                        className={`cr-continue${canContinue ? ' on' : ''}`}
                        disabled={!canContinue}
                        onClick={advanceQuestion}
                      >
                        {isLast ? L('Submit answers', '提交回复') : L('Continue', '继续')}
                        <ArrowUp size={13} style={{ transform: 'rotate(45deg)' }} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* ---------- 生成活动流 ---------- */}
            {phase === 'generating' && (
              <>
                <StepRow
                  title={L(`Search course syllabus for “${topic}”`, `搜索《${topic}》课程大纲`)}
                  state={researchState === 'completed' ? 'done' : 'loading'}
                  sub={
                    research?.status === 'disabled'
                      ? L('No web search — built from model knowledge', '无需外部检索，基于模型知识构建')
                      : research?.reason && researchState !== 'completed'
                        ? research.reason
                        : undefined
                  }
                />
                {researchState === 'completed' && sourcePairs.length > 0 && (
                  <div className="cr-sources">
                    <span className="cr-sources-pill">
                      <Globe size={12} />
                      {L(`Web search · ${research?.sources ?? sourcePairs.length} sources`, `网络检索 · ${research?.sources ?? sourcePairs.length} 个来源`)}
                    </span>
                    <div className="cr-source-list">
                      {(sourcesOpen ? sourcePairs : sourcePairs.slice(0, 5)).map((s, i) => (
                        <a className="cr-source" key={`${s.link}-${i}`} href={s.link || undefined} target="_blank" rel="noreferrer">
                          <Globe size={13} />
                          <span className="cr-source-title">{s.title}</span>
                          {s.link && <span className="cr-source-host">{hostOf(s.link)}</span>}
                        </a>
                      ))}
                      {sourcePairs.length > 5 && (
                        <button type="button" className="cr-source-more" onClick={() => setSourcesOpen((o) => !o)}>
                          {sourcesOpen ? L('Show less', '收起') : L(`And ${sourcePairs.length - 5} more…`, `还有 ${sourcePairs.length - 5} 个…`)}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <StepRow
                  title={L(`Build the units for “${topic}”`, `搭建《${topic}》课程单元`)}
                  state={syllabusState === 'completed' ? 'done' : 'loading'}
                />

                {/* 蓝图卡:进度 → 等待确认 */}
                {blueprint && !stage2 && (
                  <div className="cr-genesis">
                    {waiting ? (
                      <>
                        <div className="cr-genesis-row">
                          <span className="cr-genesis-ico ok">
                            <Check size={16} strokeWidth={3} />
                          </span>
                          <span className="cr-genesis-body">
                            <b>{L('Course blueprint · waiting for you', '课程蓝图 · 等待你确认')}</b>
                            <span>{L('Open to review and confirm the structure', '概念图 · 打开以查看并确认课程结构')}</span>
                          </span>
                          <button type="button" className="cr-genesis-open" onClick={() => setPanelOpen(true)}>
                            {L('Review & confirm', '查看并确认')}
                          </button>
                        </div>
                        <p className="cr-genesis-note">
                          {L(
                            'This is a preview of the course structure. Open the panel to tweak which units to generate — unchecked units cost nothing. Confirm when it looks right.',
                            '这是本课程的结构预览。打开侧板可勾选要生成的单元——未勾选的单元不扣积分。确认无误后继续生成完整课程。',
                          )}
                        </p>
                        <div className="cr-genesis-cta">
                          <span className="cr-genesis-ask">{L('Adjust the structure, or continue?', '请确认课程讲解结构是否需要调整')}</span>
                          <div className="cr-genesis-btns">
                            <button type="button" className="cr-ghost2" onClick={() => setPanelOpen(true)}>
                              {L('I want to modify the structure', '我想修改课程讲解结构')}
                            </button>
                            <button
                              type="button"
                              className="cr-primary2"
                              disabled={selectedUnits.length === 0}
                              onClick={() => void confirmAndStartStage2()}
                            >
                              <Check size={14} style={{ marginRight: 6 }} />
                              {L('Looks good — generate the full course', '没问题，继续生成课程细节')}
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="cr-genesis-row">
                        <span className="cr-genesis-ico spin">
                          <RefreshCw size={15} />
                        </span>
                        <span className="cr-genesis-body">
                          <b>{L('Drawing the course blueprint', '正在绘制课程蓝图')}</b>
                          <span>
                            {L(
                              `Concept map · ${blueprint.units?.length ?? 0} units · ${totalLectures} lectures`,
                              `概念图 · ${blueprint.units?.length ?? 0} 个单元 · ${totalLectures} 个讲次`,
                            )}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* 已确认条目 + 逐单元展开 */}
                {stage2 && (
                  <StepRow
                    title={L('Course blueprint confirmed', '课程蓝图已确认')}
                    state="done"
                    sub={L('Concept map · open to view the structure', '概念图 · 打开以查看课程结构')}
                  />
                )}
                {stage2 && !ready && (
                  <StepRow
                    title={L('Writing lectures & sections', '编写课程大纲与讲节内容')}
                    state="loading"
                    sub={
                      unit.total > 0
                        ? L(`Unit ${unit.cur}/${unit.total}: ${unit.title}`, `第 ${unit.cur}/${unit.total} 单元：${unit.title}`)
                        : undefined
                    }
                  />
                )}
                {unitDone.map((u) => (
                  <StepRow key={u.id} title={L(`Expand ${u.title}`, `展开${u.title}`)} state="done" />
                ))}
                {ready && <StepRow title={L('Your course is ready', '课程已就绪')} state="done" />}

                {/* 失败 / 积分不足 / 取消 */}
                {(insufficient || genFailed || cancelled) && (
                  <div className="cr-alert" role="status">
                    <div className="cr-alert-title">
                      <TriangleAlert size={15} />
                      {insufficient
                        ? L('Out of credits', '积分不足')
                        : cancelled
                          ? L('Generation cancelled', '生成已取消')
                          : L('Generation interrupted', '生成中断')}
                    </div>
                    <p className="cr-alert-body">
                      {insufficient
                        ? L(
                            'A course costs 10 credits. You get 20 free credits every day (2 per chat), resetting at midnight Beijing time.',
                            '生成一门课程需要 10 积分。每天免费获得 20 积分（对话 2/次），北京时间零点自动重置。',
                          )
                        : cancelled
                          ? L('Your checkpoint is safely stored — resume anytime without paying twice.', '检查点已安全落库，可随时恢复，不会重复扣积分。')
                          : L(
                              'Generation hit an issue. Your checkpoint is safely stored — resume anytime without paying twice.',
                              '生成遇到异常。检查点已安全落库，可随时恢复，不会重复扣积分。',
                            )}
                    </p>
                    <div className="cr-alert-btns">
                      {blueprintUuid && !insufficient && (
                        <button
                          type="button"
                          className="cr-primary2"
                          onClick={() => {
                            setCancelled(false);
                            setGenFailed(false);
                            void confirmAndStartStage2();
                          }}
                        >
                          {L('Resume from checkpoint', '从检查点恢复生成')}
                        </button>
                      )}
                      <button type="button" className="cr-ghost2" onClick={() => startIntake(topic)}>
                        {L('Restart intake', '重新定制')}
                      </button>
                    </div>
                  </div>
                )}

                {/* 学习小贴士(生成中轮换) */}
                {!ready && !genFailed && !insufficient && !cancelled && (
                  <div className="cr-tip">
                    <span className="cr-tip-ico">
                      <TipIcon size={44} />
                    </span>
                    <span className="cr-tip-body">
                      <b>{L('Study tip', '学习小贴士')}</b>
                      <span>{L(tip[0], tip[1])}</span>
                    </span>
                  </div>
                )}
              </>
            )}
          </>
        )}
        <div ref={colEndRef} className="cr-col-end" />
      </div>

      {/* 空态命题输入(深链兜底) */}
      {!topic && (
        <div className="cr-dock">
          <div className="cr-composer">
            <input
              ref={inputRef}
              className="cr-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && input.trim()) startIntake(input.trim());
              }}
              placeholder={L('What do you want to learn? e.g. “Macroeconomics”', '你想学什么？例如「宏观经济学」')}
            />
            <button
              className="cr-send"
              type="button"
              title={L('Start', '开始定制')}
              disabled={!input.trim()}
              onClick={() => input.trim() && startIntake(input.trim())}
            >
              <ArrowUp size={14} />
            </button>
          </div>
        </div>
      )}

      {/* 底部条:取消生成(中)+ 阶段 pill(右)+ 中断提示(7 天内不再提示) */}
      {topic && !ready && (
        <div className={`cr-bottombar${panelOpen ? ' shift' : ''}`}>
          {phase === 'generating' && !navHintOff && (
            <div className="cr-navhint">
              {L('Refreshing or leaving this page will interrupt the generation', '刷新或离开页面会中断生成')}
              {' · '}
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem('hk_gen_nav_hint_at', String(Date.now()));
                  setNavHintOff(true);
                }}
              >
                {L("Don't remind me for 7 days", '7 天内不再提示')}
              </button>
            </div>
          )}
          <div className="cr-bottombar-row">
            <span className="cr-bb-spacer" />
            <button type="button" className="cr-cancel" onClick={abandonAll}>
              <Square size={11} fill="currentColor" />
              {phase === 'generating' ? L('Cancel generation', '取消生成') : L('Cancel intake', '取消定制')}
            </button>
            <span className="cr-bb-status">
              {phase === 'generating' && <b className="cr-elapsed">{fmtElapsed(elapsedMs)}</b>}
              <span className="cr-bb-pill">{phaseLabel}</span>
            </span>
          </div>
        </div>
      )}

      {/* 蓝图预览侧板 */}
      {panelOpen && blueprint && (
        <aside className="cr-panel" role="dialog" aria-label={L('Course blueprint', '课程蓝图')}>
          <div className="cr-panel-head">
            <span className="cr-panel-tab active">{L('Course blueprint', '课程蓝图')}</span>
            <button type="button" className="cr-panel-close" onClick={() => setPanelOpen(false)} aria-label={L('Close', '关闭')}>
              <X size={16} />
            </button>
          </div>
          <div className="cr-panel-body">
            <div className="cr-panel-kicker">{L('Course structure', '课程讲解结构')}</div>
            <h3 className="cr-panel-title">
              {blueprint.courseTitle}
              <span className="cr-panel-count">
                {L(`${totalLectures} lectures`, `${totalLectures} 个讲次`)}
              </span>
            </h3>
            {blueprint.courseDescription && <p className="cr-panel-desc">{blueprint.courseDescription}</p>}
            <div className="cr-panel-depth">
              <span className="cr-depth-label">{L('Course depth', '课程深度')}</span>
              {DEPTH_STAGES.map((d) => (
                <span key={d.key} className={`cr-depth-pill${d.activeFor.includes(depthValue) ? ' on' : ''}`}>
                  {L(d.en, d.zh)}
                </span>
              ))}
            </div>
            <div className="cr-panel-hint">
              {L('Uncheck units you do not need — unchecked units cost nothing.', '不需要的单元可以取消勾选——未勾选的单元不扣积分。')}
            </div>
            <div className="cr-tree">
              <div className="cr-tree-root">
                <div className="cr-tree-root-card">
                  <b>{blueprint.courseTitle}</b>
                  <span>
                    {(blueprint.tags && blueprint.tags.length > 0 ? blueprint.tags : [answers.preference || L('Tailored', '量身定制')].slice(0, 3)).map((tg) => (
                      <i key={tg}>#{tg}</i>
                    ))}
                  </span>
                </div>
              </div>
              <div className="cr-tree-units">
                {blueprint.units?.map((u, idx) => {
                  const uId = u.unitId || `unit-${idx + 1}`;
                  const checked = selectedUnits.includes(uId);
                  const doneUnit = unitDone.some((d) => d.id === uId);
                  return (
                    <label key={uId} className={`cr-tree-unit${checked ? ' on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={stage2 || ready}
                        onChange={() =>
                          setSelectedUnits((prev) => (prev.includes(uId) ? prev.filter((id) => id !== uId) : [...prev, uId]))
                        }
                      />
                      <span className="cr-tree-unit-num">{L(`Unit ${String(idx + 1).padStart(2, '0')}`, `单元 ${String(idx + 1).padStart(2, '0')}`)}</span>
                      <span className="cr-tree-unit-title">{u.title}</span>
                      <span className="cr-tree-unit-meta">
                        {doneUnit ? (
                          <>
                            <Check size={12} strokeWidth={3} /> {L('Done', '已生成')}
                          </>
                        ) : (
                          L(`${u.lectureCount ?? 3} lectures`, `${u.lectureCount ?? 3} 讲`)
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="cr-panel-foot">
            {stage2
              ? ready
                ? L('Course complete', '课程生成完成')
                : L(`Writing lectures · unit ${unit.cur}/${unit.total || blueprint.units?.length || 0}`, `正在编写讲次与小节 · 单元 ${unit.cur}/${unit.total || blueprint.units?.length || 0}`)
              : waiting
                ? L('Waiting for your confirmation', '等待你确认课程结构')
                : L(
                    `${blueprint.units?.length ?? 0} units · ≈ ${blueprint.estimatedMinutes ?? (blueprint.units?.length ?? 4) * 45} min`,
                    `${blueprint.units?.length ?? 0} 个单元 · ≈ ${blueprint.estimatedMinutes ?? (blueprint.units?.length ?? 4) * 45} 分钟`,
                  )}
          </div>
        </aside>
      )}

      {supportOpen && <SupportModal onClose={() => setSupportOpen(false)} title={L('Contact the founders', '联系创始人')} />}
    </div>
  );
};
