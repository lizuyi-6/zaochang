import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useI18n } from './i18n';
import { L } from './i18n/content';
import {
  generateCourseLive,
  type BlueprintData,
  type CourseGenProgressData,
  type GenStepId,
} from './backend';
import { courseFromBackend, type GeneratedCourse } from './generate';
import { courseJoinKey, markCourseJoined } from './courseJoinMemory';
import type { PageProps } from './types';
import './shell.css';

/**
 * 全屏「课程工坊」— 课程生成等待体验(暖色编辑工作室语言)。
 * 呈现层重做(2026-10):全屏暖纸接管替代小卡浮层;主题衬线回显;编号阶段时间线由
 * 真实 SSE 帧驱动(boot → researching_the_web → generating_initial_syllabus →
 * blueprint_ready → 逐单元细化);整体进度条按阶段权重 × 真实单元比例;已耗时计时器。
 * 逻辑层与旧实现逐字一致:在线优先、蓝图确认门、检查点断点恢复、abort/忙碌守卫、
 * 积分回写;后端不可达无缝回退伪生成计时序列。
 */



const LIVE_STEPS: { id: GenStepId; phase: 'initial' | 'research' | 'crafting' }[] = [
  { id: 'boot', phase: 'initial' },
  { id: 'researching_the_web', phase: 'research' },
  { id: 'generating_initial_syllabus', phase: 'crafting' },
];


const parseLines = (raw: string, fallback: string): string[] => {
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) return arr.map(String);
  } catch {
    /* dict 值不是数组时退回阶段名 */
  }
  return [fallback];
};

const fmtElapsed = (ms: number) => {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export const GenerationOverlay: React.FC<PageProps> = ({ state, set }) => {
  const { t } = useI18n();
  const query = state.genQuery;
  const [mode, setMode] = useState<'connecting' | 'live'>('connecting');
  const [insufficient, setInsufficient] = useState(false);
  const [failed, setFailed] = useState(false);
  const [stepStatus, setStepStatus] = useState<Partial<Record<GenStepId, 'loading' | 'completed'>>>({});
  const [searchProgress, setSearchProgress] = useState<CourseGenProgressData | null>(null);
  const [blueprint, setBlueprint] = useState<BlueprintData | null>(null);
  const [blueprintUuid, setBlueprintUuid] = useState<string>('');
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [waitingConfirmation, setWaitingConfirmation] = useState(false);
  const [stage2Active, setStage2Active] = useState(false);
  const [liveCurrentUnit, setLiveCurrentUnit] = useState(0);
  const [liveTotalUnits, setLiveTotalUnits] = useState(0);
  const [liveUnitTitle, setLiveUnitTitle] = useState('');
  const [activePhase, setActivePhase] = useState<'initial' | 'research' | 'crafting'>('initial');
  const [ready, setReady] = useState(false);
  const [lineIdx, setLineIdx] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef<number>(Date.now());
  const finishedRef = useRef(false);
  const remainingRef = useRef<number | null>(null);
  /* Stage 2 请求生命周期:取消/卸载必须真正 abort SSE,忙碌守卫挡连击(重复 confirm
   * 会在后端撞 409 并发租约并白烧一次生成) */
  const stage2CtrlRef = useRef<AbortController | null>(null);
  const stage2BusyRef = useRef(false);
  const finishTimerRef = useRef<number | null>(null);
  /* blueprintUuid 的 ref 镜像:异步 SSE 闭包里读到的是旧 state,断点登记必须拿最新值 */
  const blueprintUuidRef = useRef('');
  const updateBlueprintUuid = (uuid: string) => {
    blueprintUuidRef.current = uuid;
    setBlueprintUuid(uuid);
  };

  const cg = 'chatResponse.courseGeneration';

  /* 已耗时计时:挂起即走,完成/失败/确认门暂停在原地(用户回看耗时) */
  const clockRunning = !ready && !failed && !insufficient;
  useEffect(() => {
    if (!query || !clockRunning) return;
    const iv = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 1000);
    return () => window.clearInterval(iv);
  }, [query, clockRunning]);

  const finish = (gen: GeneratedCourse, persisted = false) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const latestCredits = remainingRef.current;
    /* persisted = 真 LLM 生成并已入 D1:集市/我的课程列表需要重拉才能看到新课 */
    markCourseJoined(state.identity?.email ?? 'demo', courseJoinKey((gen as { courseUuid?: string }).courseUuid));
    const genUuid = (gen as { courseUuid?: string }).courseUuid;
    set({
      generating: false,
      generated: gen,
      screen: 'courseJourney',
      courseJoined: true,
      genResume: null,
      /* 真课完成后把 UUID 抬为活动课程:URL 带 uuid,刷新/深链可复原 */
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

  const cancel = () => {
    finishedRef.current = true;
    stage2CtrlRef.current?.abort();
    if (finishTimerRef.current !== null) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    set({ generating: false });
  };

  /* 中断但已有检查点:登记到 AppState,Courses 页提供"继续生成"入口(关掉浮层不丢断点) */
  const registerCheckpoint = () => {
    if (blueprintUuidRef.current) set({ genResume: { uuid: blueprintUuidRef.current, query } });
  };

  // 触发 Stage 2: 独立有界单元真实生成与检查点
  const confirmAndStartStage2 = async (customUnits?: string[]) => {
    if (stage2BusyRef.current || finishedRef.current) return;
    stage2BusyRef.current = true;
    const ctrl = new AbortController();
    stage2CtrlRef.current = ctrl;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setWaitingConfirmation(false);
    setStage2Active(true);
    setFailed(false);
    setActivePhase('crafting');
    /* 蓝图已确认完成:03 保持 done,细化进度由 04 的单元计数承载 */
    setStepStatus((s) => ({ ...s, generating_initial_syllabus: 'completed' }));

    const unitsToGenerate = customUnits || selectedUnitIds;

    let result: Awaited<ReturnType<typeof generateCourseLive>>;
    try {
      result = await generateCourseLive(
        {
          resumeUuid: blueprintUuid,
          action: 'confirm_blueprint',
          selectedUnits: unitsToGenerate,
          model: state.chatModel,
        },
        {
          onStep: (id, status) => {
            if (finishedRef.current) return;
            setStepStatus((s) => ({ ...s, [id]: status }));
          },
          onUnitProgress: (data) => {
            if (finishedRef.current) return;
            /* SSE 乱序/重复帧守卫:进度只允许单调前进,绝不 3/6 → 2/6 倒退 */
            setLiveCurrentUnit((cur) => Math.max(cur, data.unit_index));
            setLiveTotalUnits((cur) => Math.max(cur, data.total_units));
            if (data.title) setLiveUnitTitle(data.title);
          },
          onRemaining: (remaining) => {
            if (finishedRef.current) return;
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
      setStepStatus((s) => ({ ...s, generating_initial_syllabus: 'completed' }));
      setReady(true);
      finishTimerRef.current = window.setTimeout(() => finish(courseFromBackend(result.course, query), true), 1000);
    } else {
      registerCheckpoint();
      setFailed(true);
    }
  };

  /* 在线优先: 蓝图阶段请求与用户确认 */
  useEffect(() => {
    if (!query) return;
    finishedRef.current = false;
    remainingRef.current = null;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setSearchProgress(null);
    setStepStatus({});
    setInsufficient(false);
    setFailed(false);
    setReady(false);
    setMode('connecting');
    setBlueprint(null);
    setWaitingConfirmation(false);
    setStage2Active(false);
    /* 一次性断点交接:Courses 页"继续生成"带着 uuid 进来——直接落到中断态界面,
     * 由用户点"从检查点恢复生成",而不是重跑蓝图阶段重复扣积分 */
    const handoff = state.genResumeUuid;
    if (handoff) {
      set({ genResumeUuid: undefined });
      updateBlueprintUuid(handoff);
      setMode('live');
      setFailed(true);
      return;
    }
    updateBlueprintUuid('');
    const ctrl = new AbortController();

    (async () => {
      const result = await generateCourseLive(
        {
          query,
          brief: state.courseBrief,
          idempotencyKey: crypto.randomUUID(),
          requireConfirmation: true, // 请求真实蓝图阶段，等待前端确认
          model: state.chatModel,
        },
        {
          onStep: (id, status) => {
            setMode('live');
            setStepStatus((s) => ({ ...s, [id]: status }));
            if (status === 'loading') {
              const st = LIVE_STEPS.find((x) => x.id === id);
              if (st) setActivePhase(st.phase);
            }
          },
          onProgress: (_message, data) => {
            if (data) setSearchProgress(data);
          },
          onBlueprint: (bp, reqConfirm, uuid) => {
            setBlueprint(bp);
            if (uuid) updateBlueprintUuid(uuid);
            const allIds = bp.units?.map((u) => u.unitId).filter(Boolean) as string[] || [];
            setSelectedUnitIds(allIds);
            if (reqConfirm) {
              setWaitingConfirmation(true);
            }
          },
          onRemaining: (remaining) => {
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
          },
        },
        ctrl.signal,
      );

      if (finishedRef.current) return;
      /* 工程未开 strict:真值检查不收窄判别联合,必须用字面量判别(ok===true/false) */
      if (result.ok === true) {
        setMode('live');
        if ('requiresConfirmation' in result && result.requiresConfirmation) {
          // 蓝图阶段已真实完成，等待用户审查和确认
          setWaitingConfirmation(true);
          setStepStatus((s) => ({ ...s, generating_initial_syllabus: 'completed' }));
        } else if ('course' in result) {
          setReady(true);
          finishTimerRef.current = window.setTimeout(() => finish(courseFromBackend(result.course, query), true), 1000);
        }
      } else if (result.reason === 'insufficient') {
        setInsufficient(true);
      } else {
        // 离线/断网:与上游故障同路径,进入失败态(不再有伪生成演示)
        setInsufficient(false);
        setFailed(true);
      }
    })();

    return () => {
      ctrl.abort();
      stage2CtrlRef.current?.abort();
      if (finishTimerRef.current !== null) {
        window.clearTimeout(finishTimerRef.current);
        finishTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, set]);

  /* 轮换文案节奏 */
  useEffect(() => {
    if (!query || ready || waitingConfirmation) return;
    const iv = window.setInterval(() => setLineIdx((i) => i + 1), 900);
    return () => window.clearInterval(iv);
  }, [query, ready, waitingConfirmation]);

  if (!query) return null;

  const linePhase = activePhase;
  const lines = parseLines(t(`${cg}.loadingLines.${linePhase}`), t(`${cg}.phase.${linePhase}`));
  const line = lines[lineIdx % lines.length];

  /* ———— 阶段时间线(唯一事实:stepStatus + 确认门 + stage2 计数)———— */
  type StageState = 'pending' | 'active' | 'done';
  const stepState = (id: GenStepId): StageState => {
    const st = stepStatus[id];
    if (st === 'completed') return 'done';
    if (st === 'loading') return 'active';
    return 'pending';
  };
  const boot = stepState('boot');
  const research = stepState('researching_the_web');
  const syllabus = stepState('generating_initial_syllabus');
  const refine: StageState = ready ? 'done' : stage2Active ? 'active' : waitingConfirmation ? 'pending' : 'pending';
  const confirmGate = waitingConfirmation && !!blueprint;

  const stages: { num: string; label: string; state: StageState; aux?: React.ReactNode }[] =
[
          {
            num: '01',
            label: L('Parsing your request', '解析学习需求'),
            state: boot,
          },
          {
            num: '02',
            label: L('Researching authoritative sources', '检索权威资料'),
            state: research,
            aux:
              research === 'done' && searchProgress && (searchProgress.sources ?? 0) > 0 ? (
                L(`Found ${searchProgress.sources} sources`, `已检索到 ${searchProgress.sources} 条来源`)
              ) : research === 'done' && searchProgress?.status === 'not_triggered' ? (
                L('Web search bypassed — built from model knowledge', '无需外部检索，基于模型知识构建')
              ) : undefined,
          },
          {
            num: '03',
            label: L('Drafting the course blueprint', '起草课程蓝图'),
            state: confirmGate ? 'done' : syllabus,
            aux: confirmGate ? L('Awaiting your review below', '蓝图已就绪，请在下方审查确认') : undefined,
          },
          {
            num: '04',
            label: L('Refining unit content', '细化单元内容'),
            state: refine,
            aux:
              stage2Active && liveTotalUnits > 0 ? (
                L(`Unit ${liveCurrentUnit}/${liveTotalUnits}: ${liveUnitTitle}`, `第 ${liveCurrentUnit}/${liveTotalUnits} 单元：${liveUnitTitle}`)
              ) : confirmGate ? (
                L('Starts after you confirm the blueprint', '确认蓝图后开始')
              ) : undefined,
          },
        ];

  /* 整体进度:阶段权重(06/18/26/50)× 阶段内真实比例;确认门停在 50%。 */
  const stagePct = (st: StageState) => (st === 'done' ? 1 : 0);
  let pct: number;
  if (ready) pct = 100;
  else if (confirmGate) pct = 50;
  else if (stage2Active && liveTotalUnits > 0) pct = 50 + Math.round((48 * liveCurrentUnit) / liveTotalUnits);
  else pct = 6 * stagePct(boot) + 18 * stagePct(research) + 26 * stagePct(syllabus);
  pct = Math.max(4, Math.min(100, pct));

  const toggleUnit = (unitId: string) => {
    setSelectedUnitIds((prev) =>
      prev.includes(unitId) ? prev.filter((id) => id !== unitId) : [...prev, unitId]
    );
  };

  const headline = insufficient
    ? L('Out of credits', '积分不足')
    : failed
      ? L('Generation interrupted', '生成中断')
      : ready
        ? L('Your course is ready', '课程已就绪')
        : confirmGate
          ? L('Review the blueprint', '审查课程蓝图')
          : L('Crafting your course', '正在为你打造这门课');

  return (
    <div className="gen-veil" role="dialog" aria-label={headline}>
      <div className="gen-atelier">
        <div className="gen-kicker">LATTICE ATELIER · {t(`${cg}.phase.crafting`)}</div>
        <h2 className="gen-topic" title={query}>
          “{query}”
        </h2>

        {insufficient || failed ? (
          <div className="gen-alert" role="status">
            <div className="gen-alert-title">{headline}</div>
            <p className="gen-alert-body">
              {insufficient
                ? L(
                    'A course costs 10 credits. You get 20 free credits every day (2 per chat), resetting at midnight Beijing time.',
                    '生成一门课程需要 10 积分。每天免费获得 20 积分（对话 2/次），北京时间零点自动重置。',
                  )
                : L(
                    'Generation hit an issue. Your checkpoint is safely stored — resume anytime without paying twice.',
                    '生成遇到异常。检查点已安全落库，可随时恢复，不会重复扣积分。',
                  )}
            </p>
            {blueprintUuid && !insufficient && (
              <button type="button" className="gen-resume" onClick={() => confirmAndStartStage2()}>
                {L('Resume from checkpoint', '从检查点恢复生成')}
              </button>
            )}
          </div>
        ) : ready ? (
          <div className="gen-ready" role="status">{t(`${cg}.courseReady`)}</div>
        ) : (
          <>
            <ol className="gen-stages">
              {stages.map((s) => (
                <li key={s.num} className={`gen-stage ${s.state}`}>
                  <span className="gen-stage-num">{s.num}</span>
                  <span className="gen-stage-ico" aria-hidden="true">
                    {s.state === 'done' ? (
                      <Check size={13} strokeWidth={3} />
                    ) : s.state === 'active' ? (
                      <span className="gen-dot" />
                    ) : null}
                  </span>
                  <span className="gen-stage-body">
                    <span className="gen-stage-label">{s.label}</span>
                    {s.aux ? (
                      <span className="gen-stage-aux">{s.aux}</span>
                    ) : s.state === 'active' && mode === 'live' && line && !confirmGate ? (
                      <span className="gen-stage-aux" key={line}>{line}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>

            <div className="gen-meter" aria-hidden="true">
              <span className="gen-meter-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="gen-meta">
              <span className="gen-meta-pct">{pct}%</span>
              <span className="gen-meta-elapsed">{L('Elapsed', '已耗时')} {fmtElapsed(elapsedMs)}</span>
            </div>
          </>
        )}

        {confirmGate && blueprint && (
          <div className="gen-blueprint">
            <div className="gen-bp-title">{blueprint.courseTitle}</div>
            {blueprint.courseDescription && <div className="gen-bp-desc">{blueprint.courseDescription}</div>}
            <div className="gen-bp-metrics">
              <span>{L(`Units ${blueprint.units?.length || blueprint.totalUnits || 0}`, `单元 ${blueprint.units?.length || blueprint.totalUnits || 0}`)}</span>
              <span>
                {L(
                  `Lectures ${blueprint.totalLectures || blueprint.units?.reduce((acc, u) => acc + (u.lectureCount || 3), 0) || 0}`,
                  `讲次 ${blueprint.totalLectures || blueprint.units?.reduce((acc, u) => acc + (u.lectureCount || 3), 0) || 0}`,
                )}
              </span>
              <span>
                {L(
                  `≈ ${blueprint.estimatedMinutes ? `${blueprint.estimatedMinutes} min` : `${(blueprint.units?.length || 4) * 45} min`}`,
                  `≈ ${blueprint.estimatedMinutes ? `${blueprint.estimatedMinutes} 分钟` : `${(blueprint.units?.length || 4) * 45} 分钟`}`,
                )}
              </span>
            </div>
            <div className="gen-bp-hint">{L('Uncheck anything you do not need — unchecked units cost nothing.', '不需要的单元可以取消勾选——未勾选的单元不扣积分。')}</div>
            <div className="gen-bp-list" role="group" aria-label={L('Units to generate', '要生成的单元')}>
              {blueprint.units?.map((u, idx) => {
                const uId = u.unitId || `unit-${idx + 1}`;
                const checked = selectedUnitIds.includes(uId);
                return (
                  <label key={uId} className={`gen-bp-unit${checked ? ' on' : ''}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleUnit(uId)} />
                    <span className="gen-bp-unit-num">{String(idx + 1).padStart(2, '0')}</span>
                    <span className="gen-bp-unit-body">
                      <span className="gen-bp-unit-title">{u.title}</span>
                      {u.objectives && u.objectives.length > 0 && (
                        <span className="gen-bp-unit-obj">{u.objectives[0]}</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            <button
              type="button"
              className="gen-bp-confirm"
              disabled={selectedUnitIds.length === 0}
              onClick={() => confirmAndStartStage2()}
            >
              {L(`Confirm & generate ${selectedUnitIds.length} units`, `确认大纲，生成 ${selectedUnitIds.length} 个单元`)}
            </button>
          </div>
        )}

        <button className="gen-cancel" type="button" onClick={cancel}>
          {insufficient || failed ? L('Close', '关闭') : t(`${cg}.stopButton.cancel`)}
        </button>
      </div>
    </div>
  );
};
