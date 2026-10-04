import { requireMember } from "../../_lib/access-control";
import { frame, sseResponse } from "../../_lib/hyperknow/sse";
import { jsonError } from "../../_lib/errors";
import { assertSameOrigin } from "../../_lib/request-origin";
import { enforceRateLimit, rateLimitKey } from "../../_lib/rate-limit";
import { contentGenerateStream, generateNextSteps, resolveChatModel } from "../../_lib/hyperknow/agents";
import { CHAT_TOTAL_BUDGET_MS } from "../../_lib/hyperknow/budgets";
import { HyperknowNotConfiguredError, HyperknowUpstreamError } from "../../_lib/hyperknow/llm";
import { FALLBACK_GUIDELINE } from "../../_lib/hyperknow/prompts";
import { saveConversation, getConversation } from "../../_lib/hyperknow/store";
import { consumeCredits, currentCredits, dailyCreditsFor, HK_CHAT_COST } from "../../_lib/hyperknow/credits";
import { decodeRequestBodyJson, type StreamChunk } from "../../_lib/hyperknow/protocol";

export const dynamic = "force-dynamic";

// 主学习对话端点(原 ws/chatWs.js 的 SSE 化)。事件序列与原 WS 逐帧一致:
//   conversation_created → credit_status → tool_execution(directorAgent thinking)
//   → tool_selection(generate_content started) → [thinking 增量映射为 directorAgent
//   thinking;首个正文增量先补发 directorAgent completed] → content_chunk×N
//   → tool_execution(generate_content completed) → tool_selection(recommend_next_step
//   started) → tool_execution(recommend_next_step completed) → complete。
// 前端适配器(同接口 SSE 版 ChatWsClient)按 data.type 分发,页面层零改动。
//
// 失败语义二分(与 reading-ai 路由同款):
// - 流开始之前(鉴权/同源/限流/校验/配置/上游非 2xx)→ 普通 JSON 错误;
//   为此先预取首个 LLM 增量再发 SSE 头,conversation_created 等帧随流一起延后。
// - 流开始之后 → 补一帧 {type:"error"} 再关闭(原 WS 的 catch 行为)。

type ChatRequestInput = {
  message?: unknown;
  mode?: unknown;
  model?: unknown;
  ui_language?: unknown;
  conversation_id?: unknown;
};

const MAX_MESSAGE_CHARS = 8000;


export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const rawBody = await request.arrayBuffer();
    const input = decodeRequestBodyJson<ChatRequestInput>(new Uint8Array(rawBody)) ?? {};
    const message = String(input.message ?? "").trim().slice(0, MAX_MESSAGE_CHARS);
    if (!message) return Response.json({ error: "message_required" }, { status: 400 });
    // mode/ui_language 为原 WS 协议字段,接受但从不分支(原版同样只透传不使用)。

    await enforceRateLimit(await rateLimitKey("hyperknow-chat", member.email), 30, 60 * 60);

    // 会话归属:带 conversation_id 且属于本人 → 续聊并载入历史;否则开新会话。
    // 不属于本人 → 404(与不存在同形,不泄露存在性)。
    let conversationId = crypto.randomUUID();
    let history: Array<{ role: string; content: string }> = [];
    const requestedId = typeof input.conversation_id === "string" ? input.conversation_id : "";
    if (requestedId) {
      const existing = await getConversation(requestedId, member.email);
      if (!existing) return Response.json({ error: "target_not_found" }, { status: 404 });
      conversationId = existing.id;
      history = existing.history;
    }
    /* 发给模型的历史窗口:长会话线性膨胀会撑爆上下文并放大每次请求的 token——
     * 只带最近 40 条(模型实际能消化的窗口),完整历史仍按落库上限保存。 */
    const modelHistory = history.slice(-40);

    // H8(2026-10 审计):Workers 运行时恒有 AbortSignal.any,typeof 分支是死代码
    // (360s 兜底不可达);总预算提为导出常量,与重试层级(llm 候选 ≤2 + chat 回退 1 次)
    // 的耗时上限可核算——契约钉在 hyperknow-hardening。
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(CHAT_TOTAL_BUDGET_MS)]);

    // 预取首个 LLM 增量(推理模型路径:guideline 用静态兜底,与原 chatWs.js 的
    // isReasoningModel 分支一致——Director Agent 不单独调用,其思考过程由
    // thinking_delta 增量实时映射)。模型二选一:见界 Flash=step-3.7-flash /
    // 见界 Pro=step-5-preview,白名单外的值一律回落 Flash。
    const model = resolveChatModel(input.model);
    const generator = contentGenerateStream(message, FALLBACK_GUIDELINE, modelHistory, signal, model);
    let firstChunk: StreamChunk | null = null;
    let generatorDone = false;
    try {
      const result = await generator.next();
      if (result.done) {
        generatorDone = true;
      } else {
        firstChunk = result.value;
      }
    } catch (error) {
      if (error instanceof HyperknowNotConfiguredError) {
        return Response.json({ error: error.code }, { status: error.status });
      }
      if (error instanceof HyperknowUpstreamError) {
        return Response.json({ error: error.code }, { status: error.status });
      }
      throw error;
    }

    // 扣费点:LLM 预取成功(上游可达)之后、发流之前。配置缺失/上游故障已在上面
    // 返回,不扣费;流开始后的中途失败不退费。条件 UPDATE 原子扣减,不透支。
    const remainingCredits = await consumeCredits(member.email, HK_CHAT_COST);
    if (remainingCredits === null) {
      void generator.return(undefined as never).catch(() => {}); // 收掉已启的上游流
      const { remaining, max } = await currentCredits(member.email);
      return Response.json(
        { error: "insufficient_credits", credit_info: { remaining, max } },
        { status: 402 },
      );
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        void (async () => {
          let closed = false;
          const push = (data: Record<string, unknown>) => {
            if (closed) return;
            try {
              controller.enqueue(frame(data));
            } catch {
              closed = true;
            }
          };
          try {
            push({ type: "conversation_created", data: { conversation_id: conversationId }, conversation_id: conversationId });
            push({ type: "credit_status", message: "Processing request", credit_info: { remaining: remainingCredits, max: dailyCreditsFor(member.email) } });
            push({
              type: "tool_execution",
              tool_name: "directorAgent",
              tool_status: "thinking",
              display: "display",
              data: { message: "Analyzing pedagogical intent and scaffolding..." },
            });
            push({ type: "tool_selection", tool_name: "generate_content", tool_status: "started", display: "display" });

            let fullResponse = "";
            let thinkingFinished = false;
            const deliverChunk = (chunk: StreamChunk) => {
              if (chunk.type === "thinking") {
                push({
                  type: "tool_execution",
                  tool_name: "directorAgent",
                  tool_status: "thinking",
                  display: "display",
                  data: { message: chunk.text },
                });
                return;
              }
              if (!thinkingFinished) {
                thinkingFinished = true;
                push({
                  type: "tool_execution",
                  tool_name: "directorAgent",
                  tool_status: "completed",
                  display: "display",
                  data: { phase: "thinking" },
                });
              }
              fullResponse += chunk.text;
              push({ type: "content_chunk", chunk: chunk.text, conversation_id: conversationId });
            };

            if (firstChunk) deliverChunk(firstChunk);
            if (!generatorDone) {
              for (;;) {
                const { done, value } = await generator.next();
                if (done) break;
                deliverChunk(value);
              }
            }

            push({
              type: "tool_execution",
              tool_name: "generate_content",
              tool_status: "completed",
              display: "display",
              data: { model_used: "hyperknow-reproduction-engine", total_length: fullResponse.length },
            });

            push({ type: "tool_selection", tool_name: "recommend_next_step", tool_status: "started", display: "display" });
            const nextStepsData = await generateNextSteps(message, fullResponse, signal);
            push({ type: "tool_execution", tool_name: "recommend_next_step", tool_status: "completed", display: "display", data: nextStepsData });

            const title = message.slice(0, 30) + (message.length > 30 ? "..." : "");
            await saveConversation({
              id: conversationId,
              userEmail: member.email,
              title,
              /* 落库上限 200 条:无界增长会推高每次读写与列表接口的负载,超限丢最旧 */
              history: [...history, { role: "user", content: message }, { role: "assistant", content: fullResponse }].slice(-200),
            });

            push({ type: "complete", conversation_id: conversationId });
          } catch (error) {
            if (signal.aborted || request.signal.aborted) {
              /* 客户端断开/超时:静默收尾 */
            } else {
              console.error("[hyperknow-chat] mid-stream failure:", error instanceof Error ? error.message : error);
              push({ type: "error", message: "Failed to process message" });
            }
          }
          try {
            controller.close();
          } catch {
            /* 流已被取消 */
          }
        })();
      },
    });

    return sseResponse(stream);
  } catch (error) {
    return jsonError(error);
  }
}
