// 白板讲课计划的超时预算契约(qa-runs 2026-10-02 P-001):
// 服务端路由 130s 预算 > 冷实例实测 92-100s;客户端 abort 必须大于服务端预算,否则
// 浏览器会在服务端仍在成功生成时提前掐死请求(d59be3b 只放宽了服务端 110→130s,
// 客户端仍停在 65s,修复对冷实例实际不生效)。所有调用点必须引用导出常量,禁止内联
// 数字——本测试逐文件扫描锁死。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

test('plan budget: client abort budget exceeds the server route timeout, via exported constant', () => {
  const route = read('app/api/hyperknow/whiteboard/plan/route.ts');
  const serverMatch = route.match(/AbortSignal\.timeout\((\d+_000)\)/);
  assert.ok(serverMatch, 'plan 路由必须显式设置 AbortSignal.timeout');
  const serverMs = Number(serverMatch[1].replace('_', ''));

  const backend = read('hyperknow-spa/src/lattice/backend.ts');
  const constMatch = backend.match(/export const PLAN_CLIENT_TIMEOUT_MS = (\d+_000)/);
  assert.ok(constMatch, 'SPA 必须导出 PLAN_CLIENT_TIMEOUT_MS 常量(调用点禁止内联数字)');
  const clientMs = Number(constMatch[1].replace('_', ''));

  assert.ok(serverMs >= 130_000, `服务端预算应 ≥130s(冷实例实测 92-100s),当前 ${serverMs}ms`);
  assert.ok(clientMs > serverMs, `客户端兜底(${clientMs}ms)必须大于服务端超时(${serverMs}ms),否则服务端预算成空话`);

  const page = read('hyperknow-spa/src/lattice/whiteboard/WhiteboardPage.tsx');
  assert.match(page, /PLAN_CLIENT_TIMEOUT_MS/, 'WhiteboardPage 必须引用常量而非内联毫秒数');
});

test('plan budget: no inline abort timers on plan fetch paths anywhere in the SPA', () => {
  const spaSrc = join(root, 'hyperknow-spa', 'src');
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const text = readFileSync(full, 'utf8');
        // ctrl.abort() 后面直接跟毫秒字面量的定时器 = 又一个会失配的内联预算
        for (const m of text.matchAll(/abort\(\),\s*\d+_000/g)) offenders.push(`${full}: ${m[0]}`);
      }
    }
  };
  walk(spaSrc);
  assert.deepEqual(offenders, [], '发现内联 abort 毫秒数,必须改用 PLAN_CLIENT_TIMEOUT_MS 等导出常量');
});
