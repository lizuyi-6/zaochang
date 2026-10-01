import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkle, ZoomIn, X } from 'lucide-react';
import {
  INK,
  VIOLET,
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
  type ViewportInsets,
} from './camera';

/**
 * 见界白板核心手绘插图组件：当远端 AI 生图接口繁忙或不可用时，
 * 智能根据 prompt 语义与教学上下文，动态呈现大学级手绘矢量概念插画 (SVG Concept Sketch)，
 * 完美融入板书手绘美学，杜绝白板出现光秃秃的冷字块。
 */
export const WhiteboardConceptSketch: React.FC<{
  prompt: string;
  caption?: string;
  width?: number;
}> = ({ prompt, caption, width = 320 }) => {
  const p = (prompt + ' ' + (caption || '')).toLowerCase();
  let theme: 'frontend' | 'psychology' | 'ai' | 'general' = 'general';
  if (/(vue|react|component|frontend|ui|code|前端|组件|工程|代码|虚拟dom|响应式|javascript|typescript)/i.test(p)) {
    theme = 'frontend';
  } else if (/(psych|mind|brain|mental|emotion|stress|认知|心理|情绪|压力|神经|动机|感知|行为)/i.test(p)) {
    theme = 'psychology';
  } else if (/(ai|model|data|machine|learning|algorithm|算法|数据|模型|深度学习|网络|统计)/i.test(p)) {
    theme = 'ai';
  }

  const h = 180;

  return (
    <div
      style={{
        width: width || '100%',
        maxWidth: '100%',
        background: '#FAF8F5',
        border: '1.8px solid #164E46',
        borderRadius: 12,
        padding: '12px 14px 10px',
        boxShadow: '0 3px 12px rgba(22, 78, 70, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#D9A441', display: 'inline-block' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#164E46' }}>
            {caption || '[概念图解]'}
          </span>
        </div>
        <span style={{ fontSize: 10, color: '#82908B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Concept Schema
        </span>
      </div>

      <div style={{ width: '100%', height: h, background: '#F4F1EA', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg viewBox="0 0 280 160" width="100%" height="100%" fill="none">
          {/* 背景微网格 */}
          <path d="M20 0 V160 M60 0 V160 M100 0 V160 M140 0 V160 M180 0 V160 M220 0 V160 M260 0 V160" stroke="#164E46" strokeOpacity=".05" strokeWidth="1" />
          <path d="M0 40 H280 M0 80 H280 M0 120 H280" stroke="#164E46" strokeOpacity=".05" strokeWidth="1" />

          {theme === 'frontend' && (
            <g stroke="#164E46" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {/* 现代前端组件树与响应式双向绑定机制 */}
              <rect x="25" y="20" width="230" height="120" rx="8" fill="#F7F4EC" strokeWidth="2" />
              <path d="M25 44 H255" strokeWidth="1.5" />
              <circle cx="38" cy="32" r="3" fill="#D9A441" />
              <circle cx="48" cy="32" r="3" fill="#A9BCA5" />
              <circle cx="58" cy="32" r="3" fill="#164E46" />
              <text x="75" y="35" fontSize="9" fill="#164E46" fontFamily="sans-serif" fontWeight="600">App.vue [Component Hierarchy]</text>
              {/* 父子组件嵌套 + 插槽记号 */}
              <rect x="40" y="56" width="90" height="34" rx="5" fill="#E8EBDD" />
              <text x="50" y="76" fontSize="10" fill="#164E46" fontFamily="sans-serif">State / Ref</text>
              <path d="M44 61 h20 M44 65 h12" stroke="#164E46" strokeOpacity=".25" strokeWidth="1.2" strokeLinecap="round" />
              <rect x="150" y="56" width="90" height="34" rx="5" fill="#EDF0DF" />
              <text x="160" y="76" fontSize="10" fill="#164E46" fontFamily="sans-serif">Virtual DOM</text>
              <path d="M154 61 h16 M154 65 h10" stroke="#164E46" strokeOpacity=".25" strokeWidth="1.2" strokeLinecap="round" />
              {/* 响应式数据流动箭头(双向) */}
              <path d="M130 68 L150 68" stroke="#D9A441" strokeWidth="2.4" />
              <path d="M144 64 L150 68 L144 72" fill="#D9A441" />
              <path d="M150 82 L130 82" stroke="#164E46" strokeWidth="1.5" strokeDasharray="3 3" />
              <path d="M136 78 L130 82 L136 86" fill="none" stroke="#164E46" strokeWidth="1.5" />
              <rect x="75" y="102" width="130" height="26" rx="4" fill="#164E46" />
              <text x="96" y="118" fontSize="10" fill="#F7F4EC" fontFamily="sans-serif">Reactive Binding (UI Update)</text>
              {/* 差量更新小方块 */}
              <rect x="212" y="106" width="7" height="7" rx="1.5" fill="#D9A441" />
              <rect x="222" y="106" width="7" height="7" rx="1.5" fill="none" stroke="#F7F4EC" strokeWidth="1" />
            </g>
          )}

          {theme === 'psychology' && (
            <g stroke="#164E46" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {/* 认知心理学：刺激-评估-反应三元回路与神经反馈 */}
              <circle cx="140" cy="80" r="56" fill="#A9BCA5" fillOpacity=".2" stroke="none" />
              {/* 左右认知通道 */}
              <path d="M80 40 Q50 80, 80 120" strokeWidth="2.4" />
              <path d="M200 40 Q230 80, 200 120" strokeWidth="2.4" />
              {/* 刺激输入 */}
              <rect x="30" y="66" width="60" height="28" rx="6" fill="#F7F4EC" />
              <text x="38" y="83" fontSize="9.5" fill="#164E46" fontFamily="sans-serif" fontWeight="600">Stimulus 刺激</text>
              <circle cx="44" cy="71" r="1.6" fill="#D9A441" />
              {/* 认知中枢:树突棘 */}
              <circle cx="140" cy="80" r="26" fill="#D9A441" fillOpacity=".25" />
              <circle cx="140" cy="80" r="18" fill="#164E46" />
              <circle cx="140" cy="80" r="6" fill="#D9A441" />
              <path d="M128 66 l-5 -6 M152 66 l5 -6 M124 80 h-8 M156 80 h8 M128 94 l-5 6 M152 94 l5 6" strokeWidth="1.3" />
              <text x="118" y="122" fontSize="9" fill="#164E46" fontFamily="sans-serif">Appraisal 评估</text>
              {/* 反应行为 */}
              <rect x="190" y="66" width="60" height="28" rx="6" fill="#F7F4EC" />
              <text x="195" y="83" fontSize="9.5" fill="#164E46" fontFamily="sans-serif" fontWeight="600">Response 反应</text>
              <circle cx="238" cy="71" r="1.6" fill="#164E46" />
              {/* 传导流(带端头) */}
              <path d="M90 80 L122 80 M158 80 L190 80" stroke="#D9A441" strokeWidth="2.2" />
              <path d="M118 76.5 L122 80 L118 83.5 M186 76.5 L190 80 L186 83.5" fill="none" stroke="#D9A441" strokeWidth="1.8" />
              <path d="M220 94 Q140 146, 60 94" stroke="#164E46" strokeDasharray="4 3" />
            </g>
          )}

          {theme === 'ai' && (
            <g stroke="#164E46" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {/* 深度学习与大模型注意力拓扑图解 */}
              <rect x="35" y="25" width="210" height="110" rx="8" fill="#F7F4EC" />
              <circle cx="65" cy="50" r="7" fill="#A9BCA5" />
              <circle cx="65" cy="80" r="7" fill="#A9BCA5" />
              <circle cx="65" cy="110" r="7" fill="#A9BCA5" />
              <circle cx="140" cy="65" r="9" fill="#D9A441" />
              <circle cx="140" cy="95" r="9" fill="#164E46" />
              <circle cx="215" cy="80" r="8" fill="#D9A441" />
              {/* 注意力权重弧(粗细=权重) */}
              <path d="M72 50 L131 65 M72 50 L131 95" strokeWidth="1.4" strokeOpacity=".5" />
              <path d="M72 80 L131 65 M72 80 L131 95" strokeWidth="1.8" stroke="#D9A441" />
              <path d="M72 110 L131 65 M72 110 L131 95" strokeWidth="1.4" strokeOpacity=".5" />
              <path d="M149 65 L207 80 M149 95 L207 80" strokeWidth="2" />
              <path d="M203 76 L207 80 L203 84 M203 76.5 L207 80.5 L203 84" fill="none" strokeWidth="1.6" />
              {/* 隐层分隔虚线 */}
              <path d="M112 34 V126 M168 34 V126" strokeWidth="1" strokeOpacity=".2" strokeDasharray="3 3.4" />
              <text x="45" y="145" fontSize="9" fill="#164E46" fontFamily="sans-serif">Input Features</text>
              <text x="120" y="145" fontSize="9" fill="#164E46" fontFamily="sans-serif">Latent Layers</text>
              <text x="195" y="145" fontSize="9" fill="#164E46" fontFamily="sans-serif">Output</text>
            </g>
          )}

          {theme === 'general' && (
            <g stroke="#164E46" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {/* 通用结构化知识阶梯：概念 -> 机理 -> 实践 */}
              <rect x="30" y="35" width="65" height="42" rx="6" fill="#F7F4EC" />
              <text x="40" y="58" fontSize="10" fill="#164E46" fontFamily="sans-serif" fontWeight="600">背景情境</text>
              <path d="M36 43 h30 M36 47 h20" stroke="#164E46" strokeOpacity=".2" strokeWidth="1.4" strokeLinecap="round" />
              <rect x="110" y="30" width="65" height="52" rx="6" fill="#E8EBDD" />
              <text x="120" y="58" fontSize="10" fill="#164E46" fontFamily="sans-serif" fontWeight="600">核心机制</text>
              <circle cx="142" cy="70" r="4" fill="#D9A441" />
              <circle cx="142" cy="70" r="7" fill="none" stroke="#D9A441" strokeWidth="1" strokeOpacity=".55" />
              <rect x="190" y="35" width="65" height="42" rx="6" fill="#F7F4EC" />
              <text x="200" y="58" fontSize="10" fill="#164E46" fontFamily="sans-serif" fontWeight="600">实践落地</text>
              <path d="M36 69 h24 M204 43 h26 M204 47 h16" stroke="#164E46" strokeOpacity=".2" strokeWidth="1.4" strokeLinecap="round" />
              {/* 阶梯箭头带端头 */}
              <path d="M95 56 L110 56 M175 56 L190 56" stroke="#D9A441" strokeWidth="2.2" />
              <path d="M106.5 52.5 L110 56 L106.5 59.5 M186.5 52.5 L190 56 L186.5 59.5" fill="none" stroke="#D9A441" strokeWidth="1.8" />
              <path d="M40 102 H240" strokeWidth="1.5" strokeDasharray="4 3" />
              <circle cx="140" cy="116" r="14" fill="#164E46" />
              <circle cx="140" cy="116" r="18" fill="none" stroke="#164E46" strokeOpacity=".25" strokeWidth="1.2" strokeDasharray="3 3.4" />
              <path d="M135 116 L139 120 L146 112" stroke="#F7F4EC" strokeWidth="2" fill="none" />
              <text x="100" y="142" fontSize="9.5" fill="#164E46" fontFamily="sans-serif">Syllabus Synthesis Flow</text>
              <path d="M38 26 l2.4 2.4 M40.4 26 l-2.4 2.4" stroke="#D9A441" strokeWidth="1.3" strokeLinecap="round" />
              <circle cx="248" cy="26" r="2" fill="#D9A441" fillOpacity=".8" />
            </g>
          )}
        </svg>
      </div>

      <div style={{ fontSize: 12, color: '#4B5563', lineHeight: 1.4, wordBreak: 'break-word' }}>
        {prompt}
      </div>
    </div>
  );
};
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
  fontWeight: seg.b || item.weight === 700 ? 700 : item.weight ?? 500,
  fontStyle: seg.i ? 'italic' : undefined,
  color: seg.red ? '#C0392B' : seg.violet ? VIOLET : (item.color ?? INK),
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
  insets?: ViewportInsets;
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
  insets,
}) => {
  const [lightboxImage, setLightboxImage] = useState<{ url: string; caption?: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 2D Camera state: { x, y, zoom }
  const [camera, setCamera] = useState<CameraState>({ x: -panX, y: 0, zoom });
  const viewportRef = useRef<HTMLDivElement>(null);

  // Keep camera zoom in sync with prop if changed externally (e.g. Chrome zoom buttons)
  useEffect(() => {
    setCamera((prev) => {
      if (Math.abs(prev.zoom - zoom) > 0.001) {
        if (viewportRef.current) {
          const rect = viewportRef.current.getBoundingClientRect();
          const center = { x: rect.width / 2, y: rect.height / 2 };
          return zoomAtPoint(prev, center, zoom);
        }
        return { ...prev, zoom };
      }
      return prev;
    });
  }, [zoom]);


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
        m.set(it.id, r ? { svg: r.svg, ...diagramBox(r, it.w ?? 320) } : null);
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

    // Collect elements in this step
    const latestBoardStep = Math.max(...items.filter((it) => it.step <= targetStep).map((it) => it.step));
    const stepItems = items.filter((it) => it.step === latestBoardStep);
    let targetElements = stepItems.map((it) => {
      const d = it.diagram ? diagrams.get(it.id) : null;
      return {
        x: it.x,
        y: it.y,
        width: d ? d.w : (it.w ?? 340),
        height: d ? d.h : it.image ? (it.image.width ?? 340) + 64 : (it.lines.length * (it.mono ? MONO_LH : it.size * 1.24)),
      };
    });

    if (targetElements.length === 0 && targetWritingId) {
      const it = items.find((i) => i.id === targetWritingId);
      if (it) {
        const d = it.diagram ? diagrams.get(it.id) : null;
        targetElements = [{
          x: it.x,
          y: it.y,
          width: d ? d.w : (it.w ?? 340),
          height: d ? d.h : it.image ? (it.image.width ?? 340) + 64 : (it.lines.length * (it.mono ? MONO_LH : it.size * 1.24)),
        }];
      }
    }

    const box = computeBoundingBox(targetElements);
    if (!box) return;

    const layout = vp.closest('.wb-app-layout');
    const toolbar = layout?.querySelector('.wb-top-bar')?.getBoundingClientRect();
    const dock = layout?.querySelector('.wb-unified-dock')?.getBoundingClientRect();
    const currentInsets: ViewportInsets = insets ?? {
      top: toolbar ? Math.max(0, toolbar.bottom - vpRect.top) + 12 : 76,
      bottom: dock ? Math.max(0, vpRect.bottom - dock.top) + 12 : 104,
      left: vpRect.width <= 640 ? 8 : 32,
      right: vpRect.width <= 640 ? 8 : 32,
    };
    const safeLeft = Math.max(0, currentInsets.left ?? 32);
    const safeTop = Math.max(0, currentInsets.top ?? 76);
    const safeRight = vpRect.width - Math.max(0, currentInsets.right ?? 32);
    const safeBottom = vpRect.height - Math.max(0, currentInsets.bottom ?? 104);

    setCamera((prev) => {
      const boxLeft = box.minX * prev.zoom + prev.x;
      const boxRight = box.maxX * prev.zoom + prev.x;
      const boxTop = box.minY * prev.zoom + prev.y;
      const boxBottom = box.maxY * prev.zoom + prev.y;

      const isComfortablyVisible =
        boxLeft >= safeLeft + 16 &&
        boxTop >= safeTop + 16 &&
        boxRight <= safeRight - 16 &&
        boxBottom <= safeBottom - 16;

      if (isComfortablyVisible && prev.zoom >= 0.85) {
        return prev;
      }

      const next = focusBox(box, vpRect, prev.zoom, 48, currentInsets, true);
      if (onZoomChange && Math.abs(prev.zoom - next.zoom) > 0.01) {
        onZoomChange(next.zoom);
      }
      return next;
    });
  }, [isFollowing, items, diagrams, insets, onZoomChange]);

  // Auto-focus on writingId, step change, or resume following
  useEffect(() => {
    if (isFollowing) {
      focusTarget(writingId, step);
    }
  }, [writingId, step, isFollowing, focusTarget]);

  // Handle window resize and font/image loaded
  useEffect(() => {
    const handleResize = () => {
      if (isFollowing) {
        focusTarget(writingId, step);
      }
    };
    const observer = new ResizeObserver(handleResize);
    if (viewportRef.current) {
      observer.observe(viewportRef.current);
      const layout = viewportRef.current.closest('.wb-app-layout');
      /* lib 未含 DOM.Iterable,NodeList 不可 for-of,先转数组 */
      for (const element of Array.from(layout?.querySelectorAll('.wb-top-bar, .wb-unified-dock') ?? [])) {
        observer.observe(element);
      }
    }
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
      setIsDragging(true);
    } else if (g.pointers.size === 2) {
      const [p1, p2] = Array.from(g.pointers.values());
      g.initialDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      g.initialCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      g.startCam = { ...camera };
      setIsDragging(true);
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
      setIsDragging(true);
    } else if (g.pointers.size === 0) {
      g.isDragging = false;
      setIsDragging(false);
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
          transition: isDragging ? 'none' : 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div className={`wb-dots${dots ? '' : ' off'}`} style={{ width: 3600, height: 2400 }} />
        <div className={`wb-board${standardFont ? ' wb-standard' : ''}`}>
          {items.map((item) => {
            if (item.step > step) return null;
            const flat = flats.get(item.id)!;
            const writeTotal = itemCharCount(item);
            const isWriting = writingId === item.id;
            const isDone = item.step < step || (progress[item.id] ?? 0) >= writeTotal;
            const hasStarted = isDone || isWriting || (progress[item.id] ?? 0) > 0;
            if (!hasStarted) return null;
            const shown = isDone ? flat.total : (progress[item.id] ?? 0);
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
                      width: item.image.width ?? 320,
                    }}
                  >
                    <WhiteboardConceptSketch
                      prompt={item.image.prompt || 'Visual concept illustration'}
                      caption={item.image.caption}
                      width={item.image.width ?? 320}
                    />
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
        style={{ ...segStyle(accSeg, item), ...(accPending ? { color: '#9CA3AF' } : undefined) }}
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
        <path d={gridPaths} stroke="#9CA3AF" strokeWidth="1.4" fill="none" strokeLinecap="round" />
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
