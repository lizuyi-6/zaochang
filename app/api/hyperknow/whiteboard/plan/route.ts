import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { assertSameOrigin } from "../../../_lib/request-origin";
import { enforceRateLimit, rateLimitKey } from "../../../_lib/rate-limit";
import { planLecture } from "../../../_lib/hyperknow/agents";
import { HyperknowNotConfiguredError, HyperknowUpstreamError } from "../../../_lib/hyperknow/llm";
import { saveWhiteboardSession } from "../../../_lib/hyperknow/store";

export const dynamic = "force-dynamic";

// 白板讲座规划端点(原 ws/whiteboardWs.js 的无状态化改造,见 HYPERKNOW.md)。
// 原版把讲座计划存在 WS 连接内存里、用 setTimeout 链在服务端按节奏推步;
// Workers 无长连接可用,改为一次 POST 返回完整计划,播放节奏移交客户端适配器
// (同一条 stepDurationMs 公式保证两端节奏一致),服务端只落库做归属校验。
// 响应里 session_ready 的形状与原 WS 事件逐字段一致,前端页面层零改动。

const DEFAULT_TOPIC = "Introduction to Learning Concepts";

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const input = (await request.json().catch(() => ({}))) as { topic?: unknown };
    const topic = (String(input.topic ?? "").trim().slice(0, 300)) || DEFAULT_TOPIC;

    await enforceRateLimit(await rateLimitKey("hyperknow-whiteboard", member.email), 20, 60 * 60);

    const signal = AbortSignal.timeout(60_000);
    let plan;
    try {
      plan = await planLecture(topic, signal);
    } catch (error) {
      if (error instanceof HyperknowNotConfiguredError) {
        return Response.json({ error: error.code }, { status: error.status });
      }
      if (error instanceof HyperknowUpstreamError) {
        return Response.json({ error: error.code }, { status: error.status });
      }
      throw error;
    }

    const sessionId = crypto.randomUUID();
    await saveWhiteboardSession({ id: sessionId, userEmail: member.email, topic, plan });

    return Response.json({
      session_id: sessionId,
      topic,
      resumed: false,
      status: "active",
      steps: plan.steps,
    });
  } catch (error) {
    return jsonError(error);
  }
}
