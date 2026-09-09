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

let audioEl: HTMLAudioElement | null = null;
const ttsListeners = new Set<(on: boolean) => void>();
const notifyTts = (on: boolean) => ttsListeners.forEach((l) => l(on));

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
let currentTrack: Track | null = null;

function stopAudio(): void {
  const el = audioEl;
  const track = currentTrack;
  audioEl = null;
  currentTrack = null;
  if (el) {
    el.pause();
    el.onended = null;
    el.onerror = null;
    notifyTts(false);
  }
  // 主动停止也要解冻等待方(课程步进在等 ended)。
  if (track) {
    track.settleStarted('stopped');
    track.settleEnded();
  }
}

export const tts = {
  speaking: (): boolean => !!audioEl && !audioEl.paused,
  /** 订阅播放状态(按钮的高亮/停止态用)。返回退订函数。 */
  subscribe(cb: (on: boolean) => void): () => void {
    ttsListeners.add(cb);
    return () => {
      ttsListeners.delete(cb);
    };
  },
  stop: stopAudio,
  /**
   * 课程旁白:返回播放句柄,调用方(白板步进)用它等"真正起声"与"播完"——
   * 音频是节奏的时钟,字幕与下一步都以它对齐,避免冷合成延迟造成的声画错位与截断。
   * 同一时刻只有一条旁白(新开一条会停掉旧的)。
   */
  speakTrack(text: string, voice = 'warm', speed = 1): SpeakHandle {
    const body = text.trim();
    if (!body) return { started: Promise.resolve('stopped'), ended: Promise.resolve(), getProgress: () => null };
    stopAudio();
    const url = `/api/hyperknow/tts/stream?text=${encodeURIComponent(body.slice(0, 1500))}&voice=${encodeURIComponent(voice)}&speed=${speed}`;
    const el = new Audio(url);
    audioEl = el;
    let resolveStarted!: (v: SpeakStart) => void;
    let resolveEnded!: () => void;
    const started = new Promise<SpeakStart>((res) => { resolveStarted = res; });
    const ended = new Promise<void>((res) => { resolveEnded = res; });
    const track: Track = {
      // promise 重复 settle 是无操作,不需要额外标志位。
      settleStarted: (v) => resolveStarted(v),
      settleEnded: () => resolveEnded(),
    };
    currentTrack = track;
    const detach = () => {
      if (audioEl === el) {
        audioEl = null;
        notifyTts(false);
      }
      if (currentTrack === track) currentTrack = null;
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
        notifyTts(true);
        track.settleStarted('started');
      },
      () => {
        detach();
        track.settleStarted('error');
        track.settleEnded();
      },
    );
    const getProgress = (): AudioProgress | null => {
      if (!el || isNaN(el.duration) || el.duration <= 0) return null;
      const cur = el.currentTime;
      const dur = el.duration;
      const ratio = Math.max(0, Math.min(1, cur / dur));
      return { currentTime: cur, duration: dur, ratio };
    };
    return { started, ended, getProgress };
  },
  /** 暂停当前旁白(课程暂停):不销毁元素,恢复时从断点继续。 */
  pauseAudio(): void {
    audioEl?.pause();
  },
  resumeAudio(): void {
    const el = audioEl;
    if (el && el.paused && !el.ended) void el.play().catch(() => {});
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
