import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { PlanetDoodle } from './illustrations';
import { useI18n } from './i18n';
import { L } from './i18n/content';
import {
  generateCourseLive,
  type BlueprintData,
  type CourseGenProgressData,
  type GenStepId,
} from './backend';
import { buildGeneratedCourse, courseFromBackend } from './generate';
import type { PageProps } from './types';
import './replica.css';

/**
 * 全屏"课程生成中"浮层 — 在线优先:同源真后端可达时按真实 SSE 帧驱动步骤清单
 * (boot → researching_the_web → generating_initial_syllabus → blueprint_ready);
 * 真实蓝图确认: 后端在 blueprint_ready 停住, 用户可审查大纲与课节、勾选单元后确认进入细化;
 * 细化阶段独立调用 LLM 每单元保存检查点, 真实回报进度, 支持断点恢复;
 * 后端不可达(静态托管/未配置/断网)无缝回退伪生成计时序列。
 */

interface Phase {
  key: 'initial' | 'crafting' | 'refining';
  ms: number;
}

const PHASES: Phase[] = [
  { key: 'initial', ms: 1600 },
  { key: 'crafting', ms: 4200 },
  { key: 'refining', ms: 2000 },
];

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

export const GenerationOverlay: React.FC<PageProps> = ({ state, set }) => {
  const { t } = useI18n();
  const query = state.genQuery;
  const [mode, setMode] = useState<'connecting' | 'live' | 'pseudo'>('connecting');
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
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [lineIdx, setLineIdx] = useState(0);
  const [unitsDone, setUnitsDone] = useState(0);
  const finishedRef = useRef(false);
  const remainingRef = useRef<number | null>(null);

  const cg = 'chatResponse.courseGeneration';
  const phase = PHASES[phaseIdx];

  const finish = (gen: ReturnType<typeof buildGeneratedCourse>, persisted = false) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const latestCredits = remainingRef.current;
    /* persisted = 真 LLM 生成并已入 D1:集市/我的课程列表需要重拉才能看到新课 */
    set({
      generating: false,
      generated: gen,
      screen: 'courseJourney',
      courseJoined: true,
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
    set({ generating: false });
  };

  // 触发 Stage 2: 独立有界单元真实生成与检查点
  const confirmAndStartStage2 = async (customUnits?: string[]) => {
    setWaitingConfirmation(false);
    setStage2Active(true);
    setFailed(false);
    setActivePhase('crafting');
    setStepStatus((s) => ({ ...s, generating_initial_syllabus: 'loading' }));

    const unitsToGenerate = customUnits || selectedUnitIds;

    const result = await generateCourseLive(
      {
        resumeUuid: blueprintUuid,
        action: 'confirm_blueprint',
        selectedUnits: unitsToGenerate,
      },
      {
        onStep: (id, status) => {
          setStepStatus((s) => ({ ...s, [id]: status }));
        },
        onUnitProgress: (data) => {
          setLiveCurrentUnit(data.unit_index);
          setLiveTotalUnits(data.total_units);
          if (data.title) setLiveUnitTitle(data.title);
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
    );

    if (finishedRef.current) return;
    if (result.ok && 'course' in result) {
      setStepStatus((s) => ({ ...s, generating_initial_syllabus: 'completed' }));
      setReady(true);
      window.setTimeout(() => finish(courseFromBackend(result.course, query), true), 1000);
    } else {
      setFailed(true);
    }
  };

  /* 在线优先: 蓝图阶段请求与用户确认 */
  useEffect(() => {
    if (!query) return;
    finishedRef.current = false;
    remainingRef.current = null;
    setSearchProgress(null);
    setStepStatus({});
    setInsufficient(false);
    setFailed(false);
    setReady(false);
    setMode('connecting');
    setBlueprint(null);
    setWaitingConfirmation(false);
    setStage2Active(false);
    const ctrl = new AbortController();
    const pseudoTimers: number[] = [];

    (async () => {
      const result = await generateCourseLive(
        {
          query,
          brief: state.courseBrief,
          idempotencyKey: crypto.randomUUID(),
          requireConfirmation: true, // 请求真实蓝图阶段，等待前端确认
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
            if (uuid) setBlueprintUuid(uuid);
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
      if (result.ok) {
        setMode('live');
        if ('requiresConfirmation' in result && result.requiresConfirmation) {
          // 蓝图阶段已真实完成，等待用户审查和确认
          setWaitingConfirmation(true);
          setStepStatus((s) => ({ ...s, generating_initial_syllabus: 'completed' }));
        } else if ('course' in result) {
          setReady(true);
          window.setTimeout(() => finish(courseFromBackend(result.course, query), true), 1000);
        }
      } else if (result.reason === 'insufficient') {
        setInsufficient(true);
      } else if (result.reason === 'offline') {
        /* 兜底:伪生成计时序列(仅静态托管/断网) */
        setMode('pseudo');
        PHASES.forEach((_, i) => {
          if (i > 0) pseudoTimers.push(window.setTimeout(() => setPhaseIdx(i), PHASES.slice(0, i).reduce((a, q) => a + q.ms, 0)));
        });
        const total = PHASES.reduce((a, p) => a + p.ms, 0) + 900;
        pseudoTimers.push(window.setTimeout(() => finish(buildGeneratedCourse(query)), total));
      } else {
        setInsufficient(false);
        setFailed(true);
      }
    })();

    return () => {
      ctrl.abort();
      pseudoTimers.forEach((x) => window.clearTimeout(x));
    };
  }, [query, set]);

  /* 轮换文案节奏 */
  useEffect(() => {
    if (!query || ready || waitingConfirmation) return;
    const iv = window.setInterval(() => setLineIdx((i) => i + 1), 900);
    return () => window.clearInterval(iv);
  }, [query, ready, waitingConfirmation]);

  /* 伪生成 crafting 阶段的单元计数 */
  useEffect(() => {
    if (mode !== 'pseudo' || phase.key !== 'crafting' || !query) return;
    const total = 4;
    const iv = window.setInterval(() => setUnitsDone((n) => Math.min(total, n + 1)), 850);
    return () => window.clearInterval(iv);
  }, [mode, phase.key, query]);

  if (!query) return null;

  const linePhase = mode === 'pseudo' ? phase.key : activePhase;
  const lines = parseLines(t(`${cg}.loadingLines.${linePhase}`), t(`${cg}.phase.${linePhase}`));
  const line = lines[lineIdx % lines.length];
  const totalUnits = 4;
  const unitsLabel =
    phase.key === 'crafting' && unitsDone >= totalUnits
      ? t(`${cg}.sessionsRefined_other`, { count: 12 })
      : t(`${cg}.unitsExpanded`, { current: Math.max(1, unitsDone), total: totalUnits });

  const toggleUnit = (unitId: string) => {
    setSelectedUnitIds((prev) =>
      prev.includes(unitId) ? prev.filter((id) => id !== unitId) : [...prev, unitId]
    );
  };

  return (
    <div className="gen-veil" role="dialog" aria-label={t(`${cg}.phase.crafting`)}>
      <div className="gen-card" style={{ maxWidth: waitingConfirmation ? 460 : 400 }}>
        <div className={`gen-orbie${mode !== 'pseudo' ? ' busy' : ''}`}>
          <PlanetDoodle size={58} />
        </div>

        {insufficient || failed ? (
          <div className="gen-phase" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ fontWeight: 700 }}>
              {insufficient ? L('Out of credits', '积分不足') : L('Generation interrupted', '生成中断')}
            </div>
            <div style={{ maxWidth: 340, whiteSpace: 'normal', lineHeight: 1.6, color: '#6B7280', fontSize: 13 }}>
              {insufficient
                ? L(
                    'A course costs 10 credits. You get 20 free credits every day (2 per chat), resetting at midnight Beijing time.',
                    '生成一门课程需要 10 积分。每天免费获得 20 积分（对话 2/次），北京时间零点自动重置。',
                  )
                : L('Generation encountered an issue. Your checkpoints are saved; you can resume anytime.', '课程生成发生异常。检查点已安全落库，您可以从断点无缝恢复。')}
            </div>
            {blueprintUuid && !insufficient && (
              <button
                type="button"
                className="btn primary"
                style={{ marginTop: 8, padding: '6px 16px', fontSize: 13, borderRadius: 6 }}
                onClick={() => confirmAndStartStage2()}
              >
                {L('Resume from Checkpoint', '从检查点恢复生成')}
              </button>
            )}
          </div>
        ) : ready ? (
          <div className="gen-phase">{t(`${cg}.courseReady`)}</div>
        ) : waitingConfirmation && blueprint ? (
          /* 真实蓝图阶段：审查大纲、挑选单元、确认开始细化（复用品牌深绿与SVG，兼容计划数量与节数时长） */
          <div className="gen-blueprint-review" style={{ textAlign: 'left', width: '100%', marginTop: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#164E46', marginBottom: 4, textAlign: 'center' }}>
              {L('Review Course Blueprint', '审查并确认课程蓝图')}
            </div>
            <div style={{ fontSize: 13, color: '#4B5563', marginBottom: 10, textAlign: 'center', lineHeight: 1.4 }}>
              <strong>{blueprint.courseTitle}</strong>
              {blueprint.courseDescription && (
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                  {blueprint.courseDescription}
                </div>
              )}
            </div>

            {/* 服务端计划指标兼容展示：单元数/节数/预估时长 */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 14,
                marginBottom: 10,
                fontSize: 11.5,
                color: '#164E46',
                background: '#F4F7F3',
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid #DCE6D9',
              }}
            >
              <span>{L(`Units: ${blueprint.units?.length || blueprint.totalUnits || 0}`, `单元：${blueprint.units?.length || blueprint.totalUnits || 0}`)}</span>
              <span>
                {L(
                  `Lectures: ${
                    blueprint.totalLectures ||
                    blueprint.units?.reduce((acc, u) => acc + (u.lectureCount || 3), 0) ||
                    0
                  }`,
                  `讲次：${
                    blueprint.totalLectures ||
                    blueprint.units?.reduce((acc, u) => acc + (u.lectureCount || 3), 0) ||
                    0
                  }`,
                )}
              </span>
              <span>
                {L(
                  `Est. Time: ${
                    blueprint.estimatedMinutes
                      ? `${blueprint.estimatedMinutes}m`
                      : `${(blueprint.units?.length || 4) * 45}m`
                  }`,
                  `预估时长：${
                    blueprint.estimatedMinutes
                      ? `${blueprint.estimatedMinutes} 分钟`
                      : `${(blueprint.units?.length || 4) * 45} 分钟`
                  }`,
                )}
              </span>
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              {L('Select Units to Generate:', '选择要生成的单元：')}
            </div>

            <div
              style={{
                maxHeight: 200,
                overflowY: 'auto',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                padding: '8px 10px',
                background: '#F9FAFB',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {blueprint.units?.map((u, idx) => {
                const uId = u.unitId || `unit-${idx + 1}`;
                const checked = selectedUnitIds.includes(uId);
                return (
                  <label
                    key={uId}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      fontSize: 12,
                      cursor: 'pointer',
                      color: checked ? '#111827' : '#9CA3AF',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleUnit(uId)}
                      style={{ marginTop: 2, accentColor: '#164E46' }}
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>{u.title}</div>
                      {u.objectives && u.objectives.length > 0 && (
                        <div style={{ fontSize: 11, color: '#52796F', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <circle cx="8" cy="8" r="7" stroke="#164E46" strokeWidth="2" />
                            <circle cx="8" cy="8" r="3" fill="#D9A441" />
                          </svg>
                          <span>{u.objectives[0]}</span>
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn primary"
                style={{
                  padding: '8px 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 8,
                  background: '#164E46',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(22, 78, 70, 0.25)',
                }}
                disabled={selectedUnitIds.length === 0}
                onClick={() => confirmAndStartStage2()}
              >
                {L(`Confirm & Generate (${selectedUnitIds.length} units)`, `确认大纲并生成 (${selectedUnitIds.length} 个单元)`)}
              </button>
            </div>
          </div>
        ) : mode === 'live' ? (
          <div className="gen-steps">
            {LIVE_STEPS.map((s) => {
              const st = stepStatus[s.id] ?? 'pending';
              return (
                <div key={s.id} className={`gen-step ${st}`}>
                  <span className="gen-step-ico">{st === 'completed' ? <Check size={13} strokeWidth={3} /> : <span className="gen-dot" />}</span>
                  <span className="gen-step-label">{t(`${cg}.phase.${s.phase}`)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="gen-phase">{t(`${cg}.phase.${mode === 'pseudo' ? phase.key : 'initial'}`)}</div>
        )}

        {mode === 'live' && !ready && !waitingConfirmation && searchProgress && (
          <div
            className="gen-search-status"
            style={{
              fontSize: 12,
              color: (searchProgress.sources ?? 0) > 0 ? '#059669' : '#6B7280',
              marginTop: 6,
              textAlign: 'center',
              maxWidth: 360,
              lineHeight: 1.4,
            }}
          >
            {(searchProgress.sources ?? 0) > 0 ? (
              <span>
                {L(`Found ${searchProgress.sources} reference sources`, `已检索到 ${searchProgress.sources} 条权威资料`)}
                {searchProgress.titles && searchProgress.titles.length > 0 && (
                  <span
                    style={{
                      display: 'block',
                      fontSize: 11,
                      color: '#9CA3AF',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginTop: 2,
                    }}
                  >
                    {searchProgress.titles[0]}
                  </span>
                )}
              </span>
            ) : searchProgress.status && searchProgress.status !== 'success' ? (
              <span style={{ color: '#9CA3AF' }}>
                {searchProgress.reason || L('Web search unavailable, continuing with model knowledge', '未获取到外部研学资料，已降级继续生成')}
              </span>
            ) : null}
          </div>
        )}

        {stage2Active && liveTotalUnits > 0 && !ready && (
          <div
            className="gen-stage2-progress"
            style={{
              marginTop: 10,
              padding: '6px 12px',
              background: '#ECFDF5',
              borderRadius: 6,
              border: '1px solid #A7F3D0',
              color: '#065F46',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {L(
              `Refining Unit ${liveCurrentUnit}/${liveTotalUnits}: ${liveUnitTitle}`,
              `正在细化第 ${liveCurrentUnit}/${liveTotalUnits} 单元：${liveUnitTitle}`,
            )}
          </div>
        )}

        {!ready && !waitingConfirmation && <div className="gen-line" key={`${linePhase}-${lineIdx}`}>{line}</div>}

        {mode === 'pseudo' && !ready && (
          <>
            <div className="gen-track">
              {PHASES.map((p, i) => (
                <span
                  key={p.key}
                  className={`gen-seg${i < phaseIdx ? ' done' : i === phaseIdx ? ' active' : ''}`}
                  style={{ '--gen-dur': `${p.ms}ms` } as React.CSSProperties}
                />
              ))}
            </div>
            {phase.key !== 'initial' && <div className="gen-units">{unitsLabel}</div>}
          </>
        )}

        <button className="gen-cancel" type="button" onClick={cancel}>
          {insufficient || failed ? L('Close', '关闭') : t(`${cg}.stopButton.cancel`)}
        </button>
      </div>
    </div>
  );
};
