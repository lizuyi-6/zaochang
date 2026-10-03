import React, { useMemo } from 'react';
import type { Rich, Seg } from './lessonScript';
import { buildWindows, windowForOffset } from './captionWindow';

interface FlatC {
  ch: string;
  seg: Seg;
}

/**
 * Serif caption bar (EB Garamond), word-by-word reveal with a blinking caret
 * and a dimmed ghost lookahead of the next few characters.
 *
 * 分句窗口(captionWindow.ts):只渲染当前窗口内的 1-2 句,旧句随揭示游标前进
 * 退出——字幕栏高度恒有界,长旁白不再溢出屏幕。
 */
export const CaptionBar: React.FC<{
  caption: Rich | null;
  /** characters revealed */
  shown: number;
  typing: boolean;
  /** center x of the caption (optional for legacy calls) */
  centerX?: number;
  /** raised above the quick-check block */
  raised?: boolean;
}> = ({ caption, shown, typing, raised }) => {
  const flat = useMemo<FlatC[]>(() => {
    if (!caption) return [];
    const out: FlatC[] = [];
    for (const seg of caption) for (const ch of seg.t) out.push({ ch, seg });
    return out;
  }, [caption]);

  const windows = useMemo(() => buildWindows(flat.map((c) => c.ch).join('')), [flat]);

  if (!caption || flat.length === 0) return null;

  const GHOST = 10;
  /* 游标 = 下一个待揭示字符;窗口完成(shown 越界)即滑入下一窗,末窗驻留 */
  const win = windowForOffset(windows, Math.min(shown, flat.length - 1));
  const out: React.ReactNode[] = [];
  let acc = '';
  let accSeg: Seg | null = null;
  let accCls = '';
  let key = 0;
  const flush = () => {
    if (!acc) return;
    out.push(
      <span key={key++} className={accCls} style={accSeg?.i ? { fontStyle: 'italic' } : undefined}>
        {acc}
      </span>,
    );
    acc = '';
  };
  flat.forEach((c, i) => {
    if (i < win.start || i >= win.end) return; // 窗口外:旧句已退场,新句未轮到
    const cls = i < shown ? (c.seg.i ? 'i' : '') : i < shown + GHOST ? 'ghost' : 'gone';
    if (cls === 'gone') return; // beyond ghost window: not rendered yet
    const key2 = cls + (c.seg.i ? 'i' : '');
    if (accCls !== key2) {
      flush();
      accCls = key2;
      accSeg = c.seg;
    }
    acc += c.ch;
  });
  flush();

  return (
    <div className={`wb-caption${raised ? ' raised' : ''}`} role="status">
      {out}
      {typing && <span className="caret" />}
    </div>
  );
};
