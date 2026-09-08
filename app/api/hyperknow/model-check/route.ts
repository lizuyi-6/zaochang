import { requireMember } from "../../_lib/access-control";
import { jsonError } from "../../_lib/errors";
import { assertSameOrigin } from "../../_lib/request-origin";
import { enforceRateLimit, rateLimitKey } from "../../_lib/rate-limit";
import { chat, HyperknowNotConfiguredError, HyperknowUpstreamError } from "../../_lib/hyperknow/llm";

export const dynamic = "force-dynamic";

// 模型探针(白板连接面板"检查模型状态"):一次最小代价的真实模型调用,
// 只回答"模型是否响应 + 往返耗时"。不扣积分、不落库——它衡量的是链路健康,
// 不是内容;失败也回 200 + ok:false,让前端区分"模型没响应"与"检查没跑起来"。
const PROBE_TIMEOUT_MS = 30_000;

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const originError = assertSameOrigin(request);
    if (originError) return originError;

    await enforceRateLimit(await rateLimitKey("hyperknow-model-check", member.email), 20, 60 * 60);

    const startedAt = Date.now();
    try {
      const answer = await chat(
        [
          { role: "system", content: "You are a health probe. Reply with exactly one word: ok" },
          { role: "user", content: "ping" },
        ],
        { maxTokens: 16, signal: AbortSignal.any([request.signal, AbortSignal.timeout(PROBE_TIMEOUT_MS)]) },
      );
      return Response.json({ ok: true, latency_ms: Date.now() - startedAt, answer: answer.trim().slice(0, 40) });
    } catch (error) {
      if (error instanceof HyperknowNotConfiguredError) {
        return Response.json({ error: error.code }, { status: error.status });
      }
      if (error instanceof HyperknowUpstreamError) {
        return Response.json({ ok: false, error: error.code }, { status: 200 });
      }
      // 超时/中断:上游没在预算内给出回答,按"模型没响应"上报。
      return Response.json({ ok: false, error: "no_answer" }, { status: 200 });
    }
  } catch (error) {
    return jsonError(error);
  }
}
