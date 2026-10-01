/**
 * 板书导出:把当前板书按"当前页 / 全部"渲染成位图,再落成 JPG 或
 * 交给浏览器打印(→ 另存为 PDF)。
 *
 * 为什么用 Canvas 重画而不是截 DOM:板书是绝对定位的 div + 内联 SVG,
 * 世界坐标(2200×1300)与屏幕上的缩放/平移无关;直接从数据重画可以不依赖
 * 当前视口、也不受 transform 过渡动画影响,导出结果稳定。
 * 字体用页面已加载的 Caveat/Handlee(先 await document.fonts)。
 */
import { BOARD_ANNOTS, getBoardItems, getBoardTable, INK, type BoardAnnot, type BoardItem, type BoardTable, type Rich } from './whiteboard/lessonScript';
import { diagramBox, renderDiagram } from './whiteboard/diagram';
import { L } from './i18n/content';
import { downloadBlob } from './actions';
import { toast } from './toast';

export interface BoardSnapshot {
  step: number;
  standardFont: boolean;
  dots: boolean;
  tableRows: number;
  panX: number;
  /** 板书数据源(演示脚本或直播计划);缺省回退演示脚本,老调用零改动 */
  items?: BoardItem[];
  table?: BoardTable | null;
  annots?: BoardAnnot[];
  /** 第二页起点 x;0/缺省 = 单页(演示课为 1132) */
  pageSplitX?: number;
}

export type ExportFormat = 'jpg' | 'pdf';
export type ExportPage = 'current' | 'all';

const SCALE = 2;
const PAD = 48;
const WORLD_W = 2200;
const WORLD_H = 1300;
/** 板书分两页:左半页(修辞三角)与右半页(听众/信息)。 */
const PAGE_SPLIT = 1100;
const MONO_LH = 25;
const ANNOT_COLOR = '#C44918';

const HAND = '"Caveat", "Segoe Print", cursive';
const TABLE_HAND = '"Handlee", "Caveat", cursive';
const SANS = '"Satoshi", "MiSans", "PingFang SC", "Microsoft YaHei", -apple-system, sans-serif';
const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';

interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

async function ensureFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load('400 30px Caveat'),
      document.fonts.load('700 30px Caveat'),
      document.fonts.load('400 30px Handlee'),
      document.fonts.load('400 30px Satoshi'),
      document.fonts.load('700 30px Satoshi'),
    ]);
    await document.fonts.ready;
  } catch {
    /* 字体加载失败 → 用回退字体导出 */
  }
}

function itemFont(item: BoardItem, seg: Rich[number], standardFont: boolean): { font: string; size: number; lh: number } {
  const size = item.mono || !standardFont ? item.size : Math.round(item.size * 0.8);
  const lh = item.mono ? MONO_LH : item.size * 1.24;
  const family = item.mono ? MONO : standardFont ? SANS : HAND;
  const weight = seg.b || seg.red || item.weight === 700 ? 700 : item.weight ?? 400;
  const italic = seg.i || seg.red ? 'italic ' : '';
  return { font: `${italic}${weight} ${size}px ${family}`, size, lh };
}

/** 把一行文字画在行盒里(行盒高度 lh,字体在行盒里垂直居中)。 */
function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, yTop: number, lh: number, size: number, color: string): void {
  const m = ctx.measureText('Hg');
  const asc = m.fontBoundingBoxAscent || size * 0.8;
  const desc = m.fontBoundingBoxDescent || size * 0.2;
  ctx.fillStyle = color;
  ctx.fillText(text, x, yTop + (lh - (asc + desc)) / 2 + asc);
}

function drawHighlight(ctx: CanvasRenderingContext2D, x: number, yTop: number, w: number, lh: number): void {
  ctx.fillStyle = '#FCF6DA';
  ctx.fillRect(x - 2, yTop + lh * 0.08, w + 4, lh * 0.88);
}

function drawItem(ctx: CanvasRenderingContext2D, item: BoardItem, standardFont: boolean): void {
  item.lines.forEach((line, li) => {
    const yTop = item.y + li * (item.mono ? MONO_LH : item.size * 1.24);
    let x = item.x;
    for (const seg of line) {
      const { font, size, lh } = itemFont(item, seg, standardFont);
      ctx.font = font;
      const w = ctx.measureText(seg.t).width;
      if (seg.hl) drawHighlight(ctx, x, yTop, w, lh);
      drawText(ctx, seg.t, x, yTop, lh, size, seg.red ? '#C0392B' : item.color ?? INK);
      x += w;
    }
  });
}

function itemWidth(ctx: CanvasRenderingContext2D, item: BoardItem, standardFont: boolean): number {
  let max = 0;
  for (const line of item.lines) {
    let w = 0;
    for (const seg of line) {
      const { font } = itemFont(item, seg, standardFont);
      ctx.font = font;
      w += ctx.measureText(seg.t).width;
    }
    max = Math.max(max, w);
  }
  return max;
}

const wob = (v: number, i: number): number => v + (i % 2 ? 1.4 : -1.2);

function drawTable(ctx: CanvasRenderingContext2D, table: BoardTable, standardFont: boolean, rowsShown: number): void {
  const W = table.colW.reduce((a, b) => a + b, 0);
  const H = table.rowH.reduce((a, b) => a + b, 0);
  const xs = [0, table.colW[0], table.colW[0] + table.colW[1], W];
  const ys = [0, table.rowH[0], table.rowH[0] + table.rowH[1], table.rowH[0] + table.rowH[1] + table.rowH[2], H];

  ctx.save();
  ctx.translate(table.x, table.y);
  ctx.strokeStyle = '#B9B9B9';
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  xs.forEach((lx, i) => {
    ctx.moveTo(wob(lx, i), 2);
    ctx.lineTo(wob(lx, i + 1), H - 2);
  });
  ys.forEach((ly, i) => {
    ctx.moveTo(2, wob(ly, i));
    ctx.lineTo(W - 2, wob(ly, i + 1));
  });
  ctx.stroke();
  ctx.restore();

  const size = standardFont ? 15 : 18.5;
  const family = standardFont ? SANS : TABLE_HAND;
  const lh = size * 1.12;
  const padX = standardFont ? 5 : 7;
  const padY = 4;

  table.cells.forEach((row, ri) => {
    if (ri >= rowsShown) return;
    let cy = 0;
    for (let i = 0; i < ri; i++) cy += table.rowH[i];
    row.forEach((cell, ci) => {
      let cx = 0;
      for (let i = 0; i < ci; i++) cx += table.colW[i];
      const maxW = table.colW[ci] - padX * 2;
      const weight = ri === 0 || cell.hl ? 700 : standardFont ? 500 : 400;
      ctx.font = `${weight} ${size}px ${family}`;
      const breakAnywhere = /[\u3000-\u9fff\uff00-\uffef]/.test(cell.t);
      const lines = cell.sw && standardFont ? cell.sw : wrapCell(ctx, cell.t, maxW, breakAnywhere);
      lines.forEach((text, li) => {
        const x = table.x + cx + padX;
        const yTop = table.y + cy + padY + li * lh;
        if (cell.hl) drawHighlight(ctx, x, yTop, ctx.measureText(text).width, lh);
        drawText(ctx, text, x, yTop, lh, size, '#424242');
      });
    });
  });
  ctx.restore();
}

function wrapCell(ctx: CanvasRenderingContext2D, text: string, maxW: number, breakAnywhere: boolean): string[] {
  const parts = breakAnywhere ? Array.from(text) : text.split(' ');
  const sep = breakAnywhere ? '' : ' ';
  const lines: string[] = [];
  let cur = '';
  for (const part of parts) {
    const next = cur ? cur + sep + part : part;
    if (cur && ctx.measureText(next).width > maxW) {
      lines.push(cur);
      cur = part;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawAnnots(ctx: CanvasRenderingContext2D, annots: BoardAnnot[], step: number): void {
  ctx.save();
  ctx.strokeStyle = ANNOT_COLOR;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (const an of annots) {
    if (an.step > step) continue;
    ctx.beginPath();
    if (an.kind === 'circle') {
      const rx = an.w / 2 - 3;
      const ry = an.h / 2 - 3;
      const cx = an.x + an.w / 2;
      const cy = an.y + an.h / 2;
      ctx.moveTo(cx - rx, cy);
      ctx.bezierCurveTo(cx - rx, cy - ry * 1.15, cx - rx * 0.5, cy - ry * 1.05, cx, cy - ry);
      ctx.bezierCurveTo(cx + rx * 0.6, cy - ry * 1.1, cx + rx, cy - ry * 0.55, cx + rx * 0.97, cy);
      ctx.bezierCurveTo(cx + rx * 1.05, cy + ry * 0.6, cx + rx * 0.45, cy + ry * 1.1, cx - 1, cy + ry * 0.98);
      ctx.bezierCurveTo(cx - rx * 0.55, cy + ry * 1.08, cx - rx * 1.02, cy + ry * 0.5, cx - rx, cy + 1);
    } else {
      const w = an.w;
      const x = an.x;
      const y = an.y;
      ctx.moveTo(x + 2, y + 3);
      ctx.quadraticCurveTo(x + w * 0.25, y + 6, x + w * 0.5, y + 3.5);
      ctx.quadraticCurveTo(x + w * 0.75, y + 1, x + w - 2, y + 4);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function contentCrop(ctx: CanvasRenderingContext2D, snap: BoardSnapshot): Crop {
  const items = snap.items ?? getBoardItems();
  const table = snap.table !== undefined ? snap.table : getBoardTable();
  const annots = snap.annots ?? BOARD_ANNOTS;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (x: number, y: number, w: number, h: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + w);
    y1 = Math.max(y1, y + h);
  };
  for (const item of items) {
    if (item.step > snap.step) continue;
    if (item.diagram) {
      const r = renderDiagram(item.diagram);
      if (r) {
        const box = diagramBox(r);
        grow(item.x, item.y, box.w, box.h);
        continue;
      }
    }
    if (item.image) {
      grow(item.x, item.y, item.image.width ?? 340, item.image.height ?? 240);
      continue;
    }
    const lh = item.mono ? MONO_LH : item.size * 1.24;
    grow(item.x, item.y, itemWidth(ctx, item, snap.standardFont), item.lines.length * lh);
  }
  if (table && table.step <= snap.step) {
    grow(table.x, table.y, table.colW.reduce((a, b) => a + b, 0), table.rowH.reduce((a, b) => a + b, 0));
  }
  for (const an of annots) {
    if (an.step <= snap.step) grow(an.x, an.y, an.w, an.h);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 900, h: 700 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function cropFor(ctx: CanvasRenderingContext2D, page: ExportPage, snap: BoardSnapshot): Crop {
  const content = contentCrop(ctx, snap);
  const split = snap.pageSplitX ?? PAGE_SPLIT;
  const x0 = page === 'all' ? 0 : snap.panX > 0 ? split : 0;
  const x1 = page === 'all' ? WORLD_W : snap.panX > 0 ? WORLD_W : split;
  const left = Math.max(x0, Math.min(content.x - PAD, x1));
  const right = Math.min(x1, Math.max(content.x + content.w + PAD, x0));
  const top = Math.max(0, content.y - PAD);
  const bottom = Math.min(WORLD_H, content.y + content.h + PAD);
  return { x: left, y: top, w: Math.max(120, right - left), h: Math.max(120, bottom - top) };
}

/* 插图光栅化:SVG data URL → Image(浏览器安全模型要求异步解码)。
 * SVG-in-img 取不到文档 webfont,文字落系统 cursive 回退——如实记录。 */
const diagramImgCache = new Map<string, HTMLImageElement>();

async function diagramImage(svg: string): Promise<HTMLImageElement | null> {
  const cached = diagramImgCache.get(svg);
  if (cached) return cached;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  try {
    await img.decode();
  } catch {
    return null;
  }
  diagramImgCache.set(svg, img);
  return img;
}

async function renderBoard(page: ExportPage, snap: BoardSnapshot): Promise<HTMLCanvasElement> {
  const items = snap.items ?? getBoardItems();
  const table = snap.table !== undefined ? snap.table : getBoardTable();
  const annots = snap.annots ?? BOARD_ANNOTS;
  const measure = document.createElement('canvas').getContext('2d')!;
  const crop = cropFor(measure, page, snap);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(crop.w * SCALE);
  canvas.height = Math.round(crop.h * SCALE);
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FCFCFC';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(SCALE, SCALE);
  ctx.translate(-crop.x, -crop.y);

  if (snap.dots) {
    ctx.save();
    ctx.fillStyle = '#E5E7EB';
    for (let x = 0; x <= WORLD_W; x += 24) {
      for (let y = 0; y <= WORLD_H; y += 24) {
        if (x < crop.x - 8 || x > crop.x + crop.w + 8 || y < crop.y - 8 || y > crop.y + crop.h + 8) continue;
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* 插图先光栅化(异步),文本/表格/圈注同步画 */
  const diagrams = new Map<string, HTMLImageElement | null>();
  for (const item of items) {
    if (!item.diagram || item.step > snap.step) continue;
    const r = renderDiagram(item.diagram);
    if (r) diagrams.set(item.id, await diagramImage(r.svg));
  }

  for (const item of items) {
    if (item.step > snap.step) continue;
    const img = item.diagram ? diagrams.get(item.id) : undefined;
    if (item.diagram && img) {
      const r = renderDiagram(item.diagram)!;
      const box = diagramBox(r);
      ctx.drawImage(img, item.x, item.y, box.w, box.h);
    } else if (item.image) {
      // 真实生图在 Canvas 导出时绘制占位或已加载图像
      ctx.save();
      ctx.fillStyle = '#F3F4F6';
      ctx.strokeStyle = '#D1D5DB';
      ctx.lineWidth = 1;
      const w = item.image.width ?? 340;
      const h = item.image.height ?? 240;
      ctx.fillRect(item.x, item.y, w, h);
      ctx.strokeRect(item.x, item.y, w, h);
      if (item.image.caption) {
        ctx.fillStyle = '#6B7280';
        ctx.font = '13px ' + SANS;
        ctx.fillText(item.image.caption, item.x + 8, item.y + h - 10);
      }
      ctx.restore();
    } else {
      drawItem(ctx, item, snap.standardFont);
    }
  }
  if (table && table.step <= snap.step) {
    drawTable(ctx, table, snap.standardFont, snap.step > table.step ? 4 : snap.tableRows);
  }
  drawAnnots(ctx, annots, snap.step);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

/** 导出板书:JPG 直接下载,PDF 走浏览器打印(另存为 PDF)。 */
export async function exportBoard(format: ExportFormat, page: ExportPage, snap: BoardSnapshot): Promise<void> {
  const printWindow = format === 'pdf' ? window.open('', '_blank') : null;
  if (format === 'pdf' && !printWindow) {
    toast(L('Allow pop-ups to export as PDF', '请允许弹出窗口，才能导出 PDF'));
    return;
  }
  toast(L('Preparing the board image…', '正在生成板书图片…'));
  await ensureFonts();
  const canvas = await renderBoard(page, snap);
  const blob = await toBlob(canvas, 'image/jpeg', 0.92);
  if (!blob) {
    toast(L('Export failed — please try again', '导出失败，请重试'));
    printWindow?.close();
    return;
  }

  if (format === 'jpg') {
    downloadBlob(blob, `hyperknow-board-${page === 'all' ? 'all' : 'page'}-${Date.now()}.jpg`);
    toast(L('Board exported as JPG', '板书已导出为 JPG'));
    return;
  }

  const url = URL.createObjectURL(blob);
  const title = L('Hyperknow board', 'Hyperknow 板书');
  printWindow!.document.open();
  printWindow!.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
      '<style>@page{margin:12mm}html,body{margin:0;background:#fff}img{width:100%;height:auto;display:block}</style>' +
      `</head><body><img src="${url}" alt="${title}"></body></html>`,
  );
  printWindow!.document.close();
  const img = printWindow!.document.querySelector('img');
  const print = () => {
    try {
      printWindow!.focus();
      printWindow!.print();
    } catch {
      /* 用户已关闭打印窗口 */
    }
  };
  if (img?.complete) print();
  else img?.addEventListener('load', print);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
