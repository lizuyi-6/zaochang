// 产物静态资产引用完整性(npm test 在 build 之后运行,postbuild 已同步 KaTeX 字体):
// 产物 CSS 里的每个相对 url(fonts/…) 都必须在 dist/client/assets/fonts/ 下真实存在。
// 背景(qa-runs 2026-10-02 P-010):@import katex CSS 只带出 @font-face 声明,字体文件
// 从未进产物,线上全部公式 404 回退字体渲染。此测试对任意新增字体同样生效。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const assetsDir = join(process.cwd(), 'dist', 'client', 'assets');

test('build assets: every relative url(fonts/…) in built CSS resolves to a real file', () => {
  assert.ok(existsSync(assetsDir), 'dist/client/assets 必须存在(npm test 先跑 build)');
  const cssFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.css'));
  assert.ok(cssFiles.length > 0, '产物必须包含 CSS 文件');

  const missing = [];
  let checked = 0;
  for (const cssFile of cssFiles) {
    const css = readFileSync(join(assetsDir, cssFile), 'utf8');
    // 只查相对路径字体引用(不含 ./ ../ 前缀的裸 fonts/... 与 data: 内联)
    for (const match of css.matchAll(/url\((?:'|")?(fonts\/[^)'"]+?)(?:'|")?\)/g)) {
      checked += 1;
      if (!existsSync(join(assetsDir, match[1].split('?')[0].split('#')[0]))) {
        missing.push(`${cssFile} -> ${match[1]}`);
      }
    }
  }
  assert.ok(
    checked > 0,
    '产物 CSS 应包含相对字体引用(KaTeX);一个都没有说明 @import 链断了,测试本身失效',
  );
  assert.deepEqual(missing, [], `产物 CSS 引用了不存在的字体文件: ${missing.join(', ')}`);
});

test('build assets: KaTeX woff2 主字体已随产物分发', () => {
  const fontsDir = join(assetsDir, 'fonts');
  assert.ok(existsSync(fontsDir), 'dist/client/assets/fonts 必须存在(postbuild 同步)');
  const fonts = readdirSync(fontsDir);
  assert.ok(
    fonts.includes('KaTeX_Main-Regular.woff2'),
    'KaTeX_Main-Regular.woff2 必须存在(书籍/文档全部公式的正文字体)',
  );
  assert.ok(fonts.filter((f) => f.startsWith('KaTeX_')).length >= 10, 'KaTeX 字体族应整组同步');
});

/* ---- 见界 SPA(public/lattice,入库产物):白板公式 KaTeX 同一纪律 ----
 * 白板公式动作此前直接把 LaTeX 源码当等宽文本上板;改 KaTeX 渲染后,Vite 资产
 * 管线把 node_modules CSS 的 url(fonts/…) 重写成 /lattice/assets/<hash>.woff2
 * 并随产物发出——契约:产物 CSS 引用的每个 /lattice/assets/ 字体都必须真实入库。 */

const latticeAssetsDir = join(process.cwd(), 'public', 'lattice', 'assets');

test('lattice assets: 白板产物 CSS 引用的 /lattice/assets/ 字体全部真实存在', () => {
  assert.ok(existsSync(latticeAssetsDir), 'public/lattice/assets 必须存在(SPA 产物入库)');
  const cssFiles = readdirSync(latticeAssetsDir).filter((f) => f.endsWith('.css'));
  const missing = [];
  let checked = 0;
  for (const cssFile of cssFiles) {
    const css = readFileSync(join(latticeAssetsDir, cssFile), 'utf8');
    for (const match of css.matchAll(/url\((?:'|")?\/lattice\/assets\/([^)'"]+?\.(?:woff2?|ttf))(?:'|")?\)/g)) {
      checked += 1;
      if (!existsSync(join(latticeAssetsDir, match[1]))) {
        missing.push(`${cssFile} -> ${match[1]}`);
      }
    }
  }
  assert.ok(checked > 0, '白板产物应包含 KaTeX 字体引用(katex 异步 css chunk);一个都没有说明公式样式链断了');
  assert.deepEqual(missing, [], `白板产物 CSS 引用了未入库的字体文件: ${missing.join(', ')}`);
});

test('lattice assets: KaTeX 字体组已随白板产物分发', () => {
  const fonts = readdirSync(latticeAssetsDir).filter((f) => f.startsWith('KaTeX_'));
  assert.ok(fonts.some((f) => f.endsWith('.woff2')), 'KaTeX woff2 必须存在');
  assert.ok(fonts.length >= 10, `KaTeX 字体族应整组发出(当前 ${fonts.length} 个)`);
});
