// Hyperknow Agent(1:1 复刻 agent.hyperknow.io)· 集成套件:真实 Wrangler 预览 +
// 假 AI 上游(messages 协议)与假 TTS 上游,覆盖:
// - chat SSE 全事件序列(与原 WS 逐帧对齐)+ 会话持久化与归属隔离
// - TTS 缓存语义(MISS → HIT)与音色/速度缓存 key 隔离
// - 白板讲座规划(降级 fallback)与举手插话、归属 404
// - 课程蓝图生成事件序列、市场列表隔离与详情 404
// 执行顺序由 tests/rendered-html.test.mjs 的注册顺序保证(套件串行)。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baseUrl,
  runId,
  lastTtsRequest,
  ttsUpstreamCount,
  resetAiUpstream,
  authHeaders,
  queryLocalD1,
} from "../harness/preview.mjs";

// Hyperknow SSE 帧(`event: frame\ndata: {...}\n\n`)→ 按序解析出原始事件对象
// (与原 WS 版 ws.send(JSON) 的帧形状一致,断言才能逐帧对齐)。
async function readHkFrames(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const frames = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let frameEnd = buffer.indexOf("\n\n");
    while (frameEnd >= 0) {
      const frameText = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + 2);
      frameEnd = buffer.indexOf("\n\n");
      const dataLine = frameText.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) continue;
      frames.push(JSON.parse(dataLine.slice(5).trim()));
    }
  }
  return frames;
}

export function register() {
  test("hyperknow user info: 匿名 401,登录返回造场身份 + 装饰性 credits", async () => {
    const anonymous = await fetch(`${baseUrl}/api/hyperknow/auth/get_user_info`);
    assert.equal(anonymous.status, 401, "匿名应为 401 auth_required");
    assert.equal((await anonymous.json()).error, "auth_required");

    const email = `hk-info-${runId}@example.com`;
    const response = await fetch(`${baseUrl}/api/hyperknow/auth/get_user_info`, { headers: authHeaders("学Agent用户", email) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.data.email, email);
    assert.equal(body.data.user_id, email, "user_id 用造场身份(替代原复刻版假鉴权)");
    assert.equal(body.data.subscription.remaining_credits, 20, "credits 为装饰性固定值(仅驱动徽章)");
    assert.equal(body.data.subscription.max_credits, 20);
  });

  test("hyperknow chat SSE: 事件序列与原 WS 逐帧对齐,thinking 不入正文,会话落库", async () => {
    const email = `hk-chat-${runId}@example.com`;
    const message = "Explain supervised learning concisely";
    const response = await fetch(`${baseUrl}/api/hyperknow/chat`, {
      method: "POST",
      headers: authHeaders("学习用户", email),
      body: JSON.stringify({ message, mode: "standard", ui_language: "en" }),
    });
    // 注意:body 要留给 readHkFrames,失败信息不能消费 body。
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/event-stream/);

    const frames = await readHkFrames(response);
    const types = frames.map((frame) => frame.type);
    const markers = types.filter((type) => ["conversation_created", "credit_status", "complete"].includes(type));
    assert.deepEqual(markers, ["conversation_created", "credit_status", "complete"], "骨架帧次序必须与原 WS 一致");

    // directorAgent 思考:1 帧初始 + 假上游 4 个 thinking 增量映射,再 1 帧 completed
    const directorThinking = frames.filter((f) => f.type === "tool_execution" && f.tool_name === "directorAgent" && f.tool_status === "thinking");
    assert.equal(directorThinking.length, 5, "初始帧 + 4 个 thinking_delta");
    assert.equal(directorThinking[0].data.message, "Analyzing pedagogical intent and scaffolding...");
    assert.equal(directorThinking[1].data.message, "这是", "thinking_delta 增量应逐帧映射为 directorAgent 思考");
    const directorCompleted = frames.find((f) => f.type === "tool_execution" && f.tool_name === "directorAgent" && f.tool_status === "completed");
    assert.ok(directorCompleted, "首个正文增量前必须补发 directorAgent completed(原 isReasoningModel 路径)");
    assert.ok(
      types.indexOf(types.find((t, i) => frames[i].type === "tool_execution" && frames[i].tool_name === "directorAgent" && frames[i].tool_status === "completed")) <
      types.indexOf("content_chunk"),
      "completed 必须先于第一个 content_chunk",
    );

    const chunks = frames.filter((f) => f.type === "content_chunk");
    assert.equal(chunks.length, 4, "4 个 text_delta → 4 个 content_chunk");
    assert.equal(chunks.map((f) => f.chunk).join(""), "这是假定的模型增量输出。", "thinking 文本不得混入正文(假上游两者内容相同,可证伪)");

    const nextSteps = frames.find((f) => f.type === "tool_execution" && f.tool_name === "recommend_next_step" && f.tool_status === "completed");
    assert.equal(nextSteps.data.next_steps.length, 3, "假上游非 JSON → 确定性 fallback 3 条");
    const generateCompleted = frames.find((f) => f.type === "tool_execution" && f.tool_name === "generate_content" && f.tool_status === "completed");
    assert.equal(generateCompleted.data.total_length, "这是假定的模型增量输出。".length);

    const conversationId = frames.find((f) => f.type === "conversation_created").conversation_id;
    const listed = await (await fetch(`${baseUrl}/api/hyperknow/conversations/list_past_conversations`, { headers: authHeaders("学习用户", email) })).json();
    const stored = listed.conversations.find((conv) => conv.conversation_id === conversationId);
    assert.ok(stored, "会话应已持久化");
    assert.equal(stored.title, `${message.slice(0, 30)}...`, "标题取消息前 30 字 + 省略号");
    assert.equal(stored.history.length, 2);
    assert.deepEqual(stored.history[0], { role: "user", content: message });
    assert.equal(stored.history[1].role, "assistant");

    // 归属隔离:他人拿 conversation_id 续聊 → 404(与不存在同形)。
    const stranger = await fetch(`${baseUrl}/api/hyperknow/chat`, {
      method: "POST",
      headers: authHeaders("旁人", `hk-stranger-${runId}@example.com`),
      body: JSON.stringify({ message: "hi", conversation_id: conversationId }),
    });
    assert.equal(stranger.status, 404, "他人会话必须 404");
    await stranger.body?.cancel();
  });

  test("hyperknow chat: 空消息 400", async () => {
    const response = await fetch(`${baseUrl}/api/hyperknow/chat`, {
      method: "POST",
      headers: authHeaders("学习用户", `hk-chat-empty-${runId}@example.com`),
      body: JSON.stringify({ message: "   " }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "message_required");
  });

  test("hyperknow tts/stream: MISS → HIT 两级缓存,音色/速度参与缓存 key,匿名 401", async () => {
    resetAiUpstream();
    const email = `hk-tts-${runId}@example.com`;
    const anonymous = await fetch(`${baseUrl}/api/hyperknow/tts/stream?text=hello&voice=warm&speed=1.0`);
    assert.equal(anonymous.status, 401, "TTS 属登录态端点(同源 Cookie 由 Audio 元素携带)");
    await anonymous.body?.cancel();

    const url = (voice, speed) => `${baseUrl}/api/hyperknow/tts/stream?text=hello&voice=${voice}&speed=${speed}`;
    const first = await fetch(url("warm", "1.0"), { headers: authHeaders("试听用户", email) });
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("content-type"), "audio/mpeg");
    assert.equal(first.headers.get("x-cache"), "MISS");
    const firstBody = Buffer.from(await first.arrayBuffer());
    assert.equal(lastTtsRequest.voice, "voice-tone-U5kvAcyum0", "warm 必须映射官方克隆音色 ID");
    assert.equal(lastTtsRequest.model, "step-tts-mini");
    assert.equal(lastTtsRequest.speed, 1);
    assert.equal(ttsUpstreamCount, 1, "首次必须真实触达上游");

    const second = await fetch(url("warm", "1.0"), { headers: authHeaders("试听用户", email) });
    assert.equal(second.headers.get("x-cache"), "HIT-MEMORY", "同 key 第二次走内存缓存");
    assert.equal(ttsUpstreamCount, 1, "命中不得再触达上游");
    assert.deepEqual(Buffer.from(await second.arrayBuffer()), firstBody);

    const calm = await fetch(url("calm", "1.0"), { headers: authHeaders("试听用户", email) });
    assert.equal(calm.headers.get("x-cache"), "MISS", "不同音色必须隔离 key");
    assert.equal((await calm.text()).includes("voice-tone-U5kvQekdQ8"), true, "假上游回声校验音色映射");
    assert.equal(ttsUpstreamCount, 2);
    assert.equal(lastTtsRequest.voice, "voice-tone-U5kvQekdQ8");
  });

  test("hyperknow whiteboard: 计划降级落库,插话 fallback,归属 404", async () => {
    const email = `hk-board-${runId}@example.com`;
    const planResponse = await fetch(`${baseUrl}/api/hyperknow/whiteboard/plan`, {
      method: "POST",
      headers: authHeaders("白板用户", email),
      body: JSON.stringify({ topic: "Binary Search" }),
    });
    // body 要留给 .json(),失败信息不能消费 body。
    assert.equal(planResponse.status, 200);
    const plan = await planResponse.json();
    assert.equal(plan.status, "active");
    assert.equal(plan.topic, "Binary Search");
    assert.equal(plan.steps.length, 2, "假上游非 JSON → 确定性 fallback 两步");
    assert.equal(plan.steps[0].board_action.type, "card");
    assert.match(plan.steps[0].spoken_text, /Binary Search/);
    assert.equal(plan.steps[1].board_action.type, "formula");

    const stored = await queryLocalD1(`SELECT user_email AS u, topic AS t FROM hk_whiteboard_sessions WHERE id = '${plan.session_id}'`);
    assert.equal(stored[0].u, email, "讲座计划必须落库(插话端点跨请求取回)");
    assert.equal(stored[0].t, "Binary Search");

    const interject = await fetch(`${baseUrl}/api/hyperknow/whiteboard/interject`, {
      method: "POST",
      headers: authHeaders("白板用户", email),
      body: JSON.stringify({ session_id: plan.session_id, step_id: "step_1", question: "What does Δx represent?" }),
    });
    assert.equal(interject.status, 200);
    const answer = await interject.json();
    assert.equal(answer.answer_text, "That is a great question regarding this step. It clarifies how the underlying variables interact.");
    assert.ok(answer.resume_transition);

    const stranger = await fetch(`${baseUrl}/api/hyperknow/whiteboard/interject`, {
      method: "POST",
      headers: authHeaders("旁人", `hk-board-stranger-${runId}@example.com`),
      body: JSON.stringify({ session_id: plan.session_id, step_id: "step_1", question: "hi" }),
    });
    assert.equal(stranger.status, 404, "他人讲座必须 404(不泄露存在性)");
    await stranger.body?.cancel();

    const missing = await fetch(`${baseUrl}/api/hyperknow/whiteboard/interject`, {
      method: "POST",
      headers: authHeaders("白板用户", email),
      body: JSON.stringify({ session_id: crypto.randomUUID(), question: "hi" }),
    });
    assert.equal(missing.status, 404, "不存在的讲座同样 404");
    await missing.body?.cancel();
  });

  test("hyperknow course-generation: 事件序列与原 WS 一致,市场与详情按归属隔离", async () => {
    const email = `hk-course-${runId}@example.com`;
    const query = "Quantum Computing Foundations";
    const response = await fetch(`${baseUrl}/api/hyperknow/course-generation`, {
      method: "POST",
      headers: authHeaders("建课用户", email),
      body: JSON.stringify({ query }),
    });
    assert.equal(response.status, 200);
    const frames = await readHkFrames(response);
    const stepTimeline = frames
      .filter((f) => f.type === "course_generation_step")
      .map((f) => `${f.step_id}:${f.status}`);
    assert.deepEqual(
      stepTimeline,
      ["boot:loading", "researching_the_web:loading", "researching_the_web:completed", "generating_initial_syllabus:loading", "generating_initial_syllabus:completed"],
      "生成步骤时间线必须与原 courseGenWs 一致",
    );
    const progress = frames.find((f) => f.type === "course_generation_progress");
    assert.match(progress.message, /round 1\/3/);

    const ready = frames.find((f) => f.type === "course_structure_ready");
    assert.ok(ready, "必须以 course_structure_ready 收尾");
    assert.equal(ready.course.courseUuid, ready.course_uuid);
    assert.equal(ready.course.courseTitle, query, "假上游非 JSON → fallback 结构标题取查询词");
    assert.equal(ready.course.units.length, 1);

    const market = await (await fetch(`${baseUrl}/api/hyperknow/marketplace/courses`, { headers: authHeaders("建课用户", email) })).json();
    assert.equal(market.courses[0].courseUuid, ready.course_uuid, "本人课程排最前");
    assert.equal(market.courses.length, 3, "2 条官方样例课程始终在列");
    assert.ok(market.courses.some((course) => course.courseTitle === "Introduction to Sociology"));

    const strangerMarket = await (await fetch(`${baseUrl}/api/hyperknow/marketplace/courses`, { headers: authHeaders("旁人", `hk-course-stranger-${runId}@example.com`) })).json();
    assert.equal(strangerMarket.courses.length, 2, "他人看不到我的课程,样例照旧");

    const mine = await fetch(`${baseUrl}/api/hyperknow/courses/${ready.course_uuid}`, { headers: authHeaders("建课用户", email) });
    assert.equal(mine.status, 200);
    assert.equal((await mine.json()).data.courseTitle, query);
    const stranger = await fetch(`${baseUrl}/api/hyperknow/courses/${ready.course_uuid}`, { headers: authHeaders("旁人", `hk-course-stranger-${runId}@example.com`) });
    assert.equal(stranger.status, 404, "课程详情越权 404");
    await stranger.body?.cancel();
  });
}
