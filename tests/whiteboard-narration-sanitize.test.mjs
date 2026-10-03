// 旁白净化回归:LLM 偶发违反"纯口语"约定把 HTML 标签漏进 spoken_text(2026-10-03
// 贝叶斯讲"核心术语预教"步实测,字幕栏显示 <strong> 原文,TTS 会把标签读出来)。
// 字幕/对答面板/TTS 同源这一条数据,适配层源头剥标签。纯函数直引 TS。
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeNarration } from "../hyperknow-spa/src/lattice/whiteboard/sanitizeNarration.ts";

test("剥标签:成对标签内容保留,标签本身绝不出现在旁白", () => {
  assert.equal(
    sanitizeNarration("看板子上的三个定义：<strong>先验概率</strong>是初始判断；<strong>似然</strong>衡量可靠性"),
    "看板子上的三个定义：先验概率是初始判断；似然衡量可靠性",
  );
  assert.equal(sanitizeNarration("第一<br/>第二<em>第三</em>"), "第一第二第三");
});

test("实体解码 + 空白收敛 + 中文标点前空格回收", () => {
  assert.equal(sanitizeNarration("A &amp; B&nbsp;&nbsp;测试。\n  下一句  。"), "A & B 测试。 下一句。");
  assert.equal(sanitizeNarration("&lt;均值&gt; &quot;可信&quot;"), "<均值> \"可信\"");
});

test("未闭合尖括号段保持原样(不吞正文),空输入安全", () => {
  assert.equal(sanitizeNarration("x < y 且 y > 0"), "x < y 且 y > 0");
  assert.equal(sanitizeNarration(""), "");
  assert.equal(sanitizeNarration(undefined), "");
});

test("真实事故样本:贝叶斯术语步旁白", () => {
  const dirty = "看板子上的三个定义：<strong>先验概率</strong>是你拿到新证据之前，对事件发生的初始判断，比如普通人群的感染率就是先验；<strong>似然</strong>是假设事件成立的情况下，新证据出现的概率。";
  const clean = sanitizeNarration(dirty);
  assert.ok(!clean.includes("<"), "净化后不得残留尖括号标签");
  assert.ok(!clean.includes("strong"), "标签名不得被读出来");
  assert.ok(clean.includes("先验概率是你拿到新证据之前"), "正文内容完整保留");
});
