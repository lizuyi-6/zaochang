// SPA 类型门禁:根 tsconfig 排除 hyperknow-spa,而 SPA 构建脚本里的 `tsc -b`
// 只有跑 `npm run build` 才会执行——直接 vite build 或漏跑都会让类型错误上线
// (2026-10-01 实锤:useRef 未导入,根 tsc 不覆盖、直接 vite build 不查,白屏到线上)。
// 本测试在门禁里强制跑一遍 SPA 的 tsc -b,堵住这个盲区。
// Node 24 起 spawn .cmd 报 EINVAL,故用 node 直调 typescript 的 js 入口。
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const spaDir = join(root, '..', 'hyperknow-spa');

// 每个可用的 TypeScript 都要过:根目录的(CI 不装 SPA 依赖,只有它)+ SPA 自带的(vite build 用它)。
// 2026-11-02:本地只跑了 SPA 自带的 TS 6(能按 `!x.graded` 收窄联合类型)而 CI 回退到根 TS 5.9 报错——
// 本地绿、CI 红。两个都跑,本地通过即意味着 CI 通过。
test('hyperknow-spa tsc -b 零类型错误', () => {
  const candidates = [
    join(root, '..', 'node_modules', 'typescript', 'bin', 'tsc'),
    join(spaDir, 'node_modules', 'typescript', 'bin', 'tsc'),
  ].filter((p) => existsSync(p));
  if (!candidates.length) throw new Error('typescript not found (expected under hyperknow-spa or repo root node_modules)');
  for (const tscJs of candidates) {
    try {
      const out = execFileSync(process.execPath, [tscJs, '-b', '--pretty', 'false'], {
        cwd: spaDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 180_000,
      });
      if (out && out.trim()) throw new Error(`tsc -b reported:\n${out.trim().slice(0, 2000)}`);
    } catch (err) {
      const detail = typeof err === 'object' && err !== null && 'stdout' in err && String(err.stdout || '').trim()
        ? String(err.stdout)
        : String(err.message ?? err);
      throw new Error(`SPA typecheck failed (${tscJs}):\n${detail.slice(0, 2000)}`);
    }
  }
});
