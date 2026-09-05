// Hyperknow Agent 纯逻辑单测(零 Wrangler/网络):SSE 流解析、thinking/text 分流、
// TTS 文本净化与缓存 key、白板节奏公式、四个 Agent 的 JSON 解析 fallback。
// 被测模块全部零 import(--experimental-strip-types 直接加载 .ts 源码)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMessagesSseLine, consumeMessagesSse, sanitizeTtsText, stepDurationMs, ttsCacheKey } from "../app/api/_lib/hyperknow/protocol.ts";
import {
  buildNextStepsPrompt,
  parseCourseStructure,
  parseInterjectionAnswer,
  parseLecturePlan,
  parseNextSteps,
  fallbackCourseStructure,
  fallbackInterjectionAnswer,
  fallbackLecturePlan,
  fallbackNextSteps,
} from "../app/api/_lib/hyperknow/prompts.ts";

function sseLine(payload) {
  return `data: ${JSON.stringify(payload)}`;
}

test("parseMessagesSseLine: thinking_delta 与 text_delta 分流", () => {
  const thinking = parseMessagesSseLine(sseLine({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "分析中" } }));
  assert.deepEqual(thinking, [{ type: "thinking", text: "分析中" }]);
  const text = parseMessagesSseLine(sseLine({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "正文" } }));
  assert.deepEqual(text, [{ type: "text", text: "正文" }]);
});

test("parseMessagesSseLine: 非法行/未知事件/空增量一律忽略", () => {
  assert.deepEqual(parseMessagesSseLine("event: message_start"), []);
  assert.deepEqual(parseMessagesSseLine("data: [DONE]"), []);
  assert.deepEqual(parseMessagesSseLine("data: {broken"), []);
  assert.deepEqual(parseMessagesSseLine(sseLine({ type: "content_block_delta", delta: { type: "text_delta", text: "" } })), []);
  assert.deepEqual(parseMessagesSseLine(sseLine({ type: "content_block_delta", delta: { type: "thinking_delta", thinking: null } })), []);
  assert.deepEqual(parseMessagesSseLine(sseLine({ type: "content_block_start", index: 0 })), []);
});

test("consumeMessagesSse: 跨 chunk 断行与无尾换行的尾行都能解析", async () => {
  const frames = [
    new TextEncoder().encode(`data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "thinking_delta", thinking: "思" } })}\n`),
    // 同一 chunk 内两行 + 断行
    new TextEncoder().encode(`data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "thinking_delta", thinking: "考" } })}\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "答" } })}\ndata: {"broken`),
    // 尾行无换行(前导 \n 终结上一条被截断的坏行)
    new TextEncoder().encode(`\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "案" } })}`),
  ];
  const chunks = [];
  for await (const chunk of consumeMessagesSse(new Blob(frames).stream())) chunks.push(chunk);
  assert.deepEqual(chunks, [
    { type: "thinking", text: "思" },
    { type: "thinking", text: "考" },
    { type: "text", text: "答" },
    { type: "text", text: "案" },
  ]);
});

test("sanitizeTtsText: 剥 HTML/截 500 字/空兜底", () => {
  assert.equal(sanitizeTtsText("<p>Hello <strong>world</strong></p>"), "Hello world");
  assert.equal(sanitizeTtsText("   "), "你好，我是你的 Hyperknow 学习导师。");
  assert.equal(sanitizeTtsText("<div></div>"), "你好，我是你的 Hyperknow 学习导师。");
  assert.equal(sanitizeTtsText("x".repeat(600)).length, 500);
});

test("ttsCacheKey: 同输入同 key,不同 voice/speed/text 互相隔离", async () => {
  const base = await ttsCacheKey("hello", "warm", 1.0);
  assert.equal(base, await ttsCacheKey("hello", "warm", 1.0));
  assert.match(base, /^warm_[0-9a-f]{64}$/);
  assert.notEqual(base, await ttsCacheKey("hello", "calm", 1.0));
  assert.notEqual(base, await ttsCacheKey("hello", "warm", 1.5));
  assert.notEqual(base, await ttsCacheKey("hello!", "warm", 1.0));
});

test("stepDurationMs: 字数×180ms,下限 4 秒(与原 whiteboardWs 逐字一致)", () => {
  assert.equal(stepDurationMs("a".repeat(10)), 4000);
  assert.equal(stepDurationMs("a".repeat(22)), 4000);
  assert.equal(stepDurationMs("a".repeat(23)), 23 * 180);
  assert.equal(stepDurationMs("a".repeat(100)), 100 * 180);
});

test("parseNextSteps: 合法 JSON 透传,坏 JSON 走确定性 fallback", () => {
  const custom = { has_steps: true, next_steps: [{ display_step: "x", step_prompt: "y" }], learning_progress: { topic: "t", percentage: 1, predicted_next_title: "n" } };
  assert.deepEqual(parseNextSteps(JSON.stringify(custom)), custom);
  assert.deepEqual(parseNextSteps("这不是 JSON"), fallbackNextSteps());
  assert.deepEqual(parseNextSteps(""), fallbackNextSteps());
  assert.equal(fallbackNextSteps().next_steps.length, 3, "fallback 必须是 3 条(前端按钮网格依赖)");
});

test("parseLecturePlan: steps 缺失/坏 JSON 走 fallback,fallback 自带两步", () => {
  const plan = { steps: [{ step_id: "s1", spoken_text: "x", board_action: { type: "card" } }] };
  assert.deepEqual(parseLecturePlan(JSON.stringify(plan), "拓扑学"), plan);
  assert.deepEqual(parseLecturePlan(JSON.stringify({ nope: true }), "拓扑学"), fallbackLecturePlan("拓扑学"));
  assert.deepEqual(parseLecturePlan("boom", "拓扑学"), fallbackLecturePlan("拓扑学"));
  const fallback = fallbackLecturePlan("拓扑学");
  assert.equal(fallback.steps.length, 2);
  assert.match(fallback.steps[0].spoken_text, /拓扑学/);
  assert.equal(fallback.steps[1].board_action.type, "formula");
});

test("parseInterjectionAnswer: 坏 JSON 走 fallback(文案与原版逐字一致)", () => {
  assert.deepEqual(parseInterjectionAnswer('{"answer_text":"a","resume_transition":"b"}'), { answer_text: "a", resume_transition: "b" });
  assert.deepEqual(parseInterjectionAnswer("nope"), fallbackInterjectionAnswer());
});

test("parseCourseStructure: units 缺失/坏 JSON 走 fallback,fallback 保留查询词", () => {
  const structure = { courseTitle: "C", courseDescription: "D", targetLearner: "L", tags: [], units: [{ unitId: "u", title: "U", lectures: [] }] };
  assert.deepEqual(parseCourseStructure(JSON.stringify(structure), "q"), structure);
  assert.deepEqual(parseCourseStructure("boom", "量子引力学"), fallbackCourseStructure("量子引力学"));
  const fallback = fallbackCourseStructure("量子引力学");
  assert.equal(fallback.courseTitle, "量子引力学");
  assert.match(fallback.units[0].lectures[0].sessions[0].title, /量子引力学/);
});

test("buildNextStepsPrompt: 用户问题原样进 prompt(供假上游断言)", () => {
  assert.match(buildNextStepsPrompt("什么是监督学习"), /"什么是监督学习"/);
});
