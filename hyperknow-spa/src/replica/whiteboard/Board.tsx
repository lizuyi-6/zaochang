import React, { useMemo } from 'react';
import {
  BOARD_ANNOTS,
  INK,
  getBoardItems,
  getBoardTable,
  type BoardAnnot,
  type BoardItem,
  type Rich,
  type Seg,
} from './lessonScript';
import { BoardCircle, BoardPencil, BoardUnderline } from '../illustrations';

/** Flatten rich lines into styled chars for progressive reveal. */
interface FlatChar {
  ch: string;
  seg: Seg;
  lineIdx: number;
  /** cumulative x offset within its line, approximated */
  xInLine: number;
}
interface Flat {
  chars: FlatChar[];
  lines: { chars: FlatChar[]; width: number }[];
  total: number;
}

const CHAR_W = 0.44; // Caveat avg advance, em
const MONO_LH = 25; // mermaid line pitch, px

function flatten(item: BoardItem): Flat {
  const lines: Flat['lines'] = [];
  const chars: FlatChar[] = [];
  item.lines.forEach((line, lineIdx) => {
    const lineChars: FlatChar[] = [];
    let x = 0;
    for (const seg of line) {
      for (const ch of seg.t) {
        const c: FlatChar = { ch, seg, lineIdx, xInLine: x };
        lineChars.push(c);
        chars.push(c);
        x += charW(ch, item.size, seg);
      }
    }
    lines.push({ chars: lineChars, width: x });
  });
  return { chars, lines, total: chars.length };
}

function charW(ch: string, size: number, seg: Seg): number {
  let w = size * CHAR_W;
  if (ch === ' ') w = size * 0.26;
  else if ('ilj.,:;\'"!()'.includes(ch)) w = size * 0.24;
  else if ('mwMW'.includes(ch)) w = size * 0.62;
  else if (ch >= 'A' && ch <= 'Z') w = size * 0.5;
  if (seg.b) w *= 1.06;
  return w;
}

const segStyle = (seg: Seg, item: BoardItem): React.CSSProperties => ({
  fontWeight: seg.b || item.weight === 700 ? 700 : item.weight ?? 400,
  fontStyle: seg.i ? 'italic' : undefined,
  color: seg.red ? '#C0392B' : seg.violet ? undefined : item.color,
});

function segClass(seg: Seg): string {
  return `${seg.hl ? 'hlseg' : ''} ${seg.red ? 'red' : ''}`.trim();
}

export interface BoardProps {
  /** current step being played (items with step <= current are visible) */
  step: number;
  /** char reveal progress for items of the current step: itemId -> chars shown */
  progress: Record<string, number>;
  /** item currently receiving pencil */
  writingId: string | null;
  panX: number;
  zoom: number;
  standardFont: boolean;
  dots: boolean;
  /** table rows revealed (0..4) — row 0 = header */
  tableRows: number;
  /** annotations revealed: id set */
  annotsDone: Set<string>;
  /** annotation currently animating */
  annotActive: string | null;
}

export const Board: React.FC<BoardProps> = ({
  step,
  progress,
  writingId,
  panX,
  zoom,
  standardFont,
  dots,
  tableRows,
  annotsDone,
  annotActive,
}) => {
  const BOARD_ITEMS = getBoardItems();
  const BOARD_TABLE = getBoardTable();
  const flats = useMemo(() => {
    const m = new Map<string, Flat>();
    for (const it of BOARD_ITEMS) m.set(it.id, flatten(it));
    return m;
  }, []);

  const pencilPos = useMemo(() => {
    if (!writingId) return null;
    const item = BOARD_ITEMS.find((i) => i.id === writingId);
    const flat = flats.get(writingId);
    if (!item || !flat) return null;
    const shown = progress[writingId] ?? 0;
    const c = flat.chars[Math.max(0, shown - 1)];
    const lh = item.mono ? MONO_LH : item.size * 1.24;
    if (!c) return { x: item.x, y: item.y };
    return { x: item.x + c.xInLine + 6, y: item.y + c.lineIdx * lh + item.size * 0.55 };
  }, [writingId, progress, flats]);

  return (
    <div
      className="wb-world"
      style={{ transform: `scale(${zoom}) translateX(${-panX}px)` }}
    >
      <div className={`wb-dots${dots ? '' : ' off'}`} style={{ width: 2200, height: 1300 }} />
      <div className={`wb-board${standardFont ? ' wb-standard' : ''}`}>
        {BOARD_ITEMS.map((item) => {
          if (item.step > step) return null;
          const flat = flats.get(item.id)!;
          const isWriting = item.step === step && (progress[item.id] ?? 0) < flat.total;
          const shown = item.step < step ? flat.total : progress[item.id] ?? 0;
          const lh = item.mono ? MONO_LH : item.size * 1.24;
          return (
            <div
              key={item.id}
              className={`wb-item${item.mono ? ' mono' : ''}`}
              style={{
                left: item.x,
                // item.y is the div top; stored values are pre-compensated so
                // rendered glyph tops land on the reference measurements
                // (Caveat's tall ascent pushes caps ~6px below the div top)
                top: item.y,
                width: item.w,
                fontSize: standardFont && !item.mono ? Math.round(item.size * 0.8) : item.size,
                lineHeight: `${lh}px`,
                color: item.color ?? INK,
                fontWeight: item.weight ?? 400,
              }}
            >
              {flat.lines.map((line, li) => {
              // chars before this line = cumulative length of previous lines
              let before = 0;
              for (let k = 0; k < li; k++) before += flat.lines[k].chars.length;
              const shownHere = Math.max(0, Math.min(line.chars.length, shown - before));
              return (
                <span className="wb-line" key={li}>
                  {renderLine(line.chars, shownHere, isWriting, item)}
                </span>
              );
            })}
            </div>
          );
        })}

        {/* table */}
        {step >= BOARD_TABLE.step && (
          <TableBlock rowsShown={step > BOARD_TABLE.step ? 4 : tableRows} standard={standardFont} />
        )}

        {/* annotations */}
        {BOARD_ANNOTS.map((an) => {
          if (an.step > step) return null;
          const done = an.step < step || annotsDone.has(an.id);
          const active = annotActive === an.id;
          if (!done && !active) return null;
          return <AnnotView key={an.id} an={an} animate={active} />;
        })}

        {pencilPos && (
          <div className="wb-pencil" style={{ left: pencilPos.x, top: pencilPos.y }}>
            <BoardPencil size={20} />
          </div>
        )}
      </div>
    </div>
  );
};

/** Render one line, revealing the first `shown` chars; chars beyond (while writing) render faint. */
function renderLine(lineChars: FlatChar[], shown: number, isWriting: boolean, item: BoardItem): React.ReactNode {
  const out: React.ReactNode[] = [];
  let acc = '';
  let accSeg: Seg | null = null;
  let accPending = false;
  let key = 0;
  const flush = () => {
    if (!acc || !accSeg) return;
    out.push(
      <span
        key={key++}
        className={segClass(accSeg)}
        style={{ ...segStyle(accSeg, item), ...(accPending ? { color: '#D9D5CC' } : undefined) }}
      >
        {acc}
      </span>,
    );
    acc = '';
  };
  lineChars.forEach((c, i) => {
    const pending = isWriting && i >= shown;
    if (accSeg !== c.seg || pending !== accPending) {
      flush();
      accSeg = c.seg;
      accPending = pending;
    }
    acc += c.ch;
  });
  flush();
  return <>{out}</>;
}

const TableBlock: React.FC<{ rowsShown: number; standard: boolean }> = ({ rowsShown, standard }) => {
  const { x, y, colW, rowH, cells } = getBoardTable();
  const W = colW.reduce((a, b) => a + b, 0);
  const H = rowH.reduce((a, b) => a + b, 0);
  // wavy grid path
  const xs = [0, colW[0], colW[0] + colW[1], W];
  const ys = [0, rowH[0], rowH[0] + rowH[1], rowH[0] + rowH[1] + rowH[2], H];
  const wob = (v: number, i: number) => v + (i % 2 ? 1.4 : -1.2);
  const vLines = xs.map((lx, i) => `M ${wob(lx, i)} 2 L ${wob(lx, i + 1)} ${H - 2}`).join(' ');
  const hLines = ys.map((ly, i) => `M 2 ${wob(ly, i)} L ${W - 2} ${wob(ly, i + 1)}`).join(' ');
  return (
    <div className={`wb-table${standard ? ' wb-standard' : ''}`} style={{ left: x, top: y, width: W, height: H }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <path d={vLines + ' ' + hLines} stroke="#B9B9B9" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </svg>
      {cells.map((row, ri) => {
        let cy = 0;
        for (let i = 0; i < ri; i++) cy += rowH[i];
        return row.map((cell, ci) => {
          let cx = 0;
          for (let i = 0; i < ci; i++) cx += colW[i];
          return (
            <div
              key={`${ri}-${ci}`}
              className={`wb-cell${ri === 0 ? ' head' : ''}${ri >= rowsShown ? ' wb-row-hidden' : ''}`}
              style={{ left: cx, top: cy, width: colW[ci], height: rowH[ri] }}
            >
              {cell.hl ? (
                <span className="hlseg">{cell.t}</span>
              ) : standard && cell.sw ? (
                <>
                  {cell.sw[0]}
                  <br />
                  {cell.sw[1]}
                </>
              ) : (
                cell.t
              )}
            </div>
          );
        });
      })}
    </div>
  );
};

const AnnotView: React.FC<{ an: BoardAnnot; animate: boolean }> = ({ an, animate }) => (
  <div className="wb-annot" style={{ left: an.x, top: an.y }}>
    {an.kind === 'circle' && <BoardCircle w={an.w} h={an.h} animate={animate} />}
    {an.kind === 'underline' && <BoardUnderline w={an.w} animate={animate} />}
  </div>
);

/** Helper for the player: total char count of an item. */
export function itemCharCount(item: BoardItem): number {
  return item.lines.reduce((n, line) => n + line.reduce((m, s) => m + s.t.length, 0), 0);
}

/** caption rich text → plain length */
export function richLen(r: Rich): number {
  return r.reduce((n, s) => n + s.t.length, 0);
}
