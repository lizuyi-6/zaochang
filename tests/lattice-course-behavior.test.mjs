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
