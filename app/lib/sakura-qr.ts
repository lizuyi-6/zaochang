// 樱花树二维码:把 QR 模块矩阵画成一棵带光影的 3D 樱花树(静态 SVG 字符串 + 落花参数)。
// 零 import——登录面板与反向邀请面板共用,测试直连(strip-types)。
//
// 可扫性纪律(装饰再多也不能让码失效):
// - 码区 + 四周 SAKURA_QR_QUIET 个模块的静区只放两种东西:浅色树冠底(亮模块)与
//   深色樱花(暗模块)。每个暗模块恰好一朵花、花心落在模块中心;亮模块不画任何东西。
// - 树冠花团、树枝、地面全部在静区之外:花团圆心沿静区矩形的外法向放置,到静区的
//   距离 ≥ 半径(构造保证 + 渲染前过滤),且静区矩形在所有装饰之后用同一渐变重绘一遍
//   兜底,任何越界(含投影、花团上的小花)都会被盖掉。
// - 定位图形保留 1:1:3:1:1 的明暗结构,只做小圆角与浮雕渐变(圆角上限见 FINDER_RADII)。
// - 落花不进 SVG:由组件按 sakuraQrPetals 渲染成 HTML 元素做合成层动画(SVG 静态,
//   不随动画重绘滤镜),起点在树冠下沿之下、只往下落,不经过码区。
// 外观随机量全部由模块坐标与码尺寸派生(确定性):同一矩阵永远渲染出同一棵树。

export type QrModuleMatrix = { size: number; data: ArrayLike<number | boolean> };
export type SakuraPuff = { cx: number; cy: number; r: number; tone: 0 | 1 | 2 | 3; layer: 0 | 1 | 2 };
export type SakuraPetal = { left: number; top: number; fall: number; drift: number; delay: number; duration: number; tone: number };
type Rect = { x0: number; y0: number; x1: number; y1: number };

export const SAKURA_QR_QUIET = 2;
export const SAKURA_QR_FINDER = 7;
// 纠错等级 Q(25%):装饰不占纠错预算(每个模块的花心都按真值着色),余量留给屏幕反光/摩尔纹。
// 对比实测(zxing-cpp / WeChatQRCode,6 个 URL × 12 种拍屏劣化):Q 与 H 持平或略好,且模块更大。
export const SAKURA_QR_ERROR_CORRECTION = "Q";

const GAP = 0.2;
const PAD = 0.6;
const TRUNK_LENGTH = 11;
const GROUND_BAND = 3.6;
const CORNER_WEIGHT = 3;
// 暗模块樱花的半径(模块为 1):> 0.5 让相邻暗模块的花瓣交叠成簇,花心始终在模块中心。
const BLOSSOM_SCALE = 1.2;
// 定位图形圆角(外环外沿 / 外环内沿 / 内核)。实测圆角越大,严格解码器(OpenCV)越难
// 认出定位图形:1.9/1.05/0.9 时 2x 屏 2/72,0.35/0.18/0.2 时 71/72(直角 72/72),不要再放大。
const FINDER_RADII = [0.35, 0.18, 0.2] as const;

// 点到轴对齐矩形的距离(点在矩形内为 0)。
export function distanceToRect(x: number, y: number, rect: Rect) {
  const dx = Math.max(rect.x0 - x, 0, x - rect.x1);
  const dy = Math.max(rect.y0 - y, 0, y - rect.y1);
  return Math.hypot(dx, dy);
}

export function isFinderModule(row: number, col: number, size: number) {
  const f = SAKURA_QR_FINDER;
  return (row < f && col < f) || (row < f && col >= size - f) || (row >= size - f && col < f);
}

function rand(a: number, b: number, salt = 0) {
  let h = (Math.imul(a + 1, 374761393) + Math.imul(b + 7, 668265263) + Math.imul(salt + 3, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const n = (value: number) => String(Math.round(value * 100) / 100);
const lerp = (range: readonly [number, number], t: number) => range[0] + (range[1] - range[0]) * t;

type Side = "top" | "right" | "bottom" | "left";
type PerimeterPoint = { px: number; py: number; nx: number; ny: number; side: Side; t: number; corner: boolean };

// 沿静区矩形外缘走一圈:四条边给边法向,四个角把法向在 90° 内扫过(角按 CORNER_WEIGHT 计长度)。
// 侧边的 t 统一为"自上而下"0→1,顶/底边为左→右/右→左。
function perimeterPoint(R: Rect, s: number): PerimeterPoint {
  const w = R.x1 - R.x0;
  const h = R.y1 - R.y0;
  const arc = (Math.PI / 2) * CORNER_WEIGHT;
  const corner = (x: number, y: number, angle: number, side: Side, t: number): PerimeterPoint => (
    { px: x, py: y, nx: Math.cos(angle), ny: Math.sin(angle), side, t, corner: true }
  );
  const segments: Array<[number, (u: number) => PerimeterPoint]> = [
    [w, (u) => ({ px: R.x0 + w * u, py: R.y0, nx: 0, ny: -1, side: "top", t: u, corner: false })],
    [arc, (u) => corner(R.x1, R.y0, -Math.PI / 2 + (Math.PI / 2) * u, "top", u)],
    [h, (u) => ({ px: R.x1, py: R.y0 + h * u, nx: 1, ny: 0, side: "right", t: u, corner: false })],
    [arc, (u) => corner(R.x1, R.y1, (Math.PI / 2) * u, "bottom", u)],
    [w, (u) => ({ px: R.x1 - w * u, py: R.y1, nx: 0, ny: 1, side: "bottom", t: u, corner: false })],
    [arc, (u) => corner(R.x0, R.y1, Math.PI / 2 + (Math.PI / 2) * u, "bottom", u)],
    [h, (u) => ({ px: R.x0, py: R.y1 - h * u, nx: -1, ny: 0, side: "left", t: 1 - u, corner: false })],
    [arc, (u) => corner(R.x0, R.y0, Math.PI + (Math.PI / 2) * u, "top", u)],
  ];
  let rest = s;
  for (const [length, at] of segments) {
    if (rest <= length) return at(rest / length);
    rest -= length;
  }
  return segments[0][1](0);
}

// 树冠三层花团:前层(小、亮)紧贴静区外沿,把码"嵌"进树冠;中层、后层(大、偏深)
// 逐层外扩,勾出顶部穹顶、两侧中上部外鼓、底部收拢的树冠轮廓。
const LAYERS = [
  // step, 顶/侧/底/上角/下角 半径范围, 外扩(基础, 穹顶增量)
  { step: 2.2, top: [1.5, 2.3], side: [1.4, 2.1], bottom: [1.4, 2.0], cornerTop: [1.6, 2.2], cornerBottom: [1.4, 1.9], base: [0, 0.35], dome: 0.6 },
  { step: 2.9, top: [2.0, 2.8], side: [1.8, 2.5], bottom: [1.7, 2.3], cornerTop: [2.2, 2.8], cornerBottom: [1.7, 2.1], base: [0.5, 1.5], dome: 2.0 },
  { step: 3.6, top: [2.6, 3.5], side: [2.2, 3.0], bottom: [1.9, 2.4], cornerTop: [2.6, 3.2], cornerBottom: [1.8, 2.2], base: [1.2, 2.6], dome: 3.4 },
] as const;

function crownPuffs(R: Rect, size: number): SakuraPuff[] {
  const w = R.x1 - R.x0;
  const h = R.y1 - R.y0;
  const perimeter = 2 * (w + h) + 4 * (Math.PI / 2) * CORNER_WEIGHT;
  const puffs: SakuraPuff[] = [];
  // 后层先入数组(先画,在最下面)
  for (let layer = 2; layer >= 0; layer -= 1) {
    const spec = LAYERS[layer];
    const count = Math.round(perimeter / spec.step);
    for (let i = 0; i < count; i += 1) {
      const salt = 10 + layer * 7;
      const s = ((i + 0.5 + (rand(i, size, salt) - 0.5) * 0.6) / count) * perimeter;
      const p = perimeterPoint(R, Math.min(perimeter - 0.01, Math.max(0, s)));
      const wobble = rand(i, size, salt + 1);
      const push = rand(i, size, salt + 2);
      let range: readonly [number, number];
      let dome = 0;
      let shade: number;
      if (p.corner) {
        const top = p.ny < 0;
        range = top ? spec.cornerTop : spec.cornerBottom;
        dome = top ? spec.dome * 0.35 : 0;
        shade = top ? 0 : 2;
      } else if (p.side === "top") {
        range = spec.top;
        dome = spec.dome * Math.sin(Math.PI * p.t);
        shade = 0;
      } else if (p.side === "bottom") {
        range = spec.bottom;
        dome = spec.dome * 0.15 * Math.sin(Math.PI * p.t);
        shade = 2;
      } else {
        range = spec.side;
        // 侧缘在中上部最鼓,越往下越收、越沉色
        dome = spec.dome * 0.6 * Math.sin(Math.PI * Math.min(1, p.t * 1.3));
        shade = p.t < 0.4 ? 0 : p.t < 0.75 ? 1 : 2;
      }
      const r = lerp(range, wobble);
      const extra = lerp(spec.base, push) + dome;
      const d = r + GAP + extra;
      const tone = Math.min(3, shade + (layer === 0 ? 0 : 1)) as SakuraPuff["tone"];
      puffs.push({ cx: p.px + p.nx * d, cy: p.py + p.ny * d, r, tone, layer: layer as SakuraPuff["layer"] });
    }
  }
  return puffs;
}

export function sakuraQrLayout(size: number) {
  const quiet = SAKURA_QR_QUIET;
  // 先在局部坐标(码区左上角为原点)生成树冠,再按外包框平移到画布内。
  const local: Rect = { x0: -quiet, y0: -quiet, x1: size + quiet, y1: size + quiet };
  const raw = crownPuffs(local, size);
  const minX = Math.min(...raw.map((p) => p.cx - p.r));
  const maxX = Math.max(...raw.map((p) => p.cx + p.r));
  const minY = Math.min(...raw.map((p) => p.cy - p.r));
  const maxY = Math.max(...raw.map((p) => p.cy + p.r));
  const qrX = PAD - minX;
  const qrY = PAD - minY;
  const quietRect: Rect = { x0: qrX - quiet, y0: qrY - quiet, x1: qrX + size + quiet, y1: qrY + size + quiet };
  const puffs = raw.map((p) => ({ ...p, cx: p.cx + qrX, cy: p.cy + qrY }));
  const crownBottom = maxY + qrY - 0.8;
  const groundY = crownBottom + TRUNK_LENGTH;
  return {
    width: maxX - minX + PAD * 2,
    height: groundY + GROUND_BAND,
    qrX,
    qrY,
    quietRect,
    crownBottom,
    groundY,
    puffs,
  };
}

// 落花参数(百分比坐标,相对整幅画):起点在树冠下沿之下,下落距离到地面为止。
export function sakuraQrPetals(size: number, count = 9): SakuraPetal[] {
  const { width: W, height: H, quietRect: R, crownBottom: cb, groundY: gy } = sakuraQrLayout(size);
  return Array.from({ length: count }, (_, i) => {
    const x = R.x0 + 2 + rand(i, 1, 51) * (R.x1 - R.x0 - 4);
    const y = cb + 0.4 + rand(i, 2, 52) * 1.6;
    return {
      left: (x / W) * 100,
      top: (y / H) * 100,
      fall: ((gy + 0.6 - y) / W) * 100,
      drift: ((rand(i, 5, 55) - 0.6) * 5 / W) * 100,
      delay: -rand(i, 3, 53) * 8,
      duration: 6.5 + rand(i, 4, 54) * 3.5,
      tone: i % 3,
    };
  });
}

// 单片花瓣(尖端带樱花特有的缺口),沿 +x 方向,根部在原点。
const PETAL = [
  [0.04, -0.28], [0.42, -0.38], [0.55, -0.14], [0.47, 0], [0.55, 0.14], [0.42, 0.38], [0.04, 0.28],
] as const;

function flowerPath(rotationDeg: number, scale = 1) {
  let d = "";
  for (let p = 0; p < 5; p += 1) {
    const angle = ((rotationDeg + p * 72 - 90) * Math.PI) / 180;
    const cos = Math.cos(angle) * scale;
    const sin = Math.sin(angle) * scale;
    const pt = ([u, v]: readonly [number, number]) => `${n(u * cos - v * sin)} ${n(u * sin + v * cos)}`;
    d += `M0 0C${pt(PETAL[0])} ${pt(PETAL[1])} ${pt(PETAL[2])}L${pt(PETAL[3])}L${pt(PETAL[4])}C${pt(PETAL[5])} ${pt(PETAL[6])} 0 0Z`;
  }
  return d;
}

const SINGLE_PETAL = "M-.27 0C-.15 -.22 .15 -.26 .28 -.08L.2 0L.28 .08C.15 .26 -.15 .22 -.27 0Z";

// 暗模块樱花的三套色(深玫红系;基色亮度都压在 0.36 以下,保证与浅底的明暗差)。
const BLOSSOM_PALETTES = [
  ["#e2678c", "#b3264f", "#6e0f31"],
  ["#d6557c", "#9c1b46", "#5c0b2a"],
  ["#e56c88", "#b02c48", "#70122b"],
] as const;
const BLOSSOM_ROTATIONS = [9, 33, 57] as const;

// 树冠花团四档明暗:0 迎光 → 3 背光(外层底部)。
const PUFF_TONES = [
  ["#fde8ee", "#f9d5df", "#f0b8c9"],
  ["#fadbe4", "#f5c5d3", "#e8a5ba"],
  ["#f6ccd8", "#f0b4c6", "#de8fa9"],
  ["#f0bfce", "#e7a3b9", "#cf7b98"],
] as const;
// 花团上的装饰小花:白粉 / 浅粉 / 中粉
const FLOWER_TONES = [
  ["#ffffff", "#fff2f6", "#f7c9d6"],
  ["#fff6f8", "#fcdbe4", "#f2abc0"],
  ["#fde3ea", "#f5b3c6", "#e48aa6"],
] as const;
const PETAL_COLORS = ["#f4a9bf", "#f8c4d3", "#ec93ae"] as const;

function radial(id: string, stops: readonly string[], fx = 0.34, fy = 0.3) {
  return `<radialGradient id="${id}" cx="${n(fx + 0.08)}" cy="${n(fy + 0.08)}" r=".72" fx="${fx}" fy="${fy}">${
    stops.map((color, i) => `<stop offset="${n(i / (stops.length - 1))}" stop-color="${color}"/>`).join("")
  }</radialGradient>`;
}

// 一段渐细的枝:起点宽 w1、终点宽 w2,中段沿法向弯 bend。
function limb(x1: number, y1: number, x2: number, y2: number, w1: number, w2: number, bend: number) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const nx = -(y2 - y1) / length;
  const ny = (x2 - x1) / length;
  const mx = (x1 + x2) / 2 + nx * bend;
  const my = (y1 + y2) / 2 + ny * bend;
  const wm = (w1 + w2) / 4;
  const side = (sign: number, w: number, x: number, y: number) => `${n(x + nx * w * sign / 2)} ${n(y + ny * w * sign / 2)}`;
  return `M${side(1, w1, x1, y1)}Q${n(mx + nx * wm)} ${n(my + ny * wm)} ${side(1, w2, x2, y2)}L${side(-1, w2, x2, y2)}Q${n(mx - nx * wm)} ${n(my - ny * wm)} ${side(-1, w1, x1, y1)}Z`;
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number) {
  return `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`;
}

export function renderSakuraQrSvg(matrix: QrModuleMatrix, label = "扫码登录二维码"): string {
  const size = matrix.size;
  const { width: W, height: H, qrX, qrY, quietRect: R, crownBottom: cb, groundY: gy, puffs: crown } = sakuraQrLayout(size);
  const cx = (R.x0 + R.x1) / 2;
  const dark = (row: number, col: number) => Boolean(matrix.data[row * size + col]);

  const defs: string[] = [
    `<linearGradient id="zqSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf6"/><stop offset=".7" stop-color="#fdf1f2"/><stop offset="1" stop-color="#f7edef"/></linearGradient>`,
    `<radialGradient id="zqSun" cx=".14" cy=".08" r=".55"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`,
    // 树冠底色用绝对坐标渐变:冠底、静区兜底矩形共用同一渐变,拼接处无缝。
    `<radialGradient id="zqCrown" gradientUnits="userSpaceOnUse" cx="${n(qrX + size * 0.36)}" cy="${n(qrY + size * 0.3)}" r="${n(size * 0.95)}"><stop offset="0" stop-color="#fffbfc"/><stop offset=".55" stop-color="#fdeef2"/><stop offset="1" stop-color="#f9e0e7"/></radialGradient>`,
    `<linearGradient id="zqBark" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4a2c22"/><stop offset=".28" stop-color="#97674c"/><stop offset=".55" stop-color="#6f452f"/><stop offset="1" stop-color="#2f1b15"/></linearGradient>`,
    `<radialGradient id="zqGround" cx=".5" cy=".45" r=".55"><stop offset="0" stop-color="#e6f0d6"/><stop offset=".72" stop-color="#d7e6c4"/><stop offset="1" stop-color="#d7e6c4" stop-opacity="0"/></radialGradient>`,
    `<linearGradient id="zqFinder" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b0325a"/><stop offset=".5" stop-color="#7c1339"/><stop offset="1" stop-color="#560a23"/></linearGradient>`,
    `<radialGradient id="zqDome" gradientUnits="userSpaceOnUse" cx="${n(qrX + size * 0.28)}" cy="${n(qrY + size * 0.22)}" r="${n(size * 0.9)}"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#3d0619" stop-opacity=".07"/></radialGradient>`,
    `<filter id="zqShadow" x="-2%" y="-2%" width="104%" height="104%"><feDropShadow dx=".12" dy=".16" stdDeviation=".13" flood-color="#4f0a22" flood-opacity=".32"/></filter>`,
    `<filter id="zqPuffShadow" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx=".1" dy=".35" stdDeviation=".45" flood-color="#a83c62" flood-opacity=".26"/></filter>`,
    `<filter id="zqBlur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation=".7"/></filter>`,
    `<path id="zqp" d="${SINGLE_PETAL}"/>`,
  ];
  BLOSSOM_PALETTES.forEach((palette, i) => defs.push(radial(`zqg${i}`, palette)));
  PUFF_TONES.forEach((tone, i) => defs.push(radial(`zqPuff${i}`, tone, 0.36, 0.3)));
  FLOWER_TONES.forEach((tone, i) => defs.push(radial(`zqFl${i}`, tone, 0.4, 0.36)));
  BLOSSOM_PALETTES.forEach((_, c) => {
    BLOSSOM_ROTATIONS.forEach((rotation, r) => {
      defs.push(`<g id="zqb${c * 3 + r}"><path d="${flowerPath(rotation, BLOSSOM_SCALE)}" fill="url(#zqg${c})"/><circle r=".17" fill="#4d0820"/></g>`);
    });
  });
  FLOWER_TONES.forEach((_, c) => {
    BLOSSOM_ROTATIONS.forEach((rotation, r) => {
      defs.push(`<g id="zqf${c * 3 + r}"><path d="${flowerPath(rotation)}" fill="url(#zqFl${c})"/><circle r=".11" fill="#e06a8f"/></g>`);
    });
  });

  const body: string[] = [];
  // 天空 + 左上柔光 + 远山
  body.push(`<rect width="${n(W)}" height="${n(H)}" fill="url(#zqSky)"/>`);
  body.push(`<rect width="${n(W)}" height="${n(H)}" fill="url(#zqSun)"/>`);
  body.push(`<path d="M0 ${n(gy - 3)}C${n(W * 0.2)} ${n(gy - 7.5)} ${n(W * 0.38)} ${n(gy - 4.8)} ${n(W * 0.55)} ${n(gy - 2.8)}S${n(W * 0.85)} ${n(gy - 6.6)} ${n(W)} ${n(gy - 3.8)}V${n(H)}H0Z" fill="#f3e3eb" opacity=".8"/>`);

  // 地面、树冠投影、地上落花
  body.push(`<ellipse cx="${n(cx)}" cy="${n(gy + 0.9)}" rx="${n(W * 0.48)}" ry="2.9" fill="url(#zqGround)"/>`);
  body.push(`<ellipse cx="${n(cx + 2.4)}" cy="${n(gy + 0.6)}" rx="${n(W * 0.27)}" ry="1.4" fill="#56663f" opacity=".3" filter="url(#zqBlur)"/>`);
  for (let i = 0; i < 26; i += 1) {
    const angle = rand(i, 1, 21) * Math.PI * 2;
    const dist = Math.sqrt(rand(i, 2, 22));
    const px = cx + Math.cos(angle) * dist * W * 0.41;
    const py = gy + 0.9 + Math.sin(angle) * dist * 2;
    body.push(`<use href="#zqp" fill="${PETAL_COLORS[i % 3]}" transform="translate(${n(px)} ${n(py)}) rotate(${n(rand(i, 3, 23) * 360)}) scale(${n(0.8 + rand(i, 4, 24) * 0.6)} ${n(0.45 + rand(i, 5, 25) * 0.3)})"/>`);
  }

  // 树:主干在离地约 2/3 处分叉,左右两根大枝斜展进树冠下沿(伞形),中枝直上;
  // 两根下垂小枝末梢挂花团。枝顶都藏在树冠花团后面。
  // 侧枝先画、主干后画盖住侧枝根部;主干与中枝共用绝对坐标渐变,衔接处无缝。
  const fy = cb + 4;
  const sideBark = [
    limb(cx - 1.4, fy + 0.4, cx - 17.5, cb + 2.4, 1, 0.35, -0.9),
    limb(cx + 1.6, fy + 0.2, cx + 15.5, cb + 1.6, 0.9, 0.3, 0.8),
    limb(cx - 0.4, fy + 1.2, cx - 12.5, cb - 1.4, 2.7, 1.2, -1.4),
    limb(cx + 0.7, fy + 1.1, cx + 11.5, cb - 1.8, 2.5, 1.1, 1.3),
  ];
  const trunk = [
    limb(cx + 0.2, fy - 1, cx + 1, cb - 3.6, 2.75, 1.3, 0.5),
    limb(cx, gy + 0.6, cx + 0.2, fy - 1.4, 5.6, 2.8, 0.5),
  ];
  const roots = `M${n(cx - 2.6)} ${n(gy - 0.4)}C${n(cx - 4.2)} ${n(gy)} ${n(cx - 5.8)} ${n(gy + 0.6)} ${n(cx - 7.6)} ${n(gy + 1.2)}C${n(cx - 5.4)} ${n(gy + 1.2)} ${n(cx - 3.8)} ${n(gy + 1)} ${n(cx - 1.8)} ${n(gy + 0.8)}ZM${n(cx + 2.6)} ${n(gy - 0.4)}C${n(cx + 4.2)} ${n(gy + 0.1)} ${n(cx + 5.8)} ${n(gy + 0.7)} ${n(cx + 7.2)} ${n(gy + 1.3)}C${n(cx + 5.2)} ${n(gy + 1.3)} ${n(cx + 3.7)} ${n(gy + 1.1)} ${n(cx + 1.8)} ${n(gy + 0.8)}Z`;
  defs.push(`<linearGradient id="zqTrunk" gradientUnits="userSpaceOnUse" x1="${n(cx - 2.8)}" y1="0" x2="${n(cx + 3)}" y2="0"><stop offset="0" stop-color="#4a2c22"/><stop offset=".28" stop-color="#97674c"/><stop offset=".55" stop-color="#6f452f"/><stop offset="1" stop-color="#2f1b15"/></linearGradient>`);
  body.push(`<g fill="url(#zqBark)">${sideBark.map((d) => `<path d="${d}"/>`).join("")}</g>`);
  body.push(`<g fill="url(#zqTrunk)">${trunk.map((d) => `<path d="${d}"/>`).join("")}<path d="${roots}"/></g>`);
  // 树皮纹理 + 主干左侧受光高光 + 树冠压在枝上的阴影
  body.push(`<g fill="none" stroke="#2e1a14" stroke-linecap="round" stroke-width=".16" opacity=".4"><path d="M${n(cx - 0.6)} ${n(gy - 0.4)}C${n(cx - 1)} ${n(gy - 2.6)} ${n(cx - 0.3)} ${n(gy - 4.6)} ${n(cx - 0.5)} ${n(fy - 1)}"/><path d="M${n(cx + 1.3)} ${n(gy - 1)}C${n(cx + 1)} ${n(gy - 3)} ${n(cx + 1.5)} ${n(gy - 4.8)} ${n(cx + 1.2)} ${n(fy - 0.6)}"/></g>`);
  body.push(`<path d="M${n(cx - 1.9)} ${n(gy - 0.3)}C${n(cx - 2)} ${n(gy - 2.6)} ${n(cx - 1.7)} ${n(gy - 4.8)} ${n(cx - 1.5)} ${n(fy - 0.8)}" fill="none" stroke="#d29f80" stroke-width=".42" stroke-linecap="round" opacity=".5"/>`);
  body.push(`<ellipse cx="${n(cx + 1)}" cy="${n(cb - 0.4)}" rx="15" ry="1.5" fill="#3b1a12" opacity=".32" filter="url(#zqBlur)"/>`);

  // 下垂小枝末梢的花团(在树冠下方,离静区很远)
  const twigPuffs: SakuraPuff[] = [
    { cx: cx - 17.4, cy: cb + 2.4, r: 1.7, tone: 1, layer: 0 },
    { cx: cx - 15.4, cy: cb + 3.1, r: 1.2, tone: 2, layer: 0 },
    { cx: cx - 18.9, cy: cb + 1.2, r: 1.1, tone: 0, layer: 0 },
    { cx: cx + 15.5, cy: cb + 1.6, r: 1.5, tone: 1, layer: 0 },
    { cx: cx + 13.8, cy: cb + 2.4, r: 1.05, tone: 2, layer: 0 },
  ];

  // 树冠:冠底(桥接静区与花团)→ 后/中/前三层花团(各带投影)→ 花团表面的小樱花
  const puffs = [...crown, ...twigPuffs].filter((puff) => distanceToRect(puff.cx, puff.cy, R) >= puff.r);
  body.push(`<rect x="${n(R.x0 - 1.4)}" y="${n(R.y0 - 1.4)}" width="${n(R.x1 - R.x0 + 2.8)}" height="${n(R.y1 - R.y0 + 2.8)}" rx="3" fill="url(#zqCrown)"/>`);
  // 花团表面按向日葵螺旋铺小樱花;最外一圈花心压在圆周内侧、花瓣伸出圆外,
  // 让花团轮廓呈花瓣状起伏而不是光滑的球。被上层花团盖住的花、会碰到静区的花直接剔除。
  const covers = (layer: number, x: number, y: number, radius: number) => puffs.some(
    (other) => other.layer < layer && Math.hypot(other.cx - x, other.cy - y) < other.r - radius * 0.7,
  );
  const flowersFor = (puff: SakuraPuff, index: number) => {
    const count = Math.max(3, Math.round(puff.r * puff.r * 1.15));
    const spin = rand(index, 0, 36) * Math.PI * 2;
    const out: string[] = [];
    for (let k = 0; k < count; k += 1) {
      const frac = Math.sqrt((k + 0.5) / count);
      const angle = spin + k * 2.39996 + (rand(index, k, 33) - 0.5) * 0.5;
      const dist = frac * (puff.r + 0.05);
      const scale = 1 + rand(index, k, 32) * 0.45;
      const x = puff.cx + Math.cos(angle) * dist;
      const y = puff.cy + Math.sin(angle) * dist;
      if (distanceToRect(x, y, R) < 0.62 * scale || covers(puff.layer, x, y, 0.53 * scale)) continue;
      // 迎光(左上)的花更白,背光的更粉
      const lit = (Math.cos(angle) * -0.6 + Math.sin(angle) * -0.8) * frac;
      const shade = lit > 0.25 ? 0 : lit > -0.35 ? 1 : 2;
      const tone = Math.min(2, Math.max(0, shade + (puff.tone >= 2 ? 1 : 0) - (puff.tone === 0 ? 1 : 0)));
      out.push(`<use href="#zqf${tone * 3 + (k % 3)}" transform="translate(${n(x)} ${n(y)}) scale(${n(scale)})"/>`);
    }
    return out.join("");
  };
  for (const layer of [2, 1, 0] as const) {
    const group = puffs.map((puff, index) => ({ puff, index })).filter(({ puff }) => puff.layer === layer);
    // 前层不加投影:投影会落进静区边缘,被兜底矩形硬切出一道框线。
    body.push(`<g${layer === 0 ? "" : ` filter="url(#zqPuffShadow)"`}>${
      group.map(({ puff }) => `<circle cx="${n(puff.cx)}" cy="${n(puff.cy)}" r="${n(puff.r)}" fill="url(#zqPuff${puff.tone})" data-puff=""/>`).join("")
    }</g>`);
    body.push(`<g>${group.map(({ puff, index }) => flowersFor(puff, index)).join("")}</g>`);
  }

  // 静区兜底:同一渐变重绘静区矩形,盖掉任何可能越界的装饰/投影。
  body.push(`<rect x="${n(R.x0)}" y="${n(R.y0)}" width="${n(R.x1 - R.x0)}" height="${n(R.y1 - R.y0)}" rx="1.2" fill="url(#zqCrown)" data-quiet-zone=""/>`);

  // 暗模块 → 一朵深色樱花(定位图形单独画)
  const blossoms: string[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!dark(row, col) || isFinderModule(row, col, size)) continue;
      const variant = Math.floor(rand(row, col, 41) * 9);
      blossoms.push(`<use href="#zqb${variant}" x="${n(qrX + col + 0.5)}" y="${n(qrY + row + 0.5)}"/>`);
    }
  }
  body.push(`<g filter="url(#zqShadow)" data-modules="">${blossoms.join("")}</g>`);

  // 定位图形:外环 + 内核保持 1:1:3:1:1,内核上压一朵同色系浮雕樱花
  const finders: string[] = [];
  for (const [fx, fy] of [[qrX, qrY], [qrX + size - SAKURA_QR_FINDER, qrY], [qrX, qrY + size - SAKURA_QR_FINDER]]) {
    finders.push(`<path d="${roundedRectPath(fx, fy, 7, 7, FINDER_RADII[0])}${roundedRectPath(fx + 1, fy + 1, 5, 5, FINDER_RADII[1])}" fill-rule="evenodd" fill="url(#zqFinder)"/>`);
    finders.push(`<rect x="${n(fx + 2)}" y="${n(fy + 2)}" width="3" height="3" rx="${FINDER_RADII[2]}" fill="url(#zqFinder)"/>`);
    finders.push(`<path d="${flowerPath(18, 2.55)}" transform="translate(${n(fx + 3.5)} ${n(fy + 3.5)})" fill="#a2365c" opacity=".7"/>`);
    finders.push(`<circle cx="${n(fx + 3.5)}" cy="${n(fy + 3.5)}" r=".38" fill="#4d0820"/>`);
  }
  body.push(`<g filter="url(#zqShadow)" data-finders="">${finders.join("")}</g>`);

  // 整个树冠的球面光照(左上亮、右下暗),幅度很小,不改变模块明暗归属
  body.push(`<rect x="${n(R.x0)}" y="${n(R.y0)}" width="${n(R.x1 - R.x0)}" height="${n(R.y1 - R.y0)}" rx="1.2" fill="url(#zqDome)"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(W)} ${n(H)}" role="img" aria-label="${label}"><defs>${defs.join("")}</defs>${body.join("")}</svg>`;
}
