/**
 * 直播放适配器:把后端 LecturePlan(/api/hyperknow/whiteboard/plan,原 WS
 * whiteboardWs.js 的无状态化形状)映射成演示脚本同构的 LessonScript——
 * 引擎(runStep/writeItem/typeCaption)、Board 与导出共用同一套数据形态,
 * 直播课与演示课零特判。板书动作:card(HTML→手写行)/formula(LaTeX 源码
 * 等宽呈现)/diagram(手绘 mermaid,见 diagram.ts)/quick_check(随堂快测)。
 */
import type { LiveLecturePlan } from '../backend';
import type { BoardAnnot, BoardItem, BoardTable, LessonStep, Rich } from './lessonScript';
import { VIOLET } from './lessonScript';
import { L } from '../i18n/content';

export interface LessonScript {
  steps: LessonStep[];
  items: BoardItem[];
  table: BoardTable | null;
  annots: BoardAnnot[];
  /** script-step 无 canned 答案(直播课不演戏);保留字段对齐演示脚本消费方 */
  userAnswers: Record<number, string>;
  /** 第二页起点(板书世界 x);0 = 单页 */
  pageSplitX: number;
  /** 直播课的讲座会话 ID(举手插话按它取回计划上下文);演示课无 */
  sessionId?: string;
}

/* 与演示板书同一套栏目网格(列 x 间距沿用参考稿) */
const COL_X = [90, 470, 775, 1132, 1471];
const COL_W = 330;
const COL_MAX_H = 620;
const LINE_CHARS = 36; // Caveat 19px ≈ 8.8px/字符,36 字符 ≈ 317px < 列宽

/* ---------------- HTML → 手写行(Rich) ---------------- */

interface Run {
  t: string;
  b?: boolean;
  i?: boolean;
  br?: boolean; // 块/换行哨兵
}

const BLOCK = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'PRE', 'BLOCKQUOTE', 'TABLE', 'TR']);

function collectRuns(node: Node, fmt: { b?: boolean; i?: boolean }, runs: Run[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = (node.textContent ?? '').replace(/\s+/g, ' ');
    if (t.trim()) runs.push({ t: t.trim() === ' ' ? ' ' : t, ...fmt });
    else if (runs.length && !runs[runs.length - 1].br) runs.push({ t: ' ', ...fmt });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  const tag = el.tagName;
  if (tag === 'BR') {
    runs.push({ t: '', br: true });
    return;
  }
  const next = {
    b: fmt.b || tag === 'STRONG' || tag === 'B' || /^H[1-6]$/.test(tag),
    i: fmt.i || tag === 'EM' || tag === 'I',
  };
  if (BLOCK.has(tag)) {
    runs.push({ t: '', br: true });
    el.childNodes.forEach((c) => collectRuns(c, next, runs));
    runs.push({ t: '', br: true });
    return;
  }
  el.childNodes.forEach((c) => collectRuns(c, next, runs));
}

/** 按行宽把 run 序列折行:拉丁按词折,CJK 逐字折。 */
function wrapRuns(runs: Run[]): Rich[] {
  const lines: Rich[] = [];
  let cur: Rich = [];
  let curLen = 0;
  const flush = () => {
    // 去行首/行尾的纯空白段,再落行;整行空白丢弃
    while (cur.length && !cur[0].t.trim()) cur.shift();
    while (cur.length && !cur[cur.length - 1].t.trim()) cur.pop();
    if (cur.length) {
      const line = cur.map((s) => ({ ...s }));
      lines.push(line);
    }
    cur = [];
    curLen = 0;
  };
  for (const run of runs) {
    if (run.br) {
      flush();
      continue;
    }
    const parts = run.t.split(/(\s+)/).filter((p) => p !== '');
    for (const part of parts) {
      const isCjk = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/.test(part);
      const plen = part.length;
      if (curLen + plen > LINE_CHARS && (isCjk || part.trim() === '')) {
        flush();
        if (part.trim() === '') continue;
      }
      if (isCjk && plen > LINE_CHARS) {
        for (const ch of part) {
          if (curLen + 1 > LINE_CHARS) flush();
          cur.push({ t: ch, b: run.b, i: run.i });
          curLen += 1;
        }
        continue;
      }
      if (curLen + plen > LINE_CHARS) flush();
      cur.push({ t: part, b: run.b, i: run.i });
      curLen += plen;
    }
  }
  flush();
  return lines.slice(0, 9);
}

/** HTML 卡片正文 → 手写板书行(结构性标签成行、strong/h* 加粗、br/块界换行)。 */
export function htmlToLines(html: string): Rich[] {
  try {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root) return [];
    const runs: Run[] = [];
    root.childNodes.forEach((c) => collectRuns(c, {}, runs));
    return wrapRuns(runs);
  } catch {
    return [];
  }
}

/* ---------------- LecturePlan → LessonScript ---------------- */

interface Cursor {
  col: number;
  y: number;
}

const plain = (s: string): Rich => [{ t: s }];

export function liveLessonFromPlan(plan: LiveLecturePlan): LessonScript {
  const steps: LessonStep[] = [];
  const items: BoardItem[] = [];
  const cursor: Cursor = { col: 0, y: 94 };
  let plannedPan = false;

  const advance = (h: number): void => {
    cursor.y += h + 26;
    if (cursor.y > COL_MAX_H && cursor.col < COL_X.length - 1) {
      cursor.col += 1;
      cursor.y = 94;
    }
  };
  const push = (item: Omit<BoardItem, 'x' | 'y'>): void => {
    items.push({ ...item, x: COL_X[cursor.col], y: cursor.y });
    const lh = item.size * 1.24;
    advance(item.diagram ? 440 : item.image ? 280 : (item.lines?.length ?? 1) * lh);
  };

  plan.steps.forEach((step, idx) => {
    const id = idx + 1;
    const action = step.board_action;
    const chipText = L('Board note', '板书');
    const panel: LessonStep['panel'] = [
      { id: `chip-live-${id}`, kind: 'chip', chipIcon: 'pencil', chipText },
      { id: `m-live-${id}`, kind: 'msg', text: plain(step.spoken_text) },
    ];
    if (action.type === 'card') {
      const titleLines = action.title ? [plain(action.title)] : [];
      if (titleLines.length) {
        push({ id: `c${id}t`, step: id, size: 22, weight: 700, color: VIOLET, lines: titleLines });
      }
      const body = action.content ? htmlToLines(action.content) : [];
      if (body.length) push({ id: `c${id}b`, step: id, size: 19, w: COL_W, lines: body });
    } else if (action.type === 'formula') {
      push({ id: `f${id}`, step: id, size: 16, mono: true, w: COL_W, lines: [plain(action.latex ?? action.content ?? '')] });
    } else if (action.type === 'diagram') {
      let code = action.code ?? action.content ?? '';
      const rawNodes = (action as { nodes?: Array<{ id: string; label: string }> }).nodes;
      const rawEdges = (action as { edges?: Array<{ from: string; to: string; label?: string }> }).edges;
      if (!code && Array.isArray(rawNodes) && rawNodes.length) {
        // 结构化节点边转化为标准 Mermaid 语法
        const nodeLines = rawNodes.map((n) => `  ${n.id}["${n.label}"]`);
        const edgeLines = (rawEdges ?? []).map((e) => `  ${e.from} -->${e.label ? `|${e.label}| ` : ' '}${e.to}`);
        code = `graph TD\n${nodeLines.join('\n')}\n${edgeLines.join('\n')}`;
      }

      // 提取友好降级自然文字，绝不向学员输出原生代码
      const naturalFallbackText: string[] = [];
      if (code) {
        const rawLines = code.split('\n');
        for (const line of rawLines) {
          const trimmed = line.trim();
          if (!trimmed || /^(graph|flowchart|subgraph|end|style|class)/i.test(trimmed)) continue;
          const cleaned = trimmed
            .replace(/-->|---|==>/g, ' → ')
            .replace(/[\[\]\(\)\{\}\"\']/g, '')
            .trim();
          if (cleaned) naturalFallbackText.push(cleaned);
        }
      }
      const fallbackDisplayLines = naturalFallbackText.length
        ? naturalFallbackText.slice(0, 5).map(plain)
        : [plain(action.title || step.spoken_text || 'Structured Concept Flow')];

      push({
        id: `d${id}`,
        step: id,
        size: 14,
        w: 360,
        diagram: code,
        lines: fallbackDisplayLines,
      });
    } else if (action.type === 'image') {
      const caption = action.caption ?? action.title ?? '';
      const prompt = action.prompt ?? '';
      const isFailed = Boolean((action as { failed?: boolean }).failed);
      const status: 'pending' | 'ready' | 'failed' = action.url
        ? 'ready'
        : isFailed
        ? 'failed'
        : 'pending';

      push({
        id: `img${id}`,
        step: id,
        size: 14,
        w: 360,
        image: {
          url: action.url,
          status,
          caption: caption || prompt,
          prompt,
          width: action.width ?? 340,
          height: action.height ?? 240,
        },
        lines: [
          plain(caption ? `[${caption}]` : '[Visual Note]'),
          plain(prompt || step.spoken_text),
        ],
      });
    }

    /* 本步内容已落到第二页(x≥1132)→ 该步开讲时翻页;只翻一次 */
    const needPan = COL_X[cursor.col] >= 1132 && !plannedPan;
    if (needPan) plannedPan = true;

    const lessonStep: LessonStep = {
      id,
      panel,
      caption: plain(step.spoken_text),
      beat: 400,
      /* 服务端 step_id:举手插话把它作为答疑上下文(演示步没有) */
      sid: step.step_id,
      ...(needPan ? { pan: true } : {}),
    };

    if (action.type === 'quick_check') {
      const options = (action.options ?? []).length >= 2 ? (action.options as string[]) : [];
      if (options.length >= 2) {
        lessonStep.awaitChoice = {
          question: action.question ?? L('Quick check', '快速检查'),
          options,
          answer: Math.min(Math.max(action.answer ?? 0, 0), options.length - 1),
        };
      }
    }

    if (idx === plan.steps.length - 1) {
      lessonStep.systemEnd = true;
      steps.push(lessonStep);
      steps.push({ id: id + 1, panel: [], popup: 'unitComplete' });
      return;
    }
    steps.push(lessonStep);
  });

  /* 板书跨到第二页才翻页;未跨页时 pageSplitX=0(单页导出) */
  const maxX = items.reduce((m, it) => Math.max(m, it.x), 0);
  return {
    steps,
    items,
    table: null,
    annots: [],
    userAnswers: {},
    pageSplitX: maxX >= 1132 ? 1132 : 0,
    sessionId: plan.session_id || undefined,
  };
}
