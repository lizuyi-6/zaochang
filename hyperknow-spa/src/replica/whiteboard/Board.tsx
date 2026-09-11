import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkle, ZoomIn, X } from 'lucide-react';
import {
  INK,
  type BoardAnnot,
  type BoardItem,
  type BoardTable,
  type Rich,
  type Seg,
} from './lessonScript';
import { diagramBox, renderDiagram } from './diagram';
import { BoardCircle, BoardPencil, BoardUnderline } from '../illustrations';
import {
  clampZoom,
  zoomAtPoint,
  focusBox,
  computeBoundingBox,
  type CameraState,
  type Point2D,
} from './camera';

/** Flatten rich lines into styled chars for progressive reveal. */
interface FlatChar {
  ch: string;
  seg: Seg;
  lineIdx: number;
  xInLine: number;
}
interface Flat {
  chars: FlatChar[];
  lines: { chars: FlatChar[]; width: number }[];
  total: number;
}

const CHAR_W = 0.44; // Caveat avg advance, em
const MONO_LH = 25; // monospace code line pitch, px

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
  step: number;
  progress: Record<string, number>;
  writingId: string | null;
  panX: number;
  zoom: number;
  onZoomChange?: (newZoom: number) => void;
  standardFont: boolean;
  dots: boolean;
  tableRows: number;
  annotsDone: Set<string>;
  annotActive: string | null;
  items: BoardItem[];
  table: BoardTable | null;
  annots: BoardAnnot[];
  isFollowing?: boolean;
  onUserInteraction?: () => void;
}

export const Board: React.FC<BoardProps> = ({
  step,
  progress,
  writingId,
  panX,
  zoom,
  onZoomChange,
  standardFont,
  dots,
  tableRows,
  annotsDone,
  annotActive,
  items,
  table,
  annots,
  isFollowing = true,
  onUserInteraction,
}) => {
  const [lightboxImage, setLightboxImage] = useState<{ url: string; caption?: string } | null>(null);

  // 2D Camera state: { x, y, zoom }
  const [camera, setCamera] = useState<CameraState>({ x: -panX, y: 0, zoom });
  const viewportRef = useRef<HTMLDivElement>(null);

  // Keep camera zoom in sync with prop if not interacting
  useEffect(() => {
    setCamera((prev) => {
      if (Math.abs(prev.zoom - zoom) > 0.001) {
        return { ...prev, zoom };
      }
      return prev;
    });
  }, [zoom]);

  // Sync panX if prop changes externally (e.g. page flip button)
  useEffect(() => {
    if (isFollowing) {
      setCamera((prev) => ({ ...prev, x: -panX }));
    }
  }, [panX, isFollowing]);

  const flats = useMemo(() => {
    const m = new Map<string, Flat>();
    for (const it of items) m.set(it.id, flatten(it));
    return m;
  }, [items]);

  const diagrams = useMemo(() => {
    const m = new Map<string, { svg: string; w: number; h: number } | null>();
    for (const it of items) {
      if (it.diagram && !m.has(it.id)) {
        const r = renderDiagram(it.diagram);
        m.set(it.id, r ? { svg: r.svg, ...diagramBox(r) } : null);
      }
    }
    return m;
  }, [items]);

  // Auto-focus boundary on writingId or step changes if user is following
  const focusTarget = useCallback((targetWritingId: string | null, targetStep: number) => {
    if (!isFollowing || !viewportRef.current) return;
    const vp = viewportRef.current;
    const vpRect = vp.getBoundingClientRect();
    if (vpRect.width <= 0 || vpRect.height <= 0) return;

    // Determine target elements
    let targetElements: Array<{ x: number; y: number; width?: number; height?: number }> = [];

    if (targetWritingId) {
      const item = items.find((it) => it.id === targetWritingId);
      if (item) {
        const d = item.diagram ? diagrams.get(item.id) : null;
        targetElements = [{
          x: item.x,
          y: item.y,
          width: d ? d.w : (item.w ?? 340),
          height: d ? d.h : item.image ? (item.w ?? 340) + 64 : (item.lines.length * (item.mono ? MONO_LH : item.size * 1.24)),
        }];
      }
    }

    if (targetElements.length === 0) {
      const stepItems = items.filter((it) => it.step === targetStep);
      targetElements = stepItems.map((it) => {
        const d = it.diagram ? diagrams.get(it.id) : null;
        return {
          x: it.x,
          y: it.y,
          width: d ? d.w : (it.w ?? 340),
          height: d ? d.h : (it.lines.length * (it.mono ? MONO_LH : it.size * 1.24)),
        };
      });
    }

    const box = computeBoundingBox(targetElements);
    if (!box) return;

    setCamera((prev) => {
      const padding = 24;
      const visible = box.minX * prev.zoom + prev.x >= padding
        && box.minY * prev.zoom + prev.y >= padding
        && box.maxX * prev.zoom + prev.x <= vpRect.width - padding
        && box.maxY * prev.zoom + prev.y <= vpRect.height - padding;
      return visible ? prev : focusBox(box, vpRect, prev.zoom, padding);
    });
  }, [isFollowing, items, diagrams]);

  // Auto-focus on writingId or step change
  useEffect(() => {
    focusTarget(writingId, step);
  }, [writingId, step, focusTarget]);

  // Handle window resize and font/image loaded
  useEffect(() => {
    const handleResize = () => {
      if (isFollowing) {
        focusTarget(writingId, step);
      }
    };
    const observer = new ResizeObserver(handleResize);
    if (viewportRef.current) observer.observe(viewportRef.current);
    let active = true;
    void document.fonts.ready.then(() => { if (active) handleResize(); });
    return () => { active = false; observer.disconnect(); };
  }, [isFollowing, writingId, step, focusTarget]);

  // Pointer dragging and pinch-to-zoom gestures
  const gestureRef = useRef<{
    pointers: Map<number, Point2D>;
    startPointers: Map<number, Point2D>;
    startCam: CameraState;
    initialDistance: number;
    initialCenter: Point2D;
    isDragging: boolean;
  }>({
    pointers: new Map(),
    startPointers: new Map(),
    startCam: { x: 0, y: 0, zoom: 1 },
    initialDistance: 0,
    initialCenter: { x: 0, y: 0 },
    isDragging: false,
  });

  const onPointerDown = (e: React.PointerEvent) => {
    // Only handle primary pointer or multi-touch on the canvas
    if (e.target instanceof HTMLElement && e.target.closest('.wb-lightbox-backdrop, .wb-image-card, button, a')) {
      return;
    }

    const g = gestureRef.current;
    const pt = { x: e.clientX, y: e.clientY };
    g.pointers.set(e.pointerId, pt);
    g.startPointers.set(e.pointerId, pt);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    if (g.pointers.size === 1) {
      g.startCam = { ...camera };
      g.isDragging = true;
    } else if (g.pointers.size === 2) {
      const [p1, p2] = Array.from(g.pointers.values());
      g.initialDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      g.initialCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      g.startCam = { ...camera };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g.pointers.has(e.pointerId)) return;
    const currentPt = { x: e.clientX, y: e.clientY };
    g.pointers.set(e.pointerId, currentPt);

    // User is manually manipulating camera -> stop following tutor
    if (onUserInteraction && isFollowing) {
      onUserInteraction();
    }

    if (g.pointers.size === 1 && g.isDragging) {
      const startP = g.startPointers.get(e.pointerId) || currentPt;
      const dx = currentPt.x - startP.x;
      const dy = currentPt.y - startP.y;

      setCamera({
        ...g.startCam,
        x: g.startCam.x + dx,
        y: g.startCam.y + dy,
      });
    } else if (g.pointers.size === 2) {
      const [p1, p2] = Array.from(g.pointers.values());
      const currentDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (g.initialDistance > 0) {
        const scaleFactor = currentDist / g.initialDistance;
        const targetZoom = clampZoom(g.startCam.zoom * scaleFactor);
        const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

        if (viewportRef.current) {
          const rect = viewportRef.current.getBoundingClientRect();
          const focal: Point2D = { x: center.x - rect.left, y: center.y - rect.top };
          const newCam = zoomAtPoint(g.startCam, focal, targetZoom);
          setCamera(newCam);
          onZoomChange?.(newCam.zoom);
        }
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    g.pointers.delete(e.pointerId);
    g.startPointers.delete(e.pointerId);
    try {
      if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    if (g.pointers.size === 1) {
      // Transitioned from 2 fingers to 1 finger: reset 1-finger start anchor so it doesn't jump
      const remainingId = Array.from(g.pointers.keys())[0];
      const remainingPt = g.pointers.get(remainingId)!;
      g.startPointers.set(remainingId, remainingPt);
      g.startCam = { ...camera };
      g.isDragging = true;
    } else if (g.pointers.size === 0) {
      g.isDragging = false;
    }
  };

  // Wheel zoom and pan
  const onWheel = (e: React.WheelEvent) => {
    // If scrolling over an internal panel or modal, do not intercept
    if (e.target instanceof HTMLElement && e.target.closest('.wb-panel, .wb-lightbox-backdrop')) {
      return;
    }
    e.preventDefault();

    if (onUserInteraction && isFollowing) {
      onUserInteraction();
    }

    if (!viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const focal: Point2D = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (e.ctrlKey || e.metaKey) {
      // Pinch / Ctrl + wheel zoom
      const zoomDelta = -e.deltaY * 0.005;
      const targetZoom = clampZoom(camera.zoom * (1 + zoomDelta));
      const nextCam = zoomAtPoint(camera, focal, targetZoom);
      setCamera(nextCam);
      onZoomChange?.(nextCam.zoom);
    } else {
      // Pan
      setCamera((prev) => ({
        ...prev,
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  const pencilPos = useMemo(() => {
    if (!writingId) return null;
    const item = items.find((i) => i.id === writingId);
    const flat = flats.get(writingId);
    if (!item || !flat) return null;
    if (item.diagram && diagrams.get(item.id)) return null;
    if (item.mono) return null; // code rendered naturally without handwriting pencil
    const shown = progress[writingId] ?? 0;
    const c = flat.chars[Math.max(0, shown - 1)];
    const lh = item.mono ? MONO_LH : item.size * 1.24;
    if (!c) return { x: item.x, y: item.y };
    return { x: item.x + c.xInLine + 6, y: item.y + c.lineIdx * lh + item.size * 0.55 };
  }, [writingId, progress, flats, items, diagrams]);

  return (
    <div
      className="wb-viewport"
      ref={viewportRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <div
        className="wb-world"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <div className={`wb-dots${dots ? '' : ' off'}`} style={{ width: 3600, height: 2400 }} />
        <div className={`wb-board${standardFont ? ' wb-standard' : ''}`}>
          {items.map((item) => {
            if (item.step > step) return null;
            const flat = flats.get(item.id)!;
            const writeTotal = itemCharCount(item);
            const isWriting = item.step === step && (progress[item.id] ?? 0) < writeTotal;
            const shown = item.step < step ? flat.total : progress[item.id] ?? 0;
            const lh = item.mono ? MONO_LH : item.size * 1.24;

            const diagram = item.diagram ? diagrams.get(item.id) : undefined;
            if (diagram) {
              return (
                <div
                  key={item.id}
                  className={`wb-item wb-diagram${isWriting ? ' writing' : ' drawn'}`}
                  style={{ left: item.x, top: item.y, width: diagram.w, height: diagram.h }}
                  dangerouslySetInnerHTML={{ __html: diagram.svg }}
                />
              );
            }

            if (item.image) {
              const status = item.image.status ?? (item.image.url ? 'ready' : 'pending');

              if (status === 'failed') {
                return (
                  <div
                    key={item.id}
                    className={`wb-item wb-image-degraded${isWriting ? ' writing' : ' drawn'}`}
                    style={{
                      left: item.x,
                      top: item.y,
                      width: item.image.width ?? 340,
                    }}
                  >
                    <div className="wb-image-degraded-tag">
                      {item.image.caption ? `[${item.image.caption}]` : '[Visual Note]'}
                    </div>
                    <div className="wb-image-degraded-text">
                      {item.image.prompt || 'Visual concept illustration'}
                    </div>
                  </div>
                );
              }

              if (status === 'pending' || !item.image.url) {
                return (
                  <div
                    key={item.id}
                    className={`wb-item wb-image-card pending${isWriting ? ' writing' : ' drawn'}`}
                    style={{
                      left: item.x,
                      top: item.y,
                      width: item.image.width ?? 340,
                    }}
                  >
                    <div className="wb-image-wrap fixed-ratio">
                      <div className="wb-image-skeleton">
                        <Sparkle className="wb-image-spin" size={20} />
                        <span>Generating visual...</span>
                      </div>
                      {item.image.caption && (
                        <div className="wb-image-caption">{item.image.caption}</div>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={item.id}
                  className={`wb-item wb-image-card ready${isWriting ? ' writing' : ' drawn'}`}
                  style={{
                    left: item.x,
                    top: item.y,
                    width: item.image.width ?? 340,
                  }}
                  onClick={() => setLightboxImage({ url: item.image!.url!, caption: item.image!.caption })}
                  title="Click to zoom"
                >
                  <div className="wb-image-wrap fixed-ratio">
                    <img
                      src={item.image.url}
                      alt={item.image.caption ?? 'Lesson visual'}
                      className="wb-image-el"
                      loading="lazy"
                    />
                    <div className="wb-image-zoom-hint">
                      <ZoomIn size={14} />
                    </div>
                    {item.image.caption && (
                      <div className="wb-image-caption">{item.image.caption}</div>
                    )}
                  </div>
                </div>
              );
            }

            // Long code blocks or mono blocks: render clean monospace without artificial handwriting delay
            if (item.mono) {
              const codeText = item.lines.map((l) => l.map((s) => s.t).join('')).join('\n');
              return (
                <div
                  key={item.id}
                  className="wb-item wb-code-block mono"
                  style={{
                    left: item.x,
                    top: item.y,
                    width: item.w ?? 440,
                    fontSize: 13.5,
                    lineHeight: `${MONO_LH}px`,
                  }}
                >
                  <pre className="wb-code-content">{codeText}</pre>
                </div>
              );
            }

            return (
              <div
                key={item.id}
                className="wb-item"
                style={{
                  left: item.x,
                  top: item.y,
                  width: item.w,
                  fontSize: standardFont ? Math.round(item.size * 0.8) : item.size,
                  lineHeight: `${lh}px`,
                  color: item.color ?? INK,
                  fontWeight: item.weight ?? 400,
                }}
              >
                {flat.lines.map((line, li) => {
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
          {table && step >= table.step && (
            <TableBlock table={table} rowsShown={step > table.step ? 4 : tableRows} standard={standardFont} />
          )}

          {/* annotations */}
          {annots.map((an) => {
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

      {lightboxImage && (
        <div className="wb-lightbox-backdrop" onClick={() => setLightboxImage(null)}>
          <div className="wb-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="wb-lightbox-close"
              onClick={() => setLightboxImage(null)}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <img src={lightboxImage.url} alt={lightboxImage.caption ?? 'Visual preview'} className="wb-lightbox-img" />
            {lightboxImage.caption && <div className="wb-lightbox-caption">{lightboxImage.caption}</div>}
          </div>
        </div>
      )}
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
    if (i >= shown && !isWriting) return;
    if (accSeg !== c.seg || accPending !== pending) {
      flush();
      accSeg = c.seg;
      accPending = pending;
    }
    acc += c.ch;
  });
  flush();
  return out;
}

const TableBlock: React.FC<{ table: BoardTable; rowsShown: number; standard: boolean }> = ({
  table,
  rowsShown,
  standard,
}) => {
  const totalW = table.colW.reduce((a, b) => a + b, 0);
  const totalH = table.rowH.reduce((a, b) => a + b, 0);
  const colX = useMemo(() => {
    const xs = [0];
    for (let i = 0; i < table.colW.length; i++) xs.push(xs[i] + table.colW[i]);
    return xs;
  }, [table.colW]);
  const rowY = useMemo(() => {
    const ys = [0];
    for (let i = 0; i < table.rowH.length; i++) ys.push(ys[i] + table.rowH[i]);
    return ys;
  }, [table.rowH]);

  const gridPaths = useMemo(() => {
    const p: string[] = [];
    for (let r = 1; r < table.rowH.length; r++) {
      const y = rowY[r];
      p.push(`M 0 ${y} Q ${totalW * 0.5} ${y + (r % 2 ? 1.5 : -1.2)} ${totalW} ${y}`);
    }
    for (let c = 1; c < table.colW.length; c++) {
      const x = colX[c];
      p.push(`M ${x} 0 Q ${x + (c % 2 ? 1.2 : -1.5)} ${totalH * 0.5} ${x} ${totalH}`);
    }
    return p.join(' ');
  }, [table, colX, rowY, totalW, totalH]);

  return (
    <div className="wb-table" style={{ left: table.x, top: table.y, width: totalW, height: totalH }}>
      <svg width={totalW} height={totalH} viewBox={`0 0 ${totalW} ${totalH}`}>
        <path d={gridPaths} stroke="#D4CFBF" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </svg>
      {table.cells.map((row, r) =>
        row.map((cell, c) => {
          const visible = r <= rowsShown;
          const text = standard && cell.sw ? `${cell.sw[0]}\n${cell.sw[1]}` : cell.t;
          return (
            <div
              key={`${r}-${c}`}
              className={`wb-cell${r === 0 ? ' head' : ''}${visible ? '' : ' wb-row-hidden'}`}
              style={{
                left: colX[c],
                top: rowY[r],
                width: table.colW[c],
                height: table.rowH[r],
                whiteSpace: standard && cell.sw ? 'pre-line' : undefined,
              }}
            >
              {cell.hl ? <span className="hlseg">{text}</span> : text}
            </div>
          );
        }),
      )}
    </div>
  );
};

const AnnotView: React.FC<{ an: BoardAnnot; animate: boolean }> = ({ an, animate }) => {
  if (an.kind === 'highlight') {
    return (
      <div
        className="wb-annot highlight"
        style={{
          left: an.x,
          top: an.y,
          width: an.w,
          height: an.h,
          animation: animate ? 'wb-highlight-wipe 0.55s ease-out forwards' : undefined,
        }}
      >
        <BoardUnderline w={an.w} />
      </div>
    );
  }
  if (an.kind === 'circle') {
    return (
      <div
        className="wb-annot circle"
        style={{
          left: an.x,
          top: an.y,
          width: an.w,
          height: an.h,
          transform: 'translate(-10px, -8px)',
        }}
      >
        <BoardCircle w={an.w + 20} h={an.h + 16} />
      </div>
    );
  }
  return null;
};

/** Helper for the player: total char count of an item. */
export function itemCharCount(item: BoardItem): number {
  if (item.diagram || item.image || item.mono) return 42;
  return item.lines.reduce((n, line) => n + line.reduce((m, s) => m + s.t.length, 0), 0);
}

export function richLen(r: Rich): number {
  return r.reduce((n, s) => n + s.t.length, 0);
}
