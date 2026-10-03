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
