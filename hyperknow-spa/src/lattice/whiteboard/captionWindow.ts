/**
 * 字幕栏分句窗口:旁白逐字揭示时,字幕栏只保留当前窗口内的文本,旧句随窗口
 * 前进退出——一次至多两句(短句成对),长句独占一窗(用户原话:"一次最多不能
 * 超过两句话,或者语义最大的最连贯的一句话")。此前整段旁白累积在字幕栏里,
 * 长步六七行直接溢出屏幕下缘。
 *
 * 纯函数,不碰 DOM:CaptionBar 渲染与 tests/whiteboard-caption-window 回归共用。
 */

export interface CaptionWindow {
  /** 窗口在整段旁白中的起始字符下标(含) */
  start: number;
  /** 结束下标(不含);窗口两两相接,覆盖全文 */
  end: number;
}

/** 成对窗口的合并上限:两句合计超过此字符数就各自独占一窗(字幕栏约两行容量) */
export const PAIR_MAX_CHARS = 66;

/* 分号同为断句点:实测旁白用"；"串起三四个定义,一句占满三行——分号子句是
 * 独立的语义拍,短子句仍会被成对逻辑重新两两合并,窗口不碎 */
const CJK_TERMINATORS = new Set(['。', '！', '？', '…', '；']);
const LATIN_TERMINATORS = new Set(['.', '!', '?', ';']);
/** 句尾右引号/右括号:并入前一句,不作下一句开头 */
const CLOSERS = new Set(['"', '’', '”', '「', '」', '『', '』', '）', ')', '】', ']']);

const isCjk = (ch: string): boolean => {
  const code = ch.codePointAt(0) ?? 0;
  return (code >= 0x2e80 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0x20000 && code <= 0x2fa1f);
};

/** 句终判定:终结符本身 + 前后字符联合判定——小数点(3.5)不断、连用终结符(……/!!)
 * 合并到末字才断、右引号随前句 */
function isSentenceEnd(text: string, i: number): boolean {
  const ch = text[i];
  const next = i + 1 < text.length ? text[i + 1] : '';
  if (CJK_TERMINATORS.has(ch)) {
    if (CJK_TERMINATORS.has(next)) return false; // 连用终结符合并,末字才断
    return true;
  }
  if (!LATIN_TERMINATORS.has(ch)) return false;
  if (ch === '.') {
    const prev = i > 0 ? text[i - 1] : '';
    if (/[0-9]/.test(prev) && /[0-9]/.test(next)) return false; // 小数
    if (next === '.') return false; // ... 残片按整串省略处理
  }
  if (LATIN_TERMINATORS.has(next)) return false; // !!/?? 合并到末字
  return next === '' || /\s/.test(next) || isCjk(next) || CJK_TERMINATORS.has(next);
}

/** 把整段旁白切成句段(终结符留在句尾;句后空白与右引号并入前句,窗口天然相接) */
export function splitSentences(text: string): CaptionWindow[] {
  const out: CaptionWindow[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (!isSentenceEnd(text, i)) continue;
    let end = i + 1;
    while (end < text.length && (/\s/.test(text[end]) || CLOSERS.has(text[end]))) end++;
    out.push({ start, end });
    start = end;
    i = end - 1;
  }
  if (start < text.length) out.push({ start, end: text.length });
  return out;
}

/** 句段 → 显示窗口:短句成对(合计 ≤ PAIR_MAX_CHARS),长句独占。每窗至多两句。 */
export function buildWindows(text: string, pairMax = PAIR_MAX_CHARS): CaptionWindow[] {
  const sentences = splitSentences(text);
  if (!sentences.length) return [];
  const windows: CaptionWindow[] = [];
  let cur: CaptionWindow | null = null;
  let curSentences = 0;
  for (const s of sentences) {
    const len = s.end - s.start;
    if (len > pairMax) {
      if (cur) windows.push(cur);
      windows.push({ ...s });
      cur = null;
      curSentences = 0;
      continue;
    }
    if (cur && curSentences < 2 && s.end - cur.start <= pairMax) {
      cur = { start: cur.start, end: s.end };
      curSentences += 1;
      continue;
    }
    if (cur) windows.push(cur);
    cur = { ...s };
    curSentences = 1;
  }
  if (cur) windows.push(cur);
  return windows;
}

/** 揭示游标(已揭示字符数)落在哪个窗口:游标越过窗口右界即滑入下一窗 */
export function windowForOffset(windows: CaptionWindow[], offset: number): CaptionWindow {
  if (!windows.length) return { start: 0, end: 0 };
  for (const w of windows) {
    if (offset < w.end) return w;
  }
  return windows[windows.length - 1];
}
