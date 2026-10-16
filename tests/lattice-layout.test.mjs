import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { diagramBox, renderDiagram } from '../hyperknow-spa/src/lattice/whiteboard/diagram.ts';

const require = createRequire(new URL('../hyperknow-spa/package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../hyperknow-spa/src/lattice/whiteboard/liveLesson.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', compiled)((spec) => {
  if (spec === './diagram') return { diagramBox, renderDiagram };
  if (spec === './lessonScript') return { VIOLET: '#7654aa' };
  if (spec === './sanitizeNarration') return { sanitizeNarration: (t) => t };
  if (spec === '../i18n/content') return { L: (_en, zh) => zh };
  throw new Error(`Unexpected dependency: ${spec}`);
}, mod, mod.exports);
const { liveLessonFromPlan } = mod.exports;

function plan(actions) {
  return { steps: actions.map((board_action, i) => ({ step_id: String(i), spoken_text: '讲解', board_action })) };
}
function diagram(nodes) {
  return { type: 'diagram', code: 'graph TD\n' + Array.from({ length: nodes - 1 }, (_, i) => `N${i}[节点${i}] --> N${i + 1}[节点${i + 1}]`).join('\n') };
}
for (const n of [3, 4, 8]) {
  test(`layout: ${n}-node diagram reserves its rendered height before a card`, () => {
    const action = diagram(n);
    const [drawing, card] = liveLessonFromPlan(plan([action, { type: 'card', title: '总结' }])).items;
    const height = diagramBox(renderDiagram(action.code)).h;
    assert.ok(height > 388);
    assert.ok(card.x > drawing.x || card.y >= drawing.y + height + 28);
  });
}
test('layout: a tall diagram moves columns before exceeding the height limit', () => {
  const action = diagram(4);
  const [formula, drawing] = liveLessonFromPlan(plan([{ type: 'formula', latex: 'x=1' }, action])).items;
  assert.equal(formula.x, 60);
  assert.equal(drawing.x, 420);
  assert.equal(drawing.y, 94);
  assert.ok(drawing.y + diagramBox(renderDiagram(action.code)).h <= 580);
});
test('layout: unsupported diagrams reserve their rendered fallback text height', () => {
  const [drawing, next] = liveLessonFromPlan(plan([
    { type: 'diagram', code: 'not a diagram', title: '说明' },
    { type: 'card', title: '总结' },
  ])).items;
  assert.equal(renderDiagram(drawing.diagram), null);
  assert.equal(next.x, drawing.x);
  assert.equal(next.y, drawing.y + drawing.lines.length * drawing.size * 1.24 + 28);
});

test('layout: a long card body continues into the next column instead of being silently cut at 10 lines', () => {
  // 生产实测:模型写了 12+ 行的开场卡,旧实现 wrapRuns 硬截 10 行且无省略号,学员只看到半句话
  const sentences = Array.from({ length: 18 }, (_, i) => `<p>第${i + 1}条:社会学的想象力把个人困扰与公共议题联系起来。</p>`).join('');
  const { items } = liveLessonFromPlan(plan([{ type: 'card', title: '本讲开场', content: sentences }]));
  const bodies = items.filter((it) => /^c1b/.test(it.id));
  assert.ok(bodies.length >= 2, `超长正文应续排成多块,实际 ${bodies.length}`);
  const text = bodies.flatMap((b) => b.lines.map((l) => l.map((s) => s.t).join(''))).join('');
  assert.ok(text.includes('第18条'), '最后一条要点必须上板,不得被截断');
  for (const b of bodies) {
    assert.ok(b.y + b.lines.length * 19 * 1.24 <= 580 + 0.5 || b.x === 1540, `续排块越过列高上限: y=${b.y} lines=${b.lines.length}`);
    assert.equal(b.step, 1, '续排块与首块同一步写出');
  }
  assert.ok(bodies[1].x > bodies[0].x, '续排块落在下一列');
  assert.equal(new Set(items.map((it) => it.id)).size, items.length, '板书元素 id 必须唯一');
});

test('layout: a normal short card stays one block under its title', () => {
  const { items } = liveLessonFromPlan(plan([{ type: 'card', title: '要点', content: '<ul><li>一</li><li>二</li></ul>' }]));
  assert.deepEqual(items.map((it) => it.id), ['c1t', 'c1b']);
  assert.equal(items[1].x, items[0].x);
});

test('layout: a runaway card body is capped visibly (ellipsis), never silently', () => {
  const huge = Array.from({ length: 80 }, (_, i) => `<p>第${i + 1}条要点</p>`).join('');
  const { items } = liveLessonFromPlan(plan([{ type: 'card', title: '失控', content: huge }]));
  const lines = items.filter((it) => /^c1b/.test(it.id)).flatMap((b) => b.lines);
  assert.equal(lines.length, 48, '安全上限 48 行');
  assert.equal(lines.at(-1).at(-1).t, '…', '超限末行必须带省略号');
});

test('layout: Chinese card wrapping keeps digit runs whole and obeys 避头尾 (no 「990 / 0名」, no line-leading comma)', () => {
  const content = '<p>初始假设：全人群感染先验概率1%，即10000人中有100名感染者，9900名未感染者。后验计算：真阳性/(真阳性+假阳性)=95/(95+495)≈16.1%，远低于直觉的95%（这就是“基率忽略”）。</p>';
  const { items } = liveLessonFromPlan(plan([{ type: 'card', title: '机制拆解', content }]));
  const lines = items.filter((it) => /^c1b/.test(it.id)).flatMap((b) => b.lines.map((l) => l.map((s) => s.t).join('')));
  assert.ok(lines.length >= 3);
  const joined = lines.join('');
  for (const num of ['10000', '9900', '16.1%', '95%']) {
    assert.ok(lines.some((l) => l.includes(num)), `数字串 ${num} 不得被折行拆开: ${JSON.stringify(lines)}`);
  }
  assert.equal(joined.replace(/\s/g, ''), content.replace(/<[^>]+>/g, '').replace(/\s/g, ''), '折行不得丢字');
  for (const l of lines.slice(1)) assert.ok(!/^[，。、；：！？）》」』”’,.;:!?)%]/.test(l), `行首不得是收尾标点: ${l}`);
  for (const l of lines.slice(0, -1)) assert.ok(!/[（《「『“‘(]$/.test(l), `行尾不得是开括号/开引号: ${l}`);
});
