// 邮件内嵌「实时评审进度」PNG 渲染器。
// 为什么是图片:HTML 邮件发出后不能执行脚本,唯一随打开时间变化的内容就是客户端
// 加载的远程图片。这里按请求现渲一张透明底 PNG(进度条 + 数字),收件人每次打开
// (客户端重新取图时)看到的就是当时的最新进度;中文说明走 alt 文本与状态页链接。
// 中文无法在图片里渲染( Workers 无字体光栅化),所以图上只放 0-9 与 % / 符号。
import { mailStatusPercent, type MailStatusState } from "./mail-status.ts";

// 2x 渲染、邮件里按 1x 显示:高分屏与客户端缩放下边缘不糊。
const W = 1200;
const H = 280;
const MARGIN = 40;
const BAR_TOP = 196;
const BAR_HEIGHT = 48;
// 圆角必须明显小于高度的一半:radius ≥ height/2 时圆角矩形退化成胶囊,
// SDF 覆盖度在内部也趋近 0(实测整条不可见)。12/48 = 四分之一,稳妥取值。
const BAR_RADIUS = 12;
const GREEN: [number, number, number] = [22, 78, 70];       // #164E46 品牌墨绿
const TRACK: [number, number, number] = [226, 233, 229];    // 进度槽浅灰绿

// 3x5 点阵字模(只够数字与少量符号;行优先,'1'=着墨)。
const GLYPHS: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  "/": ["001", "001", "010", "100", "100"],
  "%": ["101", "001", "010", "100", "101"],
  ":": ["000", "010", "000", "010", "000"],
  ".": ["000", "000", "000", "000", "010"],
  "-": ["000", "000", "111", "000", "000"],
  " ": ["000", "000", "000", "000", "000"],
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const source = new Uint8Array(new ArrayBuffer(bytes.length));
  source.set(bytes);
  const stream = new Response(source).body!.pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// 圆角矩形覆盖度(标准中心型 SDF):d < 0 在内部,d > 0 在外部,
// cover = clamp(0.5 - d) → 内部 1、边界 1px 过渡带、外部 0。
// 曾用"钳位到内矩形中心"的写法:那算的是到弧心的距离,内部点 d = -radius,
// 被 0.5 + d 钳成 0——整条进度条不可见(测试抓到的)。
function roundedRectCoverage(x: number, y: number, left: number, top: number, width: number, height: number, radius: number): number {
  const px = x + 0.5 - (left + width / 2);
  const py = y + 0.5 - (top + height / 2);
  const hw = width / 2 - radius;
  const hh = height / 2 - radius;
  const qx = Math.max(Math.abs(px) - hw, 0);
  const qy = Math.max(Math.abs(py) - hh, 0);
  const d = Math.hypot(qx, qy) - radius;
  return Math.min(Math.max(0.5 - d, 0), 1);
}

function drawText(rgba: Uint8Array, text: string, x: number, y: number, scale: number, color: [number, number, number]): void {
  let cursor = x;
  for (const char of text) {
    const glyph = GLYPHS[char];
    if (!glyph) continue;
    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < glyph[row].length; col++) {
        if (glyph[row][col] !== "1") continue;
        for (let py = 0; py < scale; py++) {
          for (let px = 0; px < scale; px++) {
            const offset = ((y + row * scale + py) * W + cursor + col * scale + px) * 4;
            rgba[offset] = color[0];
            rgba[offset + 1] = color[1];
            rgba[offset + 2] = color[2];
            rgba[offset + 3] = 255;
          }
        }
      }
    }
    cursor += 3 * scale + Math.round(scale * 0.6);
  }
}

function textWidth(text: string, scale: number): number {
  const chars = [...text].filter((c) => GLYPHS[c]);
  if (chars.length === 0) return 0;
  return chars.length * 3 * scale + (chars.length - 1) * Math.round(scale * 0.6);
}

// 纯函数:状态 → RGBA 位图(测试可在无 D1/网络下断言像素)。
export function renderMailStatusPanelRgba(state: MailStatusState): { width: number; height: number; rgba: Uint8Array } {
  const rgba = new Uint8Array(W * H * 4);
  const percent = mailStatusPercent(state);
  const left = MARGIN;
  const right = W - MARGIN;
  const trackWidth = right - left;

  // 进度槽
  for (let y = BAR_TOP; y < BAR_TOP + BAR_HEIGHT; y++) {
    for (let x = left; x < right; x++) {
      const cover = roundedRectCoverage(x, y, left, BAR_TOP, trackWidth, BAR_HEIGHT, BAR_RADIUS);
      if (cover <= 0) continue;
      const offset = (y * W + x) * 4;
      rgba[offset] = TRACK[0];
      rgba[offset + 1] = TRACK[1];
      rgba[offset + 2] = TRACK[2];
      rgba[offset + 3] = Math.round(cover * 255);
    }
  }
  // 已完成部分(percent 为 null 时不画填充:空轨 = 无数字状态的中性形态)
  if (percent !== null && percent > 0) {
    const fillWidth = Math.max(Math.round((trackWidth * percent) / 100), BAR_HEIGHT);
    for (let y = BAR_TOP; y < BAR_TOP + BAR_HEIGHT; y++) {
      for (let x = left; x < Math.min(left + fillWidth, right); x++) {
        const cover = roundedRectCoverage(x, y, left, BAR_TOP, trackWidth, BAR_HEIGHT, BAR_RADIUS);
        if (cover <= 0) continue;
        const offset = (y * W + x) * 4;
        rgba[offset] = GREEN[0];
        rgba[offset + 1] = GREEN[1];
        rgba[offset + 2] = GREEN[2];
        rgba[offset + 3] = Math.round(cover * 255);
      }
    }
  }
  // 数字:左 "已完成/总数",右 百分比;任一缺失只画有的那个
  if (typeof state.total === "number") {
    const done = Math.min(Math.max(state.done ?? 0, 0), state.total);
    drawText(rgba, `${done}/${state.total}`, left, 24, 30, GREEN);
  }
  if (percent !== null) {
    const label = `${percent}%`;
    const scale = 16;
    drawText(rgba, label, right - textWidth(label, scale), 60, scale, GREEN);
  }
  return { width: W, height: H, rgba };
}

export async function renderMailStatusPanelPng(state: MailStatusState): Promise<Uint8Array<ArrayBuffer>> {
  const { width, height, rgba } = renderMailStatusPanelRgba(state);
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const idat = await deflate(raw);
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const pieces = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0)),
  ];
  // 单块 ArrayBuffer:既避开展开运算的大数组开销,也满足 TS 对 BodyInit 的 buffer 泛型要求。
  const total = pieces.reduce((sum, piece) => sum + piece.length, 0);
  const png = new Uint8Array(total);
  let cursor = 0;
  for (const piece of pieces) {
    png.set(piece, cursor);
    cursor += piece.length;
  }
  return png;
}

export const MAIL_STATUS_PANEL = { width: W, height: H } as const;
