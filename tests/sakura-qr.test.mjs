// 樱花树登录二维码:结构不变量 + 真栅格化解码。
// 渲染器 app/lib/sakura-qr.ts 零依赖直连(strip-types);解码走 sharp(librsvg)栅格化 →
// jsQR(站内「扫一扫」用的同一个解码器)。装饰再怎么改,这里必须一直能解出原 URL。
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";
import jsQR from "jsqr";
import sharp from "sharp";
import {
  SAKURA_QR_ERROR_CORRECTION,
  distanceToRect,
  isFinderModule,
  renderSakuraQrSvg,
  sakuraQrLayout,
  sakuraQrPetals,
} from "../app/lib/sakura-qr.ts";

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), "utf8");
const round2 = (v) => String(Math.round(v * 100) / 100);

const FIXED_TOKENS = [
  "Zq9_xP3kLm2Vb8Nt5Rw1Yc7Hd4Jf6Gs0Ae-UoIiKpQ",
  "aB3-dE6_gH9jK2mN5pQ8sT1vW4yZ7cF0hL3oR6uX9zA",
  "-".repeat(43),
  "A".repeat(43),
];
// 每次再加两枚随机 token(与线上同形态:32 字节 base64url),失败信息里带 token 便于复现。
const TOKENS = [...FIXED_TOKENS, randomBytes(32).toString("base64url"), randomBytes(32).toString("base64url")];
const ORIGIN = "https://aetherstudio.top";
const urlsFor = (token) => [`${ORIGIN}/signin/qr/${token}`, `${ORIGIN}/signin/qr-pair/${token}`];

function build(url) {
  const qr = QRCode.create(url, { errorCorrectionLevel: SAKURA_QR_ERROR_CORRECTION });
  return { modules: qr.modules, svg: renderSakuraQrSvg(qr.modules), layout: sakuraQrLayout(qr.modules.size) };
}

test("sakura-qr: 每个非定位暗模块恰好一朵花,花心落在模块中心;亮模块不画花", () => {
  for (const url of urlsFor(FIXED_TOKENS[0]).concat(urlsFor(FIXED_TOKENS[1]))) {
    const { modules, svg, layout } = build(url);
    const drawn = [...svg.matchAll(/<use href="#zqb\d" x="([\d.]+)" y="([\d.]+)"\/>/g)].map((m) => `${m[1]},${m[2]}`);
    const expected = [];
    for (let row = 0; row < modules.size; row += 1) {
      for (let col = 0; col < modules.size; col += 1) {
        if (modules.data[row * modules.size + col] && !isFinderModule(row, col, modules.size)) {
          expected.push(`${round2(layout.qrX + col + 0.5)},${round2(layout.qrY + row + 0.5)}`);
        }
      }
    }
    assert.ok(expected.length > 500, "样本矩阵应有足够多的暗模块");
    assert.equal(new Set(drawn).size, drawn.length, "同一模块不得画两朵");
    assert.deepEqual([...drawn].sort(), [...expected].sort(), `暗模块集合必须与矩阵一致:${url}`);
  }
});

test("sakura-qr: 树冠花团全部在静区之外;静区兜底矩形画在所有花团之后、模块之前", () => {
  for (const url of urlsFor(FIXED_TOKENS[0])) {
    const { svg, layout } = build(url);
    const puffs = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="url\(#zqPuff\d\)" data-puff=""\/>/g)]
      .map((m) => ({ cx: Number(m[1]), cy: Number(m[2]), r: Number(m[3]) }));
    assert.ok(puffs.length > 100, "树冠花团数量异常(正则失配会让本断言空转)");
    for (const puff of puffs) {
      // 0.01 = 坐标两位小数取整的容差
      assert.ok(distanceToRect(puff.cx, puff.cy, layout.quietRect) >= puff.r - 0.01, `花团侵入静区:${JSON.stringify(puff)}`);
    }
    const lastPuff = svg.lastIndexOf('data-puff=""');
    const guard = svg.indexOf('data-quiet-zone=""');
    const modulesAt = svg.indexOf('data-modules=""');
    assert.ok(guard > lastPuff, "静区兜底矩形必须在全部花团之后绘制");
    assert.ok(guard < modulesAt, "静区兜底矩形必须在暗模块之前绘制");
    assert.match(svg, new RegExp(`<rect x="${round2(layout.quietRect.x0)}" y="${round2(layout.quietRect.y0)}" width="${round2(layout.quietRect.x1 - layout.quietRect.x0)}" height="${round2(layout.quietRect.y1 - layout.quietRect.y0)}"[^>]*data-quiet-zone=""`), "兜底矩形必须恰好覆盖静区");
  }
});

test("sakura-qr: 落花起点在树冠下沿之下(不经过码区),落点不出画面", () => {
  for (const size of [41, 45, 49]) {
    const layout = sakuraQrLayout(size);
    const petals = sakuraQrPetals(size);
    assert.ok(petals.length > 0);
    for (const petal of petals) {
      const startY = (petal.top / 100) * layout.height;
      const endY = startY + (petal.fall / 100) * layout.width;
      assert.ok(startY > layout.quietRect.y1, `落花起点进入码区/静区:size=${size} ${JSON.stringify(petal)}`);
      assert.ok(endY <= layout.height, `落花落出画面:size=${size} ${JSON.stringify(petal)}`);
    }
  }
});

test("sakura-qr: 栅格化后 jsQR 能解出原 URL(两个方向 × 多个 token × 1x/2x 显示尺寸)", async () => {
  for (const token of TOKENS) {
    for (const url of urlsFor(token)) {
      const { svg } = build(url);
      for (const width of [360, 720]) {
        const { data, info } = await sharp(Buffer.from(svg), { density: 300 })
          .resize({ width })
          .flatten({ background: "#ffffff" })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
        assert.equal(decoded?.data, url, `解码失败:width=${width} url=${url}`);
      }
    }
  }
});

test("sakura-qr: 两个扫码面板都走共享樱花渲染,不再各自 QRCode.toString", () => {
  for (const file of ["app/signin/qr-login-panel.tsx", "app/profile/qr-host/qr-host-panel.tsx"]) {
    const source = read(file);
    assert.match(source, /<SakuraQrImage art=\{qrArt\} \/>/, `${file} 必须用 SakuraQrImage`);
    assert.match(source, /sakuraQrArt\((start|host)\.url\)/, `${file} 必须用 sakuraQrArt 生成`);
    assert.doesNotMatch(source, /QRCode\.toString/, `${file} 不得再直接生成黑白码`);
  }
  const image = read("app/signin/sakura-qr-image.tsx");
  assert.match(image, /errorCorrectionLevel: SAKURA_QR_ERROR_CORRECTION/, "纠错等级只认 lib 常量(与本测试同一来源)");
  const css = read("app/globals.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.sakura-qr-petal \{ animation: none; display: none; \} \}/, "减少动态效果时必须停掉落花");
});
