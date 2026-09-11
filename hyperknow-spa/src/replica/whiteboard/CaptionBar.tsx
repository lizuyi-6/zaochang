import React, { useMemo } from 'react';
import type { Rich, Seg } from './lessonScript';

interface FlatC {
  ch: string;
  seg: Seg;
}

/**
 * Serif caption bar (EB Garamond), word-by-word reveal with a blinking caret
 * and a dimmed ghost lookahead of the next few characters.
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

  if (!caption || flat.length === 0) return null;

  const GHOST = 10;
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
