// 课程内容完整性回归(零 Wrangler/网络):伪生成课程骨架、预置公开课、市场卡片
// 节数口径、后端课程 kind 推导、官方示例课树、大纲 fallback 语言跟随。
// SPA 侧模块经 typescript 转译 + 递归相对导入加载(index.tsx 含 JSX,不能直接
// --experimental-strip-types);服务端纯模块直接 import。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { SAMPLE_COURSES, getSampleCourse, sampleMarketRow } from "../app/api/_lib/hyperknow/samples.ts";
import { fallbackCourseStructure, parseCourseStructure } from "../app/api/_lib/hyperknow/prompts.ts";

const spa = new URL("../hyperknow-spa/", import.meta.url);
const spaRequire = createRequire(new URL("package.json", spa));
const ts = spaRequire("typescript");

/* 极简 TS/TSX CommonJS 加载器:相对导入递归转译,react 用 SPA 自己的依赖,
   .json 直接解析。只用于纯数据/逻辑模块,不渲染。 */
const moduleCache = new Map();
function resolveSpec(fromUrl, spec) {
  const base = new URL(spec, fromUrl);
  for (const candidate of [base.href, `${base.href}.ts`, `${base.href}.tsx`, `${base.href}.json`]) {
    const path = fileURLToPath(candidate);
    if (existsSync(path)) return new URL(candidate);
  }
  throw new Error(`cannot resolve ${spec} from ${fromUrl.pathname}`);
}
function loadTsModule(url) {
  if (moduleCache.has(url.href)) return moduleCache.get(url.href);
  if (url.href.endsWith(".json")) {
    const parsed = JSON.parse(readFileSync(url, "utf8"));
    moduleCache.set(url.href, parsed);
    return parsed;
  }
  const source = readFileSync(url, "utf8");
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
  const localRequire = (spec) => {
    if (!spec.startsWith(".")) return spaRequire(spec);
    return loadTsModule(resolveSpec(url, spec));
  };
  new Function("require", "module", "exports", compiled.outputText)(localRequire, fakeModule, fakeModule.exports);
  return fakeModule.exports;
}

const gen = loadTsModule(new URL("src/replica/generate.ts", spa));
const data = loadTsModule(new URL("src/replica/data.ts", spa));

const sessionTotal = (units) =>
  units.reduce((n, u) => n + u.lectures.reduce((m, l) => m + l.sessions.length, 0), 0);
const kindsOf = (unit) => unit.lectures.map((l) => l.kind ?? "lecture");

test("伪生成课程骨架:4 单元,每单元 3 讲 + 1 项目 + 1 测验,节数与卡片口径一致", () => {
  const course = gen.buildGeneratedCourse("机器学习");
  assert.equal(course.units.length, 4);
  for (const unit of course.units) {
    assert.ok(unit.lectures.length > 0, "单元不许为空");
    assert.deepEqual(kindsOf(unit), ["lecture", "lecture", "lecture", "project", "exam"]);
    for (const lec of unit.lectures) assert.ok(lec.sessions.length > 0, `讲次 ${lec.id} 不许没有小节`);
  }
  assert.equal(sessionTotal(course.units), gen.GENERATED_LESSON_COUNT);
  assert.equal(gen.countCourseSessions(course.units), gen.GENERATED_LESSON_COUNT);
  /* CourseJourney 以 id==='l1' 判定首讲 */
  assert.equal(course.units[0].lectures[0].id, "l1");
  /* 单元标题不带"Unit N"/"第 N 单元"前缀(前缀由 CourseJourney 统一拼装) */
  for (const unit of course.units) assert.doesNotMatch(unit.title, /^\s*(unit\s*\d+|第\s*\d+\s*单元)/i);
});

test("市场/首页卡片节数 = 点进去的实际节数(同一生成器现算)", () => {
  for (const card of [...data.homeCourses(), ...data.marketplaceFeatured()]) {
    assert.equal(card.lessons, gen.GENERATED_LESSON_COUNT, card.id);
    const preview = gen.buildGeneratedCourse(card.title);
    assert.equal(sessionTotal(preview.units), card.lessons, card.id);
  }
});

test("预置公开课(Public Speaking):5 单元全量,每单元有讲有项目有测验,无空讲", () => {
  const units = data.publicSpeaking();
  assert.equal(units.length, 5);
  for (const unit of units) {
    assert.ok(unit.lectures.length >= 5, `unit ${unit.id} 讲次不足`);
    assert.ok(kindsOf(unit).includes("project"), `unit ${unit.id} 缺项目`);
    assert.ok(kindsOf(unit).includes("exam"), `unit ${unit.id} 缺测验`);
    for (const lec of unit.lectures) assert.ok(lec.sessions.length > 0, `${lec.id} 没有小节`);
  }
  assert.equal(sessionTotal(units), 61);
  assert.equal(units[0].lectures[0].id, "l1");
  assert.ok(units[0].lectures[0].sessions[0].upNext, "首节保留 upNext 标记");
});

test("courseFromBackend:按标题推导项目/测验 kind,剥掉单元标题前缀防双前缀", () => {
  const backendCourse = {
    courseTitle: "机器学习基础",
    courseDescription: "desc",
    targetLearner: "learner",
    tags: ["AI"],
    units: [
      {
        title: "第 1 单元：基础",
        unitId: "unit-1",
        lectures: [
          { title: "什么是机器学习", lectureId: "lec-1", sessions: [{ title: "直觉", sessionTime: 20, depthTags: [] }] },
          { title: "项目：动手做", lectureId: "lec-2", sessions: [{ title: "实现", sessionTime: 30, depthTags: [] }] },
          { title: "测验：单元测验", lectureId: "lec-3", sessions: [{ title: "限时测验", sessionTime: 15, depthTags: [] }] },
        ],
      },
      { title: "Unit 2: Practice", unitId: "unit-2", lectures: [{ title: "Practice lab", lectureId: "lec-4", sessions: [] }] },
    ],
  };
  const course = gen.courseFromBackend(backendCourse, "fallback");
  assert.equal(course.units[0].title, "基础");
  assert.equal(course.units[1].title, "Practice");
  assert.match(course.unit1Title, /基础/);
  const kinds = course.units[0].lectures.map((l) => l.kind);
  assert.deepEqual(kinds, ["lecture", "project", "exam"]);
  assert.equal(course.units[0].lectures[0].id, "l1");
});

test("官方示例课:完整中文课程树,市场行节数由结构现算,详情可按 id 解析", () => {
  assert.equal(SAMPLE_COURSES.length, 2);
  for (const course of SAMPLE_COURSES) {
    assert.match(course.courseTitle, /[一-鿿]/, "课程名必须是中文");
    assert.doesNotMatch(course.courseTitle, /^[A-Za-z\s:]+$/, "课程名不许是纯英文");
    assert.ok(course.units.length >= 4, "示例课至少 4 单元");
    for (const unit of course.units) {
      const titles = unit.lectures.map((l) => l.title);
      assert.ok(titles.some((t) => t.startsWith("项目")), `示例课单元缺项目:${unit.title}`);
      assert.ok(titles.some((t) => t.startsWith("测验")), `示例课单元缺测验:${unit.title}`);
      for (const lec of unit.lectures) assert.ok(lec.sessions.length > 0, `${lec.title} 没有小节`);
    }
    const row = sampleMarketRow(course);
    assert.equal(row.sessionCount, sessionTotal(course.units));
    assert.equal(row.unitCount, course.units.length);
    assert.equal(row.courseUuid, course.marketplaceId);
    assert.equal(getSampleCourse(course.marketplaceId), course);
  }
  assert.equal(getSampleCourse("no-such-id"), undefined);
});

test("大纲 fallback 跟随查询语言,且结构含项目与测验讲次", () => {
  const zh = fallbackCourseStructure("机器学习");
  assert.ok(zh.units.length >= 3);
  assert.match(zh.units[0].title, /[一-鿿]/);
  const zhTitles = zh.units.flatMap((u) => u.lectures.map((l) => l.title));
  assert.ok(zhTitles.some((t) => t.startsWith("项目：")), "中文 fallback 缺项目讲次");
  assert.ok(zhTitles.some((t) => t.startsWith("测验：")), "中文 fallback 缺测验讲次");
  const en = fallbackCourseStructure("Biology");
  assert.match(en.units[0].title, /^[A-Za-z ]+$/);
  const enTitles = en.units.flatMap((u) => u.lectures.map((l) => l.title));
  assert.ok(enTitles.some((t) => t.startsWith("Project:")), "英文 fallback 缺项目讲次");
  assert.ok(enTitles.some((t) => t.startsWith("Exam:")), "英文 fallback 缺测验讲次");
  /* 坏 JSON 仍走 fallback,课程标题保留查询词 */
  assert.deepEqual(parseCourseStructure("boom", "机器学习"), zh);
});
