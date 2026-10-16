// 樱花树立体码:把 QR 模块矩阵搭成一块体素小园子——地砖、草、树干、樱花树冠。
// 斜 45°俯视是一棵树;相机转到正上方(正交投影)时,每一列最高那块体素的顶面
// 恰好拼成二维码。零 import——登录面板与反向邀请面板共用,测试直连(strip-types)。
//
// 可扫性纪律(只约束正上方那一帧,树形态不要求能扫):
// - 每一列(= 一个模块)最高体素的顶面颜色由模块真值决定:暗模块取深色、亮模块取浅色,
//   与体素是地砖、草还是树冠无关(SAKURA_FLAT 按 kind × 明暗给色)。场景先搭完几何,
//   最后才按"每列最高者"统一上色,树干/树枝哪怕穿出树冠也只会拿到正确明暗的颜色。
// - 平面码四周铺 SAKURA_QR_MAT 个模块宽的浅色衬底作静区,不依赖页面背景色。
// - 平面帧不走斜投影的多边形绘制,而是按模块直接 fillRect(边界取整到设备像素),
//   没有抗锯齿接缝;同一份绘制函数也被测试拿去栅格化、交给 jsQR 解码。
// 外观随机量全部由体素坐标派生(确定性):同一矩阵永远是同一棵树。

export type QrModuleMatrix = { size: number; data: ArrayLike<number | boolean> };
export type Rgb = readonly [number, number, number];
export type SakuraVoxelKind = "slab" | "floor" | "grass" | "trunk" | "crown";
export type SakuraVoxel = {
  x: number;
  y: number;
  z: number;
  kind: SakuraVoxelKind;
  faces: number;
  // 每列最高的体素:顶面在两种形态间渐变(tree → flat);其余体素 flat 无意义
  top: boolean;
  // 树形态下三个可见面的颜色(已含朝向明暗与环境光遮蔽)
  tree: Rgb;
  sideX: Rgb;
  sideY: Rgb;
  flat: Rgb;
  blades: boolean;
};
export type SakuraScene = {
  size: number;
  dark: Uint8Array;
  voxels: SakuraVoxel[];
  // 每个模块(row * size + col)对应的最高体素下标
  topOf: Int32Array;
  // 取景用的轮廓点(x, y, z 三元组):地块四角 + 每个凸出地面的列的顶面四角
  hull: Float64Array;
  crownBox: { x0: number; y0: number; x1: number; y1: number; z0: number; z1: number };
};
export type SakuraPetal = { left: number; top: number; fall: number; drift: number; delay: number; duration: number; tone: number };
export type SakuraCamera = { e: number; cy: number; sy: number; cp: number; sp: number };
export type SakuraFit = { scale: number; ox: number; oy: number };
export type SakuraPalette = "sakura" | "plain";
// 测试用最小 2D 画布接口(浏览器 CanvasRenderingContext2D 满足它)
export type SakuraCanvas = {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  globalAlpha: number;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
};

// 纠错等级 Q(25%):平面帧每个模块都按真值着色,纠错余量留给屏幕反光/摩尔纹。
export const SAKURA_QR_ERROR_CORRECTION = "Q";
export const SAKURA_QR_MAT = 3;
export const FACE_TOP = 1;
export const FACE_X = 2;
export const FACE_Y = 4;

const TREE_YAW = Math.PI / 4;
const TREE_PITCH = Math.PI / 6;
const SLAB_Z = -2;
const SHADE_Y = 0.88;
const SHADE_X = 0.75;

const hex = (value: string): Rgb => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
];

export const SAKURA_MAT = hex("#fbf7f1");
// 正上方帧的顶面色:[暗模块, 亮模块]。含 ±3% 抖动后暗色相对亮度 ≤ 0.15、亮色 ≥ 0.8,
// 对比度 ≥ 4.5:1(测试按此断言)。
export const SAKURA_FLAT: Record<SakuraVoxelKind, readonly [Rgb, Rgb]> = {
  crown: [hex("#a92e57"), hex("#fdecf1")],
  floor: [hex("#ad315b"), hex("#f8f2e9")],
  grass: [hex("#276b2b"), hex("#eef5e6")],
  trunk: [hex("#5a3424"), hex("#f6efe6")],
  slab: [hex("#5a3424"), hex("#f6efe6")],
};
const PLAIN_DARK = "#111111";
const PLAIN_LIGHT = "#ffffff";

const TREE = {
  crownDark: hex("#ec8dab"),
  crownLight: hex("#fcdce6"),
  crownBody: [hex("#f8c0d1"), hex("#f3abc2"), hex("#fad1de"), hex("#ef9bb6")],
  shadow: hex("#c99aa5"),
  floorDark: hex("#efbcc8"),
  floorLight: [hex("#f1e8da"), hex("#e8dcc9")],
  floorSide: hex("#dccbb2"),
  slab: hex("#b9a58b"),
  grass: hex("#7cc44e"),
  grassSide: hex("#5a9b39"),
  trunk: hex("#7a4a32"),
  blade: ["#8fd65c", "#64b23f", "#a6e070"],
};

// 树冠 = 若干椭球花团的并集(相对码中心,单位:模块;按 41 模块的码设计,其余尺寸等比缩放)。
// [dx, dy, 中心高度, 水平半径, 垂直半径]
const CROWN_PUFFS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [0, 0, 25, 11.5, 7.5],
  [1, -1, 32, 9, 6],
  [-2, -3, 37.5, 6, 4],
  [0, -12, 27, 6.5, 5],
  [-8, -7, 28, 6, 5],
  [8, -8, 29, 6, 5],
  [-12, 3, 24, 5.5, 4.5],
  [12, -3, 25, 5.5, 4.5],
  [-8, 8, 22.5, 6, 4.5],
  [9, 9, 23, 7, 5],
  [2, 12, 22, 6, 4.5],
  [-7, -2, 32, 6, 5],
  [7, 3, 31, 6, 5],
  [3, -8, 34, 6, 4.5],
  [-4, 7, 29.5, 6, 4.5],
];
// 树枝:从树干上段伸进各个花团(终点藏在树冠里)。[dx, dy, z] 起点 → 终点
const BRANCHES: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [0, 0, 12, -8, -7, 27],
  [0, 0, 13, 8, -8, 28],
  [0, 0, 11, -8, 8, 22],
  [0, 0, 12, 9, 9, 22],
  [0, 0, 14, 2, 12, 21],
  [0, 0, 15, 0, -12, 26],
  [0, 0, 13, -12, 3, 23],
  [0, 0, 14, 12, -3, 24],
];
const TRUNK_TOP = 20;

function rand(x: number, y: number, z: number, salt = 0) {
  let h = (Math.imul(x + 11, 374761393) + Math.imul(y + 7, 668265263) + Math.imul(z + 5, 2246822519) + Math.imul(salt + 3, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const clamp255 = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const scaleRgb = (c: Rgb, k: number): Rgb => [clamp255(c[0] * k), clamp255(c[1] * k), clamp255(c[2] * k)];
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: Rgb) => `rgb(${clamp255(c[0])},${clamp255(c[1])},${clamp255(c[2])})`;

// WCAG 相对亮度(0..1)
export function relativeLuminance(c: Rgb) {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

export function isFinderZone(row: number, col: number, size: number) {
  // 定位图形 7×7 + 1 圈分隔带
  const f = 8;
  return (row < f && col < f) || (row < f && col >= size - f) || (row >= size - f && col < f);
}

export function buildSakuraScene(matrix: QrModuleMatrix): SakuraScene {
  const size = matrix.size;
  const k = size / 41;
  const c = size / 2;
  const dark = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i += 1) dark[i] = matrix.data[i] ? 1 : 0;

  const zTop = Math.ceil(44 * k);
  const layers = zTop - SLAB_Z + 1;
  // 0 = 空;1 slab 2 floor 3 grass 4 trunk 5 crown
  const grid = new Uint8Array(size * size * layers);
  const at = (x: number, y: number, z: number) => ((z - SLAB_Z) * size + y) * size + x;
  const inside = (x: number, y: number, z: number) => x >= 0 && y >= 0 && x < size && y < size && z >= SLAB_Z && z <= zTop;
  const put = (x: number, y: number, z: number, kind: number) => {
    if (inside(x, y, z)) grid[at(x, y, z)] = kind;
  };
  const filled = (x: number, y: number, z: number) => inside(x, y, z) && grid[at(x, y, z)] !== 0;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      put(x, y, SLAB_Z, 1);
      put(x, y, SLAB_Z + 1, 2);
      const edge = x <= 1 || y <= 1 || x >= size - 2 || y >= size - 2;
      if (dark[y * size + x] && (edge || isFinderZone(y, x, size))) put(x, y, 0, 3);
    }
  }

  // 树干(2×2,根部外扩一圈)+ 树枝(三维直线体素化)
  const t0 = Math.round(c) - 1;
  for (let z = 0; z <= Math.round(TRUNK_TOP * k); z += 1) {
    for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) put(t0 + dx, t0 + dy, z, 4);
  }
  for (const [dx, dy] of [[-1, 0], [2, 1], [0, 2], [1, -1], [-1, 1], [1, 2]] as const) put(t0 + dx, t0 + dy, 0, 4);
  for (const [dx, dy] of [[-1, 0], [2, 1], [0, 2]] as const) put(t0 + dx, t0 + dy, 1, 4);
  for (const [ax, ay, az, bx, by, bz] of BRANCHES) {
    const from = [c + ax * k, c + ay * k, az * k];
    const to = [c + bx * k, c + by * k, bz * k];
    const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) * 3);
    for (let s = 0; s <= steps; s += 1) {
      const u = s / steps;
      put(Math.floor(from[0] + (to[0] - from[0]) * u), Math.floor(from[1] + (to[1] - from[1]) * u), Math.floor(from[2] + (to[2] - from[2]) * u), 4);
    }
  }

  // 树冠:离定位图形与地块外缘留出空地(那里是草和地砖)
  const crownAllowed = (x: number, y: number) => (
    x >= 3 && y >= 3 && x <= size - 4 && y <= size - 4 && !isFinderZone(y, x, size)
  );
  const crown = { x0: size, y0: size, x1: 0, y1: 0, z0: zTop, z1: 0 };
  // 每个体素到最近花团的归一化距离²(只遍历各花团自己的包围盒)
  const field = new Float32Array(grid.length).fill(Infinity);
  for (const [dx, dy, cz, rxy, rz] of CROWN_PUFFS) {
    const px0 = c + dx * k;
    const py0 = c + dy * k;
    const pz0 = cz * k;
    const r = rxy * k * 1.3;
    const h = rz * k * 1.3;
    for (let z = Math.max(1, Math.floor(pz0 - h)); z <= Math.min(zTop, Math.ceil(pz0 + h)); z += 1) {
      for (let y = Math.max(0, Math.floor(py0 - r)); y <= Math.min(size - 1, Math.ceil(py0 + r)); y += 1) {
        for (let x = Math.max(0, Math.floor(px0 - r)); x <= Math.min(size - 1, Math.ceil(px0 + r)); x += 1) {
          const qx = (x + 0.5 - px0) / (rxy * k);
          const qy = (y + 0.5 - py0) / (rxy * k);
          const qz = (z + 0.5 - pz0) / (rz * k);
          const i = at(x, y, z);
          field[i] = Math.min(field[i], qx * qx + qy * qy + qz * qz);
        }
      }
    }
  }
  for (let z = 1; z <= zTop; z += 1) {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!crownAllowed(x, y)) continue;
        // 表面起伏:阈值按体素坐标抖动,轮廓不是光滑椭球
        if (field[at(x, y, z)] <= 1 + (rand(x, y, z, 1) - 0.5) * 0.45) {
          put(x, y, z, 5);
          crown.x0 = Math.min(crown.x0, x);
          crown.y0 = Math.min(crown.y0, y);
          crown.x1 = Math.max(crown.x1, x + 1);
          crown.y1 = Math.max(crown.y1, y + 1);
          crown.z0 = Math.min(crown.z0, z);
          crown.z1 = Math.max(crown.z1, z + 1);
        }
      }
    }
  }

  const topZ = new Int32Array(size * size).fill(SLAB_Z - 1);
  const crowned = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      for (let z = zTop; z >= SLAB_Z; z -= 1) {
        if (filled(x, y, z)) {
          topZ[y * size + x] = z;
          break;
        }
      }
      for (let z = 1; z <= zTop; z += 1) if (grid[at(x, y, z)] === 5) crowned[y * size + x] = 1;
    }
  }

  const kinds: SakuraVoxelKind[] = ["slab", "slab", "floor", "grass", "trunk", "crown"];
  const crownSpan = Math.max(1, crown.z1 - crown.z0);
  const voxels: SakuraVoxel[] = [];
  const topOf = new Int32Array(size * size).fill(-1);
  for (let z = SLAB_Z; z <= zTop; z += 1) {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const code = grid[at(x, y, z)];
        if (!code) continue;
        const faces = (filled(x, y, z + 1) ? 0 : FACE_TOP) | (filled(x + 1, y, z) ? 0 : FACE_X) | (filled(x, y + 1, z) ? 0 : FACE_Y);
        if (!faces) continue;
        const cell = y * size + x;
        const kind = kinds[code];
        const top = topZ[cell] === z;
        const isDark = dark[cell] === 1;
        const jitter = 0.94 + rand(x, y, z, 2) * 0.12;
        let tree: Rgb;
        let side: Rgb;
        if (kind === "crown") {
          const ao = 0.87 + 0.13 * ((z - crown.z0) / crownSpan);
          const body = TREE.crownBody[Math.floor(rand(x, y, z, 3) * TREE.crownBody.length)];
          tree = scaleRgb(top ? (isDark ? TREE.crownDark : TREE.crownLight) : body, jitter * ao);
          side = scaleRgb(top ? mixRgb(body, isDark ? TREE.crownDark : TREE.crownLight, 0.5) : body, jitter * ao);
        } else if (kind === "grass") {
          tree = scaleRgb(TREE.grass, jitter);
          side = scaleRgb(TREE.grassSide, jitter);
        } else if (kind === "trunk") {
          tree = scaleRgb(TREE.trunk, 0.9 + rand(x, y, z, 4) * 0.25);
          side = tree;
        } else if (kind === "floor") {
          const tile = TREE.floorLight[(x + y) & 1];
          // 树冠下的地砖(俯视看不到):阴影 + 落了一地的花瓣
          const under = crowned[cell] === 1;
          const petal = under ? rand(x, y, z, 5) < 0.28 : isDark;
          const base = scaleRgb(petal ? TREE.floorDark : tile, 0.97 + rand(x, y, z, 6) * 0.06);
          tree = under ? mixRgb(base, TREE.shadow, 0.28) : base;
          side = scaleRgb(TREE.floorSide, jitter);
        } else {
          tree = scaleRgb(TREE.slab, jitter);
          side = tree;
        }
        const flatPair = SAKURA_FLAT[kind];
        const flatBase = isDark ? flatPair[0] : flatPair[1];
        // 平面帧的明暗只认模块真值;抖动 ±3% 只做质感,不跨明暗档
        const flat = top ? scaleRgb(flatBase, 0.97 + rand(x, y, z, 7) * 0.06) : tree;
        if (top) topOf[cell] = voxels.length;
        // 环境光遮蔽:每个可见面前方那一层 3×3 邻居里实心的越多,面越暗(花团之间的褶皱)
        const occlusion = (ox: number, oy: number, oz: number) => {
          let count = 0;
          for (let a = -1; a <= 1; a += 1) {
            for (let b = -1; b <= 1; b += 1) {
              if (oz) count += filled(x + a, y + b, z + 1) ? 1 : 0;
              else if (ox) count += filled(x + 1, y + a, z + b) ? 1 : 0;
              else if (oy) count += filled(x + a, y + 1, z + b) ? 1 : 0;
            }
          }
          return 1 - 0.04 * count;
        };
        voxels.push({
          x, y, z, kind, faces, top,
          tree: faces & FACE_TOP ? scaleRgb(tree, occlusion(0, 0, 1)) : tree,
          sideX: faces & FACE_X ? scaleRgb(side, SHADE_X * occlusion(1, 0, 0)) : side,
          sideY: faces & FACE_Y ? scaleRgb(side, SHADE_Y * occlusion(0, 1, 0)) : side,
          flat,
          blades: kind === "grass" && top,
        });
      }
    }
  }

  const hull: number[] = [];
  for (const z of [0, SLAB_Z]) hull.push(0, 0, z, size, 0, z, 0, size, z, size, size, z);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const z = topZ[y * size + x] + 1;
      if (z > 0) hull.push(x, y, z, x + 1, y, z, x, y + 1, z, x + 1, y + 1, z);
    }
  }

  return { size, dark, voxels, topOf, hull: Float64Array.from(hull), crownBox: crown };
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// t = 0 树(斜 45°、仰角 30°),t = 1 平面码(正上方,码的行列与屏幕对齐)
export function sakuraCamera(t: number): SakuraCamera {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped >= 1) return { e: 1, cy: 1, sy: 0, cp: 0, sp: 1 };
  const e = easeInOut(clamped);
  const yaw = TREE_YAW * (1 - e);
  const pitch = TREE_PITCH + (Math.PI / 2 - TREE_PITCH) * e;
  return { e, cy: Math.cos(yaw), sy: Math.sin(yaw), cp: Math.cos(pitch), sp: Math.sin(pitch) };
}

// 正交投影:地面坐标绕竖轴转 yaw,再按仰角压扁;z 越高屏幕上越靠上。
function projectX(cam: SakuraCamera, X: number, Y: number) {
  return X * cam.cy - Y * cam.sy;
}
function projectY(cam: SakuraCamera, X: number, Y: number, z: number) {
  return (X * cam.sy + Y * cam.cy) * cam.sp - z * cam.cp;
}

// 取景:轮廓点投影后的包围盒居中放进画布;平面帧四周恰好留 SAKURA_QR_MAT 个模块。
export function sakuraFit(scene: SakuraScene, cam: SakuraCamera, width: number, height: number): SakuraFit {
  const c = scene.size / 2;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const { hull } = scene;
  for (let i = 0; i < hull.length; i += 3) {
    const X = hull[i] - c;
    const Y = hull[i + 1] - c;
    const sx = projectX(cam, X, Y);
    const sy = projectY(cam, X, Y, hull[i + 2]);
    if (sx < minX) minX = sx;
    if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy;
    if (sy > maxY) maxY = sy;
  }
  const flatPad = SAKURA_QR_MAT / (scene.size + 2 * SAKURA_QR_MAT);
  const pad = 0.04 + (flatPad - 0.04) * cam.e;
  const scale = Math.min((width * (1 - 2 * pad)) / (maxX - minX), (height * (1 - 2 * pad)) / (maxY - minY));
  return { scale, ox: width / 2 - (scale * (minX + maxX)) / 2, oy: height / 2 - (scale * (minY + maxY)) / 2 };
}

function drawFlat(ctx: SakuraCanvas, scene: SakuraScene, width: number, height: number, palette: SakuraPalette) {
  const { size } = scene;
  const m = Math.min(width, height) / (size + 2 * SAKURA_QR_MAT);
  const ox = (width - m * size) / 2;
  const oy = (height - m * size) / 2;
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette === "plain" ? PLAIN_LIGHT : css(SAKURA_MAT);
  ctx.fillRect(0, 0, width, height);
  for (let row = 0; row < size; row += 1) {
    const y0 = Math.round(oy + row * m);
    const y1 = Math.round(oy + (row + 1) * m);
    for (let col = 0; col < size; col += 1) {
      const cell = row * size + col;
      if (palette === "plain" && !scene.dark[cell]) continue;
      const x0 = Math.round(ox + col * m);
      const x1 = Math.round(ox + (col + 1) * m);
      ctx.fillStyle = palette === "plain" ? PLAIN_DARK : css(scene.voxels[scene.topOf[cell]].flat);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
}

function face(ctx: SakuraCanvas, x: number, y: number, ax: number, ay: number, bx: number, by: number, color: string) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + ax, y + ay);
  ctx.lineTo(x + ax + bx, y + ay + by);
  ctx.lineTo(x + bx, y + by);
  ctx.closePath();
  ctx.fill();
  // 同色描边盖住相邻多边形之间的抗锯齿缝
  ctx.stroke();
}

// 画一帧。width/height 为画布像素(已乘 devicePixelRatio)。
export function drawSakuraQr(ctx: SakuraCanvas, scene: SakuraScene, t: number, width: number, height: number, palette: SakuraPalette = "sakura") {
  ctx.clearRect(0, 0, width, height);
  if (palette === "plain" || t >= 1) {
    drawFlat(ctx, scene, width, height, palette);
    return;
  }
  const cam = sakuraCamera(t);
  const { scale, ox, oy } = sakuraFit(scene, cam, width, height);
  const c = scene.size / 2;
  const exX = scale * cam.cy;
  const exY = scale * cam.sy * cam.sp;
  const eyX = -scale * cam.sy;
  const eyY = scale * cam.cy * cam.sp;
  const ezY = -scale * cam.cp;

  if (cam.e > 0) {
    ctx.globalAlpha = Math.min(1, cam.e * 1.4);
    ctx.fillStyle = css(SAKURA_MAT);
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }

  const { voxels } = scene;
  const depth = new Float64Array(voxels.length);
  for (let i = 0; i < voxels.length; i += 1) {
    const v = voxels[i];
    // 朝向观察者的深度;各分量非负,单位体素按中心深度排序即正确的画家序
    depth[i] = ((v.x + 0.5 - c) * cam.sy + (v.y + 0.5 - c) * cam.cy) * cam.cp + (v.z + 0.5) * cam.sp;
  }
  const order = new Uint32Array(voxels.length);
  for (let i = 0; i < order.length; i += 1) order[i] = i;
  order.sort((a, b) => depth[a] - depth[b]);

  ctx.lineWidth = Math.max(0.5, scale * 0.08);
  const bladeAlpha = 1 - cam.e;
  for (let i = 0; i < order.length; i += 1) {
    const v = voxels[order[i]];
    const X = v.x - c;
    const Y = v.y - c;
    const bx = ox + scale * projectX(cam, X, Y);
    const by = oy + scale * projectY(cam, X, Y, v.z);
    if (v.faces & FACE_X) face(ctx, bx + exX, by + exY, eyX, eyY, 0, ezY, css(v.sideX));
    if (v.faces & FACE_Y) face(ctx, bx + eyX, by + eyY, exX, exY, 0, ezY, css(v.sideY));
    if (v.faces & FACE_TOP) {
      face(ctx, bx, by + ezY, exX, exY, eyX, eyY, css(v.top ? mixRgb(v.tree, v.flat, cam.e) : v.tree));
      if (v.blades && bladeAlpha > 0.02) {
        ctx.globalAlpha = bladeAlpha;
        for (let b = 0; b < 4; b += 1) {
          const u = 0.15 + rand(v.x, v.y, b, 8) * 0.7;
          const w = 0.15 + rand(v.x, v.y, b, 9) * 0.7;
          const h = 0.6 + rand(v.x, v.y, b, 10) * 0.9;
          const lean = (rand(v.x, v.y, b, 11) - 0.5) * 0.5;
          const px = bx + exX * u + eyX * w;
          const py = by + ezY + exY * u + eyY * w;
          ctx.fillStyle = TREE.blade[b % TREE.blade.length];
          ctx.beginPath();
          ctx.moveTo(px - scale * 0.14, py);
          ctx.lineTo(px + scale * lean, py + ezY * h);
          ctx.lineTo(px + scale * 0.14, py);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
  }
}

// 落花(HTML 元素,只在树形态显示):起点在树冠下沿附近,按方形画布的百分比给出。
export function sakuraPetals(scene: SakuraScene, count = 10): SakuraPetal[] {
  const cam = sakuraCamera(0);
  const fit = sakuraFit(scene, cam, 100, 100);
  const c = scene.size / 2;
  const box = scene.crownBox;
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const x of [box.x0, box.x1]) {
    for (const y of [box.y0, box.y1]) {
      const sx = fit.ox + fit.scale * projectX(cam, x - c, y - c);
      const sy = fit.oy + fit.scale * projectY(cam, x - c, y - c, box.z0);
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx);
      maxY = Math.max(maxY, sy);
    }
  }
  const petals: SakuraPetal[] = [];
  for (let i = 0; i < count; i += 1) {
    petals.push({
      left: minX + (maxX - minX) * (0.18 + rand(i, 1, 0, 20) * 0.64),
      top: Math.max(0, maxY - 30 + rand(i, 2, 0, 20) * 18),
      fall: 14 + rand(i, 3, 0, 20) * 12,
      drift: (rand(i, 4, 0, 20) - 0.5) * 12,
      delay: rand(i, 5, 0, 20) * 9,
      duration: 6.5 + rand(i, 6, 0, 20) * 4,
      tone: i % 3,
    });
  }
  return petals;
}
