import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  normalizeLectureFocus,
  normalizeLectureStepFocuses,
  parseLecturePlan,
  repairLooseJson,
  salvageLectureSteps,
} from '../app/api/_lib/hyperknow/prompts.ts';
import { diagramBox, renderDiagram } from '../hyperknow-spa/src/lattice/whiteboard/diagram.ts';

const spa = new URL('../hyperknow-spa/', import.meta.url);
const spaRequire = createRequire(new URL('package.json', spa));
const ts = spaRequire('typescript');

function loadTsModule(url) {
  const source = readFileSync(url, 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: fileURLToPath(url),
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const fakeModule = { exports: {} };
  const localRequire = (spec) => {
    if (spec === './diagram') return { diagramBox, renderDiagram };
    if (spec === './lessonScript') return { VIOLET: '#5B21B6' };
    if (spec === './sanitizeNarration') return { sanitizeNarration: (text) => text };
    if (spec === './focus') return focusModule;
    if (spec === '../i18n/content') return { L: (_en, zh) => zh };
    throw new Error(`Unexpected dependency: ${spec}`);
  };
  new Function('require', 'module', 'exports', compiled.outputText)(localRequire, fakeModule, fakeModule.exports);
  return fakeModule.exports;
}

const focusModule = loadTsModule(new URL('src/lattice/whiteboard/focus.ts', spa));
const { focusAnnotationsForPlan } = focusModule;
const { liveLessonFromPlan } = loadTsModule(new URL('src/lattice/whiteboard/liveLesson.ts', spa));

function step(step_id, board_action, focus) {
  return {
    step_id,
    spoken_text: '讲解这一步的具体内容。',
    board_action,
    ...(focus === undefined ? {} : { focus }),
  };
}

const card = (content = '<ul><li>第一条</li><li>第二条</li></ul>') => ({ type: 'card', title: '要点', content });

test('server focus normalization accepts current and earlier card, diagram, formula, and image targets', () => {
  const steps = [
    step('step_1', card(), { step: 'step_1', bullet: 2, kind: 'highlight' }),
    step('step_2', { type: 'diagram', code: 'graph TD\nA[Alpha] --> B[Beta]' }, { step: 'step_2', node: 'B', kind: 'circle' }),
    step('step_3', { type: 'formula', latex: 'x=y' }, { step: 'step_1', bullet: 1, kind: 'underline' }),
    step('step_4', { type: 'image', caption: '图' }, { step: 'step_3', kind: 'circle' }),
  ];
  const normalized = normalizeLectureStepFocuses(steps);
  assert.deepEqual(normalized.map((item) => item.focus), [
    { step: 'step_1', bullet: 2, kind: 'highlight' },
    { step: 'step_2', node: 'B', kind: 'circle' },
    { step: 'step_1', bullet: 1, kind: 'underline' },
    { step: 'step_3', kind: 'circle' },
  ]);
  assert.equal(normalizeLectureFocus({ step: 'step_1', bullet: 2, kind: 'highlight' }, steps, 1).bullet, 2);
});

test('server drops only invalid focus and retains its lecture step', () => {
  const steps = [
    step('step_1', card(), { step: 'step_2', bullet: 1, kind: 'circle' }), // future
    step('step_2', { type: 'diagram', code: 'graph TD\nA[Alpha] --> B[Beta]' }, { step: 'missing', node: 'B', kind: 'circle' }),
    step('step_3', card('<ul><li>only one</li></ul>'), { step: 'step_3', bullet: 2, kind: 'highlight' }), // overflow
    step('step_4', card(), { step: 'step_4', bullet: 1.5, kind: 'highlight' }), // non-integer
    step('step_5', card(), { step: 'step_5', bullet: 1, kind: 'glow' }), // unknown kind
    step('step_6', card(), { bullet: 1, kind: 'circle' }), // missing step
    step('step_7', card(), { step: 'step_7', kind: 'underline' }), // card has no whole-card target
    step('step_8', card(), { step: 8, bullet: 1, kind: 'circle' }), // wrong step type
    step('step_9', { type: 'diagram', code: 'graph TD\nA[Alpha] --> B[Beta]' }, { step: 'step_9', node: 2, kind: 'circle' }), // wrong node type
    step('step_10', card(), { step: 'step_10', bullet: 1, node: 'A', kind: 'circle' }), // conflicting target fields
    step('step_11', card(), { step: 'step_11', bullet: 1 }), // missing kind
  ];
  const normalized = normalizeLectureStepFocuses(steps);
  assert.equal(normalized.length, 11, '无效 focus 不得删除教学步骤');
  for (const item of normalized) assert.equal(Object.hasOwn(item, 'focus'), false, `${item.step_id} 的无效 focus 应被剔除`);

  const parsed = parseLecturePlan(JSON.stringify({ steps }), '主题');
  assert.equal(parsed.steps.length, 11);
  assert.equal(parsed.steps[0].spoken_text, steps[0].spoken_text);
  assert.equal(parsed.steps[0].focus, undefined);
});

test('repairLooseJson and salvageLectureSteps preserve legal focus while discarding invalid focus only', () => {
  const valid = step('step_1', card(), { step: 'step_1', bullet: 1, kind: 'highlight' });
  const loose = `{"steps":[${JSON.stringify(valid)},],}`;
  const repaired = JSON.parse(repairLooseJson(loose));
  assert.deepEqual(repaired.steps[0].focus, valid.focus);

  const salvage = salvageLectureSteps(`{"steps":[${JSON.stringify(valid)},${JSON.stringify({ ...valid, step_id: 'step_2', focus: { step: 'step_1', bullet: 9, kind: 'circle' } })}`);
  assert.equal(salvage.length, 2, '半截整讲时仍保留两个有效教学步');
  assert.deepEqual(salvage[0].focus, valid.focus);
  assert.equal(salvage[1].focus, undefined, '抢救链只丢弃非法 focus');
});

test('client maps card bullet, diagram node, and formula focus to concrete transient rectangles', () => {
  const code = 'graph TD\nA[Alpha] --> B[Beta]';
  const plan = {
    session_id: 'session-1',
    topic: '聚光',
    steps: [
      step('step_1', card('<p>Beta appears in preface.</p><ul><li>Beta</li><li>Beta point</li></ul>')),
      step('step_2', { type: 'diagram', code }, { step: 'step_1', bullet: 2, kind: 'highlight' }),
      step('step_3', { type: 'formula', latex: 'x=y' }, { step: 'step_2', node: 'Beta', kind: 'circle' }),
      step('step_4', { type: 'image', caption: '图' }, { step: 'step_4', kind: 'circle' }),
      step('step_5', { type: 'quick_check' }, { step: 'step_3', kind: 'underline' }),
    ],
  };
  const items = [
    { id: 'c1b', step: 1, x: 60, y: 94, w: 320, size: 19, lines: [[{ t: 'Beta appears in preface.' }], [{ t: 'Beta' }], [{ t: 'Beta point' }]] },
    { id: 'd2', step: 2, x: 420, y: 94, w: 320, size: 14, diagram: code, lines: [] },
    { id: 'f3', step: 3, x: 780, y: 200, w: 320, h: 64, size: 16, formula: { latex: 'x=y' }, lines: [[{ t: 'x=y' }]] },
    { id: 'img4', step: 4, x: 1180, y: 94, w: 320, h: 260, size: 14, image: { width: 320, height: 220 }, lines: [] },
  ];
  const annotations = focusAnnotationsForPlan(plan, items);
  assert.equal(annotations.length, 4);
  const bulletRect = annotations[0];
  assert.deepEqual({ x: bulletRect.x, y: bulletRect.y, w: bulletRect.w, kind: bulletRect.kind, step: bulletRect.step }, {
    x: 60, y: 94 + 19 * 1.24 * 2, w: 320, kind: 'highlight', step: 2,
  });
  assert.ok(Math.abs(bulletRect.h - 19 * 1.24) < 0.000001, `bullet 高度应是两条基线间的完整行高: ${bulletRect.h}`);
  const rendered = renderDiagram(code);
  const node = rendered.nodeBoxes.find((candidate) => candidate.label === 'Beta');
  const shown = diagramBox(rendered, 320);
  const diagramRect = annotations[1];
  assert.equal(diagramRect.x, 420 + node.x * shown.w / rendered.w);
  assert.equal(diagramRect.y, 94 + node.y * shown.h / rendered.h);
  assert.equal(diagramRect.w, node.w * shown.w / rendered.w);
  assert.equal(diagramRect.h, node.h * shown.h / rendered.h);
  assert.equal(diagramRect.kind, 'circle');
  assert.equal(diagramRect.step, 3);
  assert.deepEqual(
    Object.fromEntries(['x', 'y', 'w', 'h', 'kind', 'step'].map((key) => [key, annotations[2][key]])),
    { x: 1180, y: 94, w: 320, h: 260, kind: 'circle', step: 4 },
  );
  assert.deepEqual(
    Object.fromEntries(['x', 'y', 'w', 'h', 'kind', 'step'].map((key) => [key, annotations[3][key]])),
    { x: 780, y: 200, w: 320, h: 64, kind: 'underline', step: 5 },
  );
  assert.ok(annotations.every((annotation) => annotation.transient === true));
});

test('client silently returns no rectangle for missing step, bullet, diagram node, or future target', () => {
  const base = {
    session_id: 's', topic: 't', steps: [
      step('step_1', card('<ul><li>One</li></ul>')),
      step('step_2', { type: 'diagram', code: 'graph TD\nA[Alpha] --> B[Beta]' }),
      step('step_3', { type: 'formula', latex: 'x=y' }),
      step('step_4', { type: 'quick_check' }),
    ],
  };
  const items = liveLessonFromPlan(base).items;
  for (const focus of [
    { step: 'missing', bullet: 1, kind: 'circle' },
    { step: 'step_1', bullet: 2, kind: 'highlight' },
    { step: 'step_2', node: 'absent', kind: 'circle' },
    { step: 'step_2', kind: 'underline' }, // 图不能作为无 selector 的整块目标
  ]) {
    const plan = { ...base, steps: base.steps.map((item) => ({ ...item })) };
    plan.steps[3].focus = focus;
    assert.deepEqual(focusAnnotationsForPlan(plan, items), [], `找不到目标时不应生成矩形: ${JSON.stringify(focus)}`);
  }
  const future = { ...base, steps: base.steps.map((item) => ({ ...item })) };
  future.steps[1].focus = { step: 'step_3', kind: 'underline' };
  assert.deepEqual(focusAnnotationsForPlan(future, items), []);

  const byId = { ...base, steps: base.steps.map((item) => ({ ...item })) };
  byId.steps[3].focus = { step: 'step_2', node: 'B', kind: 'circle' };
  const byIdRect = focusAnnotationsForPlan(byId, items)[0];
  assert.equal(byIdRect.kind, 'circle');
  assert.equal(byIdRect.step, 4);
  assert.ok(byIdRect.w > 0 && byIdRect.h > 0, 'diagram 节点 id B 应解析成非空矩形');
});

test('live lesson attaches focus annots; camera and export keep them transient', () => {
  const plan = {
    session_id: 's', topic: 't', steps: [
      step('step_1', card(), { step: 'step_1', bullet: 1, kind: 'highlight' }),
      step('step_2', { type: 'formula', latex: 'x=y' }),
    ],
  };
  const lesson = liveLessonFromPlan(plan);
  assert.equal(lesson.annots.length, 1);
  assert.equal(lesson.annots[0].step, 1);
  assert.equal(lesson.annots[0].transient, true);
  const board = readFileSync(new URL('../hyperknow-spa/src/lattice/whiteboard/Board.tsx', import.meta.url), 'utf8');
  assert.match(board, /annots\.filter\(\(an\) => an\.transient && an\.step === targetStep\)/, '相机优先聚焦旧板书目标矩形');
  assert.match(board, /an\.step < step - 1/, '旧聚光变浅一拍后移除');
  const page = readFileSync(new URL('../hyperknow-spa/src/lattice/whiteboard/WhiteboardPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /filter\(\(an\) => an\.transient && an\.step === s\.id\)/, '聚光在旁白步开始时并行显示');
  const exportSource = readFileSync(new URL('../hyperknow-spa/src/lattice/boardExport.ts', import.meta.url), 'utf8');
  assert.match(exportSource, /an\.transient && an\.step !== step/, '当前直播聚光随导出快照输出,旧聚光不累积');
});
