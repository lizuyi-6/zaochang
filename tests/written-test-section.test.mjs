// 笔试阅卷分区的源码级契约:分数口径与人工定稿的边界。
// 回归防线:AI 建议分永远不能冒充人工分,人工没动过的题也不能被保存动作清空。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../app/admin/sections/written-test.tsx", import.meta.url), "utf8");

test("人工分输入框初始值只来自人工分,不拿 AI 分预填(否则等于让 AI 冒充人工)", () => {
  assert.match(
    src,
    /score: item\.manualScore === null \|\| item\.manualScore === undefined \? "" : String\(item\.manualScore\)/,
    "评分框初始必须是人工分,没有人工分就留空",
  );
  assert.match(src, /采纳 \{item\.aiScore\}/, "AI 分只能靠人点「采纳」进入评分框");
});

test("保存只提交被改过的题:没动过的人工分不会被清空", () => {
  assert.match(src, /const items = \[\.\.\.touched\]\.map/, "保存必须只取被改过的题");
  assert.match(src, /setTouched\(new Set\(\)\)/, "详情载入后 touched 要清空");
  assert.match(src, /if \(!items\.length\)/, "没有改动时不应发请求");
});

test("「全部采纳建议分」只填表不直接写库(还要人点保存)", () => {
  assert.match(src, /const acceptAllAi = \(\) =>/, "必须有采纳动作");
  assert.match(src, /next\[item\.key\] = \{ score: String\(item\.aiScore\)/, "采纳要把 AI 分填进评分框");
  assert.doesNotMatch(src, /acceptAllAi[\s\S]{0,600}?await adminRequest\(/, "采纳动作不得直接写库");
});

test("初评是显式动作:单独打初评接口,不随列表加载自动跑", () => {
  assert.match(src, /"\/api\/admin\/recruit\/written-test\/score"/, "初评要走独立接口");
  assert.match(src, /method: "POST"/, "初评用 POST");
  assert.doesNotMatch(src, /loadList[\s\S]{0,400}?written-test\/score/, "列表加载不得顺带触发初评");
});

test("合规提示必须显式展示:未勾诚信确认等旗标不能藏在后台", () => {
  assert.match(src, /detail\.submission\.flags\.length/, "旗标要在详情里显示");
  assert.match(src, /admin-status-error[^}]*flags\.join/, "旗标要用错误样式展示");
});

test("导出 CSV 带 BOM:Excel 打开中文表头不乱码", () => {
  assert.match(src, /\\ufeff\$\{csv\}/, "CSV 必须带 BOM");
  assert.match(src, /text\/csv;charset=utf-8/, "CSV 的 MIME 要声明 utf-8");
});
