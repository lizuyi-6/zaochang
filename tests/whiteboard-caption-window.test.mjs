// 字幕栏分句窗口回归:用户原话"字幕栏里面一次最多不能超过两句话,或者语义最大的
// 最连贯的一句话"——此前整段旁白(6+ 行)累积在字幕栏溢出屏幕下缘,答错解析同理。
// 纯函数直引 TS(--experimental-strip-types),不起浏览器。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitSentences,
  buildWindows,
  windowForOffset,
  PAIR_MAX_CHARS,
} from "../hyperknow-spa/src/lattice/whiteboard/captionWindow.ts";

const sliceAll = (text, wins) => wins.map((w) => text.slice(w.start, w.end));

test("分句:中文终结符断句,小数点/连用省略号/右引号不误切", () => {
  const text = "收益是3.5万，这才合理。为什么呢？因为……他说“稳了。”下一句开始";
  assert.deepEqual(sliceAll(text, splitSentences(text)), [
    "收益是3.5万，这才合理。",
    "为什么呢？",
    "因为……",
    "他说“稳了。”",
    "下一句开始",
  ]);
});

test("分句:英文句读与双感叹合并", () => {
  const text = "Watch out!! This holds.真的吗";
  assert.deepEqual(sliceAll(text, splitSentences(text)), ["Watch out!! ", "This holds.", "真的吗"]);
});

test("窗口:短句成对(一次至多两句),长句独占一窗", () => {
  // 两句短 → 同窗;三句短 → 2+1,绝不出窗含三句
  const short3 = "甲说对了。乙也说对。丙更对。";
  const w3 = buildWindows(short3);
  assert.equal(w3.length, 2);
  assert.deepEqual(sliceAll(short3, w3), ["甲说对了。乙也说对。", "丙更对。"]);

  // 超 PAIR_MAX 的长句必须独占,后续短句不得挤进
  const longSentence = `这一句很长很长，${"长".repeat(PAIR_MAX_CHARS)}。`;
  const text = `${longSentence}短句。`;
  const wins = buildWindows(text);
  assert.equal(wins.length, 2);
  assert.equal(text.slice(wins[0].start, wins[0].end), longSentence);
  assert.equal(text.slice(wins[1].start, wins[1].end), "短句。");
});

test("窗口:真实长旁白每窗至多两句且全文无缝覆盖", () => {
  const narration =
    "上一讲我们搞清楚了单个经济主体的理性决策逻辑，今天我们要升级到多人互动的决策场景——博弈论。" +
    "先从一个你身边的现象说起：两家奶茶店开在同一条街，本来都能卖十五块一杯。" +
    "可只要有一家偷偷降到十二块，客人立刻全跑过去，另一家也只能跟着降。" +
    "最后的结果是什么？两家都只能卖十二块，赚的钱反而都变少了。" +
    "这就是博弈论要解释的反直觉现象：每个个体都选了自己最优的策略，集体却落到了更差的结果。" +
    "接下来我们把这个直觉拆开，先看博弈的三个基本要素。";
  const sentences = splitSentences(narration);
  const wins = buildWindows(narration);
  // 无缝覆盖全文
  assert.equal(wins[0].start, 0);
  assert.equal(wins[wins.length - 1].end, narration.length);
  for (let i = 1; i < wins.length; i++) assert.equal(wins[i].start, wins[i - 1].end);
  // 每窗至多两句(用户硬规则);非独窗合计不超 PAIR_MAX
  for (const w of wins) {
    const contained = sentences.filter((s) => s.start >= w.start && s.end <= w.end);
    assert.ok(contained.length <= 2, `窗口含 ${contained.length} 句: ${narration.slice(w.start, w.end)}`);
    if (contained.length === 2) assert.ok(w.end - w.start <= PAIR_MAX_CHARS);
  }
});

test("游标:揭示越过窗口右界即滑入下一窗,越界后驻留末窗", () => {
  const text = "第一句。第二句比较短。第三句。";
  const wins = buildWindows(text); // [第一句。第二句比较短。][第三句。]
  assert.equal(wins.length, 2);
  assert.equal(windowForOffset(wins, 0), wins[0]);
  assert.equal(windowForOffset(wins, wins[0].end - 1), wins[0]);
  assert.equal(windowForOffset(wins, wins[0].end), wins[1], "游标到达窗口右界必须换窗");
  assert.equal(windowForOffset(wins, 9999), wins[1], "揭示完成后驻留末窗");
});

test("边界:空文本与无终结符文本", () => {
  assert.deepEqual(buildWindows(""), []);
  const wins = buildWindows("没有句读的一整段话");
  assert.deepEqual(wins, [{ start: 0, end: 9 }]);
});

test("分号断句:串行定义自动分窗(实测三定义串一句占三行),短子句两两合并", () => {
  const text = "先验概率是拿到证据前的初始判断；似然是假设成立时证据出现的概率；后验概率是更新后的新判断。";
  const sentences = splitSentences(text);
  assert.equal(sentences.length, 3, "中文分号必须是断句点");
  const wins = buildWindows(text);
  assert.equal(wins.length, 2, "三子句 → 2+1 两窗,短子句成对");
  for (const w of wins) {
    const contained = sentences.filter((s) => s.start >= w.start && s.end <= w.end);
    assert.ok(contained.length <= 2, "每窗至多两句的硬规则不变");
  }
  assert.equal(sliceAll(text, wins).join(""), text, "窗口无缝覆盖全文");
});
