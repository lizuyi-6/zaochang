// KaTeX 字体同步(postbuild):globals.css `@import "katex/dist/katex.min.css"` 只会把
// KaTeX 的 CSS(含 @font-face)打进产物,Vite 不会为 node_modules CSS 里的相对 url()
// 复制字体文件——线上 /assets/fonts/KaTeX_* 三连 404,全部公式用回退字体渲染(qa-runs
// 2026-10-02 P-010)。构建后把字体复制到产物 assets 目录,CSS 里的相对引用即可命中。
// 引用完整性由 tests/build-assets.test.mjs 兜底:产物 CSS 中每个 url(fonts/…) 都必须
// 在 dist/client/assets/fonts/ 下存在。
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const src = join(process.cwd(), "node_modules", "katex", "dist", "fonts");
const out = join(process.cwd(), "dist", "client", "assets", "fonts");

if (!existsSync(src)) {
  console.error("[sync-katex-fonts] katex 字体源不存在:", src);
  process.exit(1);
}
mkdirSync(out, { recursive: true });
cpSync(src, out, { recursive: true });
console.log(`[sync-katex-fonts] 已同步 ${readdirSync(out).length} 个字体文件 → dist/client/assets/fonts/`);
