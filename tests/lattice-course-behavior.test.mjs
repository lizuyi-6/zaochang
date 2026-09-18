import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const spa = new URL("../hyperknow-spa/", import.meta.url);
const spaRequire = createRequire(new URL("package.json", spa));
const ts = spaRequire("typescript");

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

const data = loadTsModule(new URL("src/replica/data.ts", spa));
const backend = loadTsModule(new URL("src/replica/backend.ts", spa));
const joinMemory = loadTsModule(new URL("src/replica/courseJoinMemory.ts", spa));

test("封面分配策略：按主题精准匹配，杜绝一律话筒封面", () => {
  assert.equal(data.coverForTitle("人工智能导论"), "ai");
  assert.equal(data.coverForTitle("Prompt Engineering with LLMs"), "ai");
  assert.equal(data.coverForTitle("Python 实战与编程"), "prompt");
  assert.equal(data.coverForTitle("机器学习与神经网络"), "ml");
  assert.equal(data.coverForTitle("AP 心理学基础"), "psych");
  assert.equal(data.coverForTitle("西方哲学史与逻辑思考"), "philo");
  assert.equal(data.coverForTitle("高等数学与微积分"), "stats");
  assert.equal(data.coverForTitle("世界历史与近代文明"), "history");
  assert.equal(data.coverForTitle("基因与分子生物学"), "bio");
  assert.equal(data.coverForTitle("社会学与传播研究"), "sociology");
});

test("depth 规范化：overview / systematic / deep 兼容旧值", () => {
  assert.equal(backend.normalizeDepth("核心通识（二八法则快速入门）"), "overview");
  assert.equal(backend.normalizeDepth("overview"), "overview");
  assert.equal(backend.normalizeDepth("系统实战（理论兼顾实操）"), "systematic");
  assert.equal(backend.normalizeDepth("systematic"), "systematic");
  assert.equal(backend.normalizeDepth("严谨学术（完整逻辑推导）"), "deep");
  assert.equal(backend.normalizeDepth("工业级深度（解决复杂实际问题）"), "deep");
  assert.equal(backend.normalizeDepth("deep"), "deep");
  assert.equal(backend.normalizeDepth(undefined), "systematic");
});

/* ---------------- 课程加入记忆：刷新/深链/集市重开不再重复弹加入确认 ---------------- */

function withLocalStorageScope(run) {
  const store = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  try {
    return run(store);
  } finally {
    globalThis.localStorage = previous;
  }
}

test("加入记忆：mark 后 is 命中，按账户隔离，重复 mark 幂等", () => {
  withLocalStorageScope(() => {
    assert.equal(joinMemory.isCourseJoined("a@x.com", joinMemory.courseJoinKey("uuid-1")), false);
    joinMemory.markCourseJoined("a@x.com", joinMemory.courseJoinKey("uuid-1"));
    assert.equal(joinMemory.isCourseJoined("a@x.com", joinMemory.courseJoinKey("uuid-1")), true);
    // 账户隔离：另一账户不受污染
    assert.equal(joinMemory.isCourseJoined("b@x.com", joinMemory.courseJoinKey("uuid-1")), false);
    // 幂等：重复 mark 不产生重复键，也不抛错
    joinMemory.markCourseJoined("a@x.com", joinMemory.courseJoinKey("uuid-1"));
    joinMemory.markCourseJoined("a@x.com", joinMemory.courseJoinKey("uuid-2"));
    assert.equal(joinMemory.isCourseJoined("a@x.com", joinMemory.courseJoinKey("uuid-2")), true);
  });
});

test("加入记忆：无 UUID 课程回落演示课稳定键；存储损坏/不可用静默降级", () => {
  assert.equal(joinMemory.courseJoinKey(undefined), joinMemory.DEMO_COURSE_KEY);
  assert.equal(joinMemory.courseJoinKey("  "), joinMemory.DEMO_COURSE_KEY);
  assert.equal(joinMemory.courseJoinKey("uuid-9"), "uuid-9");
  withLocalStorageScope((store) => {
    // 同一演示课键：两个入口(集市无 UUID 卡 / 课程页默认课)落到同一记忆
    joinMemory.markCourseJoined("demo", joinMemory.courseJoinKey(undefined));
    assert.equal(joinMemory.isCourseJoined("demo", joinMemory.courseJoinKey(null)), true);
    // 历史数据损坏(非 JSON 数组) → 视为未加入而非抛错
    store.set("hk_course_joins:demo", "not-json{");
    assert.equal(joinMemory.isCourseJoined("demo", joinMemory.DEMO_COURSE_KEY), false);
    store.set("hk_course_joins:demo", JSON.stringify({ nope: 1 }));
    assert.equal(joinMemory.isCourseJoined("demo", joinMemory.DEMO_COURSE_KEY), false);
  });
  // localStorage 完全不可用(隐私模式)：读取与写入都不炸
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  const prev = globalThis.localStorage;
  globalThis.localStorage = broken;
  try {
    assert.equal(joinMemory.isCourseJoined("demo", "uuid-1"), false);
    joinMemory.markCourseJoined("demo", "uuid-1");
    assert.equal(joinMemory.isCourseJoined("demo", "uuid-1"), false);
  } finally {
    globalThis.localStorage = prev;
  }
});
