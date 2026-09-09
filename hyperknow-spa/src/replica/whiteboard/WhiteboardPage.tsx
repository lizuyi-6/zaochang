import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PageProps } from '../types';
import { Board, itemCharCount, richLen } from './Board';
import { CaptionBar } from './CaptionBar';
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
import { interjectLive, planLectureLive } from '../backend';
import { L } from '../i18n/content';
import { exportBoard, type ExportFormat, type ExportPage } from '../boardExport';
import { uploadFile } from '../materials';
import { toast } from '../toast';
import { listenOnce, tts, type SpeakHandle } from '../actions';
import './whiteboard.css';

type Stage = 'intro' | 'talk' | 'play';

// 每步旁白窗口(原 whiteboardWs.js deliverStep 同式,亦见 protocol.ts stepDurationMs):
// 中文一字一音节 ×180ms;英文按音节密度 ×65ms(实测 287 字符英文 ≈19.7s 音频,
// 纯 180ms/字符会算出 51.7s,音频播完后字幕独走半分钟);再按语速缩放,下限 4s。
const narrateMs = (text: string, speed = 1) => {
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || []).length;
  const other = text.length - cjk;
  return Math.max(4000, (cjk * 180 + other * 65) / Math.max(0.5, speed));
};
const BOARD_CPS = 24; // handwriting chars/sec

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
  const genLectureTitle = GEN ? GEN.units[0].lectures[0]?.title : undefined;
  const genIntroBody = GEN
    ? L(
        `This session opens ${GEN.topic} the way every Hyperknow lesson does: watch the board take shape, answer a quick check, and leave with one idea you can use today.`,
        `本节课用 Hyperknow 的标准方式开启「${GEN.topic}」：看板书逐步成形，回答一次快速检查，带着一个马上能用的想法离开。`,
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

  /* 直播放:生成课(伪生成/后端课)进白板 → 按课节话题真拉讲座计划;失败静默
   * 回退演示课(与其余端点同一双轨纪律)。演示公开演讲课不走直播,保住像素复刻。 */
  const liveTopic = GEN ? (genLectureTitle ?? GEN.topic) : null;
  const [liveScript, setLiveScript] = useState<LessonScript | null>(null);
  const [planPending, setPlanPending] = useState(liveTopic !== null);
  useEffect(() => {
    if (!liveTopic) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 65_000); // 服务端 60s 超时 + 余量
    let alive = true;
    void planLectureLive(liveTopic, ctrl.signal)
      .then((plan) => {
        if (!alive) return;
        setPlanPending(false);
        if (plan) setLiveScript(liveLessonFromPlan(plan));
      })
      .catch(() => {
        if (alive) setPlanPending(false);
      });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTopic]);

  const lesson = liveScript ?? DEMO_SCRIPT;
  const LESSON_STEPS = lesson.steps;
  const BOARD_ITEMS = lesson.items;
  const BOARD_TABLE = lesson.table;
  const BOARD_ANNOTS = lesson.annots;
  const USER_ANSWERS = lesson.userAnswers;
  const CHOICE_STEP = LESSON_STEPS.find((s) => s.awaitChoice) ?? null;

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
  const [quickCheck, setQuickCheck] = useState<{ selected: number | null } | null>(null);
  /* 举手插话进行中(导师取答案;面板/药丸展示"聆听中") */
  const [asking, setAsking] = useState(false);

  // ----- chrome / ui state -----
  const [panelOpen, setPanelOpen] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voice, setVoice] = useState<VoiceState>('off');
  const [input, setInput] = useState('');
  const [settings, setSettings] = useState<SessionSettingsValue>({ voice: 'calm', speed: 1, font: 'handwriting', dots: true });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [connOpen, setConnOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [idleOpen, setIdleOpen] = useState(false);

  // ----- engine control refs -----
  const ctl = useRef({ cancelled: false, paused: false });
  const answerResolver = useRef<((text: string) => void) | null>(null);
  const popupResolver = useRef<(() => void) | null>(null);
  const choiceResolver = useRef<((i: number) => void) | null>(null);
  const started = useRef(false);
  const voiceTimer = useRef<number | null>(null);
  const voiceTimers = useRef<number[]>([]);
  /* 当前步(插话按它取服务端 step_id 上下文)与插话互斥标记 */
  const stepRef = useRef(1);
  stepRef.current = step;
  const askingRef = useRef(false);
  // 授课语音:step runner 是稳定回调,经 ref 读最新音色/语速/静音。
  const narrationRef = useRef({ voice: settings.voice, speed: settings.speed, muted });
  narrationRef.current = { voice: settings.voice, speed: settings.speed, muted };

  /* Pause-aware delay: accumulates only while unpaused; rejects on unmount. */
  const wait = useCallback(
    (ms: number) =>
      new Promise<void>((resolve, reject) => {
        let left = ms;
        let last = Date.now();
        const iv = window.setInterval(() => {
          if (ctl.current.cancelled) {
            window.clearInterval(iv);
            reject(new Error('cancelled'));
            return;
          }
          const now = Date.now();
          if (!ctl.current.paused) left -= now - last;
          last = now;
          if (left <= 0) {
            window.clearInterval(iv);
            resolve();
          }
        }, 50);
      }),
    [],
  );

  /* ---------------- fast-forward preset (screenshot verification) ---------------- */
  const applyFastForward = useCallback((upto: number) => {
    const es: PanelEntry[] = [];
    const prog: Record<string, number> = {};
    const done = new Set<string>();
    let pan = 0;
    let rows = 0;
    let sysEnd = false;
    let lastCap: Rich | null = null;
    for (const s of LESSON_STEPS) {
      if (s.id >= upto) break;
      if (s.pan) pan = PAN_X;
      if (s.panel) es.push(...s.panel);
      if (s.caption) lastCap = s.caption;
      if (s.awaitAnswer) es.push(userBubble(`u${s.id}`, USER_ANSWERS[s.id] ?? '…'));
      if (s.awaitChoice) es.push(userBubble(`u${s.id}`, s.awaitChoice.options[s.awaitChoice.answer]));
      if (s.systemEnd) sysEnd = true;
    }
    for (const it of BOARD_ITEMS) if (it.step < upto) prog[it.id] = itemCharCount(it);
    for (const an of BOARD_ANNOTS) if (an.step < upto) done.add(an.id);
    if (BOARD_TABLE && BOARD_TABLE.step < upto) rows = 4;
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
      // 8 秒仍等不到声音(上游异常/被静音)则字幕自行前进,不让课程卡死。
      const { voice: vk, speed, muted: silent } = narrationRef.current;
      let handle: SpeakHandle | null = null;
      if (!silent && total > 0) {
        handle = tts.speakTrack(plain, vk, speed);
        const how = await Promise.race([handle.started, wait(8000).then(() => 'timeout' as const)]);
        if (how === 'stopped' || how === 'error') handle = null;
      }
      // 声画双向对齐:窗口按语言自适应估算;音频先播完 → 字幕立即补全,绝不留
      // "音频已停、字幕还在爬"的空窗。
      const per = narrateMs(plain, speed) / Math.max(1, total);
      for (let i = 1; i <= total; i++) {
        if (handle) {
          const tick = wait(per).then(() => 'tick' as const);
          const won = await Promise.race([tick, handle.ended.then(() => 'ended' as const)]);
          if (won === 'ended') {
            setCapShown(total);
            break;
          }
        } else {
          await wait(per);
        }
        setCapShown(i);
      }
      setTyping(false);
      return handle;
    },
    [wait],
  );

  const writeItem = useCallback(
    async (id: string) => {
      const total = itemCharCount(BOARD_ITEMS.find((b) => b.id === id)!);
      setWritingId(id);
      const per = 1000 / BOARD_CPS;
      for (let c = 1; c <= total; c++) {
        await wait(per);
        setProgress((p) => ({ ...p, [id]: c }));
      }
      setWritingId(null);
    },
    [wait],
  );

  const revealTable = useCallback(async () => {
    for (let r = 1; r <= 4; r++) {
      setTableRows(r);
      await wait(480);
    }
  }, [wait]);

  const drawAnnot = useCallback(
    async (id: string) => {
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

      const items = BOARD_ITEMS.filter((b) => b.step === s.id);
      const capTask: Promise<SpeakHandle | null> = s.caption ? typeCaption(s.caption) : Promise.resolve(null);
      if (BOARD_TABLE?.step === s.id) await revealTable();
      for (const it of items) await writeItem(it.id);
      for (const an of BOARD_ANNOTS.filter((a) => a.step === s.id)) await drawAnnot(an.id);
      const narration = await capTask;
      // 旁白播完才进下一步(60s 安全上限防上游挂起)——否则下一步一开讲就把
      // 还在播的音频截断,这正是上一版"字幕跑完、声音被掐"的根源。
      if (narration) await Promise.race([narration.ended, wait(60_000)]);

      if (s.awaitChoice) {
        // quick check: no "your turn" status line in the panel (ref 53)
        setStatus('idle');
        setQuickCheck({ selected: null });
        let idx: number;
        if (auto) {
          await wait(1400);
          idx = s.awaitChoice.answer;
        } else {
          idx = await new Promise<number>((res) => {
            choiceResolver.current = res;
          });
        }
        choiceResolver.current = null;
        setQuickCheck({ selected: idx });
        setEntries((prev) => [...prev, userBubble(`u${s.id}`, s.awaitChoice!.options[idx])]);
        setCaption(null);
        await wait(1500);
        setQuickCheck(null);
        setStatus('explaining');
      }

      if (s.awaitAnswer) {
        setStatus('yourturn');
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
        if (text) setEntries((prev) => [...prev, userBubble(`u${s.id}`, text)]);
        setCaption(null); // ref 50: caption area empties once the learner answers
        setStatus('explaining');
        await wait(400);
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
      if (s.beat) await wait(s.beat);
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
    const ff = practiceEntry ? (CHOICE_STEP?.id ?? ffParam ?? 1) : ffParam;
    const startFrom = ff ?? 1;
    if (ff !== null) applyFastForward(ff);
    (async () => {
      try {
        await wait(600);
        setStatus('explaining');
        for (const s of LESSON_STEPS) {
          if (s.id < startFrom) continue;
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
      ctl.current.paused = true; // 主线暂停(声画同步,与暂停键同语义)
      tts.pauseAudio();
      const sid = LESSON_STEPS.find((s) => s.id === stepRef.current)?.sid ?? '';
      const ans = await interjectLive(sessionId, sid, question);
      if (ctl.current.cancelled) return;
      askingRef.current = false;
      setAsking(false);
      const answerText =
        ans?.answerText ?? L('(The tutor could not be reached — the lecture continues.)', '(暂时联系不上导师——课程继续。)');
      setEntries((prev) => [...prev, tutorBubble(`a-${Date.now()}`, answerText)]);
      const resume = ans?.resumeTransition ?? '';
      if (resume) {
        window.setTimeout(() => {
          if (!ctl.current.cancelled) setEntries((prev) => [...prev, tutorBubble(`r-${Date.now()}`, resume)]);
        }, 1200);
      }
      /* 答疑朗读(TTS 单例:插话会打断当前旁白,字幕随之补全);尊重静音 */
      const { voice: vk, speed, muted: silent } = narrationRef.current;
      const spoken = ans && !silent ? tts.speakTrack(answerText, vk, speed) : null;
      try {
        /* 原版节奏:答疑后 5s 恢复主线;连不上导师缩短等待 */
        await wait(ans ? 5000 : 1500);
        if (spoken) await Promise.race([spoken.ended, wait(8000)]);
      } catch {
        return; // unmount cancelled
      }
      if (!ctl.current.cancelled) {
        ctl.current.paused = false;
        tts.resumeAudio();
      }
    },
    [LESSON_STEPS, liveScript, wait],
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    if (askingRef.current) {
      toast(L('The tutor is still answering your last question', '导师还在回答上一个问题'));
      return;
    }
    setInput('');
    if (answerResolver.current) {
      const res = answerResolver.current;
      answerResolver.current = null;
      res(text); // runner appends the user bubble
    } else {
      setEntries((prev) => [...prev, userBubble(`free-${Date.now()}`, text)]);
      void askTutor(text);
    }
  }, [input, askTutor]);

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
  }, [voice, askTutor]);

  const handleTogglePause = useCallback(() => {
    ctl.current.paused = !ctl.current.paused;
    // 音频与课程步进同暂停同恢复:元素不销毁,从断点续播(无需重读整句)。
    if (ctl.current.paused) tts.pauseAudio();
    else tts.resumeAudio();
    setPaused(ctl.current.paused);
  }, []);

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
    set({ screen: 'courseJourney', lectureDone: finished, lectureCompletePrompt: finished });
  }, [finished, set]);

  const centerX = panelOpen ? 615 : 800;
  const choiceVisible = quickCheck !== null;
  // play triangle whenever the tutor isn't actively explaining (await, popup, end)
  const idle = status !== 'explaining' || popup !== null;
  const placeholder = status === 'yourturn' ? L('Your answer here...', '在这里写下你的回答…') : L('Ask a question...', '问一个问题…');

  const content = useMemo(
    () => (
      <>
        <Board
          step={step}
          progress={progress}
          writingId={writingId}
          panX={panX}
          zoom={zoom}
          standardFont={settings.font === 'standard'}
          dots={settings.dots}
          tableRows={tableRows}
          annotsDone={annotsDone}
          annotActive={annotActive}
          items={BOARD_ITEMS}
          table={BOARD_TABLE}
          annots={BOARD_ANNOTS}
        />
        <CaptionBar caption={caption} shown={capShown} typing={typing} centerX={centerX} raised={choiceVisible} />
        {quickCheck && CHOICE_STEP?.awaitChoice && (
          <QuickCheck
            question={CHOICE_STEP.awaitChoice.question}
            options={CHOICE_STEP.awaitChoice.options}
            selected={quickCheck.selected}
            onSelect={(i) => {
              if (quickCheck.selected === null && choiceResolver.current) {
                const res = choiceResolver.current;
                choiceResolver.current = null;
                res(i);
              }
            }}
            centerX={centerX}
          />
        )}
        {(voice === 'listening' || asking) && <ListenPill centerX={centerX} />}
      </>
    ),
    [step, progress, writingId, panX, zoom, settings.font, settings.dots, tableRows, annotsDone, annotActive, caption, capShown, typing, centerX, choiceVisible, quickCheck, voice, asking, BOARD_ITEMS, BOARD_TABLE, BOARD_ANNOTS, CHOICE_STEP],
  );

  return (
    <div className="wb-root">
      {content}

      {panelOpen && (
        <ConversationPanel
          entries={entries}
          status={status}
          systemEnd={systemEnd}
          voice={voice}
          inputValue={input}
          onInput={setInput}
          onSend={handleSend}
          onMic={handleMic}
          onAddImage={handleAddImage}
          onClose={() => setPanelOpen(false)}
          placeholder={placeholder}
          canSend={input.trim().length > 0}
        />
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
        onZoom={setZoom}
        page={panX > 0 ? 2 : 1}
        pageCount={lesson.pageSplitX ? 2 : 1}
        onPage={(p) => setPanX(p <= 1 ? 0 : PAN_X)}
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
            set({ screen: 'home', lectureDone: true, lectureCompletePrompt: true });
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
          onClose={() => set({ screen: 'courseJourney' })}
          title={genLectureTitle}
          body={genIntroBody}
          preparing={planPending}
        />
      )}
      {stage === 'talk' && <TalkModeOverlay onStart={() => setStage('play')} />}
    </div>
  );
};

export default WhiteboardPage;
