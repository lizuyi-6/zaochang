import { requireMember } from "../../_lib/access-control";
import { jsonError } from "../../_lib/errors";
import { assertSameOrigin } from "../../_lib/request-origin";
import { enforceRateLimit, rateLimitKey } from "../../_lib/rate-limit";
import { contentGenerateStream, generateNextSteps } from "../../_lib/hyperknow/agents";
import { HyperknowNotConfiguredError, HyperknowUpstreamError } from "../../_lib/hyperknow/llm";
import { FALLBACK_GUIDELINE } from "../../_lib/hyperknow/prompts";
import { saveConversation, getConversation } from "../../_lib/hyperknow/store";
import type { StreamChunk } from "../../_lib/hyperknow/protocol";

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
  ui_language?: unknown;
  conversation_id?: unknown;
};

const MAX_MESSAGE_CHARS = 8000;

function frame(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`event: frame\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const input = (await request.json().catch(() => ({}))) as ChatRequestInput;
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

    // 客户端断开与总时长兜底合并(白板/课程同类;生成型课程实测 ~60s 量级,120s 足够)。
    const signal =
      typeof AbortSignal.any === "function"
        ? AbortSignal.any([request.signal, AbortSignal.timeout(120_000)])
        : AbortSignal.timeout(120_000);

    // 预取首个 LLM 增量(推理模型路径:guideline 用静态兜底,与原 chatWs.js 的
    // isReasoningModel 分支一致——Director Agent 不单独调用,其思考过程由
    // thinking_delta 增量实时映射)。
    const generator = contentGenerateStream(message, FALLBACK_GUIDELINE, history, signal);
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
            push({ type: "credit_status", message: "Processing request", credit_info: { remaining: 20, max: 20 } });
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
              history: [...history, { role: "user", content: message }, { role: "assistant", content: fullResponse }],
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

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
