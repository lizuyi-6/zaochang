/**
 * 手绘风 Mermaid 子集渲染器(白板"插图")。
 *
 * 为什么不用 mermaid 本体:线上产物是预构建静态资产,mermaid 全量 ~1MB 会把
 * /lattice/ 的包翻倍;而白板只需要 flowchart 的一小撮语法,并且要与板书同一套
 * 手绘语言(波纹描边、Caveat 字体、淡墨色)——自绘 ~200 行可控得多。解析失败
 * (超出子集)返回 null,调用方回退为等宽代码文本,永不白屏。
 *
 * 输出纯 SVG 字符串:Board 经 dangerouslySetInnerHTML 挂载(自家生成,非用户
 * HTML);导出经 data URL 光栅化画进 Canvas(SVG-in-img 取不到文档 webfont,
 * 文字会落到系统 cursive 回退——导出可读性优先,如实记录)。
 */

export interface DiagNode {
  id: string;
  label: string;
  lines: string[];
  shape: 'rect' | 'round' | 'diamond';
}
export interface DiagEdge {
  from: string;
  to: string;
  label?: string;
  /** 原始箭头记号:'---' = 无箭头连线,其余均画箭头 */
  arrow?: string;
}
export interface DiagGraph {
  dir: 'TD' | 'LR';
  nodes: DiagNode[];
  edges: DiagEdge[];
}

export interface RenderedDiagram {
  svg: string;
  w: number;
  h: number;
}

/** 图在板上的显示盒:等比缩到 maxW×maxH 内(diagram.ts 与 Board/导出共用同一算法)。 */
export function diagramBox(
  r: { w: number; h: number },
  maxW = 360,
  maxH = 420,
): { w: number; h: number } {
  const scale = Math.min(maxW / r.w, maxH / r.h, 1.6);
  return { w: Math.round(r.w * scale), h: Math.round(r.h * scale) };
}

const KEYWORDS = new Set(['graph', 'flowchart', 'end', 'subgraph', 'class', 'classDef', 'style', 'click', 'direction', 'linkStyle', 'init']);

const unescapeLabel = (s: string): string =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

const splitLabel = (s: string): string[] =>
  unescapeLabel(s)
    .split('\n')
    .filter((l) => l.length > 0)
    .slice(0, 4);

/* 确定性抖动:同一 id 每次渲染同一波形(hash → ±2.8px) */
const hash32 = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};
const jit = (seed: string, scale = 1): number => ((hash32(seed) % 7) - 3) * 0.8 * scale;

interface NodeSpec {
  id: string;
  label: string;
  shape: DiagNode['shape'];
}

function parseNodeSpec(spec: string): NodeSpec[] {
  const out: NodeSpec[] = [];
  const re = /([A-Za-z0-9_.-]+)\s*(\[[^\]]*\]|\([^)]*\)|\{[^}]*\})?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(spec))) {
    const id = m[1];
    if (KEYWORDS.has(id.toLowerCase())) continue;
    if (!/[A-Za-z0-9]/.test(id)) continue; // " -- " 等纯符号残片不是节点
    let label = id;
    let shape: DiagNode['shape'] = 'rect';
    if (m[2]) {
      shape = m[2][0] === '(' ? 'round' : m[2][0] === '{' ? 'diamond' : 'rect';
      const inner = m[2].slice(1, -1).trim();
      if (inner) label = inner;
    }
    out.push({ id, label, shape });
  }
  return out;
}

type Segment = { kind: 'node'; spec: NodeSpec } | { kind: 'arrow'; label?: string; mark?: string };

/** 把一条语句交替扫描成 节点/箭头 段(链式 A --> B --> C 天然成立)。 */
function scanSegments(line: string): Segment[] {
  const segs: Segment[] = [];
  const arrowRe = /(-\.\.->|-->|->|==>|-\.->|---)(?:\s*\|([^|]*)\|)?/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = arrowRe.exec(line))) {
    for (const spec of parseNodeSpec(line.slice(cursor, m.index))) segs.push({ kind: 'node', spec });
    segs.push({ kind: 'arrow', mark: m[1], ...(m[2]?.trim() ? { label: m[2].trim() } : {}) });
    cursor = m.index + m[0].length;
  }
  for (const spec of parseNodeSpec(line.slice(cursor))) segs.push({ kind: 'node', spec });
  return segs;
}

/** 解析 mermaid flowchart 子集:方向头 + `A[label] -->|文本| B(shape)` 语句(换行/分号分隔)。 */
export function parseMermaid(code: string): DiagGraph | null {
  const lines = code
    .split(/[\n;]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  let dir: 'TD' | 'LR' = 'TD';
  let start = 0;
  const header = lines[0].match(/^(?:graph|flowchart)\s+(TD|TB|LR|RL|BT)\b/i);
  if (header) {
    dir = /^(LR|RL)$/i.test(header[1]) ? 'LR' : 'TD';
    start = 1;
  }

  const nodes: DiagNode[] = [];
  const byId = new Map<string, DiagNode>();
  const edges: DiagEdge[] = [];

  const addNode = (spec: NodeSpec): DiagNode => {
    const existing = byId.get(spec.id);
    if (existing) {
      if (spec.label && spec.label !== spec.id) {
        existing.label = spec.label;
        existing.lines = splitLabel(spec.label);
      }
      if (spec.shape !== 'rect') existing.shape = spec.shape;
      return existing;
    }
    const node: DiagNode = { id: spec.id, label: spec.label, lines: splitLabel(spec.label), shape: spec.shape };
    nodes.push(node);
    byId.set(spec.id, node);
    return node;
  };

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (/^(%%|classDef\b|class\s|style\s|click\s|linkStyle\b|init\b|subgraph\b|end\b)/.test(line)) continue;
    const segs = scanSegments(line);
    let prevNode: NodeSpec | null = null;
    for (let si = 0; si < segs.length; si++) {
      const seg = segs[si];
      if (seg.kind === 'node') {
        addNode(seg.spec);
        if (!prevNode) prevNode = seg.spec;
      } else if (prevNode) {
        const next = segs[si + 1];
        if (next && next.kind === 'node') {
          edges.push({ from: prevNode.id, to: next.spec.id, arrow: seg.mark, ...(seg.label ? { label: seg.label } : {}) });
          prevNode = next.spec;
        }
      }
    }
  }

  if (!nodes.length) return null;
  return { dir, nodes, edges };
}

/* ------------------------------------------------------------------ */
/* 布局 + SVG                                                          */
/* ------------------------------------------------------------------ */

const FONT = 17;
const CHAR_W = 7.6;
const GAP_X = 44;
const GAP_Y = 60;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/** 路径数值统一一位小数,避免浮点尾迹污染 SVG 源码 */
const r1 = (v: number): number => Math.round(v * 10) / 10;

export function renderDiagram(code: string): RenderedDiagram | null {
  const g = parseMermaid(code);
  /* 没有边的不是图(垃圾输入/纯文本)——调用方回退为等宽代码文本 */
  if (!g || !g.edges.length) return null;

  /* 最长路径分层(迭代收敛,环由轮数上限截断);截断可能留下不连续层号——压实 */
  const layerOf = new Map<string, number>(g.nodes.map((n) => [n.id, 0]));
  for (let it = 0; it < g.nodes.length; it++) {
    let changed = false;
    for (const e of g.edges) {
      if (!layerOf.has(e.from) || !layerOf.has(e.to)) continue;
      const want = (layerOf.get(e.from) ?? 0) + 1;
      if (want > (layerOf.get(e.to) ?? 0)) {
        layerOf.set(e.to, want);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const usedLayers = [...new Set(g.nodes.map((n) => layerOf.get(n.id) ?? 0))].sort((a, b) => a - b);
  const compact = new Map(usedLayers.map((l, i) => [l, i]));
  for (const n of g.nodes) layerOf.set(n.id, compact.get(layerOf.get(n.id) ?? 0) ?? 0);

  /* 每层内保持声明顺序;几何:TD = 纵向层,LR = 横向层 */
  const sizeOf = (n: DiagNode): { w: number; h: number } => {
    const maxLen = Math.max(...n.lines.map((l) => l.length), 3);
    return { w: clamp(maxLen * CHAR_W + 26, 64, 188), h: n.lines.length * 20 + 20 };
  };
  const sizes = new Map(g.nodes.map((n) => [n.id, sizeOf(n)]));

  const layers: DiagNode[][] = [];
  for (const n of g.nodes) {
    const l = layerOf.get(n.id) ?? 0;
    (layers[l] ??= []).push(n);
  }

  const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
  const laneSize = (lane: DiagNode[], axis: 'w' | 'h'): number =>
    lane.reduce((acc, n) => Math.max(acc, sizes.get(n.id)?.[axis] ?? 0), 0);

  let cross = 10; // 主轴游标(TD 的 y / LR 的 x)
  const laneThickness: number[] = [];
  const laneOffset: number[] = [];
  for (const lane of layers) {
    const thickness = laneSize(lane, g.dir === 'TD' ? 'h' : 'w');
    laneThickness.push(thickness);
    laneOffset.push(cross);
    cross += thickness + (g.dir === 'TD' ? GAP_Y : GAP_X);
  }
  layers.forEach((lane, li) => {
    let along = 10; // 副轴游标(TD 的 x / LR 的 y)
    for (const n of lane) {
      const s = sizes.get(n.id)!;
      if (g.dir === 'TD') {
        pos.set(n.id, { x: along, y: laneOffset[li] + (laneThickness[li] - s.h) / 2, w: s.w, h: s.h });
        along += s.w + GAP_X;
      } else {
        pos.set(n.id, { x: laneOffset[li] + (laneThickness[li] - s.w) / 2, y: along, w: s.w, h: s.h });
        along += s.h + GAP_X;
      }
    }
  });

  let maxMain = 10;
  let maxSide = 10;
  for (const p of pos.values()) {
    maxMain = Math.max(maxMain, (g.dir === 'TD' ? p.y + p.h : p.x + p.w));
    maxSide = Math.max(maxSide, (g.dir === 'TD' ? p.x + p.w : p.y + p.h));
  }
  const W = Math.ceil((g.dir === 'TD' ? maxSide : maxMain) + 12);
  const H = Math.ceil((g.dir === 'TD' ? maxMain : maxSide) + 12);

  /* ---- 手绘节点框:四边各一段带抖动的三次曲线 ---- */
  const nodePath = (id: string, x: number, y: number, w: number, h: number, shape: DiagNode['shape']): string => {
    if (shape === 'diamond') {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const pts: [number, number][] = [
        [cx, y],
        [x + w, cy],
        [cx, y + h],
        [x, cy],
      ];
    const j = pts.map((p, i) => [r1(p[0] + jit(`${id}-d${i}`)), r1(p[1] + jit(`${id}-d${i}b`))] as [number, number]);
    return `M ${j[0][0]} ${j[0][1]} L ${j[1][0]} ${j[1][1]} L ${j[2][0]} ${j[2][1]} L ${j[3][0]} ${j[3][1]} Z`;
  }
  const r = shape === 'round' ? Math.min(20, w / 3, h / 2.4) : 7;
  const e = (k: string): number => r1(jit(`${id}-${k}`));
  // 圆角矩形用四段二次曲线,锚点逐边抖动 → 手绘感
  return [
    `M ${r1(x + r) + e('a')} ${r1(y) + e('b')}`,
    `Q ${r1(x + w / 2)} ${r1(y - 1.5)} ${r1(x + w - r) + e('c')} ${r1(y) + e('d')}`,
    `Q ${r1(x + w + 1.5)} ${r1(y + h / 2)} ${r1(x + w) + e('e')} ${r1(y + h - r) + e('f')}`,
    `Q ${r1(x + w / 2)} ${r1(y + h + 1.5)} ${r1(x + r) + e('g')} ${r1(y + h) + e('h')}`,
    `Q ${r1(x - 1.5)} ${r1(y + h / 2)} ${r1(x) + e('i')} ${r1(y + r) + e('j')}`,
    `Q ${r1(x + w / 2)} ${r1(y - 0.5)} ${r1(x + r) + e('k')} ${r1(y) + e('l')}`,
    'Z',
  ].join(' ');
  };

  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const anchorOf = (id: string, side: 'from' | 'to'): { x: number; y: number } => {
    const p = pos.get(id)!;
    if (g.dir === 'TD') return side === 'from' ? { x: p.x + p.w / 2, y: p.y + p.h } : { x: p.x + p.w / 2, y: p.y };
    return side === 'from' ? { x: p.x + p.w, y: p.y + p.h / 2 } : { x: p.x, y: p.y + p.h / 2 };
  };

  const edgePaths: string[] = [];
  const edgeLabels: string[] = [];
  g.edges.forEach((e, i) => {
    const a = anchorOf(e.from, 'from');
    const b = anchorOf(e.to, 'to');
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const bow = jit(`e${i}`, 1.6);
    let d: string;
    if (g.dir === 'TD') {
      const my = (a.y + b.y) / 2;
      d = `M ${r1(a.x)} ${r1(a.y)} C ${r1(a.x + bow)} ${r1(my)}, ${r1(b.x - bow)} ${r1(my)}, ${r1(b.x)} ${r1(b.y)}`;
    } else {
      const mx = (a.x + b.x) / 2;
      d = `M ${r1(a.x)} ${r1(a.y)} C ${r1(mx)} ${r1(a.y + bow)}, ${r1(mx)} ${r1(b.y - bow)}, ${r1(b.x)} ${r1(b.y)}`;
    }
    edgePaths.push(d);
    /* 手绘箭头:终点处按来向张开的 V 字('---' 无箭头连线不画) */
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const tipX = b.x;
    const tipY = b.y;
    const back = 9;
    const spread = 4.4;
    if (e.arrow !== '---') {
      edgePaths.push(
        `M ${r1(tipX - ux * back + px * spread + jit(`h${i}`))} ${r1(tipY - uy * back + py * spread + jit(`h${i}b`))} L ${r1(tipX)} ${r1(tipY)} L ${r1(tipX - ux * back - px * spread + jit(`h${i}c`))} ${r1(tipY - uy * back - py * spread + jit(`h${i}d`))}`,
      );
    }
    if (e.label) {
      const lx = (a.x + b.x) / 2;
      const ly = (a.y + b.y) / 2 - 6;
      const lw = e.label.length * CHAR_W * 0.82 + 10;
      edgeLabels.push(
        `<rect x="${(lx - lw / 2).toFixed(1)}" y="${ly - 12}" width="${lw.toFixed(1)}" height="17" rx="4" fill="#FCFCFC" opacity="0.92"/>` +
          `<text x="${lx.toFixed(1)}" y="${ly}" text-anchor="middle" font-size="14" fill="#5a5a55">${esc(e.label)}</text>`,
      );
    }
  });

  const nodeSvg = g.nodes
    .map((n) => {
      const p = pos.get(n.id)!;
      const texts = n.lines
        .map((l, li) => {
          const ty = p.y + p.h / 2 - ((n.lines.length - 1) * 20) / 2 + li * 20 + 6;
          return `<tspan x="${(p.x + p.w / 2).toFixed(1)}" y="${ty.toFixed(1)}">${esc(l)}</tspan>`;
        })
        .join('');
      return (
        `<path d="${nodePath(n.id, p.x, p.y, p.w, p.h, n.shape)}" fill="#FDFDFB" stroke="#4a4a45" stroke-width="1.7" stroke-linejoin="round"/>` +
        `<text font-family="'Caveat','Segoe Print',cursive" font-size="${FONT}" font-weight="600" fill="#333330" text-anchor="middle">${texts}</text>`
      );
    })
    .join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="wb-diagram-svg" role="img">` +
    `<g fill="none" stroke="#5c5c56" stroke-width="1.6" stroke-linecap="round">${edgePaths.map((d) => `<path d="${d}"/>`).join('')}</g>` +
    edgeLabels.join('') +
    nodeSvg +
    '</svg>';

  return { svg, w: W, h: H };
}
