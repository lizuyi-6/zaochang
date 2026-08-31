import { requireMember } from "../../_lib/access-control";
import { jsonError } from "../../_lib/community";
import { findInBook, getDocBody } from "../../_lib/docs";
import { enforceRateLimit, rateLimitKey } from "../../_lib/rate-limit";
import { AiNotConfiguredError, AiUpstreamError, getReadingAiConfig, streamReadingAiCompletion } from "../../_lib/reading-ai-provider";
import {
  READING_AI_ACTIONS,
  READING_AI_ACTION_LIMITS,
  READING_AI_LIMITS,
  READING_AI_MODES,
  READING_AI_REASONING_HEADROOM,
  buildAskPrompt,
  buildExplainPrompt,
  buildSummaryPrompt,
  buildTranslatePrompt,
  parseReadingAiImage,
  type ReadingAiAction,
  type ReadingAiImage,
  type ReadingAiMode,
} from "../../_lib/reading-ai-prompts";

export const dynamic = "force-dynamic";

// 阅读页「问 AI」代理。安全核心:章节正文永远由服务端经 findInBook 从 DB 解析并做
// 可见性校验(fail-closed 404,不区分不存在/不可见),客户端只传 slug 路径——
// 防越权读取 members/private 章节,也防止端点被当通用 LLM 代理。
//
// 响应形态二分:
// - 流开始**之前**的失败(鉴权/校验/限流/配置/上游非 2xx)→ 普通 JSON 错误;
// - 流开始后的失败 → SSE 已发出,补一帧 event:error 再关闭(头不能再改)。

type ReadingAiRequestInput = {
  action?: unknown;
  bookSlug?: unknown;
  path?: unknown;
  selection?: unknown;
  question?: unknown;
  mode?: unknown;
  image?: unknown;
};

function sseFrame(event: string, data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const input = (await request.json().catch(() => ({}))) as ReadingAiRequestInput;

    const action = String(input.action ?? "") as ReadingAiAction;
    if (!READING_AI_ACTIONS.includes(action)) {
      return Response.json({ error: "invalid_action" }, { status: 400 });
    }
    const bookSlug = String(input.bookSlug ?? "").trim().slice(0, READING_AI_LIMITS.slugChars);
    if (!bookSlug) return Response.json({ error: "invalid_path" }, { status: 400 });
    // 章节路径:逐段 clamp;封面页(path 为空)不做 AI——正文是桩,AI 无材料可用。
    const path = Array.isArray(input.path)
      ? input.path
          .map((segment) => String(segment ?? "").trim().slice(0, READING_AI_LIMITS.slugChars))
          .filter(Boolean)
          .slice(0, READING_AI_LIMITS.pathSegments)
      : [];
    if (path.length === 0) return Response.json({ error: "chapter_required" }, { status: 400 });
    const selection = String(input.selection ?? "").trim().slice(0, READING_AI_LIMITS.selectionChars);
    if ((action === "explain" || action === "translate") && !selection) {
      return Response.json({ error: "missing_selection" }, { status: 400 });
    }
    const question = String(input.question ?? "").trim().slice(0, READING_AI_LIMITS.questionChars);
    if (action === "ask" && !question) {
      return Response.json({ error: "missing_question" }, { status: 400 });
    }
    // 快速/专家模式:白名单外的值拒绝。模型名由服务端 env 决定,客户端永远只传这两个标签之一。
    const mode = String(input.mode ?? "fast") as ReadingAiMode;
    if (!READING_AI_MODES.includes(mode)) {
      return Response.json({ error: "invalid_mode" }, { status: 400 });
    }

    // 提问附图(多模态):仅 ask 允许;形态/体积由 parseReadingAiImage 校验;
    // AI_CHAT_VISION 未开启时 fail-closed 400(上游模型不支持图像时不该放行)。
    let image: ReadingAiImage | undefined;
    if (input.image !== undefined && input.image !== null && input.image !== "") {
      if (action !== "ask") return Response.json({ error: "invalid_image" }, { status: 400 });
      const parsed = parseReadingAiImage(input.image);
      if (!parsed) return Response.json({ error: "invalid_image" }, { status: 400 });
      let vision = false;
      try {
        vision = getReadingAiConfig().vision;
      } catch {
        return Response.json({ error: "ai_not_configured" }, { status: 503 });
      }
      if (!vision) return Response.json({ error: "vision_not_supported" }, { status: 400 });
      image = parsed;
    }

    const found = await findInBook([bookSlug, ...path], member);
    // fail-closed:不区分"不存在/不可见/跨书",一律 404 不泄露存在性(同 page.tsx 语义)。
    if (!found) return Response.json({ error: "target_not_found" }, { status: 404 });
    if (found.doc.id === found.book.id) return Response.json({ error: "chapter_required" }, { status: 400 });

    // 限流在目标校验之后:输错章节路径的 404 不应消耗用户每小时的真实提问额度。
    const limits = READING_AI_ACTION_LIMITS[action];
    await enforceRateLimit(await rateLimitKey(`ai-${action}`, member.email), limits.ratePerHour, 60 * 60);

    // 正文只从 DB 来:截断到上限 + 折叠 \r 与 3+ 连续换行(省 token,不改语义)。
    const rawBody = (await getDocBody(found.doc.id)).replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
    const chapterText = rawBody.slice(0, READING_AI_LIMITS.chapterChars);
    const truncated = rawBody.length > READING_AI_LIMITS.chapterChars;

    // explain 的"结合本章上下文":按选区在正文中的位置取一个有界窗口(选区前 2000 字 +
    // 选区后 1000 字,总上限 chapterChars);找不到选区(如选区跨格式标记)退化为章首节选。
    let explainContext = "";
    if (action === "explain") {
      const at = rawBody.indexOf(selection.slice(0, 80));
      const contextStart = Math.max(0, (at >= 0 ? at : 0) - 2000);
      explainContext = rawBody.slice(contextStart, contextStart + READING_AI_LIMITS.chapterChars);
    }

    const prompt =
      action === "explain"
        ? buildExplainPrompt({ bookTitle: found.book.title, chapterTitle: found.doc.title, selection, chapterContext: explainContext })
        : action === "translate"
          ? buildTranslatePrompt({ bookTitle: found.book.title, chapterTitle: found.doc.title, selection })
          : action === "summary"
            ? buildSummaryPrompt({ bookTitle: found.book.title, chapterTitle: found.doc.title, chapterText, truncated })
            : buildAskPrompt({ bookTitle: found.book.title, chapterTitle: found.doc.title, chapterText, truncated, question, hasImage: Boolean(image) });

    // 客户端断开(request.signal)与总时长兜底合并;AbortSignal.any 缺失时退化为仅超时。
    const signal =
      typeof AbortSignal.any === "function"
        ? AbortSignal.any([request.signal, AbortSignal.timeout(60_000)])
        : AbortSignal.timeout(60_000);

    // max_tokens 必须覆盖推理 token(两档模型都先吐思维链且计入 max_tokens),
    // 否则答案预算被推理挤光——见 READING_AI_REASONING_HEADROOM 注释。
    const generator = streamReadingAiCompletion({
      prompt,
      mode,
      maxTokens: limits.maxTokens + READING_AI_REASONING_HEADROOM[mode],
      temperature: limits.temperature,
      signal,
      image,
    });

    // 先手动推进一步:配置/上游连接类错误在此抛出 → 头未发,可回干净 JSON。
    let firstChunk: string;
    try {
      firstChunk = await generator.next().then((result) => (result.done ? "" : result.value));
    } catch (error) {
      if (error instanceof AiNotConfiguredError) {
        return Response.json({ error: error.code }, { status: error.status });
      }
      if (error instanceof AiUpstreamError) {
        return Response.json({ error: error.code }, { status: error.status });
      }
      throw error;
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        void (async () => {
          let chars = firstChunk.length;
          controller.enqueue(sseFrame("delta", { t: firstChunk }));
          try {
            for (;;) {
              const { done, value } = await generator.next();
              if (done) break;
              chars += value.length;
              controller.enqueue(sseFrame("delta", { t: value }));
            }
            controller.enqueue(
              // done 帧刻意不含 model:模型名是运营配置,不外泄给客户端(客户端只见"快速/专家")。
              sseFrame("done", { action, docId: found.doc.id, chars }),
            );
          } catch (error) {
            if (signal.aborted || request.signal.aborted) {
              /* 客户端断开/超时:消费者已不在,静默收尾 */
            } else if (error instanceof AiUpstreamError) {
              try { controller.enqueue(sseFrame("error", { error: error.code })); } catch { /* 流已被取消 */ }
            } else {
              console.error("[reading-ai] mid-stream failure:", error instanceof Error ? error.message : error);
              try { controller.enqueue(sseFrame("error", { error: "ai_upstream_error" })); } catch { /* 流已被取消 */ }
            }
          }
          // 客户端中断后流已 cancelled,close() 会抛 TypeError——不接住就是每次
          // 中途关面板都产生一次 Worker 未处理 promise rejection。
          try { controller.close(); } catch { /* 流已被取消,无需收尾 */ }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        // 提示中间代理不要缓冲(生产经 CF 边缘;自托管反代场景同样受益)。
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
