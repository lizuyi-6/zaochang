// 樱花树立体码:正上方帧的可扫性不变量 + 真栅格化解码。
// 渲染器 app/lib/sakura-qr.ts 零依赖直连(strip-types);平面帧用组件同一个 drawSakuraQr
// 画进一个只实现 fillRect 的软件画布,再交给 jsQR(站内「扫一扫」用的同一个解码器)。
// 树怎么改都行,正上方那一帧必须一直能解出原 URL。
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";
import jsQR from "jsqr";
import {
  FACE_TOP,
  SAKURA_QR_ERROR_CORRECTION,
  SAKURA_QR_MAT,
  buildSakuraScene,
  drawSakuraQr,
  isFinderZone,
  relativeLuminance,
  sakuraPetals,
} from "../app/lib/sakura-qr.ts";

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), "utf8");

const FIXED_TOKENS = [
  "Zq9_xP3kLm2Vb8Nt5Rw1Yc7Hd4Jf6Gs0Ae-UoIiKpQ",
  "aB3-dE6_gH9jK2mN5pQ8sT1vW4yZ7cF0hL3oR6uX9zA",
  "-".repeat(43),
  "A".repeat(43),
];
// 每次再加两枚随机 token(与线上同形态:32 字节 base64url),失败信息里带 URL 便于复现。
const TOKENS = [...FIXED_TOKENS, randomBytes(32).toString("base64url"), randomBytes(32).toString("base64url")];
const ORIGINS = ["https://aetherstudio.top", "http://127.0.0.1:4179"];
const urlsFor = (token, origin = ORIGINS[0]) => [`${origin}/signin/qr/${token}`, `${origin}/signin/qr-pair/${token}`];
const ALL_URLS = TOKENS.flatMap((token) => ORIGINS.flatMap((origin) => urlsFor(token, origin)));

const sceneFor = (url) => buildSakuraScene(QRCode.create(url, { errorCorrectionLevel: SAKURA_QR_ERROR_CORRECTION }).modules);

function parseColor(value) {
  const rgb = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(value);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)];
  throw new Error(`软件画布不认识的颜色:${value}`);
}

// 软件画布:fillRect 真写像素(平面帧只用它);多边形只记录顶点,供转场帧的几何断言。
function softwareCanvas(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  const points = [];
  let polygons = 0;
  const ctx = {
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    globalAlpha: 1,
    clearRect() { data.fill(0); },
    fillRect(x, y, w, h) {
      const [r, g, b] = parseColor(this.fillStyle);
      const a = this.globalAlpha;
      for (let py = Math.max(0, Math.round(y)); py < Math.min(height, Math.round(y + h)); py += 1) {
        for (let px = Math.max(0, Math.round(x)); px < Math.min(width, Math.round(x + w)); px += 1) {
          const i = (py * width + px) * 4;
          data[i] = data[i] * (1 - a) + r * a;
          data[i + 1] = data[i + 1] * (1 - a) + g * a;
          data[i + 2] = data[i + 2] * (1 - a) + b * a;
          data[i + 3] = 255;
        }
      }
    },
    beginPath() {},
    moveTo(x, y) { points.push(x, y); },
    lineTo(x, y) { points.push(x, y); },
    closePath() {},
    fill() { polygons += 1; },
    stroke() {},
  };
  return { ctx, data, points, polygons: () => polygons };
}

test("sakura-qr: 正上方看每一列最高体素的顶面,明暗与模块真值一致(对比度 ≥ 4.5:1)", () => {
  let maxDark = 0;
  let minLight = 1;
  for (const url of ALL_URLS) {
    const scene = sceneFor(url);
    const { size } = scene;
    // 不信 scene.topOf:从体素列表独立求每列最高者
    const highest = new Array(size * size).fill(-1);
    for (let i = 0; i < scene.voxels.length; i += 1) {
      const v = scene.voxels[i];
      assert.ok(v.x >= 0 && v.y >= 0 && v.x < size && v.y < size, `体素出界:${JSON.stringify(v)}`);
      const cell = v.y * size + v.x;
      if (highest[cell] < 0 || scene.voxels[highest[cell]].z < v.z) highest[cell] = i;
    }
    for (let cell = 0; cell < size * size; cell += 1) {
      assert.ok(highest[cell] >= 0, `第 ${cell} 列没有任何体素:${url}`);
      assert.equal(scene.topOf[cell], highest[cell], `topOf 必须指向该列最高体素:${url}`);
      const top = scene.voxels[highest[cell]];
      assert.ok(top.top && (top.faces & FACE_TOP), "最高体素的顶面必须可见");
      const lum = relativeLuminance(top.flat);
      if (scene.dark[cell]) {
        assert.ok(lum <= 0.15, `暗模块顶面过亮:${lum.toFixed(3)} ${top.kind} cell=${cell} ${url}`);
        maxDark = Math.max(maxDark, lum);
      } else {
        assert.ok(lum >= 0.8, `亮模块顶面过暗:${lum.toFixed(3)} ${top.kind} cell=${cell} ${url}`);
        minLight = Math.min(minLight, lum);
      }
    }
  }
  assert.ok((minLight + 0.05) / (maxDark + 0.05) >= 4.5, `明暗对比不足:dark≤${maxDark} light≥${minLight}`);
});

test("sakura-qr: 树冠与树干不占定位图形区(树形态下定位角是三块草坪,平面帧里是纯色)", () => {
  for (const url of urlsFor(FIXED_TOKENS[0]).concat(urlsFor(FIXED_TOKENS[3]))) {
    const scene = sceneFor(url);
    const kinds = new Set(scene.voxels.map((v) => v.kind));
    assert.ok(kinds.has("crown") && kinds.has("trunk") && kinds.has("grass"), "场景缺部件(断言会空转)");
    for (const v of scene.voxels) {
      if (v.kind === "crown" || v.kind === "trunk") {
        assert.ok(!isFinderZone(v.y, v.x, scene.size), `树侵入定位图形区:${JSON.stringify({ x: v.x, y: v.y, z: v.z, kind: v.kind })}`);
      }
    }
    for (let cell = 0; cell < scene.size ** 2; cell += 1) {
      const row = Math.floor(cell / scene.size);
      const col = cell % scene.size;
      if (isFinderZone(row, col, scene.size) && scene.dark[cell]) {
        assert.equal(scene.voxels[scene.topOf[cell]].kind, "grass", `定位图形暗模块应是草:${row},${col}`);
      }
    }
  }
});

test("sakura-qr: 平面帧栅格化后 jsQR 解出原 URL(两个方向 × 多个 token × 两个域名 × 多种画布尺寸)", () => {
  const sizes = [[255, 255], [360, 360], [720, 720], [400, 460], [1080, 1080]];
  for (const url of ALL_URLS) {
    const scene = sceneFor(url);
    for (const [width, height] of sizes) {
      for (const palette of ["sakura", "plain"]) {
        const canvas = softwareCanvas(width, height);
        drawSakuraQr(canvas.ctx, scene, 1, width, height, palette);
        assert.equal(canvas.polygons(), 0, "平面帧只许 fillRect(无抗锯齿接缝)");
        const decoded = jsQR(canvas.data, width, height);
        assert.equal(decoded?.data, url, `解码失败:${palette} ${width}x${height} ${url}`);
      }
    }
  }
});

test("sakura-qr: 平面帧四周 SAKURA_QR_MAT 个模块是浅色静区", () => {
  const scene = sceneFor(urlsFor(FIXED_TOKENS[1])[0]);
  const width = 512;
  const canvas = softwareCanvas(width, width);
  drawSakuraQr(canvas.ctx, scene, 1, width, width);
  const band = Math.floor((width / (scene.size + 2 * SAKURA_QR_MAT)) * SAKURA_QR_MAT);
  assert.ok(band >= 3 * Math.floor(width / (scene.size + 2 * SAKURA_QR_MAT)));
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= band && y >= band && x < width - band && y < width - band) continue;
      const i = (y * width + x) * 4;
      const lum = relativeLuminance([canvas.data[i], canvas.data[i + 1], canvas.data[i + 2]]);
      assert.ok(lum >= 0.8, `静区出现深色像素:(${x},${y}) lum=${lum.toFixed(3)}`);
    }
  }
});

test("sakura-qr: 树形态与转场每一帧都画满且不出画布(无 NaN)", () => {
  const scene = sceneFor(urlsFor(FIXED_TOKENS[0])[0]);
  for (const [width, height] of [[720, 720], [300, 360]]) {
    for (const t of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 0.999]) {
      const canvas = softwareCanvas(width, height);
      drawSakuraQr(canvas.ctx, scene, t, width, height);
      assert.ok(canvas.polygons() > 2000, `t=${t} 只画了 ${canvas.polygons()} 个面`);
      for (let i = 0; i < canvas.points.length; i += 2) {
        const x = canvas.points[i];
        const y = canvas.points[i + 1];
        assert.ok(Number.isFinite(x) && Number.isFinite(y), `t=${t} 出现非有限坐标`);
        // 1.5 px 容差:草叶尖与描边
        assert.ok(x >= -1.5 && y >= -1.5 && x <= width + 1.5 && y <= height + 1.5, `t=${t} 画出画布:(${x}, ${y}) ${width}x${height}`);
      }
    }
  }
});

test("sakura-qr: 落花在画布内,起点在树冠下沿附近、往下落", () => {
  for (const url of [urlsFor(FIXED_TOKENS[0])[0], urlsFor(FIXED_TOKENS[3])[1]]) {
    const petals = sakuraPetals(sceneFor(url));
    assert.ok(petals.length > 0);
    for (const petal of petals) {
      assert.ok(petal.left >= 0 && petal.left <= 100, JSON.stringify(petal));
      assert.ok(petal.top >= 0 && petal.fall > 0 && petal.top + petal.fall <= 100, `落花落出画面:${JSON.stringify(petal)}`);
    }
  }
});

test("sakura-qr: 两个扫码面板都走共享立体码组件;组件有翻转/普通码开关并尊重减少动态效果", () => {
  for (const file of ["app/signin/qr-login-panel.tsx", "app/profile/qr-host/qr-host-panel.tsx"]) {
    const source = read(file);
    assert.match(source, /<SakuraQrImage art=\{qrArt\} \/>/, `${file} 必须用 SakuraQrImage`);
    assert.match(source, /sakuraQrArt\((start|host)\.url\)/, `${file} 必须用 sakuraQrArt 生成`);
    assert.doesNotMatch(source, /QRCode\.toString/, `${file} 不得再直接生成黑白码`);
  }
  const image = read("app/signin/sakura-qr-image.tsx");
  assert.match(image, /errorCorrectionLevel: SAKURA_QR_ERROR_CORRECTION/, "纠错等级只认 lib 常量(与本测试同一来源)");
  for (const label of ["点击查看平面码", "点击变回一棵树", "改用普通二维码", "改回樱花树"]) {
    assert.ok(image.includes(label), `组件缺少「${label}」`);
  }
  assert.match(image, /prefers-reduced-motion: reduce/, "减少动态效果时翻转直接跳到终态");
  const css = read("app/globals.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.sakura-qr-petal \{ animation: none; display: none; \} \}/, "减少动态效果时必须停掉落花");
});
