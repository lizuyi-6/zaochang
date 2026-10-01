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

test('hyperknow-spa tsc -b 零类型错误', () => {
  const candidates = [
    join(spaDir, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(root, '..', 'node_modules', 'typescript', 'bin', 'tsc'),
  ];
  const tscJs = candidates.find((p) => existsSync(p));
  if (!tscJs) throw new Error('typescript not found (expected under hyperknow-spa or repo root node_modules)');
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
    throw new Error(`SPA typecheck failed:\n${detail.slice(0, 2000)}`);
  }
});
