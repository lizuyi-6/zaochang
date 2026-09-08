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
  lastChatCompletion,
  lastTtsRequest,
  ttsUpstreamCount,
  resetAiUpstream,
  setAiUpstreamForceFail,
  authHeaders,
  executeD1Sql,
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
  test("hyperknow user info: 匿名 401,登录返回造场身份 + 真实积分(读取不扣减)", async () => {
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
    assert.equal(body.data.subscription.remaining_credits, 20, "新账户每日额度 20(真实余额,懒重置建行)");
    assert.equal(body.data.subscription.max_credits, 20);

    // 读取是幂等的:连续两次 get_user_info 不产生扣减。
    const again = await (await fetch(`${baseUrl}/api/hyperknow/auth/get_user_info`, { headers: authHeaders("学Agent用户", email) })).json();
    assert.equal(again.data.subscription.remaining_credits, 20, "读取不得扣减");
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
    const creditFrame = frames.find((f) => f.type === "credit_status");
    assert.deepEqual(
      creditFrame.credit_info,
      { remaining: 18, max: 20 },
      "credit_status 必须携带真实余额(20 - 对话 2 = 18)",
    );

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

  test("hyperknow translate: SSE 逐帧、提示词契约、不落库、余额不足 402", async () => {
    const email = `hk-translate-${runId}@example.com`;
    const headers = authHeaders("翻译用户", email);

    const anonymous = await fetch(`${baseUrl}/api/hyperknow/translate`, {
      method: "POST",
      body: JSON.stringify({ text: "hello", target_language: "zh-CN" }),
    });
    assert.equal(anonymous.status, 401, "翻译属登录态端点");
    await anonymous.body?.cancel();

    const badLang = await fetch(`${baseUrl}/api/hyperknow/translate`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: "hello", target_language: "fr" }),
    });
    assert.equal(badLang.status, 400);
    assert.equal((await badLang.json()).error, "unsupported_language");

    const empty = await fetch(`${baseUrl}/api/hyperknow/translate`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: "   ", target_language: "en" }),
    });
    assert.equal(empty.status, 400);
    assert.equal((await empty.json()).error, "text_required");

    const response = await fetch(`${baseUrl}/api/hyperknow/translate`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: "Attention is all you need", target_language: "zh-CN" }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/event-stream/);

    const frames = await readHkFrames(response);
    assert.deepEqual(
      frames.map((f) => f.type),
      ["credit_status", "content_chunk", "content_chunk", "content_chunk", "content_chunk", "complete"],
      "事件序列:credit_status → content_chunk×N → complete",
    );
    assert.deepEqual(frames[0].credit_info, { remaining: 18, max: 20 }, "翻译与对话同价:扣 2");
    assert.equal(
      frames.filter((f) => f.type === "content_chunk").map((f) => f.chunk).join(""),
      "这是假定的模型增量输出。",
      "译文由正文增量拼成,thinking 不得混入",
    );
    assert.match(lastChatCompletion.system, /translator/i, "system 必须是翻译指令");
    assert.match(lastChatCompletion.system, /Simplified Chinese/, "目标语言名进提示词");
    assert.equal(lastChatCompletion.user, "Attention is all you need", "原文原样作为 user 消息");

    // 不落库:翻译是工具动作,不得出现在历史会话列表里。
    const listed = await (await fetch(`${baseUrl}/api/hyperknow/conversations/list_past_conversations`, { headers })).json();
    assert.equal(listed.conversations.length, 0, "翻译不得污染历史会话");

    // 余额不足:402 在发流之前(纯 JSON,带 credit_info)。
    await executeD1Sql(`UPDATE hk_credits SET balance = 1 WHERE user_email = '${email}'`);
    const blocked = await fetch(`${baseUrl}/api/hyperknow/translate`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: "one more", target_language: "en" }),
    });
    assert.equal(blocked.status, 402);
    assert.deepEqual((await blocked.json()).credit_info, { remaining: 1, max: 20 });
  });

  test("hyperknow model-check: 探针走非流式 Messages,不扣积分;上游故障回 ok:false", async () => {
    resetAiUpstream();
    const email = `hk-probe-${runId}@example.com`;
    const headers = authHeaders("探针用户", email);

    const anonymous = await fetch(`${baseUrl}/api/hyperknow/model-check`, { method: "POST", body: "{}" });
    assert.equal(anonymous.status, 401, "探针属登录态端点");
    await anonymous.body?.cancel();

    const response = await fetch(`${baseUrl}/api/hyperknow/model-check`, { method: "POST", headers, body: "{}" });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(typeof body.latency_ms, "number", "探针必须回报往返耗时");
    assert.equal(lastChatCompletion.transport, "messages");
    assert.equal(lastChatCompletion.max_tokens, 16, "探针必须是最小代价调用");
    assert.equal(lastChatCompletion.messageCount, 1, "system 抽到顶层,消息体只剩 user 一条");
    assert.match(lastChatCompletion.system, /health probe/i);
    assert.equal(lastChatCompletion.user, "ping");
    assert.equal(lastChatCompletion.stream, undefined, "探针走 llm.chat(非流式)");

    const info = await (await fetch(`${baseUrl}/api/hyperknow/auth/get_user_info`, { headers })).json();
    assert.equal(info.data.subscription.remaining_credits, 20, "健康探针不扣积分");

    // 上游故障 → 仍 200 + ok:false(前端据此区分"模型没响应"与"检查没跑起来")。
    setAiUpstreamForceFail(true);
    const failed = await fetch(`${baseUrl}/api/hyperknow/model-check`, { method: "POST", headers, body: "{}" });
    assert.equal(failed.status, 200);
    const failedBody = await failed.json();
    assert.equal(failedBody.ok, false);
    assert.equal(failedBody.error, "ai_upstream_error");
    setAiUpstreamForceFail(false);
  });

  test("hyperknow credits: 对话扣 2/课程扣 10,余额不足 402,跨北京日界懒重置", async () => {
    const email = `hk-credit-${runId}@example.com`;
    const headers = authHeaders("积分用户", email);
    const beijingToday = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);

    const info = async () =>
      (await (await fetch(`${baseUrl}/api/hyperknow/auth/get_user_info`, { headers })).json()).data.subscription.remaining_credits;
    assert.equal(await info(), 20, "新账户每日额度 20");

    // 余额 3:对话(2)成功 → 剩 1。
    await executeD1Sql(`UPDATE hk_credits SET balance = 3 WHERE user_email = '${email}'`);
    const chat = await fetch(`${baseUrl}/api/hyperknow/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: "one more chat" }),
    });
    assert.equal(chat.status, 200);
    const frames = await readHkFrames(await chat);
    assert.equal(frames.find((f) => f.type === "credit_status").credit_info.remaining, 1, "扣减后余额随帧下发");
    assert.equal(await info(), 1);

    // 余额 1 < 对话 2 → 402 insufficient_credits(JSON,非 SSE)。
    const blocked = await fetch(`${baseUrl}/api/hyperknow/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: "should be blocked" }),
    });
    assert.equal(blocked.status, 402);
    assert.deepEqual((await blocked.json()).credit_info, { remaining: 1, max: 20 });

    // 余额 1 < 课程 10 → 课程生成同样 402,且不得产生伪生成兜底空间(纯 JSON 响应)。
    await executeD1Sql(`UPDATE hk_credits SET balance = 1 WHERE user_email = '${email}'`);
    const blockedCourse = await fetch(`${baseUrl}/api/hyperknow/course-generation`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: "Anything" }),
    });
    assert.equal(blockedCourse.status, 402);
    assert.match(blockedCourse.headers.get("content-type") || "", /application\/json/);
    assert.equal((await blockedCourse.json()).error, "insufficient_credits");

    // 跨北京日界懒重置:reset_date 落后 → 读取即整额续满,行日期翻到今天。
    await executeD1Sql(`UPDATE hk_credits SET reset_date = '2000-01-01' WHERE user_email = '${email}'`);
    assert.equal(await info(), 20, "跨天后读取触发懒重置,额度续满");
    const rows = await queryLocalD1(`SELECT balance, reset_date FROM hk_credits WHERE user_email = '${email}'`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reset_date, beijingToday, "reset_date 必须是北京日期(UTC+8)");
    assert.equal(rows[0].balance, 20);

    // 重置后课程生成成功:扣 10 剩 10。
    const okCourse = await fetch(`${baseUrl}/api/hyperknow/course-generation`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: "Credit Reset Sanity" }),
    });
    assert.equal(okCourse.status, 200);
    const okFrames = await readHkFrames(await okCourse);
    assert.ok(okFrames.find((f) => f.type === "course_structure_ready"), "重置后应能真实生成");
    assert.equal(await info(), 10, "课程生成扣 10");
  });
}
