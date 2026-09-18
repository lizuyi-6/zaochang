import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as protocol from '../app/api/_lib/hyperknow/protocol.ts';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../app/api/_lib/hyperknow/dag-finalizer.ts', import.meta.url), 'utf8');
const mod = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => protocol, mod, mod.exports);
const { finalizeCourseDependencies } = mod.exports;
const cycle = () => [{ unitId: 'a', prerequisites: ['b'] }, { unitId: 'b', prerequisites: ['a'] }];
test('DAG: acyclic courses require no repair', async () => {
  await finalizeCourseDependencies([{ unitId: 'a' }], () => assert.fail('unexpected repair'));
});
test('DAG: successful repair is revalidated', async () => {
  const units = cycle();
  let calls = 0;
  await finalizeCourseDependencies(units, async (unit) => { calls++; return { ...unit, prerequisites: [] }; });
  assert.equal(calls, 2);
  assert.equal(protocol.checkPrerequisitesAcyclic(units).isAcyclic, true);
});
for (const [label, repair, message] of [
  ['null', async () => null, 'course_dependency_repair_failed'],
  ['unchanged cycle', async (unit) => unit, 'course_dependencies_cyclic'],
  ['upstream exception', async () => { throw new Error('upstream'); }, 'upstream'],
]) {
  test(`DAG: ${label} cannot continue to successful persistence`, async () => {
    let saved = false;
    await assert.rejects(async () => {
      await finalizeCourseDependencies(cycle(), repair);
      saved = true;
    }, new RegExp(message));
    assert.equal(saved, false);
  });
}
test('DAG: cancellation stops repair and success', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(finalizeCourseDependencies(cycle(), () => assert.fail('unexpected repair'), controller.signal), { name: 'AbortError' });
});
test('DAG: both generation route branches await finalization before saveCourse', () => {
  const route = readFileSync(new URL('../app/api/hyperknow/course-generation/route.ts', import.meta.url), 'utf8');
  const finalizers = [...route.matchAll(/await finalizeCourseDependencies\(/g)].map(m => m.index);
  const saves = [...route.matchAll(/await saveCourse\(/g)].map(m => m.index);
  assert.equal(finalizers.length, 2);
  assert.equal(saves.length, 2);
  for (let i = 0; i < 2; i++) assert.ok(finalizers[i] < saves[i] && (i === 0 || finalizers[i] > saves[i - 1]));
});
