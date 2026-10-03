import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PageProps } from '../types';
import { Board, itemCharCount, richLen } from './Board';
import { ConversationPanel, type PlayStatus, type VoiceState } from './Panel';
import { WhiteboardChrome } from './Chrome';
import {
  AwardPopup,
  ConnectionPanel,
  ExitConfirm,
  FeedbackModal,
  IntroOverlay,
  ListenPill,
  QuickCheck,
  SessionSettings,
  StillThere,
  TalkModeOverlay,
  UnitCompletePopup,
  type SessionSettingsValue,
} from './Popups';
import {
  getBoardItems,
  getBoardTable,
  getLessonSteps,
  getUserAnswers,
  setLearnerName,
  PAN_X,
  BOARD_ANNOTS as DEMO_ANNOTS,
  type LessonStep,
  type PanelEntry,
  type PopupKind,
  type Rich,
} from './lessonScript';
import { liveLessonFromPlan, type LessonScript } from './liveLesson';
import { fetchLectureImageLive, interjectLive, planLectureLive, PLAN_CLIENT_TIMEOUT_MS } from '../backend';
import { getBackendLang, getCurrentLng } from '../i18n';
import { getCourseLang } from '../courseLang';
import { L } from '../i18n/content';
import { exportBoard, type ExportFormat, type ExportPage } from '../boardExport';
import { uploadFile } from '../materials';
import { toast } from '../toast';
import { listenOnce, prefetchTts, tts, type SpeakHandle, type SpeakStart } from '../actions';
import { takePrefetchedEntry } from './planPrefetch';
import { lessonDelay } from './lessonDelay';
import { choiceIndexFromInput } from './choiceInput';
import './whiteboard.css';

type Stage = 'intro' | 'talk' | 'play';

// 每步旁白窗口(原 whiteboardWs.js deliverStep 同式,亦见 protocol.ts stepDurationMs):
// 中文一字一音节 ×180ms;英文按音节密度 ×65ms(实测 287 字符英文 ≈19.7s 音频,
// 纯 180ms/字符会算出 51.7s,音频播完后字幕独走半分钟);再按语速缩放,下限 4s。
export const narrateMs = (text: string, speed = 1) => {
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || []).length;
  const other = text.length - cjk;
  return Math.max(4000, (cjk * 180 + other * 65) / Math.max(0.5, speed));
};
export const BOARD_CPS = 24; // handwriting chars/sec
// 上游冷合成等起声超时上限:此前字幕恒为 0;超时后取消音频并以估算时钟平滑打出剩余字幕。
// 必须盖住真实合成 TTFB(实测 ~2.5s + 55ms/字,200+ 字旁白 ~13s),否则预热尚未完成的
// 第一步会被误判成无声杀掉(用户只看到第一步有声后面全静默)。真实错误(4xx/5xx/网络)
// 走 error 事件即时止损,这个超时只兜底"连接挂着永远不起声"。
export const STARTUP_TIMEOUT_MS = 25000;
export const STALL_MS = 12000; // 起声后 media time (currentTime) 连续不动这么久 = 断流/缓冲冻结,止损

export interface CaptionSyncOptions {
  total: number;
  plain: string;
  speed?: number;
  handle: SpeakHandle;
  wait: (ms: number) => Promise<void>;
  isSkipped: () => boolean;
  onUpdate: (shownCount: number) => void;
  stopAudio: () => void;
  startupTimeoutMs?: number;
  stallMs?: number;
  tickMs?: number;
  /** 单调时钟(默认 Date.now):activeMs 由真实流逝时间累积,而不是 tick 次数——
   * 后台标签页 setInterval 被节流到 1Hz 时,tick 计数会让 8s 起声超时变成 160s。 */
  nowMs?: () => number;
}

export async function runCaptionSync({
  total,
  plain,
  speed = 1,
  handle,
  wait,
  isSkipped,
  onUpdate,
  stopAudio,
  startupTimeoutMs = STARTUP_TIMEOUT_MS,
  stallMs = STALL_MS,
  tickMs = 50,
  nowMs = Date.now,
}: CaptionSyncOptions): Promise<void> {
  if (total <= 0) return;

  const estMs = narrateMs(plain, speed);
  let startHow: SpeakStart | null = null;
  let audioEnded = false;

  void handle.started.then((v) => {
    startHow = v;
  });
  void handle.ended.then(() => {
    audioEnded = true;
  });

  let shownCount = 0;
  let activeMs = 0;
  let lastTickAt = nowMs();
  let lastMediaTime = -1;
  let lastMediaAdvanceMs = 0;

  /* 每拍真实耗时累积进 activeMs:节流(wait 晚解决)按真实时间走,暂停期间
   * 由调用方提供的 nowMs(暂停感知时钟)自动冻结。 */
  const bankElapsed = () => {
    const now = nowMs();
    activeMs += Math.max(0, now - lastTickAt);
    lastTickAt = now;
  };
  const tick = async () => {
    await wait(tickMs);
    bankElapsed();
  };

  interface FallbackState {
    startMs: number;
    startCount: number;
    remainingCount: number;
    durationMs: number;
  }

  const fallbackRef = { current: null as FallbackState | null };

  const initFallback = (atMs: number): FallbackState => {
    if (fallbackRef.current) return fallbackRef.current;
    // 降级前确保取消挂起/残留的音频,杜绝迟到外放
    stopAudio();
    const startCount = shownCount;
    const remainingCount = Math.max(0, total - startCount);
    const durationMs = total > 0 && remainingCount > 0 ? Math.max(500, (remainingCount / total) * estMs) : 0;
    fallbackRef.current = {
      startMs: atMs,
      startCount,
      remainingCount,
      durationMs,
    };
    return fallbackRef.current;
  };

  while (true) {
    if (isSkipped()) {
      stopAudio();
      break;
    }

    const currentFallback = fallbackRef.current;
    if (currentFallback) {
      const elapsed = activeMs - currentFallback.startMs;
      if (currentFallback.durationMs <= 0 || elapsed >= currentFallback.durationMs) {
        shownCount = total;
        onUpdate(total);
        break;
      }
      const byFallback = currentFallback.startCount + Math.floor((elapsed / currentFallback.durationMs) * currentFallback.remainingCount);
      const nextShown = Math.min(total, Math.max(shownCount, byFallback));
      if (nextShown > shownCount) {
        shownCount = nextShown;
        onUpdate(shownCount);
      }
      await tick();
      continue;
    }

    if (startHow === 'error' || startHow === 'stopped') {
      initFallback(activeMs);
      continue;
    }

    if (startHow === null) {
      if (activeMs >= startupTimeoutMs) {
        // 起声超时(上游无响应/极慢):取消挂起音频,锚定当前进度切估算回退
        initFallback(activeMs);
        continue;
      }
      // 等待起声音频加载中:字幕保持 0,避免声画错位
      onUpdate(0);
      await tick();
      continue;
    }

    // startHow === 'started'
    const prog = handle.getProgress();
    const cur = prog ? prog.currentTime : 0;
    if (cur > lastMediaTime + 0.001) {
      lastMediaTime = cur;
      lastMediaAdvanceMs = activeMs;
    }

    if (activeMs - lastMediaAdvanceMs > stallMs) {
      // 媒体时间连续 stallMs 无任何前进:判定断流/缓冲冻结,止损切回退
      initFallback(activeMs);
      continue;
    }

    if (prog) {
      let ratio = prog.ratio;
      if (ratio < 0 || !Number.isFinite(prog.duration) || prog.duration <= 0) {
        // 流式响应或未知时长:以 currentTime 结合语速估算窗口推导比例。
        // 估算窗口只是下限——真实音频可能显著更长;未到 ended 前不许打满,
        // 否则真实音频仍在播而字幕提前走完(收尾由播完后的 onUpdate(total) 完成)。
        const est = estMs > 0 ? (prog.currentTime * 1000) / estMs : 0;
        ratio = Math.min(est, 0.97);
      }
      const byAudio = Math.min(total, Math.floor(ratio * total));
      if (byAudio > shownCount) {
        shownCount = byAudio;
        onUpdate(shownCount);
      }
    }

    if (audioEnded) {
      break;
    }

    const won = await Promise.race([
      wait(tickMs).then(() => 'tick' as const),
      handle.ended.then(() => 'ended' as const),
    ]);
    bankElapsed();
    if (won === 'ended') {
      audioEnded = true;
      break;
    }
  }
  onUpdate(total);
}

const userBubble = (id: string, text: string): PanelEntry => ({ id, kind: 'user', text: [{ t: text }] });
const tutorBubble = (id: string, text: string): PanelEntry => ({ id, kind: 'msg', text: [{ t: text }] });

function hashParams(): { ff: number | null; auto: boolean; hold: boolean; idle: boolean } {
  const m = window.location.hash.match(/[?&]ff=(\d+)/);
  return {
    ff: m ? parseInt(m[1], 10) : null,
    auto: /[?&]auto=1/.test(window.location.hash),
    hold: /[?&]hold=1/.test(window.location.hash),
    idle: /[?&]idle=1/.test(window.location.hash),
  };
}

export const WhiteboardPage: React.FC<PageProps> = ({ set, state }) => {
  /* 伪生成课程:壳层(课节 chip/介绍页)话题化;演示脚本作直播放的后备 */
  const GEN = state.generated;
  const targetLecture = useMemo(() => {
    if (!GEN) return null;
    if (state.activeLectureId) {
      for (const u of GEN.units) {
        const found = u.lectures.find(
          (l) => l.id === state.activeLectureId || (l as { lectureId?: string }).lectureId === state.activeLectureId,
        );
        if (found) return found;
      }
    }
    if (state.activeUnitId) {
      const u = GEN.units.find(
        (unit) => String(unit.id) === String(state.activeUnitId) || (unit as { unitId?: string }).unitId === state.activeUnitId,
      );
      if (u && u.lectures.length > 0) return u.lectures[0];
    }
    return GEN.units[0]?.lectures[0] ?? null;
  }, [GEN, state.activeLectureId, state.activeUnitId]);

  const targetTopic = state.activeTopic || targetLecture?.title || (GEN ? GEN.topic : null);
  const genLectureTitle = targetTopic ?? undefined;
  /* 介绍正文跟着话题走(课程讲次/自由命题同式)——缺省会落回演示课的修辞三角文案,
   * 自由讲座命题后备课页正文与话题对不上,就是这里漏了 freeTopicMode 的情形。 */
  const genIntroBody = targetTopic
    ? L(
        `This session opens “${targetTopic}” the way every LATTICE lesson does: watch the board take shape, answer a quick check, and leave with one idea you can use today.`,
        `本节课用见界的标准方式开启「${targetTopic}」：看板书逐步成形，回答一次快速检查，带着一个马上能用的想法离开。`,
      )
    : undefined;

  /* 演示脚本(参考录课逐字复刻,语言随挂载时点);直播课成功后整体替换。
   * 旁白称呼先绑定登录用户名(邮箱取 @ 前缀)再构建脚本;匿名/离线保底
   * 录课原版 "Ryan"。名字只在开场/过渡/收尾几处,重建也只发生在开场前。 */
  const learnerName = (() => {
    const raw = state.identity?.username ?? '';
    return (raw.includes('@') ? raw.slice(0, raw.indexOf('@')) : raw).trim();
  })();
  const DEMO_SCRIPT = useMemo<LessonScript>(
    () => {
      setLearnerName(learnerName);
      return {
        steps: getLessonSteps(),
        items: getBoardItems(),
        table: getBoardTable(),
        annots: DEMO_ANNOTS,
        userAnswers: getUserAnswers(),
        pageSplitX: 1132, // 第二页列起点(D 列),与 boardExport 的 PAGE_SPLIT 同义
      };
    },
    [learnerName],
  );

  /* 直播放:生成课(伪生成/后端课)进白板 → 按选中课节话题真拉讲座计划;失败静默
   * 回退演示课(与其余端点同一双轨纪律)。演示公开演讲课不走直播,保住像素复刻。
   * 严格锁定当前课节上下文，杜绝默认跳第一讲。 */
  const liveTopic = targetTopic;
  const [liveScript, setLiveScript] = useState<LessonScript | null>(null);
  const [planPending, setPlanPending] = useState(liveTopic !== null);
  const imageWaitResolvers = useRef<Map<number, () => void>>(new Map());

  /* 自由讲座模式:无课程上下文直进白板(#/whiteboard)。旧行为是静默播放录课复刻的
   * 公开演讲演示课——教学提示词怎么改白板都不变,用户看到的"老套路"正是这条路径。
   * 现在改为学员命题(intro 采集或 ?topic= 深链)→ 与课程讲次完全相同的
   * planLectureLive 实时备课链路;备课失败显式给重试,绝不拿话题对不上的演示课冒充。
   * planAttempt:同话题重试/失败后重试都靠它重新触发备课 effect。 */
  const freeTopicMode = !GEN && !state.activeCourseUuid;
  const [planFailed, setPlanFailed] = useState(false);
  const [planAttempt, setPlanAttempt] = useState(0);

  useEffect(() => {
    if (!liveTopic) return;
    const ctrl = new AbortController();
    // 预算必须盖过服务端 130s 路由超时(冷实例 92-100s),否则浏览器提前掐死成功在望的计划
    const timer = window.setTimeout(() => ctrl.abort(), PLAN_CLIENT_TIMEOUT_MS);
    let alive = true;
    setPlanPending(true); // 话题是进入页面后才选定的(自由讲座):收起"可开讲"态
    setPlanFailed(false);
    /* 每课语言偏好(加入弹窗的选择)优先,其次界面语言——课程讲次语言与界面解耦 */
    const appLang = getCourseLang(state.activeCourseUuid) ?? (getBackendLang() || getCurrentLng() || 'en');
    const planParams = {
      topic: liveTopic,
      courseUuid: state.activeCourseUuid || (GEN as { courseUuid?: string } | null)?.courseUuid,
      unitId: state.activeUnitId ? String(state.activeUnitId) : undefined,
      lectureId: state.activeLectureId,
      sessionId: state.activeSessionId,
      language: appLang,
    };
    // 旅程页预生成的 plan 直接复用(同 key、15min TTL);预热失败(null)补一次真实请求
    const prefetched = takePrefetchedEntry(planParams);
    let fromPrefetch = false;
    void (prefetched?.plan ?? planLectureLive(planParams, ctrl.signal))
      .then(async (plan) => {
        if (!alive) return;
        if (plan === null && prefetched && !ctrl.signal.aborted) {
          plan = await planLectureLive(planParams, ctrl.signal);
          if (!alive) return;
        } else if (plan && prefetched) {
          fromPrefetch = true;
        }
        /* 模板降级计划(上游故障 5 步兜底)就是"还是老套路"的观感来源:自由讲座
         * 用它开讲等于辜负学员命题,再挣一次真实生成(此时实例多已预热);仍降级
         * 则接受——话题对得上的模板好过话题对不上的演示课。 */
        if (plan?.degraded && freeTopicMode && !ctrl.signal.aborted) {
          const fresh = await planLectureLive(planParams, ctrl.signal);
          if (!alive) return;
          if (fresh) plan = fresh;
        }
        setPlanPending(false);
        /* 自由讲座拿不到计划一律显式失败(alive 已排除卸载路径)——不得依赖
         * !aborted:135s 客户端超时掐死时 aborted=true,若跳过置失败,简介页会放出
         * "开始学习"并播话题对不上的演示课,正是自由讲座承诺绝不发生的事。 */
        if (!plan && freeTopicMode) setPlanFailed(true);
        if (plan) {
          const script = liveLessonFromPlan(plan);
          setLiveScript(script);
          // 预热前两条旁白:整段合成延迟藏进 intro/语音选择停留期,第一步起声即缓存命中
          script.steps
            .filter((s) => s.caption)
            .slice(0, 2)
            .forEach((s) => prefetchNarration(s.caption));

          // 检查并异步按需生图(单讲最多 1 图)，切课取消不串图，失败优雅降级为文字。
          // plan 来自预生成时复用同一条 in-flight 生图 promise,零重复调用。
          const imageStep = plan.steps.find((s) => s.board_action.type === 'image' && !s.board_action.url);
          if (imageStep && imageStep.board_action.prompt) {
            const stepId = plan.steps.indexOf(imageStep) + 1;
            const imagePromise =
              fromPrefetch && prefetched
                ? prefetched.image
                : fetchLectureImageLive(
                    {
                      prompt: imageStep.board_action.prompt,
                      caption: imageStep.board_action.caption,
                      courseUuid: state.activeCourseUuid || (GEN as { courseUuid?: string } | null)?.courseUuid,
                      unitId: state.activeUnitId ? String(state.activeUnitId) : undefined,
                      lectureId: state.activeLectureId,
                      sessionId: state.activeSessionId,
                    },
                    ctrl.signal,
                  );
            void imagePromise
              .then((imgRes) => {
                if (!alive || !imgRes?.url) return;
                imageStep.board_action.url = imgRes.url;
                imageStep.board_action.caption = imgRes.caption ?? imageStep.board_action.caption;
                setLiveScript(liveLessonFromPlan(plan));
              })
              .catch(() => {
                // 生图失败优雅降级为文本板书
                (imageStep.board_action as { failed?: boolean }).failed = true;
                if (alive) setLiveScript(liveLessonFromPlan(plan));
              })
              .finally(() => {
                imageWaitResolvers.current.get(stepId)?.();
                imageWaitResolvers.current.delete(stepId);
              });
          }
        }
      })
      .catch(() => {
        if (alive) {
          setPlanPending(false);
          /* 同上:超时/网络挂起也要显式失败,自由讲座绝不静默落到演示课 */
          if (freeTopicMode) setPlanFailed(true);
        }
      });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      ctrl.abort();
      imageWaitResolvers.current.forEach((res) => res());
      imageWaitResolvers.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTopic, state.activeCourseUuid, state.activeUnitId, state.activeLectureId, state.activeSessionId, planAttempt, freeTopicMode]);

  const lesson = liveScript ?? DEMO_SCRIPT;
  const LESSON_STEPS = lesson.steps;
  const BOARD_ITEMS = lesson.items;
  const BOARD_TABLE = lesson.table;
  const BOARD_ANNOTS = lesson.annots;
  /* 引擎回调(writeItem/runStep 等)是稳定 useCallback,闭包绑定首渲染的 lesson;
   * 直播课计划异步到达后 lesson 换新,陈旧闭包会拿演示课板书按 id 找条目
   * (id 方案互不重叠 → 全部 miss)——整步空板、图永不书写。所有引擎回调
   * 一律经 lessonRef 取当前课程,绝不经闭包。 */
  const lessonRef = useRef(lesson);
  lessonRef.current = lesson;
  const USER_ANSWERS = lesson.userAnswers;
  const FIRST_CHOICE_STEP = LESSON_STEPS.find((s) => s.awaitChoice) ?? null;

  const [{ ff: ffParam, auto, hold, idle: idleParam }] = useState(hashParams);
  /* 课程页"练习"进入 → 直跳随堂练习(quick check)那一步;直播计划未决时启动瞬再求值 */
  const practiceEntry = state.whiteboardMode === 'practice';
  const [stage, setStage] = useState<Stage>(practiceEntry || ffParam !== null ? 'play' : 'intro');

  // ----- engine-visible state -----
  const [step, setStep] = useState(1);
  const [entries, setEntries] = useState<PanelEntry[]>([]);
  const [caption, setCaption] = useState<Rich | null>(null);
  const [capShown, setCapShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [writingId, setWritingId] = useState<string | null>(null);
  const [tableRows, setTableRows] = useState(0);
  const [annotsDone, setAnnotsDone] = useState<Set<string>>(new Set());
  const [annotActive, setAnnotActive] = useState<string | null>(null);
  const [panX, setPanX] = useState(0);
  const [status, setStatus] = useState<PlayStatus>('idle');
  const [systemEnd, setSystemEnd] = useState(false);
  const [popup, setPopup] = useState<PopupKind | null>(null);
  const [quickCheck, setQuickCheck] = useState<{
    stepId: number;
    question: string;
    options: string[];
    answer: number;
    explanation?: string;
    selected: number | null;
    feedback: 'correct' | 'incorrect' | null;
  } | null>(null);
  /* 举手插话进行中(导师取答案;面板/药丸展示"聆听中") */
  const [asking, setAsking] = useState(false);

  // ----- chrome / ui state -----
  /* 面板默认关，保持白板沉浸感与宽阔居中视野；用户按需开启时在桌面平滑分栏预留空间，窄屏弹层 */
  const [panelOpen, setPanelOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isFollowing, setIsFollowing] = useState(true);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const [muted, setMuted] = useState(false);
  const [voice, setVoice] = useState<VoiceState>('off');
  const [input, setInput] = useState('');
  const [settings, setSettings] = useState<SessionSettingsValue>({
    voice: state.voice || 'calm',
    speed: state.speed || 0.85,
    font: 'handwriting',
    dots: true,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [connOpen, setConnOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [idleOpen, setIdleOpen] = useState(false);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen]);

  /* 反馈/设置弹窗背板会挡住整页按钮,Esc 必须能随时退出(可发现性兜底) */
  useEffect(() => {
    if (!settingsOpen && !feedbackOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (feedbackOpen) setFeedbackOpen(false);
      else setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen, feedbackOpen]);

  // ----- engine control refs -----
  const ctl = useRef({ cancelled: false, paused: false, skipped: false });
  /* 暂停感知的授课单调时钟:字幕同步的起声超时/断流止损按"课上真实流逝时间"计,
   * 后台标签页 setInterval 节流不会拉长超时;暂停期间不累计(转场时结账重锚)。 */
  const clockRef = useRef({ elapsed: 0, last: 0 });
  const lessonNow = useCallback(() => {
    const c = clockRef.current;
    const now = Date.now();
    if (c.last === 0) {
      c.last = now;
      return c.elapsed;
    }
    if (!ctl.current.paused) c.elapsed += now - c.last;
    c.last = now;
    return c.elapsed;
  }, []);
  const setLessonPaused = useCallback(
    (p: boolean) => {
      lessonNow(); // 结账到转场点
      ctl.current.paused = p;
      lessonNow(); // 重锚基线(暂停中为 0 增量)
    },
    [lessonNow],
  );
  const answerResolver = useRef<((text: string) => void) | null>(null);
  const popupResolver = useRef<(() => void) | null>(null);
  const choiceResolver = useRef<((i: number) => void) | null>(null);
  const continueResolver = useRef<(() => void) | null>(null);
  const started = useRef(false);
  const voiceTimer = useRef<number | null>(null);
  const voiceTimers = useRef<number[]>([]);
  /* 插话恢复提示等零散延时器:卸载时统一清理 */
  const pendingTimers = useRef<number[]>([]);
  /* 当前步(插话按它取服务端 step_id 上下文)与插话互斥标记 */
  const stepRef = useRef(1);
  stepRef.current = step;
  const askingRef = useRef(false);
  // 授课语音:step runner 是稳定回调,经 ref 读最新音色/语速/静音。
  const narrationRef = useRef({ voice: settings.voice, speed: settings.speed, muted });
  narrationRef.current = { voice: settings.voice, speed: settings.speed, muted };

  useEffect(() => {
    tts.setPlaybackRate(settings.speed);
  }, [settings.speed]);

  /* 旁白预热:以基准语速 1.0 合成(与 actions.ts 实播请求保持一致命中缓存),静音不预热。
   * 上游 MISS 为整段合成(TTFB ~2.5s+55ms/字),长段落必超字幕引擎 8s 起声上限
   * 被止损成无声步——借响应 private 缓存在前一步播放期合成好后几步。 */
  const prefetchNarration = useCallback((rich: Rich | undefined) => {
    if (!rich) return;
    const { voice: vk, muted: silent } = narrationRef.current;
    if (silent) return;
    prefetchTts(
      rich.map((seg) => seg.t).join(''),
      vk,
      1,
    );
  }, []);

  /* Course clock pauses; interjection cooldown opts into wall time. */
  const wait = useCallback(
    (ms: number, runWhilePaused = false) => lessonDelay(ms, ctl.current, runWhilePaused),
    [],
  );

  /* ---------------- fast-forward preset (screenshot verification) ---------------- */
  const applyFastForward = useCallback((upto: number) => {
    const steps = lessonRef.current.steps;
    const items = lessonRef.current.items;
    const annots = lessonRef.current.annots;
    const table = lessonRef.current.table;
    const es: PanelEntry[] = [];
    const prog: Record<string, number> = {};
    const done = new Set<string>();
    let pan = 0;
    let rows = 0;
    let sysEnd = false;
    let lastCap: Rich | null = null;
    for (const s of steps) {
      if (s.id >= upto) break;
      if (s.pan) pan = PAN_X;
      if (s.panel) es.push(...s.panel);
      if (s.caption) lastCap = s.caption;
      if (s.awaitAnswer) es.push(userBubble(`u${s.id}`, USER_ANSWERS[s.id] ?? '…'));
      if (s.awaitChoice) es.push(userBubble(`u${s.id}`, s.awaitChoice.options[s.awaitChoice.answer]));
      if (s.systemEnd) sysEnd = true;
    }
    for (const it of items) if (it.step < upto) prog[it.id] = itemCharCount(it);
    for (const an of annots) if (an.step < upto) done.add(an.id);
    if (table && table.step < upto) rows = 4;
    setEntries(es);
    setProgress(prog);
    setAnnotsDone(done);
    setPanX(pan);
    setTableRows(rows);
    setSystemEnd(sysEnd);
    if (lastCap) {
      setCaption(lastCap);
      setCapShown(richLen(lastCap));
    }
    setStep(upto);
  }, []);

  /* ---------------- step runners ---------------- */

  /** 字幕随旁白同步显现;返回旁白句柄(供步进等播完),静音/无字幕步返回 null。 */
  const typeCaption = useCallback(
    async (rich: Rich): Promise<SpeakHandle | null> => {
      const total = richLen(rich);
      setCaption(rich);
      setCapShown(0);
      setTyping(true);
      const plain = rich.map((seg) => seg.t).join('');
      // 音频是时钟:等旁白真正起声,字幕才同窗起跑(冷合成的短暂停顿换来声画同步);
      // 但所有等待都有界——起声慢、上游挂起或中途断流时切估算时钟并止损停音频,
      // 绝不让字幕冻结、课程死锁(ended 只在自然播完/出错/被顶替时 settle)。
      const { voice: vk, speed, muted: silent } = narrationRef.current;
      let handle: SpeakHandle | null = null;
      if (!silent && total > 0) {
        handle = tts.speakTrack(plain, vk, speed);
        await runCaptionSync({
          total,
          plain,
          speed,
          handle,
          wait,
          isSkipped: () => ctl.current.skipped,
          onUpdate: setCapShown,
          stopAudio: () => tts.stop(),
          nowMs: lessonNow,
        });
      } else {
        const per = narrateMs(plain, speed) / Math.max(1, total);
        for (let i = 1; i <= total; i++) {
          if (ctl.current.skipped) {
            setCapShown(total);
            break;
          }
          await wait(per);
          setCapShown(i);
        }
      }
      setTyping(false);
      return handle;
    },
    [wait, lessonNow],
  );

  const writeItem = useCallback(
    async (id: string) => {
      const item = lessonRef.current.items.find((b) => b.id === id);
      if (!item) return;
      const total = itemCharCount(item);
      setWritingId(id);
      const per = 1000 / BOARD_CPS;
      for (let c = 1; c <= total; c++) {
        if (ctl.current.skipped) {
          setProgress((p) => ({ ...p, [id]: total }));
          break;
        }
        await wait(per);
        setProgress((p) => ({ ...p, [id]: c }));
      }
      setWritingId(null);
    },
    [wait],
  );

  const revealTable = useCallback(async () => {
    if (lessonRef.current.table === null) return;
    if (ctl.current.skipped) {
      setTableRows(4);
      return;
    }
    for (let r = 1; r <= 4; r++) {
      setTableRows(r);
      await wait(480);
    }
  }, [wait]);

  const drawAnnot = useCallback(
    async (id: string) => {
      if (!lessonRef.current.annots.some((a) => a.id === id)) return;
      if (ctl.current.skipped) {
        setAnnotsDone((d) => new Set(d).add(id));
        return;
      }
      setAnnotActive(id);
      await wait(950);
      setAnnotActive(null);
      setAnnotsDone((d) => new Set(d).add(id));
    },
    [wait],
  );

  const runStep = useCallback(
    async (s: LessonStep) => {
      setStep(s.id);
      if (s.pan) {
        setPanX(PAN_X);
        await wait(880);
      }
      if (s.panel) {
        for (const e of s.panel) {
          setEntries((prev) => [...prev, e]);
          await wait(240);
        }
      }

      const items = lessonRef.current.items.filter((b) => b.step === s.id);
      // 有界等待生图就绪或失败 (最多等待 3500ms，防无界阻塞音频时钟)
      const hasPendingImage = items.some((it) => it.image?.status === 'pending');
      if (hasPendingImage) {
        await Promise.race([
          new Promise<void>((res) => {
            imageWaitResolvers.current.set(s.id, res);
          }),
          wait(3500),
        ]);
      }

      const capTask: Promise<SpeakHandle | null> = s.caption ? typeCaption(s.caption) : Promise.resolve(null);
      // 若后续步骤先被取消/失败,capTask 的迟到拒绝不得成为未处理拒绝
      void capTask.catch(() => {});
      if (lessonRef.current.table?.step === s.id) await revealTable();
      for (const it of items) {
        await writeItem(it.id);
        if (!ctl.current.skipped) await wait(240);
      }
      for (const an of lessonRef.current.annots.filter((a) => a.step === s.id)) await drawAnnot(an.id);
      const narration = await capTask;
      // 旁白播完才进下一步(60s 安全上限防上游挂起)——否则下一步一开讲就把
      // 还在播的音频截断,这正是上一版"字幕跑完、声音被掐"的根源。
      if (narration) await Promise.race([narration.ended, wait(60_000)]);

      if (s.awaitChoice) {
        // quick check: no "your turn" status line in the panel (ref 53)
        setStatus('idle');
        const choice = s.awaitChoice;
        setQuickCheck({
          stepId: s.id,
          question: choice.question,
          options: choice.options,
          answer: choice.answer,
          explanation: choice.explanation,
          selected: null,
          feedback: null,
        });

        let idx: number;
        if (auto) {
          await wait(1400);
          idx = choice.answer;
        } else if (ctl.current.skipped) {
          idx = choice.answer;
        } else {
          idx = await new Promise<number>((res) => {
            choiceResolver.current = res;
          });
        }
        choiceResolver.current = null;

        const isCorrect = idx === choice.answer;
        const fbKind: 'correct' | 'incorrect' = isCorrect ? 'correct' : 'incorrect';
        setQuickCheck((prev) => (prev ? { ...prev, selected: idx, feedback: fbKind } : null));
        setEntries((prev) => [...prev, userBubble(`u${s.id}`, choice.options[idx])]);

        // Tutor feedback bubble & spoken audio feedback
        const fbExplanation = choice.explanation ? ` ${choice.explanation}` : '';
        const fbText = isCorrect
          ? `${L('Correct!', '回答正确！')}${fbExplanation}`.trim()
          : `${L('Not quite. The correct answer is: ', '不太准确哦。正确答案是：')}${choice.options[choice.answer]}。${choice.explanation || ''}`.trim();
        setEntries((prev) => [...prev, tutorBubble(`qc-fb-${s.id}-${Date.now()}`, fbText)]);

        const { voice: vk, speed: spkSpeed, muted: silent } = narrationRef.current;
        const spokenFb = !silent ? tts.speakTutorTrack(fbText, vk, spkSpeed) : null;

        if (auto) {
          await wait(1500);
          if (spokenFb) await Promise.race([spokenFb.ended, wait(4000)]);
        } else if (ctl.current.skipped) {
          if (spokenFb) tts.stopTutor();
        } else {
          /* 反馈即讲解:导师把对错与解析念完(静音/合成失败给 2.6s 阅读兜底)后
           * 自动续课,不再无限等用户点「继续」——答错后卡住不讲的观感正来自
           * 那个无限等待。「继续」按钮保留,点击即跳过剩余反馈等待。 */
          await Promise.race([
            new Promise<void>((res) => {
              continueResolver.current = res;
            }),
            (async () => {
              if (spokenFb) await Promise.race([spokenFb.ended, wait(8000)]);
              await wait(silent || !spokenFb ? 2600 : 700);
            })(),
          ]);
          continueResolver.current = null;
          if (spokenFb) tts.stopTutor();
        }

        setCaption(null);
        setQuickCheck(null);
        setStatus('explaining');
      }

      if (s.awaitAnswer) {
        setStatus('yourturn');
        setPanelOpen(true);
        let text: string;
        if (auto) {
          await wait(1200);
          text = USER_ANSWERS[s.id] ?? '…';
          if (hold) {
            // verification mode: type the answer into the box but never send
            setInput(text);
            if (idleParam) setIdleOpen(true);
            await new Promise<string>((res) => {
              answerResolver.current = res;
            });
            answerResolver.current = null;
            setEntries((prev) => [...prev, userBubble(`u${s.id}`, text)]);
            setInput('');
            setStatus('explaining');
            await wait(400);
            return;
          }
        } else {
          text = await new Promise<string>((res) => {
            answerResolver.current = res;
          });
        }
        answerResolver.current = null;
        if (text) {
          setEntries((prev) => [...prev, userBubble(`u${s.id}`, text)]);
          const ackText = L(
            'Thoughtful response! Let us connect this to what comes next.',
            '很好的思考！顺着这个思路，我们来看接下来的核心关键。'
          );
          setEntries((prev) => [...prev, tutorBubble(`ack-${s.id}-${Date.now()}`, ackText)]);
          const { voice: vk, speed: spkSpeed, muted: silent } = narrationRef.current;
          const spokenAck = !silent ? tts.speakTutorTrack(ackText, vk, spkSpeed) : null;
          try {
            await wait(1500);
            if (spokenAck) await Promise.race([spokenAck.ended, wait(6000)]);
          } catch {}
        }
        setCaption(null);
        setStatus('explaining');
      }

      if (s.popup) {
        if (s.popup === 'unitComplete') {
          setStatus('ended');
          setPopup('unitComplete');
          await new Promise<void>((res) => {
            popupResolver.current = res;
          });
          popupResolver.current = null;
        } else {
          await wait(500);
          setPopup(s.popup);
          await new Promise<void>((res) => {
            popupResolver.current = res;
          });
          popupResolver.current = null;
          setPopup(null);
        }
      }

      if (s.systemEnd) setSystemEnd(true);
      if (s.beat && !ctl.current.skipped) await wait(s.beat);
      ctl.current.skipped = false;
    },
    [auto, drawAnnot, revealTable, typeCaption, wait, writeItem],
  );

  /* ---------------- engine boot ---------------- */
  useEffect(() => {
    /* 直播放计划未决(生成中)不开讲——练习直入也要等课程内容定稿再 ff;
     * 演示课再等启动身份结算(bootReady),确保旁白称呼绑定本次登录名
     * 而不是保底名;纯静态托管下 boot 同样会结算(只是 identity 为 null)。 */
    if (stage !== 'play' || started.current || planPending) return;
    if (liveTopic === null && !state.bootReady) return;
    started.current = true;
    const ff = practiceEntry ? (FIRST_CHOICE_STEP?.id ?? ffParam ?? 1) : ffParam;
    const startFrom = ff ?? 1;
    if (ff !== null) applyFastForward(ff);
    // 起讲前先预热开头两条旁白(演示课/练习直入不走 plan 就绪预热)
    lessonRef.current.steps.filter((s) => s.caption && s.id >= startFrom)
      .slice(0, 2)
      .forEach((s) => prefetchNarration(s.caption));
    (async () => {
      try {
        await wait(600);
        setStatus('explaining');
        for (const s of lessonRef.current.steps) {
          if (s.id < startFrom) continue;
          // 滚动预热:当前步开讲时,把后面两条旁白送进合成管线
          lessonRef.current.steps.filter((x) => x.caption && x.id > s.id)
            .slice(0, 2)
            .forEach((x) => prefetchNarration(x.caption));
          await runStep(s);
        }
        setStatus((p) => (p === 'explaining' ? 'ended' : p));
      } catch {
        /* cancelled on unmount */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, planPending, state.bootReady, liveTopic]);

  /* cancel on unmount */
  useEffect(
    () => () => {
      ctl.current.cancelled = true;
      if (voiceTimer.current) window.clearTimeout(voiceTimer.current);
      voiceTimers.current.forEach((t) => window.clearTimeout(t));
      pendingTimers.current.forEach((t) => window.clearTimeout(t));
      if (choiceResolver.current) {
        choiceResolver.current(0);
        choiceResolver.current = null;
      }
      if (continueResolver.current) {
        continueResolver.current();
        continueResolver.current = null;
      }
      if (answerResolver.current) {
        answerResolver.current('');
        answerResolver.current = null;
      }
      if (popupResolver.current) {
        popupResolver.current();
        popupResolver.current = null;
      }
      tts.stop();
    },
    [],
  );

  /* ---------------- user actions ---------------- */

  const finished = systemEnd;

  /* 举手插话:自由提问(非答题步)暂停主线,导师答案回流对话面板,答疑后 5s
   * 恢复主线——原 WS interject 语义。直播课调真实端点;演示课/端点不可用给
   * 本地可见反馈,绝不静默落空。 */
  const askTutor = useCallback(
    async (question: string) => {
      /* 插话互斥(文本/语音入口共用此守卫):上一个问题还在答疑时,新问题明确驳回,
       * 不允许并发插话互相打断音频与暂停状态 */
      if (askingRef.current) {
        toast(L('The tutor is still answering your last question', '导师还在回答上一个问题'));
        return;
      }
      const sessionId = liveScript?.sessionId;
      if (!sessionId) {
        setEntries((prev) => [
          ...prev,
          {
            id: `sys-${Date.now()}`,
            kind: 'system',
            text: [
              {
                t: L(
                  'Live Q&A needs an online lecture — this is the scripted demo lesson.',
                  '实时答疑需要在线讲座——当前是演示课，答疑不可用。',
                ),
              },
            ],
          },
        ]);
        return;
      }
      askingRef.current = true;
      setAsking(true);
      setLessonPaused(true); // 主线暂停(声画同步,与暂停键同语义)
      tts.pauseAudio();
      try {
        const sid = LESSON_STEPS.find((s) => s.id === stepRef.current)?.sid ?? '';
        const ans = await interjectLive(sessionId, sid, question);
        if (ctl.current.cancelled) return;
        const answerText =
          ans?.answerText ?? L('(The tutor could not be reached — the lecture continues.)', '(暂时联系不上导师——课程继续。)');
        setEntries((prev) => [...prev, tutorBubble(`a-${Date.now()}`, answerText)]);
        const resume = ans?.resumeTransition ?? '';
        if (resume) {
          const timer = window.setTimeout(() => {
            if (!ctl.current.cancelled) setEntries((prev) => [...prev, tutorBubble(`r-${Date.now()}`, resume)]);
          }, 1200);
          pendingTimers.current.push(timer);
        }
        /* 答疑朗读不销毁主线旁白；用户主动暂停时不启动新音频。 */
        const { voice: vk, speed, muted: silent } = narrationRef.current;
        const spoken = ans && !silent && !pausedRef.current ? tts.speakTutorTrack(answerText, vk, speed) : null;
        /* 原版节奏:答疑后 5s 恢复主线;连不上导师缩短等待 */
        await wait(ans ? 5000 : 1500, true);
        if (spoken) await Promise.race([spoken.ended, wait(8000, true)]);
      } catch {
        if (!ctl.current.cancelled) {
          setEntries((prev) => [...prev, tutorBubble(`a-${Date.now()}`,
            L('(The tutor could not be reached — the lecture continues.)', '(暂时联系不上导师——课程继续。)'))]);
        }
      } finally {
        askingRef.current = false;
        tts.stopTutor();
        if (!ctl.current.cancelled) {
          setAsking(false);
          if (!pausedRef.current) {
            setLessonPaused(false);
            tts.resumeAudio();
          }
        }
      }
    },
    [LESSON_STEPS, liveScript, wait, setLessonPaused],
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    if (askingRef.current) {
      toast(L('The tutor is still answering your last question', '导师还在回答上一个问题'));
      return;
    }
    if (choiceResolver.current) {
      const index = choiceIndexFromInput(text, quickCheck?.options ?? []);
      if (index === null) {
        toast(L('Please enter a choice letter, number, or exact option', '请输入选项字母、序号或完整选项内容'));
        return;
      }
      setInput('');
      const resolve = choiceResolver.current;
      choiceResolver.current = null;
      resolve(index);
    } else if (answerResolver.current) {
      setInput('');
      const res = answerResolver.current;
      answerResolver.current = null;
      res(text); // runner appends the user bubble
    } else {
      setInput('');
      setEntries((prev) => [...prev, userBubble(`free-${Date.now()}`, text)]);
      void askTutor(text);
    }
  }, [input, askTutor, quickCheck]);

  /* 语音提问/作答:Web Speech API 一次性真转写(替代旧版 canned 台词)。
   * 等答案时转写即答案;自由时段转写即举手插话。 */
  const handleMic = useCallback(() => {
    if (voice !== 'off') {
      /* 二次点击复位监听指示(识别本身一次性,自然结束) */
      if (voiceTimer.current) window.clearTimeout(voiceTimer.current);
      voiceTimers.current.forEach((t) => window.clearTimeout(t));
      voiceTimers.current = [];
      setVoice('off');
      return;
    }
    const startedListening = listenOnce(
      (text) => {
        if (choiceResolver.current) {
          const index = choiceIndexFromInput(text, quickCheck?.options ?? []);
          if (index === null) {
            toast(L('Please say a choice letter, number, or exact option', '请说出选项字母、序号或完整选项内容'));
            return;
          }
          const resolve = choiceResolver.current;
          choiceResolver.current = null;
          resolve(index);
          return;
        }
        setEntries((prev) => [...prev, userBubble(`v-${Date.now()}`, text)]);
        const res = answerResolver.current;
        if (res) {
          answerResolver.current = null;
          res(''); // 气泡已按转写落上面,课程继续
        } else {
          void askTutor(text);
        }
      },
      () => setVoice('off'),
    );
    if (!startedListening) return;
    if (voiceTimer.current) window.clearTimeout(voiceTimer.current);
    voiceTimer.current = window.setTimeout(() => setVoice('listening'), 700);
    setVoice('preparing');
  }, [voice, askTutor, quickCheck]);

  const handleTogglePause = useCallback(() => {
    // 音频与课程步进同暂停同恢复:元素不销毁,从断点续播(无需重读整句);
    // setLessonPaused 同时给授课时钟结账,暂停时长不计入起声/断流超时。
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (askingRef.current) {
      if (next) tts.pauseAudio();
      else tts.resumeTutor();
      return;
    }
    setLessonPaused(next);
    if (next) tts.pauseAudio();
    else tts.resumeAudio();
  }, [setLessonPaused]);

  /* 右侧面板停止/结束按钮:立即停止当前音频,解除当前步手写与字幕等待,快速收尾并进入下一步 */
  const handleStopExplaining = useCallback(() => {
    tts.stop();
    ctl.current.skipped = true;
    if (choiceResolver.current) {
      const cr = choiceResolver.current;
      choiceResolver.current = null;
      cr(quickCheck?.answer ?? 0);
    }
    if (continueResolver.current) {
      const cnr = continueResolver.current;
      continueResolver.current = null;
      cnr();
    }
    if (answerResolver.current) {
      const ar = answerResolver.current;
      answerResolver.current = null;
      ar('');
    }
  }, [quickCheck]);

  /* 面板"加图片":真实上传到 /api/uploads,成功后作为一条图片记录进入对话记录 */
  const imageRef = useRef<HTMLInputElement>(null);
  const handleAddImage = useCallback(() => imageRef.current?.click(), []);
  const onImagePicked = useCallback(async (file: File) => {
    const material = await uploadFile(file);
    if (!material) {
      toast(L('Upload failed — please try again', '上传失败，请重试'));
      return;
    }
    setEntries((prev) => [
      ...prev,
      { id: `img-${Date.now()}`, kind: 'image', url: material.url, name: material.name },
    ]);
  }, []);

  /* 板书导出:当前页 = 左/右半页(按是否已翻页),全部 = 整块板书;直播课传数据源覆盖 */
  const handleExport = useCallback(
    (format: ExportFormat, page: ExportPage) => {
      void exportBoard(format, page, {
        step,
        standardFont: settings.font === 'standard',
        dots: settings.dots,
        tableRows,
        panX,
        items: BOARD_ITEMS,
        table: BOARD_TABLE,
        annots: BOARD_ANNOTS,
        pageSplitX: lesson.pageSplitX,
      });
    },
    [step, settings.font, settings.dots, tableRows, panX, BOARD_ITEMS, BOARD_TABLE, BOARD_ANNOTS, lesson.pageSplitX],
  );

  const handleExit = useCallback(() => {
    ctl.current.cancelled = true;
    const current = state.identity?.credits ?? state.energy ?? 20;
    const nextEnergy = finished ? Math.max(0, current - 5) : current;
    set({
      screen: 'courseJourney',
      lectureDone: finished,
      lectureCompletePrompt: finished,
      energy: nextEnergy,
      ...(state.identity ? { identity: { ...state.identity, credits: nextEnergy } } : {}),
    });
  }, [finished, set, state.identity, state.energy]);

  /* 自由讲座:学员命题提交。相同话题重试也必须重新触发备课 effect,故 planAttempt
   * 递增——effect 依赖里的真正"点火器"。 */
  const commitFreeTopic = useCallback(
    (topic: string) => {
      const t = topic.trim().slice(0, 300);
      if (!t) return;
      setPlanFailed(false);
      setPlanAttempt((a) => a + 1);
      set({ activeTopic: t });
    },
    [set],
  );
  const retryFreePlan = useCallback(() => {
    setPlanFailed(false);
    setPlanAttempt((a) => a + 1);
  }, []);

  // play triangle whenever the tutor isn't actively explaining (await, popup, end)
  const idle = status !== 'explaining' || popup !== null;
  const placeholder = status === 'yourturn' ? L('Your answer here...', '在这里写下你的回答…') : L('Ask a question...', '问一个问题…');

  const content = (
    <>
      <main className="wb-canvas-area" aria-label="Interactive whiteboard">
        <Board
          step={step}
          progress={progress}
          writingId={writingId}
          panX={panX}
          zoom={zoom}
          onZoomChange={(z) => setZoom(z)}
          standardFont={settings.font === 'standard'}
          dots={settings.dots}
          tableRows={tableRows}
          annotsDone={annotsDone}
          annotActive={annotActive}
          items={BOARD_ITEMS}
          table={BOARD_TABLE}
          annots={BOARD_ANNOTS}
          isFollowing={isFollowing}
          onUserInteraction={() => setIsFollowing(false)}
        />

        {/* Structured interaction overlay layer above canvas, non-overlapping with footer */}
        <section className="wb-interaction-layer" aria-live="polite">
          {quickCheck && (
            <QuickCheck
              question={quickCheck.question}
              options={quickCheck.options}
              selected={quickCheck.selected}
              answer={quickCheck.answer}
              feedback={quickCheck.feedback}
              explanation={quickCheck.explanation}
              onSelect={(i) => {
                if (quickCheck.selected === null && choiceResolver.current) {
                  const res = choiceResolver.current;
                  choiceResolver.current = null;
                  res(i);
                }
              }}
              onContinue={() => {
                if (continueResolver.current) {
                  const res = continueResolver.current;
                  continueResolver.current = null;
                  res();
                }
              }}
              onSkip={() => {
                if (choiceResolver.current) {
                  const res = choiceResolver.current;
                  choiceResolver.current = null;
                  res(quickCheck.answer);
                }
                if (continueResolver.current) {
                  const res = continueResolver.current;
                  continueResolver.current = null;
                  res();
                }
              }}
              centerX={0}
            />
          )}
          {(voice === 'listening' || asking) && <ListenPill centerX={0} />}
        </section>
      </main>
    </>
  );

  return (
    <div className={`wb-app-layout${panelOpen ? ' with-panel' : ''}`}>
      {content}
      {panelOpen && (
        <aside
          className="wb-panel-container"
          aria-label="Conversation panel"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPanelOpen(false);
          }}
        >
          <ConversationPanel
            entries={entries}
            status={status}
            systemEnd={systemEnd}
            voice={voice}
            inputValue={input}
            onInput={setInput}
            onSend={handleSend}
            onStop={handleStopExplaining}
            onMic={handleMic}
            onAddImage={handleAddImage}
            onClose={() => setPanelOpen(false)}
            placeholder={placeholder}
            canSend={input.trim().length > 0}
          />
        </aside>
      )}
      <input
        ref={imageRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void onImagePicked(file);
        }}
      />

      <WhiteboardChrome
        panelOpen={panelOpen}
        zoom={zoom}
        onZoom={(z) => {
          setZoom(z);
          setIsFollowing(false);
        }}
        page={lesson.pageSplitX ? (panX > 0 ? 2 : 1) : 1}
        pageCount={lesson.pageSplitX ? 2 : 1}
        onPage={(p) => {
          setPanX(p <= 1 ? 0 : PAN_X);
          setIsFollowing(true);
        }}
        onExport={handleExport}
        paused={paused}
        idle={idle}
        onTogglePause={handleTogglePause}
        muted={muted}
        onToggleMute={() =>
          setMuted((m) => {
            if (!m) tts.stop(); // 关掉声音同时停掉正在播的旁白
            return !m;
          })
        }
        onExit={() => setExitOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenFeedback={() => setFeedbackOpen(true)}
        onOpenConn={() => setConnOpen(!connOpen)}
        connOpen={connOpen}
        onTogglePanel={() => setPanelOpen(!panelOpen)}
        showDownloadDot
        onMicFab={handleMic}
        voiceOn={voice !== 'off'}
        titleOverride={genLectureTitle}
        isFollowing={isFollowing}
        onResumeFollow={() => setIsFollowing(true)}
        caption={caption}
        capShown={capShown}
        typing={typing}
        quickCheckActive={quickCheck !== null}
        status={status}
      />

      {connOpen && (
        <ConnectionPanel
          onClose={() => setConnOpen(false)}
          muted={muted}
          speaking={status === 'explaining'}
        />
      )}
      {settingsOpen && (
        <SessionSettings
          value={settings}
          onChange={setSettings}
          onClose={() => setSettingsOpen(false)}
          speaking={status === 'explaining'}
        />
      )}
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}

      {popup && popup !== 'unitComplete' && (
        <AwardPopup
          kind={popup}
          onGotIt={() => {
            setPopup(null);
            popupResolver.current?.();
            popupResolver.current = null;
          }}
        />
      )}
      {popup === 'unitComplete' && (
        <UnitCompletePopup
          onChat={() => {
            setPopup(null);
            popupResolver.current?.();
            popupResolver.current = null;
          }}
          onHome={() => {
            popupResolver.current?.();
            popupResolver.current = null;
            const current = state.identity?.credits ?? state.energy ?? 20;
            const nextEnergy = Math.max(0, current - 5);
            set({
              screen: 'home',
              lectureDone: true,
              lectureCompletePrompt: true,
              energy: nextEnergy,
              ...(state.identity ? { identity: { ...state.identity, credits: nextEnergy } } : {}),
            });
          }}
        />
      )}

      {exitOpen && <ExitConfirm onKeep={() => setExitOpen(false)} onExit={handleExit} />}

      {idleOpen && (
        <StillThere
          onKeep={() => setIdleOpen(false)}
          onBack={() => set({ screen: 'courses' })}
        />
      )}

      {stage === 'intro' && (
        <IntroOverlay
          onStart={() => setStage('talk')}
          onClose={() => set({ screen: freeTopicMode ? 'home' : 'courseJourney' })}
          title={genLectureTitle}
          body={genIntroBody}
          preparing={planPending}
          cover={GEN?.cover ? { kind: GEN.cover, seed: GEN.courseUuid ?? GEN.topic } : null}
          freeTopic={
            freeTopicMode
              ? {
                  picking: liveTopic === null,
                  failed: planFailed,
                  signedOut: state.bootReady && !state.identity,
                  onCommit: commitFreeTopic,
                  onRetry: retryFreePlan,
                  onDemo: () => setStage('talk'),
                  onSignIn: () => set({ screen: 'signin' }),
                }
              : undefined
          }
        />
      )}
      {stage === 'talk' && <TalkModeOverlay onStart={() => setStage('play')} />}
    </div>
  );
};

export default WhiteboardPage;
