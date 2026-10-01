import { L } from './i18n/content';
import { getCurrentLng } from './i18n';
import { toast } from './toast';

/**
 * 按钮的真实动作集合:剪贴板/分享、日历文件、朗读(TTS)、语音输入(STT)。
 * 每个动作都自带成功/失败反馈——死按钮的修复原则是"要么真做事,要么明确报错"。
 */

/* ---------------- 剪贴板 / 分享 ---------------- */

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 非安全上下文或权限被拒 → 走 execCommand 降级 */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** 分享当前页面:能系统分享就分享,否则复制链接。用户取消时不打扰。 */
export async function shareLink(url = window.location.href, title?: string): Promise<void> {
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title: title ?? document.title, url });
      return;
    } catch (error) {
      if ((error as DOMException | undefined)?.name === 'AbortError') return;
    }
  }
  const ok = await copyText(url);
  toast(ok ? L('Link copied', '链接已复制') : L('Could not copy the link', '复制链接失败'));
}

/* ---------------- 日历 (.ics) ---------------- */

export function downloadIcs(event: { title: string; description?: string; start: Date; minutes?: number }): void {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  const end = new Date(event.start.getTime() + (event.minutes ?? 60) * 60_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hyperknow//Study Session//EN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@aetherstudio.top`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${event.title}`,
    ...(event.description ? [`DESCRIPTION:${event.description.replace(/\r?\n/g, '\\n')}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  downloadBlob(blob, `${event.title.replace(/[\\/:*?"<>|]/g, '_')}.ics`);
  toast(L('Calendar file downloaded', '日历文件已下载'));
}

/** 触发一次浏览器下载(导出/日历共用)。 */
export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------------- 语音链路自检(连接面板"检查语音连接") ---------------- */

/** 实时语音需要的带宽下限(kbps)——低于它,音频就会断断续续。 */
export const AUDIO_NEEDED_KBPS = 32;

export interface AudioCheckResult {
  status: 'ok' | 'slow_link' | 'tts_failed' | 'download_failed' | 'playback_blocked' | 'unauthorized' | 'muted';
  /** 服务器出第一字节的耗时(≈ 合成时间),毫秒 */
  synthMs?: number;
  /** 实测下载速率 kbps */
  speedKbps?: number;
  neededKbps: number;
  /** 是否真的外放(课堂讲解进行中时为 false,只下载不播放) */
  played: boolean;
}

/**
 * 生成一段测试音频、量出下载速率、并尝试播放。
 * 结果状态直接对应 netCheck.audio.* 的文案分支,由连接面板渲染。
 */
export async function audioCheck(opts: { muted?: boolean; speakAloud?: boolean } = {}): Promise<AudioCheckResult> {
  const neededKbps = AUDIO_NEEDED_KBPS;
  if (opts.muted) return { status: 'muted', neededKbps, played: false };

  const sample = L('This is a quick audio check for your lesson.', '这是一段课堂音频检查。');
  const url = `/api/hyperknow/tts/stream?text=${encodeURIComponent(sample)}&voice=warm&speed=1`;
  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    return { status: 'download_failed', neededKbps, played: false };
  }
  if (!res.ok) {
    return { status: res.status === 401 || res.status === 403 ? 'unauthorized' : 'tts_failed', neededKbps, played: false };
  }
  const synthMs = Math.round(performance.now() - started);
  let bytes: ArrayBuffer;
  try {
    bytes = await res.arrayBuffer();
  } catch {
    return { status: 'download_failed', synthMs, neededKbps, played: false };
  }
  const totalMs = performance.now() - started;
  const downloadMs = Math.max(1, totalMs - synthMs);
  const speedKbps = Math.round((bytes.byteLength * 8) / downloadMs);

  if (!opts.speakAloud) {
    return { status: speedKbps < neededKbps ? 'slow_link' : 'ok', synthMs, speedKbps, neededKbps, played: false };
  }

  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
  const el = new Audio(blobUrl);
  let played = false;
  try {
    await el.play();
    played = true;
    await new Promise<void>((resolve) => {
      el.onended = () => resolve();
      el.onerror = () => resolve();
    });
  } catch {
    /* play() 被拒 = 浏览器/扬声器问题,不是链路问题 */
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
  if (!played) return { status: 'playback_blocked', synthMs, speedKbps, neededKbps, played };
  return { status: speedKbps < neededKbps ? 'slow_link' : 'ok', synthMs, speedKbps, neededKbps, played };
}

/* ---------------- 反馈/联系(邮件是唯一真实可达的通道) ---------------- */

export const SUPPORT_EMAIL = 'zaochang@aetherstudio.top';

/** 打开系统邮件客户端并带上正文;正文为空时提示而不是静默失败。 */
export function openFeedbackMail(text: string, subject = L('Hyperknow feedback', 'Hyperknow 反馈')): boolean {
  const body = text.trim();
  if (!body) {
    toast(L('Please describe the issue first', '请先描述你遇到的问题'));
    return false;
  }
  window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  toast(L('Opening your email app…', '正在打开邮件客户端…'));
  return true;
}

/* ---------------- 朗读(TTS,走 /api/hyperknow/tts/stream) ---------------- */

export const DEFAULT_PLAYBACK_RATE = 0.85;
let currentPlaybackRate = DEFAULT_PLAYBACK_RATE;

let lectureAudioEl: HTMLAudioElement | null = null;
let tutorAudioEl: HTMLAudioElement | null = null;

const ttsListeners = new Set<(on: boolean) => void>();
const notifyTts = (on: boolean) => ttsListeners.forEach((l) => l(on));

function notifyIfStopped(): void {
  const stillPlaying = Boolean(
    (lectureAudioEl && !lectureAudioEl.paused && !lectureAudioEl.ended) ||
    (tutorAudioEl && !tutorAudioEl.paused && !tutorAudioEl.ended)
  );
  if (!stillPlaying) {
    notifyTts(false);
  }
}

/** 播放与预热共用同一 URL 构造:合成端恒用基准语速 1.0,确保预热与实播命中同一条服务端/浏览器缓存。 */
function ttsStreamUrl(text: string, voice: string, speed = 1): string {
  return `/api/hyperknow/tts/stream?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}&speed=${speed}`;
}

const ttsPrefetched = new Set<string>();
/**
 * 旁白预热:上游 MISS 是整段合成完才返回(实测 ~2.5s + 55ms/字,长段落 13s+),
 * 超过字幕引擎 8s 起声上限就会被止损成无声估算步。利用响应 private max-age=3600
 * 的浏览器缓存,在前一步播放期间把后一步合成完毕,起声即缓存命中。
 * 尽力而为:失败静默,字幕引擎的既有超时/回退路径不受影响。
 * 恒以 speed=1 合成,客户端通过 playbackRate 变速,实现 100% 缓存复用。
 */
export function prefetchTts(text: string, voice = 'warm', _speed = 1): void {
  const body = text.trim().slice(0, 1500);
  if (!body || typeof fetch === 'undefined') return;
  const url = ttsStreamUrl(body, voice, 1);
  if (ttsPrefetched.has(url)) return;
  ttsPrefetched.add(url);
  void fetch(url)
    .then((r) => (r.ok ? r.arrayBuffer() : undefined))
    .catch(() => {});
}

/** 旁白句柄:started = 发声是否开始(stopped=被主动停止,error=失败);ended = 播完/停止/失败。均不 reject。 */
export type SpeakStart = 'started' | 'stopped' | 'error';
export interface AudioProgress {
  currentTime: number;
  duration: number;
  ratio: number;
}
export interface SpeakHandle {
  started: Promise<SpeakStart>;
  ended: Promise<void>;
  getProgress: () => AudioProgress | null;
}

type Track = { settleStarted: (v: SpeakStart) => void; settleEnded: () => void };
let lectureTrack: Track | null = null;
let tutorTrack: Track | null = null;

function stopLectureAudio(): void {
  const el = lectureAudioEl;
  const track = lectureTrack;
  lectureAudioEl = null;
  lectureTrack = null;
  if (el) {
    el.pause();
    try {
      el.removeAttribute('src');
      el.load();
    } catch {}
    el.onended = null;
    el.onerror = null;
  }
  if (track) {
    track.settleStarted('stopped');
    track.settleEnded();
  }
  notifyIfStopped();
}

function stopTutorAudio(): void {
  const el = tutorAudioEl;
  const track = tutorTrack;
  tutorAudioEl = null;
  tutorTrack = null;
  if (el) {
    el.pause();
    try {
      el.removeAttribute('src');
      el.load();
    } catch {}
    el.onended = null;
    el.onerror = null;
  }
  if (track) {
    track.settleStarted('stopped');
    track.settleEnded();
  }
  notifyIfStopped();
}

function stopAllAudio(): void {
  stopTutorAudio();
  stopLectureAudio();
}

function playTrackOnChannel(
  channel: 'lecture' | 'tutor',
  text: string,
  voice = 'warm',
  speed = 1,
): SpeakHandle {
  const body = text.trim();
  if (!body) return { started: Promise.resolve('stopped'), ended: Promise.resolve(), getProgress: () => null };

  if (typeof Audio === 'undefined') {
    return { started: Promise.resolve('stopped'), ended: Promise.resolve(), getProgress: () => null };
  }

  // 语速配置: 若调用方显式传入了有效非 1 语速，更新客户端基准播放倍率
  if (typeof speed === 'number' && Number.isFinite(speed) && speed > 0 && speed !== 1) {
    currentPlaybackRate = speed;
  }

  if (channel === 'lecture') {
    // 新开主线旁白步: 停止旧主线旁白与任何残留的导师答疑音频
    stopTutorAudio();
    stopLectureAudio();
  } else {
    // 导师答疑插话: 仅停止旧导师音频，绝不销毁已暂停的主线旁白！
    stopTutorAudio();
  }

  // 服务端合成恒以 speed=1 发起, 保持与预热完全一致的 URL 缓存键
  const url = ttsStreamUrl(body.slice(0, 1500), voice, 1);
  const el = new Audio(url);
  try {
    el.playbackRate = currentPlaybackRate;
  } catch {}

  let resolveStarted!: (v: SpeakStart) => void;
  let resolveEnded!: () => void;
  const started = new Promise<SpeakStart>((res) => { resolveStarted = res; });
  const ended = new Promise<void>((res) => { resolveEnded = res; });
  const track: Track = {
    settleStarted: (v) => resolveStarted(v),
    settleEnded: () => resolveEnded(),
  };

  if (channel === 'lecture') {
    lectureAudioEl = el;
    lectureTrack = track;
  } else {
    tutorAudioEl = el;
    tutorTrack = track;
  }

  const isCurrent = () => (channel === 'lecture' ? lectureAudioEl === el && lectureTrack === track : tutorAudioEl === el && tutorTrack === track);

  const detach = () => {
    if (channel === 'lecture') {
      if (lectureAudioEl === el) lectureAudioEl = null;
      if (lectureTrack === track) lectureTrack = null;
    } else {
      if (tutorAudioEl === el) tutorAudioEl = null;
      if (tutorTrack === track) tutorTrack = null;
    }
    notifyIfStopped();
  };

  el.onended = () => {
    detach();
    track.settleStarted('started');
    track.settleEnded();
  };
  el.onerror = () => {
    detach();
    track.settleStarted('error');
    track.settleEnded();
  };

  void el.play().then(
    () => {
      // 若在 play() 异步完成前已被主动停止，立刻掐断声音并卸载资源
      if (!isCurrent()) {
        try {
          el.pause();
          el.removeAttribute('src');
          el.load();
        } catch {}
        return;
      }
      notifyTts(true);
      track.settleStarted('started');
    },
    () => {
      if (!isCurrent()) return;
      detach();
      track.settleStarted('error');
      track.settleEnded();
    },
  );

  const getProgress = (): AudioProgress | null => {
    const currentEl = channel === 'lecture' ? lectureAudioEl : tutorAudioEl;
    if (!el || currentEl !== el) return null;
    const cur = typeof el.currentTime === 'number' && Number.isFinite(el.currentTime) ? el.currentTime : 0;
    const dur = el.duration;
    const validDur = typeof dur === 'number' && Number.isFinite(dur) && dur > 0;
    const ratio = validDur ? Math.max(0, Math.min(1, cur / dur)) : (Number.isFinite(cur) ? -1 : 0);
    return { currentTime: cur, duration: dur, ratio };
  };

  return { started, ended, getProgress };
}

export const tts = {
  speaking: (): boolean =>
    Boolean((lectureAudioEl && !lectureAudioEl.paused && !lectureAudioEl.ended) ||
            (tutorAudioEl && !tutorAudioEl.paused && !tutorAudioEl.ended)),

  /** 订阅播放状态(按钮的高亮/停止态用)。返回退订函数。 */
  subscribe(cb: (on: boolean) => void): () => void {
    ttsListeners.add(cb);
    return () => {
      ttsListeners.delete(cb);
    };
  },

  /** 动态更新客户端播放倍率:立即对当前播放音频生效,并作为后续音频默认倍率 */
  setPlaybackRate(rate: number): void {
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return;
    currentPlaybackRate = rate;
    if (lectureAudioEl) {
      try { lectureAudioEl.playbackRate = rate; } catch {}
    }
    if (tutorAudioEl) {
      try { tutorAudioEl.playbackRate = rate; } catch {}
    }
  },

  getPlaybackRate(): number {
    return currentPlaybackRate;
  },

  stop: stopAllAudio,
  stopTutor: stopTutorAudio,

  /**
   * 课程旁白主线通道:返回播放句柄,等"真正起声"与"播完"。
   * 新开主线步会停掉旧步,但不会被答疑插话销毁。
   */
  speakTrack(text: string, voice = 'warm', speed = 1): SpeakHandle {
    return playTrackOnChannel('lecture', text, voice, speed);
  },

  /**
   * 导师答疑独立通道:不影响主线暂停中的讲座音频与字幕时钟,答疑播完平滑释放。
   */
  speakTutorTrack(text: string, voice = 'warm', speed = 1): SpeakHandle {
    return playTrackOnChannel('tutor', text, voice, speed);
  },

  /** 暂停全部音频(课程暂停):不销毁元素,恢复时从断点继续。 */
  pauseAudio(): void {
    lectureAudioEl?.pause();
    tutorAudioEl?.pause();
    notifyTts(false);
  },

  /** 插话时只恢复导师音频，主线仍由课程时钟控制。 */
  resumeTutor(): void {
    if (tutorAudioEl && tutorAudioEl.paused && !tutorAudioEl.ended) {
      void tutorAudioEl.play().then(() => notifyTts(true)).catch(() => {});
    }
  },

  /** 恢复音频:优先恢复正在作答的导师通道;否则恢复主线旁白。 */
  resumeAudio(): void {
    if (tutorAudioEl && tutorAudioEl.paused && !tutorAudioEl.ended) {
      void tutorAudioEl.play().catch(() => {});
      notifyTts(true);
    } else if (lectureAudioEl && lectureAudioEl.paused && !lectureAudioEl.ended) {
      void lectureAudioEl.play().catch(() => {});
      notifyTts(true);
    }
  },

  async speak(text: string, voice = 'warm', speed = 1): Promise<void> {
    const handle = this.speakTrack(text, voice, speed);
    const how = await handle.started;
    if (how === 'error') toast(L('Read-aloud is unavailable right now', '朗读服务暂时不可用'));
  },
};

/* ---------------- 语音输入(Web Speech API,浏览器原生识别) ---------------- */

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechCtor = new () => SpeechRecognitionLike;

function speechCtor(): SpeechCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return speechCtor() !== null;
}

/**
 * 一次性语音识别:识别到文本回调 onText,结束时回调 onDone。
 * 返回 false = 浏览器不支持(已 toast 说明),调用方无需再处理。
 */
export function listenOnce(onText: (text: string) => void, onDone?: () => void): boolean {
  const Ctor = speechCtor();
  if (!Ctor) {
    toast(L('Voice input is not supported in this browser', '当前浏览器不支持语音输入'));
    return false;
  }
  try {
    const rec = new Ctor();
    rec.lang = getCurrentLng();
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const said = Array.from({ length: event.results.length }, (_, i) => event.results[i][0]?.transcript ?? '')
        .join('')
        .trim();
      if (said) onText(said);
    };
    rec.onerror = () => toast(L('Voice input failed — please try again', '语音输入失败，请重试'));
    rec.onend = () => onDone?.();
    rec.start();
    return true;
  } catch {
    toast(L('Voice input is unavailable', '语音输入不可用'));
    return false;
  }
}
