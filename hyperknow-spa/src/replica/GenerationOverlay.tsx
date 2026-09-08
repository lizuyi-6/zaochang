import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { PlanetDoodle } from './illustrations';
import { useI18n } from './i18n';
import { L } from './i18n/content';
import { generateCourseLive, type GenStepId } from './backend';
import { buildGeneratedCourse, courseFromBackend } from './generate';
import type { PageProps } from './types';
import './replica.css';

/**
 * 全屏"课程生成中"浮层 — 在线优先:同源真后端可达时按真实 SSE 帧驱动步骤清单
 * (boot → researching_the_web → generating_initial_syllabus → course_ready);
 * 后端不可达(静态托管/未配置/断网)无缝回退伪生成计时序列。
 * 取消不打断自由:回到首页,输入原样保留。
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
  const [activePhase, setActivePhase] = useState<'initial' | 'research' | 'crafting'>('initial');
  const [ready, setReady] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [lineIdx, setLineIdx] = useState(0);
  const [unitsDone, setUnitsDone] = useState(0);
  const finishedRef = useRef(false);

  const cg = 'chatResponse.courseGeneration';
  const phase = PHASES[phaseIdx];

  const finish = (gen: ReturnType<typeof buildGeneratedCourse>) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    set({ generating: false, generated: gen, screen: 'courseJourney', courseJoined: true });
  };
  const cancel = () => {
    finishedRef.current = true;
    set({ generating: false });
  };

  /* 在线优先 → 兜底伪生成 */
  useEffect(() => {
    if (!query) return;
    const ctrl = new AbortController();
    const pseudoTimers: number[] = [];
    (async () => {
      const result = await generateCourseLive(
        query,
        {
          onStep: (id, status) => {
            setMode('live');
            setStepStatus((s) => ({ ...s, [id]: status }));
            if (status === 'loading') {
              const st = LIVE_STEPS.find((x) => x.id === id);
              if (st) setActivePhase(st.phase);
            }
          },
          onRemaining: (remaining) => {
            if (state.identity) set({ identity: { ...state.identity, credits: remaining } });
          },
        },
        ctrl.signal,
      );
      if (finishedRef.current) return;
      if (result.ok) {
        setMode('live');
        setReady(true);
        window.setTimeout(() => finish(courseFromBackend(result.course, query)), 1000);
      } else if (result.reason === 'insufficient') {
        /* 积分不足:显式提示并停住——绝不能落进伪生成,否则"没积分"反而白拿一门假课 */
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
    if (!query || ready) return;
    const iv = window.setInterval(() => setLineIdx((i) => i + 1), 900);
    return () => window.clearInterval(iv);
  }, [query, ready]);

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

  return (
    <div className="gen-veil" role="dialog" aria-label={t(`${cg}.phase.crafting`)}>
      <div className="gen-card">
        <div className={`gen-orbie${mode !== 'pseudo' ? ' busy' : ''}`}>
          <PlanetDoodle size={58} />
        </div>

        {insufficient || failed ? (
          <div className="gen-phase" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ fontWeight: 700 }}>
              {insufficient ? L('Out of credits', '积分不足') : L('Generation failed', '生成失败')}
            </div>
            <div style={{ maxWidth: 340, whiteSpace: 'normal', lineHeight: 1.6, color: '#6B7280', fontSize: 13 }}>
              {insufficient
                ? L(
                    'A course costs 10 credits. You get 20 free credits every day (2 per chat), resetting at midnight Beijing time.',
                    '生成一门课程需要 10 积分。每天免费获得 20 积分（对话 2/次），北京时间零点自动重置。',
                  )
                : L('Something went wrong while generating the course. Please try again.', '课程生成出了点问题，请稍后再试。')}
            </div>
          </div>
        ) : ready ? (
          <div className="gen-phase">{t(`${cg}.courseReady`)}</div>
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

        {!ready && <div className="gen-line" key={`${linePhase}-${lineIdx}`}>{line}</div>}

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
