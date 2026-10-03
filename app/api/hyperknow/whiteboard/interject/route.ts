import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { assertSameOrigin } from "../../../_lib/request-origin";
import { enforceRateLimit, rateLimitKey } from "../../../_lib/rate-limit";
import { answerInterjection } from "../../../_lib/hyperknow/agents";
import { getWhiteboardSession } from "../../../_lib/hyperknow/store";

export const dynamic = "force-dynamic";

// 举手插话端点(原 ws/whiteboardWs.js interject_question 的无状态化改造)。
// 讲座进行中的打断:按 session_id 取回本人讲座计划,以当前步为上下文答疑;
// 归属不符/不存在统一 404(不泄露存在性,与站内 fail-closed 纪律一致)。
// 答疑文本由前端适配器本地合成音频(原版也是前端拿 audioUrl 再拉流)。
export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const input = (await request.json().catch(() => ({}))) as { session_id?: unknown; step_id?: unknown; question?: unknown };
    const sessionId = typeof input.session_id === "string" ? input.session_id : "";
    const stepId = typeof input.step_id === "string" ? input.step_id : "";
    const question = String(input.question ?? "").trim().slice(0, 500);
    if (!sessionId) return Response.json({ error: "session_required" }, { status: 400 });
    if (!question) return Response.json({ error: "question_required" }, { status: 400 });

    await enforceRateLimit(await rateLimitKey("hyperknow-interject", member.email), 30, 60 * 60);

    // 404 先于上游调用:不存在/越权的会话不消耗 AI 额度。
    const session = await getWhiteboardSession(sessionId, member.email);
    if (!session) return Response.json({ error: "target_not_found" }, { status: 404 });

    const currentStep = session.plan.steps.find((step) => step.step_id === stepId) ?? null;

    /* answerInterjection 内部对上游故障兜底为可读的"联系不上导师"话术,不在路由层
     * 再分流(旧 upstream-error 分支因内部全捕获而永不可达,已删)。 */
    const signal = AbortSignal.timeout(60_000);
    const answer = await answerInterjection(question, currentStep, signal, member.displayName, session.plan.language);

    return Response.json({
      answer_text: answer.answer_text,
      resume_transition: answer.resume_transition,
    });
  } catch (error) {
    return jsonError(error);
  }
}
