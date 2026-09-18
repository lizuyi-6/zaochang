import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { diagramBox, renderDiagram } from '../hyperknow-spa/src/replica/whiteboard/diagram.ts';

const require = createRequire(new URL('../hyperknow-spa/package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../hyperknow-spa/src/replica/whiteboard/liveLesson.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', compiled)((spec) => {
  if (spec === './diagram') return { diagramBox, renderDiagram };
  if (spec === './lessonScript') return { VIOLET: '#7654aa' };
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
