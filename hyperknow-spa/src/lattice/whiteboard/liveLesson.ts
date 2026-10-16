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
import { diagramBox, renderDiagram } from './diagram';
import { sanitizeNarration } from './sanitizeNarration';
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

/* 与演示板书同一套栏目网格(列宽 320 + 间距 40,彻底杜绝列间水平交叉重叠) */
const COL_X = [60, 420, 780, 1180, 1540];
const COL_W = 320;
const COL_MAX_H = 580; // 留出充足安全区，绝不越过视口下边界
const MAX_LINE_UNITS = 30; // 320px 列宽 / 19px 汉字 ≈ 16.8 字; 1 汉字 = 1.9 单元, 16 * 1.9 = 30.4
const COL_TOP = 94;
const BODY_LINE_H = 19 * 1.24;
/** 卡片正文行数安全上限:只防模型失控输出撑爆整块板(正常卡片 4-6 条要点远低于此);
 * 超出以省略号标明。旧上限 10 行且无省略号——长卡片在句中静默断掉,学员看不到后半段。 */
const CARD_BODY_MAX_LINES = 48;
/** 卡片标题至少带这么多行正文同列落位,避免标题孤悬列底、正文跑到下一列 */
const CARD_HEAD_LINES = 3;

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

function charUnits(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff01 && code <= 0xff60) ||
    (code >= 0x20000 && code <= 0x2fa1f)
  ) {
    return 1.9; // 汉字与全角标点按 1.9 单元计算
  }
  if (ch === ' ' || ch === '\t') return 0.5;
  if ('ilj.,:;\'"!()[]{}|'.includes(ch)) return 0.5;
  if ('mwMW@#%&'.includes(ch)) return 1.3;
  return 1.0;
}

/** 避头:这些标点不得出现在行首——超宽时悬挂在上一行行尾(至多溢出一个标点宽) */
const NO_LINE_START = new Set('，。、；：！？）》」』】〉”’,.;:!?)%…～');
/** 避尾:开括号/开引号不得孤零零留在行尾,随下一字换到下一行 */
const NO_LINE_END = new Set('（《「『【〈“‘(');
/** 中文段落里的数字/拉丁串(9900、95%、0.16、step-2)作为不可拆分的词;其余逐字 */
const CJK_SEGMENT = /[A-Za-z0-9][A-Za-z0-9.%/_+\-=^]*|[\s\S]/gu;

/** 按行宽把 run 序列折行:拉丁按词折,CJK 逐字折(数字串不拆、避头尾),与 DOM 真实渲染换行 1:1 对齐。
 * 旧实现中文段内逐字硬折:「9900名」被拆成「990 / 0名」、逗号落到行首,板书观感粗糙。 */
function wrapRuns(runs: Run[], maxUnits = MAX_LINE_UNITS, maxLines = 10): Rich[] {
  const lines: Rich[] = [];
  let cur: Rich = [];
  let curUnits = 0;
  const flush = () => {
    while (cur.length && !cur[0].t.trim()) cur.shift();
    while (cur.length && !cur[cur.length - 1].t.trim()) cur.pop();
    if (cur.length) {
      lines.push(cur.map((s) => ({ ...s })));
    }
    cur = [];
    curUnits = 0;
  };

  for (const run of runs) {
    if (run.br) {
      flush();
      continue;
    }
    const parts = run.t.split(/(\s+)/).filter((p) => p !== '');
    for (const part of parts) {
      const isCjk = /[\u2e80-\u9fff\uff00-\uffef]/.test(part);
      if (isCjk) {
        for (const tok of part.match(CJK_SEGMENT) ?? []) {
          const u = [...tok].reduce((sum, ch) => sum + charUnits(ch), 0);
          if (u > maxUnits) {
            /* 超长拉丁串(长 URL 之类)放不进一行:只能逐字硬折 */
            for (const ch of tok) {
              const cu = charUnits(ch);
              if (curUnits + cu > maxUnits && cur.length) flush();
              cur.push({ t: ch, b: run.b, i: run.i });
              curUnits += cu;
            }
            continue;
          }
          if (curUnits + u > maxUnits && cur.length && !NO_LINE_START.has(tok)) {
            const carry: Rich = [];
            while (cur.length > 1 && NO_LINE_END.has(cur[cur.length - 1].t)) carry.unshift(cur.pop()!);
            flush();
            for (const c of carry) {
              cur.push(c);
              curUnits += charUnits(c.t);
            }
          }
          cur.push({ t: tok, b: run.b, i: run.i });
          curUnits += u;
        }
        continue;
      }
      const wordUnits = [...part].reduce((sum, ch) => sum + charUnits(ch), 0);
      if (curUnits + wordUnits > maxUnits && cur.length > 0) {
        flush();
        if (part.trim() === '') continue;
      }
      cur.push({ t: part, b: run.b, i: run.i });
      curUnits += wordUnits;
    }
  }
  flush();
  if (lines.length <= maxLines) return lines;
  /* 超限必须可见:末行补省略号,绝不静默截断 */
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = [...kept[maxLines - 1], { t: '…' }];
  return kept;
}

/** 卡片标题折行:22px 字体折行(单行约 25 单元),带粗体,每行独立成 rich line */
export function titleToLines(title: string): Rich[] {
  const text = title.trim();
  if (!text) return [];
  const lines = wrapRuns([{ t: text, b: true }], 25, 4);
  return lines.length ? lines : [plain(text)];
}

/** HTML 卡片正文 → 手写板书行(结构性标签成行、strong/h* 加粗、br/块界换行)。 */
export function htmlToLines(html: string): Rich[] {
  try {
    if (typeof DOMParser === 'undefined') {
      /* 无 DOM 的环境(Node 契约测试):块级标签/换行作断行,其余标签剥除,按纯文本折行 */
      const runs: Run[] = [];
      for (const seg of html.split(/<(?:br\s*\/?|\/?(?:p|div|li|h[1-6]|ul|ol|tr)\b[^>]*)>/i)) {
        const t = seg.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        if (t) runs.push({ t }, { t: '', br: true });
      }
      return wrapRuns(runs, MAX_LINE_UNITS, CARD_BODY_MAX_LINES);
    }
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root) return [];
    const runs: Run[] = [];
    root.childNodes.forEach((c) => collectRuns(c, {}, runs));
    return wrapRuns(runs, MAX_LINE_UNITS, CARD_BODY_MAX_LINES);
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

  const ensureSpace = (h: number): void => {
    // 若当前列已有内容(y > 94)，且再加上此元素高度后会溢出 COL_MAX_H，主动移至下一列顶部
    if (cursor.y > 94 && cursor.y + h > COL_MAX_H && cursor.col < COL_X.length - 1) {
      cursor.col += 1;
      cursor.y = 94;
    }
  };

  const advance = (h: number): void => {
    cursor.y += h + 28;
    if (cursor.y > COL_MAX_H && cursor.col < COL_X.length - 1) {
      cursor.col += 1;
      cursor.y = 94;
    }
  };

  plan.steps.forEach((step, idx) => {
    const id = idx + 1;
    const action = step.board_action;
    /* 旁白净化(LLM 偶发漏 HTML 标签进 spoken_text):字幕/面板/TTS 同源,剥标签防朗读事故 */
    const narrationText = sanitizeNarration(step.spoken_text);
    const chipText = L('Board note', '板书');
    const panel: LessonStep['panel'] = [
      { id: `chip-live-${id}`, kind: 'chip', chipIcon: 'pencil', chipText },
      { id: `m-live-${id}`, kind: 'msg', text: plain(narrationText) },
    ];
    if (action.type === 'card') {
      const titleLines = action.title ? titleToLines(action.title) : [];
      const body = action.content ? htmlToLines(action.content) : [];
      const titleH = titleLines.length ? titleLines.length * 22 * 1.24 + 14 : 0;
      const totalCardH = titleH + body.length * BODY_LINE_H;

      // 标题与正文捆绑前置检查:整卡放得进一列就整卡换列;比一整列还高的长卡片,
      // 至少保证标题带着开头几行正文同列落位
      ensureSpace(
        totalCardH <= COL_MAX_H - COL_TOP
          ? totalCardH
          : titleH + Math.min(body.length, CARD_HEAD_LINES) * BODY_LINE_H,
      );

      if (titleLines.length) {
        items.push({ id: `c${id}t`, step: id, size: 22, weight: 700, color: VIOLET, lines: titleLines, w: COL_W, x: COL_X[cursor.col], y: cursor.y });
        cursor.y += titleH;
      }
      /* 正文超出本列剩余高度时按列续排(同一步一起写出),内容一行不丢 */
      let rest = body;
      let part = 0;
      while (rest.length) {
        const lastCol = cursor.col >= COL_X.length - 1;
        const room = lastCol ? rest.length : Math.floor((COL_MAX_H - cursor.y) / BODY_LINE_H);
        if (room < 1) {
          cursor.col += 1;
          cursor.y = COL_TOP;
          continue;
        }
        const chunk = rest.slice(0, room);
        rest = rest.slice(chunk.length);
        items.push({ id: part === 0 ? `c${id}b` : `c${id}b${part}`, step: id, size: 19, w: COL_W, lines: chunk, x: COL_X[cursor.col], y: cursor.y });
        part += 1;
        if (rest.length) {
          cursor.col += 1;
          cursor.y = COL_TOP;
        } else {
          advance(chunk.length * BODY_LINE_H);
        }
      }
      if (!body.length && titleLines.length) advance(0);
    } else if (action.type === 'formula') {
      const latex = action.latex ?? action.content ?? '';
      /* 高度估算:KaTeX 实际高度渲染后才知道,布局先按结构保守估(换行阵列/分式/
       * 求和积分矩阵都显著增行高),宁可留白不可压盖下一个元素 */
      const rows = (latex.match(/\\\\/g) || []).length;
      const stacks = (latex.match(/\\frac|\\sqrt|\\sum|\\int|\\prod|\\begin\{/g) || []).length;
      const formH = Math.min(240, 64 + rows * 26 + stacks * 14);
      ensureSpace(formH);
      items.push({
        id: `f${id}`,
        step: id,
        size: 16,
        mono: true, // 书写节奏/导出文本沿用等宽语义;Board 渲染走 formula 分支
        formula: { latex },
        w: COL_W,
        lines: [plain(latex)],
        x: COL_X[cursor.col],
        y: cursor.y,
      });
      advance(formH);
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
            .replace(/[[\](){}"']/g, '')
            .trim();
          if (cleaned) naturalFallbackText.push(cleaned);
        }
      }
      const fallbackDisplayLines = naturalFallbackText.length
        ? naturalFallbackText.slice(0, 5).map(plain)
        : [plain(sanitizeNarration(action.title ?? '') || narrationText || 'Structured Concept Flow')];

      const rendered = renderDiagram(code);
      const diagH = rendered ? diagramBox(rendered, COL_W).h : fallbackDisplayLines.length * 14 * 1.24;
      ensureSpace(diagH);
      items.push({
        id: `d${id}`,
        step: id,
        size: 14,
        w: COL_W,
        diagram: code,
        lines: fallbackDisplayLines,
        x: COL_X[cursor.col],
        y: cursor.y,
      });
      advance(diagH);
    } else if (action.type === 'image') {
      const caption = action.caption ?? action.title ?? '';
      const prompt = action.prompt ?? '';
      const isFailed = Boolean((action as { failed?: boolean }).failed);
      const status: 'pending' | 'ready' | 'failed' = action.url
        ? 'ready'
        : isFailed
        ? 'failed'
        : 'pending';

      const imgH = 260;
      ensureSpace(imgH);
      items.push({
        id: `img${id}`,
        step: id,
        size: 14,
        w: COL_W,
        image: {
          url: action.url,
          status,
          caption: caption || prompt,
          prompt,
          width: action.width ?? 320,
          height: action.height ?? 220,
        },
        lines: [
          plain(caption ? `[${caption}]` : '[Visual Note]'),
          plain(prompt || narrationText),
        ],
        x: COL_X[cursor.col],
        y: cursor.y,
      });
      advance(imgH);
    }

    /* 本步内容已落到第二页(x≥1180)→ 该步开讲时翻页;只翻一次 */
    const needPan = COL_X[cursor.col] >= 1180 && !plannedPan;
    if (needPan) plannedPan = true;

    const lessonStep: LessonStep = {
      id,
      panel,
      caption: plain(narrationText),
      beat: 400,
      /* 服务端 step_id:举手插话把它作为答疑上下文(演示步没有) */
      sid: step.step_id,
      ...(needPan ? { pan: true } : {}),
    };

    if (action.type === 'quick_check') {
      const rawOptions = (action.options ?? []).length >= 2 ? (action.options as string[]) : [];
      /* 题面/选项/解析同样走净化——答错解析会被朗读并上屏 */
      const options = rawOptions.map(sanitizeNarration).filter(Boolean);
      if (options.length >= 2) {
        lessonStep.awaitChoice = {
          question: sanitizeNarration(action.question ?? '') || L('Quick check', '快速检查'),
          options,
          answer: Math.min(Math.max(action.answer ?? 0, 0), options.length - 1),
          explanation: (action as { explanation?: string }).explanation
            ? sanitizeNarration((action as { explanation?: string }).explanation!)
            : undefined,
        };
      }
    }

    const aType = action.type as string;
    if (
      aType === 'question' ||
      aType === 'await_answer' ||
      Boolean((step as unknown as { await_answer?: boolean }).await_answer) ||
      Boolean((step as unknown as { awaitAnswer?: boolean }).awaitAnswer)
    ) {
      lessonStep.awaitAnswer = true;
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
    pageSplitX: maxX >= 1180 ? 1180 : 0,
    sessionId: plan.session_id || undefined,
  };
}
