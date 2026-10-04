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
  // W1(2026-10 审计):预算属于"每次请求"而非"整轮备课"——重试共用一个计时器时,
  // 冷启动首发烧掉 ~100s 后重试只剩 ~35s 注定失败。
  assert.match(page, /const requestWithBudget = async/, '每次真实计划请求必须经独立预算包装');
  assert.match(page, /AbortSignal\.any\(\[ctrl\.signal, reqCtrl\.signal\]\)/, '请求级超时与卸载级中止必须取交,各自独立计时');
  assert.doesNotMatch(page, /planLectureLive\(planParams, ctrl\.signal\)/, '不得再直接以整轮 ctrl 作为请求超时载体');
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

test('inquiry budget: server degrade ceiling (55s) stays below the client fallback (60s)', () => {
  // 同族时限不变量(qa-runs 2026-10-02 P-002):服务端 55s 先降级并如实标注 source,
  // 客户端 60s 兜底只负责网络层失败。若两端被单独改动而倒挂(服务端 ≥ 客户端),
  // 客户端会先 ERR_ABORTED,拿不到真实降级响应,静默拼本地模板。
  const route = read('app/api/hyperknow/course-inquiry/route.ts');
  const serverMatch = route.match(/AbortSignal\.timeout\((\d+_000)\)/);
  assert.ok(serverMatch, 'course-inquiry 路由必须显式设置 AbortSignal.timeout(服务端降级上限)');
  const serverMs = Number(serverMatch[1].replace('_', ''));

  const page = read('hyperknow-spa/src/lattice/pages/CreatePage.tsx');
  const clientMatch = page.match(/timeoutMs:\s*(\d+_000)/);
  assert.ok(clientMatch, 'CreatePage 必须为问询请求设置 timeoutMs 客户端兜底');
  const clientMs = Number(clientMatch[1].replace('_', ''));

  assert.ok(serverMs === 55_000, `服务端降级上限应为 55s,当前 ${serverMs}ms`);
  assert.ok(clientMs > serverMs, `客户端兜底(${clientMs}ms)必须大于服务端降级上限(${serverMs}ms),保证拿到真实降级响应`);
});
