import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const spa = new URL('../hyperknow-spa/', import.meta.url);
const spaRequire = createRequire(new URL('package.json', spa));
const ts = spaRequire('typescript');
const moduleCache = new Map();

function resolveSpec(fromUrl, spec) {
  const base = new URL(spec, fromUrl);
  for (const candidate of [base.href, `${base.href}.ts`, `${base.href}.tsx`, `${base.href}.json`]) {
    if (existsSync(fileURLToPath(candidate))) return new URL(candidate);
  }
  throw new Error(`cannot resolve ${spec} from ${fromUrl.pathname}`);
}

function loadTsModule(url) {
  if (moduleCache.has(url.href)) return moduleCache.get(url.href);
  if (url.href.endsWith('.json')) {
    const parsed = JSON.parse(readFileSync(url, 'utf8'));
    moduleCache.set(url.href, parsed);
    return parsed;
  }
  const source = readFileSync(url, 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: fileURLToPath(url),
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });
  const fakeModule = { exports: {} };
  moduleCache.set(url.href, fakeModule.exports);
  const localRequire = (spec) => spec.startsWith('.') ? loadTsModule(resolveSpec(url, spec)) : spaRequire(spec);
  new Function('require', 'module', 'exports', compiled.outputText)(localRequire, fakeModule, fakeModule.exports);
  return fakeModule.exports;
}

const selection = loadTsModule(new URL('src/lattice/courseSelection.ts', spa));
const journeySource = readFileSync(new URL('src/lattice/pages/CourseJourney.tsx', spa), 'utf8');
const createSource = readFileSync(new URL('src/lattice/pages/CreatePage.tsx', spa), 'utf8');

const apBio = {
  id: 'ap-bio',
  title: 'AP 生物学',
  description: '以探究为导向，研究细胞与遗传。',
  cover: 'bio',
};

const previousSociology = {
  screen: 'courseJourney',
  activeCourseUuid: '091d5945-4f34-4bfc-9d3b-c34b76d62ee5',
  generated: { courseUuid: '091d5945-4f34-4bfc-9d3b-c34b76d62ee5', title: '社会学导论' },
  activeUnitId: 'old-unit',
  activeLectureId: 'old-lecture',
  activeSessionId: 'old-session',
  activeTopic: '社会学旧讲次',
  courseJoined: true,
  lectureDone: true,
  lectureCompletePrompt: true,
  courseLoading: true,
  courseError: 'old_error',
  whiteboardMode: 'practice',
};

test('切换到无 UUID 课程卡会清空旧课程身份与讲次状态并显示卡片原文案', () => {
  const next = selection.openCourseCardState(previousSociology, apBio);

  assert.equal(next.activeCourseUuid, undefined);
  assert.equal(next.generated.title, 'AP 生物学');
  assert.equal(next.generated.description, apBio.description);
  assert.equal(next.generated.cover, 'bio');
  assert.equal(next.activeCourseCardNeedsGeneration, true);
  assert.equal(next.activeLectureId, undefined);
  assert.equal(next.activeSessionId, undefined);
  assert.equal(next.activeUnitId, undefined);
  assert.equal(next.activeTopic, undefined);
  assert.equal(next.courseLoading, false);
  assert.equal(next.courseError, null);
  assert.equal(next.courseJoined, false);
  assert.equal(next.lectureDone, false);
  assert.equal(next.lectureCompletePrompt, false);
  assert.equal(next.whiteboardMode, 'lecture');
});

test('真实课程卡使用传入 UUID 并进入详情加载态', () => {
  const next = selection.openCourseCardState(previousSociology, {
    id: 'live-course',
    title: '真实课程',
    description: '后端课程描述',
    cover: 'ml',
  }, { courseUuid: 'real-course-uuid' });

  assert.equal(next.activeCourseUuid, 'real-course-uuid');
  assert.equal(next.courseLoading, true);
  assert.equal(next.courseError, null);
  assert.equal(next.activeCourseCardNeedsGeneration, false);
  assert.equal(next.activeLectureId, undefined);
});

test('演示卡 hash 恢复准确卡片且创建动作预填标题', () => {
  const selected = selection.openCourseCardState(previousSociology, apBio);
  const hash = selection.courseHashForState('coursePreview', selected);
  assert.match(hash, /^#\/course\/preview\?/);
  assert.match(hash, /card=ap-bio/);
  assert.doesNotMatch(hash, /091d5945-4f34-4bfc-9d3b-c34b76d62ee5/);

  const restored = selection.courseCardStateFromQuery(
    previousSociology,
    new URLSearchParams(hash.slice(hash.indexOf('?') + 1)),
  );
  assert.equal(restored.screen, 'coursePreview');
  assert.equal(restored.activeCourseUuid, undefined);
  assert.equal(restored.generated.title, apBio.title);
  assert.equal(restored.generated.description, apBio.description);
  assert.equal(restored.generated.cover, apBio.cover);

  const create = selection.createCourseFromCardPatch(restored);
  assert.equal(create.screen, 'create');
  assert.equal(create.createPrompt, apBio.title);
  assert.equal(create.activeCourseUuid, undefined);
  assert.equal(create.activeCourseCardNeedsGeneration, undefined);
  assert.equal(create.activeLectureId, undefined);
  assert.equal(create.generated, null);
  assert.match(journeySource, /if\s*\(demoCardNeedsGeneration\)\s*\{\s*routeDemoToCreate\(\);/);
  assert.match(journeySource, /const routeDemoToCreate = \(\) => set\(createCourseFromCardPatch\(state\)\)/);
});

test('各卡片入口共用选择函数且演示卡不会打开加入弹窗或白板', () => {
  const entrypoints = [
    ['src/App.tsx', /courseCardStateFromQuery\(current, q\)[\s\S]*courseHashForState\('coursePreview', s\)/],
    ['src/lattice/pages/MarketplacePage.tsx', /openCourseCardState\(state, course/],
    ['src/lattice/pages/Home.tsx', /openCourseCardState\(state, c/],
    ['src/lattice/pages/CoursesPage.tsx', /openCourseCardState\(state, card, options\)/],
    ['src/lattice/pages/Onboarding.tsx', /openCourseCardState\(state, card\)/],
  ];
  for (const [path, contract] of entrypoints) {
    assert.match(readFileSync(new URL(path, spa), 'utf8'), contract, `${path} uses shared course switch`);
  }
  const openLessonStart = journeySource.indexOf('const openLesson =');
  const openLessonEnd = journeySource.indexOf('/* "练习"标签', openLessonStart);
  assert.ok(openLessonStart >= 0 && openLessonEnd > openLessonStart, 'openLesson handler is present');
  const openLessonHandler = journeySource.slice(openLessonStart, openLessonEnd);
  assert.match(openLessonHandler, /if\s*\(demoCardNeedsGeneration\)\s*\{\s*routeDemoToCreate\(\);\s*return;/);
  assert.match(openLessonHandler, /routeDemoToCreate\(\);[\s\S]*screen:\s*'whiteboard'/);
  assert.match(journeySource, /if \(demoCardNeedsGeneration\) \{\s*routeDemoToCreate\(\);\s*\} else if \(!joined\)/);
  assert.match(journeySource, /!demoCardNeedsGeneration\s*&&\s*dialog === 'join'/);
  assert.match(createSource, /const seed = state\.createPrompt\.trim\(\);[\s\S]{0,500}startIntake\(seed\)/);
});
