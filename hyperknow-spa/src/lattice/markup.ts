// 导师回复富文本解析(纯模块,零 import,可在 node --test 下直接加载)。
// 后端 prompt 契约(prompts.ts):回复 = 标准 Markdown + <div content-section="…">
// HTML 容器 + <diagram> 视觉标签 + $/$$ 数学。本模块把混合文本解析为节点树,
// 渲染层(Markup.tsx)映射为 React 元素——文本永远作纯文本节点插入,
// 绝不拼 HTML 字符串,XSS 天然免疫。
//
// 流式安全:解析器每帧都在不完整文本上重跑;结尾的半截标签(如 "<div content-sec")
// 被吞掉不出街,等下一帧补全后再现;未闭合的区块/行内样式按已有内容即席闭合。

/** 行内片段:纯文本 + 叠加的样式位(由 HTML 标签与 Markdown 记号共同置位)。 */
export interface MarkupInline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  math?: boolean;
  link?: string;
}

export type MarkupBlock =
  | { kind: 'p'; inlines: MarkupInline[] }
  | { kind: 'heading'; level: 2 | 3 | 4; inlines: MarkupInline[] }
  | { kind: 'list'; ordered: boolean; items: MarkupInline[][] }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'quote'; inlines: MarkupInline[] }
  | { kind: 'math'; text: string }
  /** HTML 表格(模型在区块内实际会输出,虽未列入 prompt 白名单) */
  | { kind: 'table'; head: MarkupInline[][] | null; rows: MarkupInline[][][] }
  /** <div content-section="…"> 教学区块 */
  | { kind: 'section'; section: string; blocks: MarkupBlock[] }
  /** <diagram> 视觉命令标签:只保留元数据,正文(mermaid 源码等)不上屏 */
  | { kind: 'diagram'; subtype: string; caption: string };

interface InlineBase {
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (whole, name: string) => ENTITIES[name] ?? whole);
}

function plain(text: string, base: InlineBase = {}): MarkupInline {
  const inl: MarkupInline = { text: decodeEntities(text) };
  if (base.bold) inl.bold = true;
  if (base.italic) inl.italic = true;
  if (base.code) inl.code = true;
  return inl;
}

/** 行内记号扫描:`code` / **bold** / __bold__ / *em* / $math$ / [text](url)。 */
const INLINE_RE =
  /(`+)([^`]+?)\1|\*\*([^*\n]+?)\*\*|__([^_\n]+?)__|\*(\S(?:[^*\n]*?\S)?)\*(?!\*)|\$\$([^$\n]+?)\$\$|\$([^$\n]+?)\$|\[([^\]\n]+?)\]\(([^)\s]+?)\)/g;

function safeHref(url: string): string | undefined {
  return /^(https?:|mailto:|\/)/i.test(url) ? url : undefined;
}

export function parseInline(text: string, base: InlineBase = {}): MarkupInline[] {
  const out: MarkupInline[] = [];
  let last = 0;
  INLINE_RE.lastIndex = 0;
  for (let m = INLINE_RE.exec(text); m; m = INLINE_RE.exec(text)) {
    if (m.index > last) out.push(plain(text.slice(last, m.index), base));
    if (m[1] !== undefined) {
      out.push({ ...plain(m[2], base), code: true });
    } else if (m[3] !== undefined) {
      out.push({ ...plain(m[3], base), bold: true });
    } else if (m[4] !== undefined) {
      out.push({ ...plain(m[4], base), bold: true });
    } else if (m[5] !== undefined) {
      out.push({ ...plain(m[5], base), italic: true });
    } else if (m[6] !== undefined) {
      out.push({ ...plain(m[6], base), math: true });
    } else if (m[7] !== undefined) {
      out.push({ ...plain(m[7], base), math: true });
    } else if (m[8] !== undefined) {
      const inl = plain(m[8], base);
      const href = safeHref(m[9]);
      if (href) inl.link = href;
      out.push(inl);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(plain(text.slice(last), base));
  return out;
}

const clampHeading = (n: number): 2 | 3 | 4 => (n <= 2 ? 2 : n === 3 ? 3 : 4);

/** Markdown 区块解析:围栏代码/标题/引用/列表/公式/段落(连续行合并,换行保留)。 */
function pushMarkdownBlocks(text: string, out: MarkupBlock[]): void {
  const lines = text.split('\n');
  let i = 0;
  let para: string[] = [];
  const flushPara = (): void => {
    const joined = para.join('\n');
    para = [];
    if (joined.trim()) out.push({ kind: 'p', inlines: parseInline(joined) });
  };
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^\s*```\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      flushPara();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // 闭合围栏(或流式 EOF)
      out.push({ kind: 'code', lang: fence[1] ?? '', text: body.join('\n') });
      continue;
    }
    if (/^\s*\$\$/.test(line)) {
      flushPara();
      const single = /^\s*\$\$(.+)\$\$\s*$/.exec(line);
      if (single) {
        out.push({ kind: 'math', text: single[1].trim() });
        i += 1;
        continue;
      }
      const body: string[] = [line.replace(/^\s*\$\$/, '')];
      i += 1;
      while (i < lines.length) {
        const end = lines[i].indexOf('$$');
        if (end !== -1) {
          body.push(lines[i].slice(0, end));
          i += 1;
          break;
        }
        body.push(lines[i]);
        i += 1;
      }
      out.push({ kind: 'math', text: body.join('\n').trim() });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      out.push({ kind: 'heading', level: clampHeading(h[1].length), inlines: parseInline(h[2]) });
      i += 1;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushPara();
      i += 1;
      continue;
    }
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (q) {
      flushPara();
      const body = [q[1]];
      i += 1;
      while (i < lines.length) {
        const q2 = /^\s*>\s?(.*)$/.exec(lines[i]);
        if (!q2) break;
        body.push(q2[1]);
        i += 1;
      }
      out.push({ kind: 'quote', inlines: parseInline(body.join('\n')) });
      continue;
    }
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const ordered = Boolean(ol);
      const items: MarkupInline[][] = [];
      while (i < lines.length) {
        const item = ordered ? /^\s*\d+[.)]\s+(.*)$/.exec(lines[i]) : /^\s*[-*+]\s+(.*)$/.exec(lines[i]);
        if (item) {
          items.push(parseInline(item[1]));
          i += 1;
          continue;
        }
        const cont = /^\s{2,}(\S.*?)\s*$/.exec(lines[i]);
        if (cont && items.length) {
          items[items.length - 1].push(plain(` ${cont[1]}`));
          i += 1;
          continue;
        }
        break;
      }
      out.push({ kind: 'list', ordered, items });
      continue;
    }
    if (!line.trim()) {
      flushPara();
      i += 1;
      continue;
    }
    para.push(line);
    i += 1;
  }
  flushPara();
}

/** 容器内部 HTML 子集解析:p/ul/ol/li/strong/b/em/i/code/br/h1-h4/table;未知标签丢弃。 */
function parseHtmlContainer(src: string): MarkupBlock[] {
  const out: MarkupBlock[] = [];
  /** 当前区块已累积的行内片段(样式随标签开合即时生效) */
  let runs: MarkupInline[] = [];
  let list: { ordered: boolean; items: MarkupInline[][] } | null = null;
  let table: { head: MarkupInline[][] | null; rows: MarkupInline[][][]; th: boolean; row: MarkupInline[][] } | null = null;
  let bold = false;
  let italic = false;
  let code = false;
  let heading: 2 | 3 | 4 | null = null;
  const base = (): InlineBase => ({ bold: bold || undefined, italic: italic || undefined, code: code || undefined });
  const emit = (): void => {
    if (runs.length === 1 && runs[0].math && !heading) {
      // 整段只有一个公式的 <p> 升格为独立数学块
      out.push({ kind: 'math', text: runs[0].text });
    } else if (runs.length) {
      if (heading) out.push({ kind: 'heading', level: heading, inlines: runs });
      else out.push({ kind: 'p', inlines: runs });
    }
    runs = [];
    heading = null;
  };
  const flushList = (): void => {
    if (list && list.items.length) {
      const items = list.items.filter((item) => item.some((inl) => inl.text.trim()));
      if (items.length) out.push({ kind: 'list', ordered: list.ordered, items });
    }
    list = null;
  };
  const flushTable = (): void => {
    if (table && (table.head || table.rows.length)) {
      out.push({ kind: 'table', head: table.head, rows: table.rows });
    }
    table = null;
  };
  let i = 0;
  while (i < src.length) {
    if (src[i] === '<') {
      const rest = src.slice(i);
      const tag = /^<\/?([a-zA-Z][a-zA-Z0-9]*)[^<>]*>/.exec(rest);
      if (!tag) {
        if (src.indexOf('>', i) === -1) break; // 流式半截标签:吞尾等下一帧
        runs.push(plain('<', base()));
        i += 1;
        continue;
      }
      const name = tag[1].toLowerCase();
      const closing = tag[0][1] === '/';
      if (!closing) {
        switch (name) {
          case 'p':
            emit();
            break;
          case 'br':
            runs.push(plain('\n', base()));
            break;
          case 'ul':
            emit();
            flushList();
            flushTable();
            list = { ordered: false, items: [] };
            break;
          case 'ol':
            emit();
            flushList();
            flushTable();
            list = { ordered: true, items: [] };
            break;
          case 'li':
            emit();
            if (!list) list = { ordered: false, items: [] };
            list.items.push([]);
            break;
          case 'table':
            emit();
            flushList();
            table = { head: null, rows: [], th: false, row: [] };
            break;
          case 'tr':
            emit();
            if (!table) table = { head: null, rows: [], th: false, row: [] };
            table.row = [];
            table.th = false;
            break;
          case 'th':
          case 'td':
            if (name === 'th' && table) table.th = true;
            if (!table) table = { head: null, rows: [], th: false, row: [] };
            table.row.push([]);
            break;
          case 'thead':
          case 'tbody':
          case 'tfoot':
            if (!table) table = { head: null, rows: [], th: false, row: [] };
            break;
          case 'strong':
          case 'b':
            bold = true;
            break;
          case 'em':
          case 'i':
            italic = true;
            break;
          case 'code':
            code = true;
            break;
          case 'h1':
          case 'h2':
          case 'h3':
          case 'h4':
            emit();
            heading = clampHeading(Number(name[1]));
            break;
          default:
            emit();
            break;
        }
      } else {
        switch (name) {
          case 'strong':
          case 'b':
            bold = false;
            break;
          case 'em':
          case 'i':
            italic = false;
            break;
          case 'code':
            code = false;
            break;
          case 'h1':
          case 'h2':
          case 'h3':
          case 'h4':
            emit();
            break;
          case 'li': {
            if (list && runs.length) {
              list.items.push(runs);
              runs = [];
            } else emit();
            break;
          }
          case 'th':
          case 'td':
            break; // 单元格边界即闭合,文本路由已按单元格分段
          case 'tr': {
            if (table && table.row.length) {
              if (table.th && !table.head) table.head = table.row;
              else table.rows.push(table.row);
            }
            if (table) table.row = [];
            break;
          }
          case 'table':
            if (table && table.row.length) {
              if (table.th && !table.head) table.head = table.row;
              else table.rows.push(table.row);
            }
            flushTable();
            break;
          case 'ul':
          case 'ol':
            emit();
            flushList();
            break;
          case 'p':
            emit();
            break;
          default:
            emit();
            break;
        }
      }
      i += tag[0].length;
      continue;
    }
    const next = src.indexOf('<', i);
    const chunk = next === -1 ? src.slice(i) : src.slice(i, next);
    if (table) {
      // 表格上下文:标签间纯空白(<tr>\n<td> 的换行等)丢弃,其余归属当前单元格
      if (chunk.trim()) {
        if (!table.row.length) table.row.push([]);
        table.row[table.row.length - 1].push(...parseInline(chunk, base()));
      }
    } else if (list && !heading) {
      // 列表上下文:标签间纯空白(<ul>\n<li> 的换行等)丢弃,其余归属当前 li
      if (chunk.trim()) {
        if (!list.items.length) list.items.push([]);
        list.items[list.items.length - 1].push(...parseInline(chunk, base()));
      }
    } else {
      runs.push(...parseInline(chunk, base()));
    }
    i = next === -1 ? src.length : next;
  }
  emit();
  flushList();
  if (table && table.row.length) {
    if (table.th && !table.head) table.head = table.row;
    else table.rows.push(table.row);
  }
  flushTable();
  return out;
}

function findClosingDiv(rest: string, from: number): number {
  const re = /<div\b[^>]*>|<\/div>/g;
  re.lastIndex = from;
  let depth = 1;
  for (let m = re.exec(rest); m; m = re.exec(rest)) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) return m.index;
  }
  return -1;
}

function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z-]+)\s*=\s*["']([^"']*)["']/g;
  for (let m = re.exec(tag); m; m = re.exec(tag)) attrs[m[1].toLowerCase()] = m[2];
  return attrs;
}

/** 零散 HTML 标签(区块容器之外)→ Markdown 等价记号;未知标签一律丢弃。 */
function strayTagToMarkdown(_full: string, name: string, closing: boolean): string {
  switch (name) {
    case 'p':
      return '\n\n';
    case 'br':
      return '\n';
    case 'strong':
    case 'b':
      return '**';
    case 'em':
    case 'i':
      return '*';
    case 'code':
      return '`';
    case 'li':
      return closing ? '' : '\n- ';
    case 'ul':
    case 'ol':
      return '\n';
    case 'table':
      return closing ? '\n\n' : '\n\n';
    case 'tr':
      return closing ? '' : '\n';
    case 'td':
    case 'th':
      return ' | ';
    case 'thead':
    case 'tbody':
    case 'tfoot':
      return '';
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
      return closing ? '\n\n' : '\n\n### ';
    default:
      return '';
  }
}

/** 主入口:把导师回复原文解析为区块树。 */
export function parseMarkup(src: string): MarkupBlock[] {
  const out: MarkupBlock[] = [];
  let md = '';
  const flushMd = (): void => {
    if (md.trim()) pushMarkdownBlocks(md, out);
    md = '';
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    if (/^<diagram\b/i.test(rest)) {
      const open = /^<diagram\b[^>]*>/i.exec(rest);
      if (!open) {
        if (src.indexOf('>', i) === -1) break;
        md += src[i];
        i += 1;
        continue;
      }
      flushMd();
      const attrs = parseAttrs(open[0]);
      const close = rest.indexOf('</diagram>', open[0].length);
      out.push({
        kind: 'diagram',
        subtype: (attrs['data-subtype'] ?? '').toLowerCase(),
        caption: (attrs['data-caption'] ?? '').trim(),
      });
      i += close === -1 ? rest.length : close + '</diagram>'.length;
      continue;
    }
    const divOpen = /^<div\b[^>]*>/i.exec(rest);
    if (divOpen) {
      flushMd();
      const attrs = parseAttrs(divOpen[0]);
      const close = findClosingDiv(rest, divOpen[0].length);
      const inner = close === -1 ? rest.slice(divOpen[0].length) : rest.slice(divOpen[0].length, close);
      const innerBlocks = parseHtmlContainer(inner);
      const section = (attrs['content-section'] ?? '').toLowerCase();
      if (/^[a-z_-]+$/.test(section)) out.push({ kind: 'section', section, blocks: innerBlocks });
      else out.push(...innerBlocks);
      i += close === -1 ? rest.length : close + '</div>'.length;
      continue;
    }
    if (src[i] === '<') {
      const stray = /^<\/?([a-zA-Z][a-zA-Z0-9]*)[^<>]*>/.exec(rest);
      if (stray) {
        md += strayTagToMarkdown(stray[0], stray[1].toLowerCase(), stray[0][1] === '/');
        i += stray[0].length;
        continue;
      }
      if (src.indexOf('>', i) === -1) break; // 流式半截标签:吞尾等下一帧
      md += src[i];
      i += 1;
      continue;
    }
    const next = src.indexOf('<', i);
    md += next === -1 ? src.slice(i) : src.slice(i, next);
    i = next === -1 ? src.length : next;
  }
  flushMd();
  return out;
}

/** 节点树 → 纯文本(TTS 朗读/复制到剪贴板用):结构转行,标记全剥。 */
export function markupToPlain(src: string): string {
  const blockText = (b: MarkupBlock): string => {
    switch (b.kind) {
      case 'p':
      case 'quote':
        return b.inlines.map((inl) => inl.text).join('');
      case 'heading':
        return b.inlines.map((inl) => inl.text).join('');
      case 'list':
        return b.items.map((it, idx) => `${b.ordered ? `${idx + 1}.` : '-'} ${it.map((inl) => inl.text).join('')}`).join('\n');
    case 'code':
      return b.text;
    case 'math':
      return b.text;
    case 'table': {
      const rowText = (row: MarkupInline[][]): string =>
        row.map((cell) => cell.map((inl) => inl.text).join('').trim()).join(' | ');
      const lines: string[] = [];
      if (b.head) lines.push(rowText(b.head));
      for (const row of b.rows) lines.push(rowText(row));
      return lines.join('\n');
    }
      case 'diagram':
        return b.caption ? `[${b.caption}]` : '';
      case 'section':
        return b.blocks.map(blockText).filter(Boolean).join('\n\n');
    }
  };
  return parseMarkup(src)
    .map(blockText)
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
