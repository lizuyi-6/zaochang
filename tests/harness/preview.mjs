import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { deflateSync, crc32 } from "node:zlib";

export const port = 4179;
export const baseUrl = `http://127.0.0.1:${port}`;
export const runId = `${process.pid}-${Date.now()}`;
export const adminEmail = `release-admin-${runId}@example.com`;
export const operationsAdminEmail = `operations-admin-${runId}@example.com`;
export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
export const stateDir = join(tmpdir(), `zaochang-test-state-${runId}`);
export const logPath = join(tmpdir(), `zaochang-wrangler-${runId}.log`);
export let server;
export let scannerServer;
export let scannerPort;
export let uploadScannerRequestCount = 0;
let uploadScannerBusyResponsesRemaining = 0;
let uploadScannerErrorAfterBusy = null;
export let output = "";
export const scannerToken = `test-upload-scanner-${runId}-token`;
export const hostingDeployerToken = `zch_${randomBytes(48).toString("base64url")}`;

// 假 OpenAI 兼容上游(仿 startFakeUploadScanner 模式):校验 Bearer,把收到的
// chat/completions 请求体存入 lastChatCompletion / aiUpstreamCount 供字段级断言;
// body 含 AI-UPSTREAM-FAIL-TEST → 500(测 pre-stream 失败映射);
// 否则回确定性 SSE:4 个 delta + [DONE],首帧 JSON 内塞 echo 字段证解析器容忍未知字段。
export let aiServer;
export let aiPort;
export let lastChatCompletion = null;
export let aiUpstreamCount = 0;
/** 蓝图形状(CourseBlueprint)的非流式调用计数——C2 双跑断言用,与单元调用区分 */
export let blueprintUpstreamCount = 0;
export let lastTtsRequest = null;
export let lastTtsBodyNonAscii = false;
export let ttsUpstreamCount = 0;
export let lastImageRequest = null;
export let imageUpstreamCount = 0;
let unitResponseDelayMs = 0;
let imageResponseDelayMs = 0;

export function generate1024PngBase64() {
  const width = 1024;
  const height = 1024;
  const rawData = Buffer.alloc(height * (1 + width), 0);
  const idatData = deflateSync(rawData);

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0x00, 0x00, 0x00, 0x0d]),
    Buffer.from("IHDR"),
    (() => {
      const b = Buffer.alloc(13);
      b.writeUInt32BE(width, 0);
      b.writeUInt32BE(height, 4);
      b[8] = 8;
      b[9] = 0;
      b[10] = 0;
      b[11] = 0;
      b[12] = 0;
      return b;
    })(),
    (() => {
      const b = Buffer.alloc(4);
      const ihdrPayload = Buffer.alloc(17);
      ihdrPayload.write("IHDR", 0);
      ihdrPayload.writeUInt32BE(width, 4);
      ihdrPayload.writeUInt32BE(height, 8);
      ihdrPayload[12] = 8;
      ihdrPayload[13] = 0;
      ihdrPayload[14] = 0;
      ihdrPayload[15] = 0;
      ihdrPayload[16] = 0;
      b.writeUInt32BE(crc32(ihdrPayload), 0);
      return b;
    })(),
    (() => {
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32BE(idatData.length, 0);
      const typeBuf = Buffer.from("IDAT");
      const crcBuf = Buffer.alloc(4);
      crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, idatData])), 0);
      return Buffer.concat([lenBuf, typeBuf, idatData, crcBuf]);
    })(),
    Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]),
  ]);
  return png.toString("base64");
}

export const valid1024PngBase64 = generate1024PngBase64();

/** 假 Tavily 搜索上游收到的 /search 请求体(课程生成联网研学断言用)。 */
export const searchRequests = [];
/** 假 StepFun 独立网页搜索 API(/v1/search)请求体与模式控制 */
export let lastStepfunSearchRequest = null;
export const stepfunSearchRequests = [];
export let stepfunSearchMockOutcome = "success";

export function setStepfunSearchMockOutcome(outcome) {
  stepfunSearchMockOutcome = outcome;
}
/** 置 true 后假上游一律 500(测"上游故障"分支);resetAiUpstream 会复位。 */
export let aiUpstreamForceFail = false;
/** 置模型名后,该模型的 /v1/messages 与 /v1/chat/completions 调用一律 404
 * (测 H3 主模型降级:llm.ts 404 候选回退 + model_degraded 帧)。 */
export let aiUpstreamMissingModel = null;
/** StepFun MCP 通道(tools/call 信封)计数与模式:success 回内嵌 JSON 命中,
 * auth_failed 回 401(2026-10 审计第 5 批:MCP 成功路径此前无集成测试)。 */
export let mcpUpstreamCount = 0;
export let mcpMockOutcome = "success";
/** 置对象后,Messages/chat-completions 调用(流式与非流式)以该对象的 JSON 串作为回复文本
 * (白板讲座计划 quick_check/diagram 透传断言用);resetAiUpstream 会复位。 */
export let aiUpstreamJsonOverride = null;
/** 置数字后,流式调用只吐出覆盖正文的前 N 个字符,随后以 stop_reason=max_tokens 收尾
 * (测讲稿流式截断后的步骤抢救);resetAiUpstream 会复位。 */
export let aiUpstreamStreamTruncateAt = null;

export function setAiUpstreamStreamTruncateAt(n) {
  aiUpstreamStreamTruncateAt = Number.isInteger(n) ? n : null;
}

export function setAiUpstreamForceFail(value) {
  aiUpstreamForceFail = Boolean(value);
}

export function setAiUpstreamMissingModel(model) {
  aiUpstreamMissingModel = model || null;
}

export function setMcpMockOutcome(outcome) {
  mcpMockOutcome = outcome;
}

export function setAiUpstreamJsonResponse(value) {
  aiUpstreamJsonOverride = value === null || value === undefined ? null : JSON.stringify(value);
}

export function setAiUpstreamUnitDelay(ms) {
  unitResponseDelayMs = ms;
}

export function setImageUpstreamDelay(ms) {
  imageResponseDelayMs = ms;
}

export function resetAiUpstream() {
  lastChatCompletion = null;
  aiUpstreamCount = 0;
  blueprintUpstreamCount = 0;
  lastTtsRequest = null;
  lastTtsBodyNonAscii = false;
  ttsUpstreamCount = 0;
  lastImageRequest = null;
  imageUpstreamCount = 0;
  searchRequests.length = 0;
  lastStepfunSearchRequest = null;
  stepfunSearchRequests.length = 0;
  stepfunSearchMockOutcome = "success";
  aiUpstreamForceFail = false;
  aiUpstreamMissingModel = null;
  mcpUpstreamCount = 0;
  mcpMockOutcome = "success";
  aiUpstreamJsonOverride = null;
  aiUpstreamStreamTruncateAt = null;
  unitResponseDelayMs = 0;
  imageResponseDelayMs = 0;
}

export async function startFakeAiUpstream() {
  const sseChunks = ["这是", "假定的", "模型增量", "输出。"];
  // content 可能是 string(纯文本)或数组(多模态);抽出文本部分供 fail 标记与既有断言,
  // 原始 content 另存 userContent 供多模态形态断言。
  const userText = (content) => {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.filter((block) => block && block.type === "text").map((block) => String(block.text ?? "")).join("\n");
    }
    return "";
  };
    aiServer = createServer(async (request, response) => {
      // 六种传输:/v1/chat/completions(OpenAI 风格)、/v1/messages(Anthropic 风格,
      // 专家模型与见界 Agent 共用)、/v1/audio/speech(见界 TTS)、
      // /v1/images/generations(StepFun 生图)、/v1/search(StepFun 独立搜索——
      // 课程研学与首页资讯)、/search(假 Tavily)。
      const isMessages = request.url === "/v1/messages";
      const isTts = request.url === "/v1/audio/speech";
      const isSearch = request.url === "/search";
      const isImages = request.url === "/v1/images/generations";
      const isStepSearch = request.url === "/v1/search";
      if (
        request.method !== "POST" ||
        (!isMessages && !isTts && !isSearch && !isImages && !isStepSearch && request.url !== "/v1/chat/completions" && request.url !== "/v1/mcp/web_search/mcp")
      ) {
        response.writeHead(404).end();
        return;
      }
    if (request.headers.authorization !== `Bearer ${isSearch ? "test-search-key" : "test-ai-key"}`) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const body = JSON.parse(rawBody);
    // H3 旋钮:指定模型 404(messages 与 chat/completions 双通道),驱动 llm.ts 降级路径
    if (aiUpstreamMissingModel && (isMessages || request.url === "/v1/chat/completions")
      && body.model === aiUpstreamMissingModel) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "model_not_found" }));
      return;
    }
    if (request.url === "/v1/mcp/web_search/mcp") {
      // StepFun MCP tools/call:success 回 text 内嵌 JSON 命中(主通道),
      // auth_failed 回 401(回退 /v1/search 的触发器)。
      mcpUpstreamCount += 1;
      if (mcpMockOutcome === "auth_failed") {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "invalid api key" } }));
        return;
      }
      const q = String((body.arguments ?? {}).query ?? body.query ?? "topic");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: {
          isError: false,
          content: [{ type: "text", text: JSON.stringify({ results: [{ title: `MCP Docs: ${q}`, url: `https://mcp.research.test/${encodeURIComponent(q)}`, snippet: `MCP channel verified result for ${q}.` }] }) }],
        },
      }));
      return;
    }
    if (isSearch) {
      // 假 Tavily:记录查询供课程研学断言;回 1 条确定性命中(URL 含查询词,可证
      // 提示词注入与 sources 计数)。
      searchRequests.push({ query: body.query, maxResults: body.max_results });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          query: body.query,
          results: [
            {
              title: `Syllabus map: ${body.query}`,
              url: `https://research.test/${encodeURIComponent(body.query)}`,
              content: `Canonical learning path for ${body.query}: fundamentals, core foundations, capstone practice.`,
            },
          ],
        }),
      );
      return;
    }
    if (isTts) {
      // 假 StepFun TTS:记录请求体供字段级断言(model/input/voice/speed),
      // 回确定性"音频"字节(内容里带 voice 标记,可证缓存 key 隔离)。
      // 另记录原始体是否含非 ASCII 字节:真实上游 WAF 拦原始 CJK(tts.ts 必须
      // \u 转义成纯 ASCII 发送),集成层守住这条线防回归。
      lastTtsRequest = body;
      lastTtsBodyNonAscii = /[^\x00-\x7f]/.test(rawBody);
      ttsUpstreamCount += 1;
      response.writeHead(200, { "content-type": "audio/mpeg" });
      response.end(Buffer.from(`fake-mp3-for-${body.voice}-${Buffer.byteLength(String(body.input ?? ""))}b`));
      return;
    }
    if (isImages) {
      lastImageRequest = body;
      imageUpstreamCount += 1;
      if (imageResponseDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, imageResponseDelayMs));
      if (aiUpstreamForceFail || String(body.prompt ?? "").includes("AI-UPSTREAM-FAIL-TEST")) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "upstream_image_failed" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          data: [
            {
              b64_json: valid1024PngBase64,
              finish_reason: "success",
            },
          ],
        }),
      );
      return;
    }
    const rawContent = isMessages ? body.messages?.[0]?.content : body.messages?.[1]?.content;
    lastChatCompletion = {
      model: body.model,
      max_tokens: body.max_tokens,
      temperature: body.temperature,
      stream: body.stream,
      system: isMessages ? (body.system ?? "") : (body.messages?.[0]?.content ?? ""),
      user: userText(rawContent),
      userContent: rawContent ?? "",
      messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
      transport: isMessages ? "messages" : "chat",
    };
    aiUpstreamCount += 1;
    if (aiUpstreamForceFail || (lastChatCompletion.user ?? "").includes("AI-UPSTREAM-FAIL-TEST")) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "boom" }));
      return;
    }
    // 非流式调用的正文计算(llm.chat 走 Messages 或 404 降级回退到 chat/completions
    // 时共用同一套确定性生成:蓝图/单元形状识别 + aiUpstreamJsonOverride 透传)。
    const computeNonStreamText = async () => {
      let text = aiUpstreamJsonOverride;
      if (!text) {
        const sys = String(lastChatCompletion.system || "");
        const usr = String(lastChatCompletion.user || "");
        if (sys.includes("CourseBlueprint") || sys.includes("Curriculum Architect") || usr.includes("course blueprint")) {
          blueprintUpstreamCount += 1;
          const isZh = usr.includes("Language: zh-CN") || /[\u4e00-\u9fa5]/.test(usr);
          const isDeep = usr.includes("Target Depth: deep");
          const isOverview = usr.includes("Target Depth: overview");
          const unitCount = isDeep ? 8 : (isOverview ? 3 : 6);
          const units = [];
          for (let u = 1; u <= unitCount; u++) {
            units.push({
              unitId: `unit-${u}`,
              title: isZh ? `第 ${u} 单元：系统核心 ${u}` : `Unit ${u}: Core System Part ${u}`,
              prerequisites: u > 1 ? [`unit-${u - 1}`] : [],
              objectives: [isZh ? `掌握第 ${u} 阶段核心知识` : `Master core concept ${u}`],
              completionCriteria: [
                isZh ? `完成项目：实战工程 ${u}` : `Complete Project: Hands-on ${u}`,
                isZh ? `通关测验：第 ${u} 单元测验` : `Pass Exam: Unit ${u} Quiz`,
              ],
              lectureCount: 3,
              plannedSessionCount: 6,
              estimatedDurationMinutes: 180,
            });
          }
          text = JSON.stringify({
            courseTitle: usr.match(/blueprint for: "([^"]+)"/)?.[1] || "Course Title",
            courseDescription: isZh ? "高质量系统化深度课程" : "A comprehensive curriculum",
            targetLearner: isZh ? "探索深度知识的学习者" : "Curious learners seeking mastery",
            tags: ["System", "Practice"],
            units,
          });
        } else if (sys.includes("Unit Specialist") || usr.includes("Generate concrete lectures and sessions")) {
          if (unitResponseDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, unitResponseDelayMs));
          const isZh = usr.includes("Language: zh-CN") || usr.includes("Simplified Chinese") || /[\u4e00-\u9fa5]/.test(usr);
          const uIdMatch = usr.match(/Unit: "([^"]+)" - "([^"]+)"/);
          const uId = uIdMatch ? uIdMatch[1] : "unit-1";
          const uTitle = uIdMatch ? uIdMatch[2] : (isZh ? "第 1 单元" : "Unit 1");
          const reqMatch = usr.match(/generate EXACTLY (\d+) lectures and total (\d+) sessions/);
          const lecCount = reqMatch ? parseInt(reqMatch[1], 10) : 3;
          const sessCount = reqMatch ? parseInt(reqMatch[2], 10) : 6;

          // 生成精确匹配期望数量的 lectures 和 sessions
          const lectures = [];
          let remainingSessions = sessCount;
          for (let l = 1; l <= lecCount; l++) {
            const isLast = l === lecCount;
            const isPenultimate = l === lecCount - 1;
            let lTitle = isZh ? `第 ${l} 讲：核心要点` : `Lecture ${l}: Core Concepts`;
            if (isPenultimate) {
              lTitle = isZh ? `项目：单元实战工程` : `Project: Unit Hands-on`;
            } else if (isLast) {
              lTitle = isZh ? `测验：单元知识检验` : `Exam: Unit Assessment`;
            }
            const currentLecSessions = isLast
              ? remainingSessions
              : Math.max(1, Math.floor(remainingSessions / (lecCount - l + 1)));
            remainingSessions -= currentLecSessions;

            const sessions = [];
            for (let s = 1; s <= currentLecSessions; s++) {
              sessions.push({
                sessionId: `${uId}-lec-${l}-sess-${s}`,
                sessionIndex: s,
                title: isZh ? `第 ${s} 节：学习与实操` : `Session ${s}: Study and Practice`,
                sessionTime: 30,
                depthTags: isLast ? ["definition", "application"] : (isPenultimate ? ["application"] : ["intuition", "definition"]),
              });
            }
            lectures.push({
              lectureId: `${uId}-lec-${l}`,
              title: lTitle,
              sessions,
            });
          }

          text = JSON.stringify({
            unitId: uId,
            title: uTitle,
            prerequisites: [],
            objectives: [isZh ? "深入掌握单元核心" : "Master unit foundations"],
            completionCriteria: [
              isZh ? "完成动手项目并通关测验" : "Complete hands-on project and pass quiz",
            ],
            lectures,
          });
        } else {
          text = "ok";
        }
      }
      return text;
    };

    // 非流式 Messages 调用(llm.chat,模型探针/讲座规划/蓝图与单元生成用):回 Anthropic 非流式
    // JSON 形状;aiUpstreamJsonOverride 置值时以该 JSON 串作正文(计划透传断言)。
    if (isMessages && body.stream !== true) {
      const text = await computeNonStreamText();
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: "msg_fake", type: "message", role: "assistant", content: [{ type: "text", text }], stop_reason: "end_turn" }));
      return;
    }
    // StepFun 独立网页搜索 API(POST /v1/search,官方推荐与模型解耦;
    // 2026-10-01 实测套餐通道 chat 内置 web_search 工具恒不触发):
    if (request.url === "/v1/search") {
      lastStepfunSearchRequest = body;
      stepfunSearchRequests.push(body);
      if (stepfunSearchMockOutcome === "auth_failed") {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      if (stepfunSearchMockOutcome === "rate_limited") {
        response.writeHead(429, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "rate_limited" }));
        return;
      }
      if (stepfunSearchMockOutcome === "upstream_error") {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "upstream_fail" }));
        return;
      }
      if (stepfunSearchMockOutcome === "no_results") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ query: String(body.query ?? ""), category: "web", results: [] }));
        return;
      }
      const q = String(body.query ?? "topic");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        query: q,
        category: "web",
        results: [
          {
            title: `StepFun Docs: ${q}`,
            url: `https://stepfun.research.test/${encodeURIComponent(q)}`,
            snippet: `Verified curriculum outline and documentation for ${q}.`,
            time: "2026-09-30T08:00:00",
          },
        ],
      }));
      return;
    }
    // 非流式 chat/completions(llm.ts 的 Messages 失败/404 降级回退通道):OpenAI JSON 形状,
    // 与 Messages 非流式共用同一套确定性正文。
    if (request.url === "/v1/chat/completions" && body.stream !== true) {
      const text = await computeNonStreamText();
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: "chatcmpl_fake", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }] }));
      return;
    }
    response.writeHead(200, { "content-type": "text/event-stream" });
    // 覆盖正文(讲稿透传断言)在流式通道同样生效:切成 4 段验证跨帧拼接;可选截断模拟 max_tokens
    const overrideText = aiUpstreamJsonOverride === null ? null
      : aiUpstreamStreamTruncateAt === null ? aiUpstreamJsonOverride : aiUpstreamJsonOverride.slice(0, aiUpstreamStreamTruncateAt);
    const streamPieces = overrideText === null ? sseChunks
      : [0, 1, 2, 3].map((i) => overrideText.slice(Math.floor((i * overrideText.length) / 4), Math.floor(((i + 1) * overrideText.length) / 4)));
    const truncated = overrideText !== null && aiUpstreamStreamTruncateAt !== null;
    if (isMessages) {
      // Anthropic Messages 流:先 thinking 块再 text 块。thinking_delta 里故意夹带与正文
      // 相同的文字——若解析器把思维链当正文,客户端拼接会翻倍、断言即失败(可证伪)。
      response.write(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg_fake", model: body.model } })}\n\n`);
      response.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } })}\n\n`);
      for (const piece of streamPieces) {
        response.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: piece } })}\n\n`);
      }
      response.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 1, content_block: { type: "text", text: "" } })}\n\n`);
      for (const piece of streamPieces) {
        response.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: piece } })}\n\n`);
      }
      response.write(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: truncated ? "max_tokens" : "end_turn" } })}\n\n`);
      response.write(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
      response.end();
      return;
    }
    for (let i = 0; i < streamPieces.length; i += 1) {
      // 首帧夹带未知字段 echo:证明服务端/客户端解析器只取 delta.content、忽略其余。
      const payload = i === 0 ? { t: streamPieces[i], echo: lastChatCompletion } : { t: streamPieces[i] };
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: streamPieces[i] } }], echoPayload: payload })}\n\n`);
    }
    if (truncated) response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "length" }] })}\n\n`);
    response.end("data: [DONE]\n\n");
  });
  await new Promise((resolve, reject) => {
    aiServer.once("error", reject);
    aiServer.listen(0, "127.0.0.1", resolve);
  });
  aiPort = aiServer.address().port;
}

// 假 CF Email Service 上游(仿 startFakeAiUpstream 模式):校验 Bearer,记录每次
// send 调用的完整 body 到 sentEmails 供字段级断言;收件人含 fail-email-test(路由
// 会把邮箱统一转小写,标记用小写)→ 500(测发送失败时验证码行必须删除、邀请码
// 不得被幻影消耗)。测试永不触达真实外发。
export let emailServer;
export let emailPort;
export let sentEmails = [];

export async function startFakeEmailUpstream() {
  emailServer = createServer(async (request, response) => {
    const match = request.url?.match(/^\/accounts\/([^/]+)\/email\/sending\/send$/);
    if (request.method !== "POST" || !match) {
      response.writeHead(404).end();
      return;
    }
    if (request.headers.authorization !== "Bearer test-email-key") {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    sentEmails.push({ account: decodeURIComponent(match[1]), ...body });
    if (String(body.to?.[0] ?? "").includes("fail-email-test")) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "boom" }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ success: true, result: { message_id: `<fake-${sentEmails.length}@test>` } }));
  });
  await new Promise((resolve, reject) => {
    emailServer.once("error", reject);
    emailServer.listen(0, "127.0.0.1", resolve);
  });
  emailPort = emailServer.address().port;
}

// 从发往指定邮箱的最近一封邮件正文提取六位验证码。
export function latestEmailCode(email) {
  const sent = sentEmails.filter((entry) => entry.to?.[0] === email).at(-1);
  return sent?.text?.match(/(\d{6})/)?.[1] ?? null;
}

export const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export async function startFakeUploadScanner() {
  scannerServer = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/scan") {
      response.writeHead(404).end();
      return;
    }
    uploadScannerRequestCount += 1;
    if (request.headers.authorization !== `Bearer ${scannerToken}`) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    const sha256 = createHash("sha256").update(body).digest("hex");
    if (request.headers["x-content-sha256"] !== sha256) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "sha256_mismatch" }));
      return;
    }
    if (uploadScannerBusyResponsesRemaining > 0) {
      uploadScannerBusyResponsesRemaining -= 1;
      response.writeHead(503, { "content-type": "application/json", "retry-after": "1" });
      response.end(JSON.stringify({ error: "scanner_busy" }));
      return;
    }
    if (uploadScannerErrorAfterBusy) {
      const error = uploadScannerErrorAfterBusy;
      uploadScannerErrorAfterBusy = null;
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ error }));
      return;
    }
    if (body.includes(Buffer.from("SCANNER-UNAVAILABLE-TEST"))) {
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "scanner_unavailable" }));
      return;
    }
    const infected = body.includes(Buffer.from("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      engine: "integration-scanner/1",
      sha256,
      signature: infected ? "Eicar-Test-Signature" : null,
      verdict: infected ? "infected" : "clean",
    }));
  });
  await new Promise((resolve, reject) => {
    scannerServer.once("error", reject);
    scannerServer.listen(0, "127.0.0.1", resolve);
  });
  scannerPort = scannerServer.address().port;
}

export function setUploadScannerBusyResponses(count, errorAfterBusy = null) {
  if (!Number.isInteger(count) || count < 0) throw new RangeError("busy response count must be a non-negative integer");
  if (errorAfterBusy !== null && !new Set(["scan_failed", "scanner_unavailable"]).has(errorAfterBusy)) {
    throw new TypeError("unsupported post-busy scanner error");
  }
  uploadScannerBusyResponsesRemaining = count;
  uploadScannerErrorAfterBusy = errorAfterBusy;
}

export function authHeaders(name, email) {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "oai-authenticated-user-email": email,
    "oai-authenticated-user-full-name": encodeURIComponent(name),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  };
}

// 身份头但不带 content-type:用于 multipart/form-data 上传(fetch 需自行生成带 boundary 的 content-type)。
export function identityHeaders(name, email) {
  return {
    "oai-authenticated-user-email": email,
    "oai-authenticated-user-full-name": encodeURIComponent(name),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  };
}

export async function executeD1Sql(sql, expectSuccess = true) {
  const sqlPath = join(tmpdir(), `zaochang-test-sql-${crypto.randomUUID()}.sql`);
  const normalizedSql = sql.trim();
  writeFileSync(sqlPath, `${normalizedSql}${normalizedSql.endsWith(";") ? "" : ";"}\n`, "utf8");
  const result = spawnSync(process.execPath, [
    join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js"),
    "d1", "execute", "site-creator-d1", "--local",
    "--config", "dist/server/wrangler.json", "--file", sqlPath,
    "--persist-to", stateDir,
  ], { cwd: projectRoot, encoding: "utf8", windowsHide: true });
  await rm(sqlPath, { force: true });
  if (expectSuccess) assert.equal(result.status, 0, result.stderr || result.stdout);
  else assert.notEqual(result.status, 0, "expected local D1 command to fail");
  return `${result.stdout}\n${result.stderr}`;
}

export function previewServerArgs() {
  return [
    join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js"),
    "dev",
    "--config", "dist/server/wrangler.json",
    "--port", String(port),
    "--persist-to", stateDir,
    "--var", "APP_ENV:test",
    "--var", "LOCAL_DEV_LOGIN:1",
    // 集成测试专用:把课程生成 Stage1 服务端预算从 300s 压到 5s,让 11-hyperknow 的
    // 超时退费用例能在秒级真实触发"超时→失败→退费"路径(route 经 budgets 门禁只在
    // APP_ENV=test 采纳该 var;正常用例无人工延迟,远低于此预算)。
    "--var", "HK_COURSE_GEN_TIMEOUT_MS:5000",
    "--var", `ZAOCHANG_ADMIN_EMAILS:${adminEmail},${operationsAdminEmail}`,
    "--var", `ZAOCHANG_FOUNDER_EMAIL:${adminEmail}`,
    "--var", `UPLOAD_SCANNER_URL:http://127.0.0.1:${scannerPort}/scan`,
    "--var", `UPLOAD_SCANNER_TOKEN:${scannerToken}`,
    "--var", "ZAOCHANG_AGENT_TOKEN:test-agent-key",
    "--var", `HOSTING_DEPLOYER_TOKEN:${hostingDeployerToken}`,
    "--var", `AI_CHAT_BASE_URL:http://127.0.0.1:${aiPort}/v1`,
    "--var", "AI_CHAT_API_KEY:test-ai-key",
    "--var", "AI_CHAT_MODEL:test-model-1",
    "--var", "AI_CHAT_MODEL_EXPERT:test-model-expert",
    "--var", "AI_CHAT_EXPERT_TRANSPORT:messages",
    "--var", "AI_CHAT_VISION:1",
    "--var", `HYPERKNOW_TTS_BASE_URL:http://127.0.0.1:${aiPort}/v1`,
    "--var", "HK_TAVILY_API_KEY:test-search-key",
    "--var", `HK_WEB_SEARCH_BASE_URL:http://127.0.0.1:${aiPort}`,
    "--var", `EMAIL_SEND_BASE_URL:http://127.0.0.1:${emailPort}`,
    "--var", "EMAIL_SEND_ACCOUNT_ID:test-email-account",
    "--var", "EMAIL_SEND_API_TOKEN:test-email-key",
  ];
}

function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

export async function stopPreviewServer() {
  const currentServer = server;
  if (!currentServer || currentServer.exitCode !== null) {
    server = undefined;
    return;
  }

  let stopped = false;
  if (process.platform === "win32") {
    const forced = spawnSync("taskkill", ["/pid", String(currentServer.pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10000,
    });
    assert.notEqual(forced.error?.code, "ETIMEDOUT", `taskkill timed out for preview server ${currentServer.pid}`);
    assert.equal(forced.status, 0, forced.stderr || forced.stdout);
    stopped = await waitForChildExit(currentServer, 2000);
  } else {
    process.kill(-currentServer.pid, "SIGTERM");
    stopped = await waitForChildExit(currentServer, 5000);
    if (!stopped) {
      process.kill(-currentServer.pid, "SIGKILL");
      stopped = await waitForChildExit(currentServer, 2000);
    }
  }
  assert.equal(stopped, true, `preview server ${currentServer.pid} did not exit`);

  const closeDeadline = Date.now() + 5000;
  let portClosed = false;
  while (Date.now() < closeDeadline) {
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(300) });
      await response.body?.cancel();
    } catch {
      portClosed = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(portClosed, true, `preview port ${port} remained reachable after stopping process ${currentServer.pid}`);
  server = undefined;
}

export async function startPreviewServer({ warmDatabase = false } = {}) {
  assert.equal(server === undefined || server.exitCode !== null, true, "preview server is already running");
  const outputOffset = output.length;
  const nextServer = spawn(process.execPath, previewServerArgs(), {
    cwd: projectRoot,
    env: { ...process.env, WRANGLER_LOG_PATH: logPath },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  server = nextServer;
  nextServer.stdout.on("data", (chunk) => { output += chunk.toString(); });
  nextServer.stderr.on("data", (chunk) => { output += chunk.toString(); });

  // 就绪窗口 90s:wrangler dev 在 Windows 负载机首次 SSR 编译可到 40-50s,30s 会误杀。
  const deadline = Date.now() + 90000;
  let consecutiveHealthyReads = 0;
  let healthReads = 0;
  while (Date.now() < deadline) {
    healthReads += 1;
    if (nextServer.exitCode !== null) {
      throw new Error(`Preview server exited early:\n${output.slice(outputOffset)}`);
    }
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1500) });
      const responseOk = response.ok;
      await response.body?.cancel();
      consecutiveHealthyReads = responseOk ? consecutiveHealthyReads + 1 : 0;
      if (consecutiveHealthyReads >= 3) break;
    } catch {
      consecutiveHealthyReads = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  assert.equal(
    consecutiveHealthyReads >= 3,
    true,
    `preview server did not become stable: reads=${healthReads}\n${output.slice(outputOffset)}`,
  );

  if (!warmDatabase) return;
  const warmHeaders = authHeaders("预热用户", `warm-${runId}@example.com`);
  const databaseDeadline = Date.now() + 5000;
  let databaseReady = false;
  while (Date.now() < databaseDeadline) {
    const response = await fetch(`${baseUrl}/api/community`, { headers: warmHeaders });
    databaseReady = response.ok;
    await response.body?.cancel();
    if (databaseReady) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.equal(databaseReady, true, `Community database read path did not become ready:\n${output.slice(outputOffset)}`);

  const writeDeadline = Date.now() + 5000;
  while (Date.now() < writeDeadline) {
    const response = await fetch(`${baseUrl}/api/products`, {
      method: "POST",
      headers: warmHeaders,
      body: JSON.stringify({ title: "x" }),
    });
    if (response.status === 400) {
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 700));
      const stable = await fetch(`${baseUrl}/api/community`, { headers: warmHeaders });
      const stableOk = stable.ok;
      await stable.body?.cancel();
      if (stableOk) return;
    } else {
      await response.body?.cancel();
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Community database write path did not become ready:\n${output.slice(outputOffset)}`);
}

export async function fetchIdempotentWithRetry(input, init = {}, { deadlineMs = 12000, attemptTimeoutMs = 1500 } = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  assert.equal(["GET", "HEAD"].includes(method), true, "retry helper only supports idempotent GET or HEAD requests");
  assert.equal(init.body, undefined, "retry helper must not replay a request body");

  const deadline = Date.now() + deadlineMs;
  let attempts = 0;
  let lastFailure;
  while (Date.now() < deadline) {
    attempts += 1;
    try {
      const response = await fetch(input, {
        ...init,
        method,
        signal: AbortSignal.timeout(Math.min(attemptTimeoutMs, Math.max(1, deadline - Date.now()))),
      });
      if (response.status !== 502 && response.status !== 503) return response;
      lastFailure = new Error(`idempotent read returned transient status ${response.status}`);
      await response.body?.cancel();
    } catch (error) {
      lastFailure = error;
    }
    if (Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`idempotent read did not recover after ${attempts} attempts`, { cause: lastFailure });
}

export async function executeLocalD1(sql, expectSuccess = true) {
  const databaseDirectory = join(stateDir, "v3", "d1", "miniflare-D1DatabaseObject");
  const databaseFiles = readdirSync(databaseDirectory)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite");
  assert.equal(databaseFiles.length, 1, `expected one local D1 database, found ${databaseFiles.join(", ")}`);
  const localDatabase = new DatabaseSync(join(databaseDirectory, databaseFiles[0]));
  let sqlError;
  try {
    localDatabase.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    localDatabase.exec("BEGIN IMMEDIATE;");
    try {
      localDatabase.exec(sql.trim());
      localDatabase.exec("COMMIT;");
    } catch (error) {
      sqlError = error;
      try {
        localDatabase.exec("ROLLBACK;");
      } catch {
        // Preserve the original SQL failure as the assertion subject.
      }
    }
  } catch (error) {
    sqlError ??= error;
  } finally {
    localDatabase.close();
  }
  if (expectSuccess) {
    if (sqlError) throw sqlError;
    return "";
  }
  assert.notEqual(sqlError, undefined, "expected local D1 SQL to fail");
  return sqlError instanceof Error ? `${sqlError.name}: ${sqlError.message}\n${sqlError.stack ?? ""}` : String(sqlError);
}

// 只读取值用的单行查询(executeLocalD1 用 exec,不返回行)。
export async function queryLocalD1(sql) {
  const databaseDirectory = join(stateDir, "v3", "d1", "miniflare-D1DatabaseObject");
  const databaseFiles = readdirSync(databaseDirectory)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite");
  assert.equal(databaseFiles.length, 1, `expected one local D1 database, found ${databaseFiles.join(", ")}`);
  const localDatabase = new DatabaseSync(join(databaseDirectory, databaseFiles[0]));
  try {
    localDatabase.exec("PRAGMA busy_timeout = 5000;");
    return localDatabase.prepare(sql.trim()).all();
  } finally {
    localDatabase.close();
  }
}

// Inspect Miniflare's local R2 object metadata directly. The backing SQLite
// table is the same object index used by the bound R2Bucket, so tests can
// distinguish a deleted quarantine object from a row that is merely unreadable.
export async function queryLocalR2Keys() {
  const databaseFiles = readdirSync(stateDir, { recursive: true })
    .filter((name) => typeof name === "string" && name.endsWith(".sqlite"));
  const keys = [];
  let foundObjectIndex = false;
  for (const relativePath of databaseFiles) {
    const localDatabase = new DatabaseSync(join(stateDir, relativePath));
    try {
      localDatabase.exec("PRAGMA busy_timeout = 5000;");
      const table = localDatabase.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_mf_objects'`,
      ).get();
      if (!table) continue;
      foundObjectIndex = true;
      for (const row of localDatabase.prepare(`SELECT key FROM _mf_objects`).all()) keys.push(String(row.key));
    } finally {
      localDatabase.close();
    }
  }
  assert.equal(foundObjectIndex, true, "expected Miniflare's local R2 object index");
  return keys.sort();
}

export async function creditTestFruit(email, amount = 20, label = crypto.randomUUID()) {
  assert.match(email, /^[a-z0-9@._+-]+$/i);
  assert.equal(Number.isInteger(amount) && amount > 0, true);
  assert.match(label, /^[a-z0-9_-]+$/i);
  const operationId = `test-credit:${runId}:${label}`;
  await executeLocalD1(`
    INSERT INTO fruit_operations
      (id, kind, idempotency_key, target_email, amount, reference_type, reference_id, description)
    VALUES ('${operationId}', 'test_credit', '${operationId}', '${email}', ${amount}, 'test_fixture', '${label}', 'integration test ledger credit');
    UPDATE wallets
      SET balance = balance + ${amount}, lifetime_earned = lifetime_earned + ${amount}, updated_at = CURRENT_TIMESTAMP
      WHERE user_email = '${email}';
    INSERT INTO fruit_entries (operation_id, user_email, bucket, delta)
      VALUES ('${operationId}', '${email}', 'available', ${amount})
  `);
  return operationId;
}

export async function reviewProduct(productId, decision = "approve_product", note = "平台预审确认产品说明与体验入口符合发布要求。") {
  assert.equal(Number.isInteger(productId), true);
  let response;
  let responseText = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(`${baseUrl}/api/admin/moderation`, {
      method: "PATCH",
      headers: authHeaders("发布审核管理员", adminEmail),
      body: JSON.stringify({ action: decision, targetRef: String(productId), note }),
    });
    responseText = await response.text();
    if (response.status !== 503 || !responseText.includes("worker restarted mid-request")) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(response.status, 200, responseText);
  const body = JSON.parse(responseText);
  assert.equal(body.productId, productId);
  assert.equal(body.reviewStatus, decision === "approve_product" ? "approved" : "rejected");
  return body;
}

before(async () => {
  await startFakeUploadScanner();
  await startFakeAiUpstream();
  await startFakeEmailUpstream();
  const migrationFiles = ["0000_silky_karen_page.sql", "0001_oauth_accounts.sql", "0002_community_interactions.sql", "0003_strange_sandman.sql", "0004_lush_gambit.sql", "0005_flimsy_magus.sql", "0006_release_readiness.sql", "0007_product_like_counters.sql", "0008_noisy_jazinda.sql", "0009_moderation_remediation.sql", "0010_invite_upload_security.sql", "0011_redundant_phalanx.sql", "0012_eminent_satana.sql", "0013_lovely_lord_hawal.sql", "0014_furry_vapor.sql", "0015_complex_eddie_brock.sql", "0016_wise_synch.sql", "0017_workable_wraith.sql", "0018_stale_speed_demon.sql", "0019_community_counter_triggers.sql", "0020_exotic_the_renegades.sql", "0021_brainy_jack_power.sql", "0022_hyperknow_tasks_and_leases.sql", "0023_cool_madame_hydra.sql", "0024_hyperknow_image_cleanup.sql", "0025_hyperknow_image_cleanup_claim.sql", "0026_far_spyke.sql", "0027_numerous_lily_hollister.sql", "0028_confused_maximus.sql", "0029_public_marten_broadcloak.sql", "0030_personal_api_keys.sql", "0031_mcp_oauth.sql", "0032_page_hosting.sql", "0033_external_payment_guard_client_state.sql", "0034_follow_creator_email_identity.sql"];
  const bootstrapSql = migrationFiles
    .slice(0, 8)
    .map((migrationFile) => readFileSync(join(projectRoot, "drizzle", migrationFile), "utf8"))
    .join("\n");
  await executeD1Sql(bootstrapSql);

  for (const migrationFile of migrationFiles.slice(8)) {
    if (migrationFile === "0008_noisy_jazinda.sql") {
      await executeLocalD1(`
        INSERT INTO members (email, display_name) VALUES ('legacy-review-migration@example.com', '迁移前作者');
        INSERT INTO members (email, display_name, joined_at)
          VALUES ('legacy-review-buyer@example.com', '迁移前买家', datetime('now', '-48 hours'));
        INSERT INTO wallets (user_email, balance, lifetime_earned, lifetime_spent) VALUES ('legacy-review-migration@example.com', 0, 0, 0);
        INSERT INTO wallets (user_email, balance, lifetime_earned, lifetime_spent) VALUES ('legacy-review-buyer@example.com', 0, 0, 0);
        INSERT INTO products (owner_email, owner_name, title, description, category)
          VALUES ('legacy-review-migration@example.com', '迁移前作者', '迁移前公开产品', '用于验证历史产品升级后必须重新进入平台预审。', '开发工具');
        INSERT INTO fruit_operations
          (id, kind, idempotency_key, actor_email, target_email, amount, reference_type, reference_id, description)
          SELECT 'legacy-review-purchase', 'purchase', 'legacy-review-purchase',
                 'legacy-review-buyer@example.com', owner_email, 1, 'product', CAST(id AS TEXT), '迁移前订单'
          FROM products WHERE owner_email = 'legacy-review-migration@example.com';
        INSERT INTO product_orders
          (id, buyer_email, product_id, seller_email, pricing_model, amount,
           idempotency_key, purchase_operation_id, available_at)
          SELECT 'legacy-review-order', 'legacy-review-buyer@example.com', id, owner_email,
                 'one_time', 1, 'legacy-review-order', 'legacy-review-purchase', datetime('now', '+24 hours')
          FROM products WHERE owner_email = 'legacy-review-migration@example.com';
        INSERT INTO product_likes (product_id, user_email)
          SELECT id, 'legacy-review-buyer@example.com'
          FROM products WHERE owner_email = 'legacy-review-migration@example.com'
      `);
    }
    if (migrationFile === "0031_mcp_oauth.sql") {
      // 0031 重建被 9 张子表引用的 oauth_provider_clients。D1 恒开外键且在事务内忽略
      // PRAGMA foreign_keys=OFF:空库能过不代表生产(已有客户端与令牌)能过——旧写法在有数据的库上
      // 报 FOREIGN KEY constraint failed。此处先灌入既有开发者客户端及子表行,迁移后断言完好。
      await executeLocalD1(`
        INSERT INTO members (email, display_name) VALUES ('pre-0031-dev@example.com', '迁移前开发者'), ('pre-0031-user@example.com', '迁移前用户');
        INSERT INTO oauth_provider_clients (client_id, owner_email, name, description, website_url, client_type, client_secret_hash, allowed_scopes, review_status, write_access_approved)
          VALUES ('zc_pre_0031_app', 'pre-0031-dev@example.com', '迁移前应用', 'd', 'https://pre-0031.example', 'confidential', 'h', 'openid profile', 'verified', 0);
        INSERT INTO oauth_provider_redirect_uris (client_id, redirect_uri) VALUES ('zc_pre_0031_app', 'https://pre-0031.example/cb');
        INSERT INTO oauth_provider_subjects (client_id, user_email, subject) VALUES ('zc_pre_0031_app', 'pre-0031-user@example.com', 'zcsub_pre_0031');
        INSERT INTO oauth_provider_consents (client_id, user_email, scope) VALUES ('zc_pre_0031_app', 'pre-0031-user@example.com', 'openid profile');
        INSERT INTO oauth_provider_access_tokens (token_hash, client_id, user_email, scope, expires_at) VALUES ('pre-0031-at', 'zc_pre_0031_app', 'pre-0031-user@example.com', 'openid profile', datetime('now', '+1 hour'));
        INSERT INTO oauth_provider_refresh_tokens (token_hash, client_id, user_email, scope, expires_at) VALUES ('pre-0031-rt', 'zc_pre_0031_app', 'pre-0031-user@example.com', 'openid profile', datetime('now', '+30 days'))
      `);
    }
    if (migrationFile === "0032_page_hosting.sql") {
      // 0032 重建 uploaded_files(CHECK 变更)并给 products 加列。空库能过不代表生产(已有上传与产品)能过:
      // 先灌入既有会员/上传/产品行,迁移后断言行完好、外键无悬空、触发器已按新定义重建。
      await executeLocalD1(`
        INSERT INTO members (email, display_name) VALUES ('pre-0032@example.com', '迁移前托管用户');
        INSERT INTO uploaded_files (key, owner_email, original_name, media_type, byte_size, visibility, purpose, sha256, scan_status, scan_engine, quarantine_key, hyperknow_image)
          VALUES ('pre-0032-file.png', 'pre-0032@example.com', 'pre-0032.png', 'image/png', 68, 'private', 'product_cover', '${"a".repeat(64)}', 'pending', NULL, 'quarantine/pre-0032', 0);
        UPDATE uploaded_files SET scan_status = 'clean', scan_engine = 'pre-0032-engine', quarantine_key = NULL, scanned_at = CURRENT_TIMESTAMP WHERE key = 'pre-0032-file.png';
        INSERT INTO products (owner_email, owner_name, title, description, category)
          VALUES ('pre-0032@example.com', '迁移前托管用户', '迁移前产品', '用于验证 0032 迁移保留既有产品。', '开发工具');
        INSERT INTO mcp_write_audit (id, member_email, credential_kind, credential_id, tool_name, product_id, result)
          VALUES ('pre-0032-audit', 'pre-0032@example.com', 'api_key', 'pre-0032-key', 'create_product', NULL, 'ok')
      `);
    }
    await executeLocalD1(readFileSync(join(projectRoot, "drizzle", migrationFile), "utf8"));
    if (migrationFile === "0032_page_hosting.sql") {
      const preserved = (await queryLocalD1(`SELECT key, purpose, scan_status, scan_engine, sha256, hyperknow_image FROM uploaded_files WHERE key = 'pre-0032-file.png'`)).map((row) => ({ ...row }));
      assert.deepEqual(preserved, [{ key: "pre-0032-file.png", purpose: "product_cover", scan_status: "clean", scan_engine: "pre-0032-engine", sha256: "a".repeat(64), hyperknow_image: 0 }]);
      const productRows = (await queryLocalD1(`SELECT hosting_revision, review_version, review_status FROM products WHERE owner_email = 'pre-0032@example.com'`)).map((row) => ({ ...row }));
      assert.deepEqual(productRows, [{ hosting_revision: 0, review_version: 1, review_status: "pending_review" }]);
      assert.deepEqual(await queryLocalD1("PRAGMA foreign_key_check"), [], "0032 must leave no dangling child rows");
      const triggers = (await queryLocalD1(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name IN ('uploaded_files_pending_insert_guard', 'uploaded_files_scan_transition_guard', 'uploaded_files_hosting_bundle_guard', 'product_material_change_requires_review', 'product_hostings_approval_staging_guard') ORDER BY name`)).map((row) => row.name);
      assert.deepEqual(triggers, ["product_hostings_approval_staging_guard", "product_material_change_requires_review", "uploaded_files_hosting_bundle_guard", "uploaded_files_pending_insert_guard", "uploaded_files_scan_transition_guard"]);
      // mcp_write_audit 的 tool_name CHECK 在 0032 里随托管工具放宽:旧行保留,新工具名可写,未知名仍拒绝。
      const auditRows = (await queryLocalD1(`SELECT id, tool_name, result FROM mcp_write_audit WHERE id = 'pre-0032-audit'`)).map((row) => ({ ...row }));
      assert.deepEqual(auditRows, [{ id: "pre-0032-audit", tool_name: "create_product", result: "ok" }]);
      await executeLocalD1(`INSERT INTO mcp_write_audit (id, member_email, credential_kind, credential_id, tool_name, result) VALUES ('pre-0032-audit-2', 'pre-0032@example.com', 'oauth', 'c', 'begin_hosting_upload', 'ok'), ('pre-0032-audit-3', 'pre-0032@example.com', 'oauth', 'c', 'remove_hosting', 'ok')`);
      const unknownTool = await executeLocalD1(`INSERT INTO mcp_write_audit (id, member_email, credential_kind, credential_id, tool_name, result) VALUES ('pre-0032-audit-4', 'pre-0032@example.com', 'oauth', 'c', 'delete_everything', 'ok')`, false);
      assert.match(unknownTool, /CHECK constraint failed/, "unknown MCP write tool names must stay rejected");
      await executeLocalD1(`DELETE FROM mcp_write_audit WHERE member_email = 'pre-0032@example.com'`);
      const zipOutsideHosting = await executeLocalD1(
        `INSERT INTO uploaded_files (key, owner_email, original_name, media_type, byte_size, visibility, purpose, sha256, scan_status) VALUES ('pre-0032-zip.zip', 'pre-0032@example.com', 'x.zip', 'application/zip', 10, 'private', 'general', '${"b".repeat(64)}', 'pending')`,
        false,
      );
      assert.match(zipOutsideHosting, /uploaded_file_hosting_bundle_invalid/, "zip must be rejected outside the hosting_bundle purpose");
      await executeLocalD1(`
        DELETE FROM products WHERE owner_email = 'pre-0032@example.com';
        DELETE FROM uploaded_files WHERE owner_email = 'pre-0032@example.com';
        DELETE FROM members WHERE email = 'pre-0032@example.com'
      `);
    }
    if (migrationFile === "0031_mcp_oauth.sql") {
      assert.deepEqual(
        (await queryLocalD1(`SELECT client_id, owner_email, registration_source, review_status, allowed_scopes FROM oauth_provider_clients WHERE client_id = 'zc_pre_0031_app'`)).map((row) => ({ ...row })),
        [{ client_id: "zc_pre_0031_app", owner_email: "pre-0031-dev@example.com", registration_source: "developer", review_status: "verified", allowed_scopes: "openid profile" }],
      );
      assert.deepEqual(
        (await queryLocalD1(`SELECT
          (SELECT COUNT(*) FROM oauth_provider_redirect_uris WHERE client_id = 'zc_pre_0031_app') AS redirects,
          (SELECT COUNT(*) FROM oauth_provider_subjects WHERE client_id = 'zc_pre_0031_app') AS subjects,
          (SELECT COUNT(*) FROM oauth_provider_consents WHERE client_id = 'zc_pre_0031_app') AS consents,
          (SELECT COUNT(*) FROM oauth_provider_access_tokens WHERE client_id = 'zc_pre_0031_app' AND resource IS NULL) AS access,
          (SELECT COUNT(*) FROM oauth_provider_refresh_tokens WHERE client_id = 'zc_pre_0031_app' AND resource IS NULL) AS refresh`)).map((row) => ({ ...row })),
        [{ redirects: 1, subjects: 1, consents: 1, access: 1, refresh: 1 }],
      );
      assert.deepEqual(await queryLocalD1("PRAGMA foreign_key_check"), [], "0031 must leave no dangling child rows");
      const orphan = await executeLocalD1(`INSERT INTO oauth_provider_redirect_uris (client_id, redirect_uri) VALUES ('zc_missing_parent', 'https://x.example/cb')`, false);
      assert.match(orphan, /FOREIGN KEY constraint failed/, "child FK must still point at the rebuilt oauth_provider_clients");
      await executeLocalD1(`
        DELETE FROM oauth_provider_refresh_tokens WHERE client_id = 'zc_pre_0031_app';
        DELETE FROM oauth_provider_access_tokens WHERE client_id = 'zc_pre_0031_app';
        DELETE FROM oauth_provider_consents WHERE client_id = 'zc_pre_0031_app';
        DELETE FROM oauth_provider_subjects WHERE client_id = 'zc_pre_0031_app';
        DELETE FROM oauth_provider_redirect_uris WHERE client_id = 'zc_pre_0031_app';
        DELETE FROM oauth_provider_clients WHERE client_id = 'zc_pre_0031_app';
        DELETE FROM members WHERE email IN ('pre-0031-dev@example.com', 'pre-0031-user@example.com')
      `);
    }
    if (migrationFile === "0008_noisy_jazinda.sql") {
      const bypassFailure = await executeLocalD1(
        `UPDATE products
         SET status = 'published', review_status = 'approved', approved_version = review_version,
             reviewed_by = owner_email, reviewed_at = CURRENT_TIMESTAMP, review_note = '绕过审核决定'
         WHERE owner_email = 'legacy-review-migration@example.com'`,
        false,
      );
      assert.match(bypassFailure, /product_review_state_invalid/);
      await executeLocalD1(`
        CREATE TABLE migration_review_assertion (id integer);
        CREATE TRIGGER migration_review_assertion_guard BEFORE INSERT ON migration_review_assertion
        WHEN NOT EXISTS (
          SELECT 1 FROM products
          WHERE owner_email = 'legacy-review-migration@example.com'
            AND status = 'pending_review' AND review_status = 'pending_review'
            AND review_version = 1 AND approved_version = 0
            AND EXISTS (SELECT 1 FROM product_orders WHERE id = 'legacy-review-order' AND product_id = products.id)
            AND EXISTS (SELECT 1 FROM product_likes WHERE product_id = products.id AND user_email = 'legacy-review-buyer@example.com')
        ) BEGIN SELECT RAISE(ABORT, 'legacy_product_not_pending_review'); END;
        INSERT INTO migration_review_assertion (id) VALUES (1);
        DROP TRIGGER migration_review_assertion_guard;
        DROP TABLE migration_review_assertion;
        INSERT INTO product_review_decisions (id, product_id, review_version, reviewer_email, decision, note)
          SELECT 'legacy-review-decision', id, review_version, owner_email, 'approved', '迁移测试批准当前版本。'
          FROM products WHERE owner_email = 'legacy-review-migration@example.com'
      `);
      const mutableDecision = await executeLocalD1(`
        UPDATE product_review_decisions SET note = '篡改审核意见' WHERE id = 'legacy-review-decision'
      `, false);
      assert.match(mutableDecision, /product_review_decision_immutable/);
      const deletableDecision = await executeLocalD1(`
        DELETE FROM product_review_decisions WHERE id = 'legacy-review-decision'
      `, false);
      assert.match(deletableDecision, /product_review_decision_immutable/);
      await executeLocalD1(`
        UPDATE products SET price = 1 WHERE owner_email = 'legacy-review-migration@example.com';
        CREATE TABLE material_review_assertion (id integer);
        CREATE TRIGGER material_review_assertion_guard BEFORE INSERT ON material_review_assertion
        WHEN NOT EXISTS (
          SELECT 1 FROM products
          WHERE owner_email = 'legacy-review-migration@example.com'
            AND status = 'pending_review' AND review_status = 'pending_review'
            AND review_version = 2 AND approved_version = 1
        ) BEGIN SELECT RAISE(ABORT, 'material_change_did_not_require_review'); END;
        INSERT INTO material_review_assertion (id) VALUES (1);
        DROP TRIGGER material_review_assertion_guard;
        DROP TABLE material_review_assertion
      `);
      const guardedOrder = await executeLocalD1(`
        INSERT INTO product_orders
          (id, buyer_email, product_id, seller_email, pricing_model, amount,
           idempotency_key, purchase_operation_id, available_at)
          SELECT 'review-guard-order', 'legacy-review-buyer@example.com', id, owner_email,
                 pricing_model, price, 'review-guard-order', 'legacy-review-purchase', datetime('now', '+24 hours')
          FROM products WHERE owner_email = 'legacy-review-migration@example.com'
      `, false);
      assert.match(guardedOrder, /product_order_product_not_approved/);
      const guardedLike = await executeLocalD1(`
        INSERT INTO product_likes (product_id, user_email)
          SELECT id, owner_email FROM products WHERE owner_email = 'legacy-review-migration@example.com'
      `, false);
      assert.match(guardedLike, /product_like_product_not_approved/);
      const guardedComment = await executeLocalD1(`
        INSERT INTO comments (user_email, owner_name, target_type, target_ref, content)
          SELECT owner_email, owner_name, 'product', CAST(id AS TEXT), '待审产品评论'
          FROM products WHERE owner_email = 'legacy-review-migration@example.com'
      `, false);
      assert.match(guardedComment, /product_comment_product_not_approved/);
      const guardedTip = await executeLocalD1(`
        INSERT INTO fruit_operations
          (id, kind, idempotency_key, actor_email, target_email, amount, reference_type, reference_id, description)
          SELECT 'review-guard-tip', 'tip', 'review-guard-tip', 'legacy-review-buyer@example.com',
                 owner_email, 5, 'product', CAST(id AS TEXT), '待审产品打赏'
          FROM products WHERE owner_email = 'legacy-review-migration@example.com'
      `, false);
      assert.match(guardedTip, /product_tip_product_not_approved/);
      await executeLocalD1(`
        INSERT INTO product_review_decisions (id, product_id, review_version, reviewer_email, decision, note)
          SELECT 'legacy-review-decision-v2', id, review_version,
                 'legacy-review-migration@example.com', 'approved', '迁移测试批准第二版本。'
          FROM products WHERE owner_email = 'legacy-review-migration@example.com';
        UPDATE products
          SET owner_email = 'legacy-review-buyer@example.com', owner_name = '迁移前买家'
          WHERE owner_email = 'legacy-review-migration@example.com';
        CREATE TABLE owner_review_assertion (id integer);
        CREATE TRIGGER owner_review_assertion_guard BEFORE INSERT ON owner_review_assertion
        WHEN NOT EXISTS (
          SELECT 1 FROM products
          WHERE title = '迁移前公开产品'
            AND owner_email = 'legacy-review-buyer@example.com'
            AND status = 'pending_review' AND review_status = 'pending_review'
            AND review_version = 3 AND approved_version = 2
        ) BEGIN SELECT RAISE(ABORT, 'owner_change_did_not_require_review'); END;
        INSERT INTO owner_review_assertion (id) VALUES (1);
        DROP TRIGGER owner_review_assertion_guard;
        DROP TABLE owner_review_assertion;
        DELETE FROM product_likes WHERE user_email = 'legacy-review-buyer@example.com';
        DELETE FROM product_orders WHERE id = 'legacy-review-order';
        DROP TRIGGER product_review_decisions_no_delete;
        DELETE FROM product_review_decisions
          WHERE product_id = (SELECT id FROM products WHERE title = '迁移前公开产品');
        CREATE TRIGGER product_review_decisions_no_delete
          BEFORE DELETE ON product_review_decisions
          BEGIN SELECT RAISE(ABORT, 'product_review_decision_immutable'); END;
        DELETE FROM products WHERE title = '迁移前公开产品';
        DROP TRIGGER fruit_operations_no_delete;
        DELETE FROM fruit_operations WHERE id = 'legacy-review-purchase';
        CREATE TRIGGER fruit_operations_no_delete
          BEFORE DELETE ON fruit_operations
          BEGIN SELECT RAISE(ABORT, 'fruit_operations_immutable'); END;
        DELETE FROM wallets WHERE user_email = 'legacy-review-buyer@example.com';
        DELETE FROM wallets WHERE user_email = 'legacy-review-migration@example.com';
        DELETE FROM members WHERE email = 'legacy-review-buyer@example.com';
        DELETE FROM members WHERE email = 'legacy-review-migration@example.com'
      `);
    }
  }

  await startPreviewServer({ warmDatabase: true });
});

after(async () => {
  await stopPreviewServer();
  await rm(stateDir, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 120,
  });
  await rm(logPath, { force: true, maxRetries: 4, retryDelay: 80 });
  if (scannerServer?.listening) {
    await new Promise((resolve, reject) => scannerServer.close((error) => error ? reject(error) : resolve()));
  }
  if (aiServer?.listening) {
    await new Promise((resolve, reject) => aiServer.close((error) => error ? reject(error) : resolve()));
  }
  if (emailServer?.listening) {
    await new Promise((resolve, reject) => emailServer.close((error) => error ? reject(error) : resolve()));
  }
});

// 最小 SSE 帧解析(原 describe 体内共享助手):把 Response 读成 {text, done}。
export async function readSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let done = null;
  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });
    let frameEnd = buffer.indexOf("\n\n");
    while (frameEnd >= 0) {
      const frame = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + 2);
      frameEnd = buffer.indexOf("\n\n");
      const eventLine = frame.split("\n").find((line) => line.startsWith("event:"));
      const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
      if (!eventLine || !dataLine) continue;
      const event = eventLine.slice(6).trim();
      const data = JSON.parse(dataLine.slice(5).trim());
      if (event === "delta") text += data.t;
      else if (event === "done") done = data;
    }
  }
  return { text, done };
}
