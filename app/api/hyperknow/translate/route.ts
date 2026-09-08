import { requireMember } from "../../_lib/access-control";
import { jsonError } from "../../_lib/errors";
import { assertSameOrigin } from "../../_lib/request-origin";
import { enforceRateLimit, rateLimitKey } from "../../_lib/rate-limit";
import { resolveConfigOrThrow } from "../../_lib/hyperknow/config";
import { streamChat, HyperknowNotConfiguredError, HyperknowUpstreamError } from "../../_lib/hyperknow/llm";
import { consumeCredits, currentCredits, HK_CHAT_COST, HK_DAILY_CREDITS } from "../../_lib/hyperknow/credits";

export const dynamic = "force-dynamic";

// 译文端点(聊天页"翻译"按钮):把一段导师回复翻成目标语言。
// 与 /chat 的关键差异是**不落库**——翻译是工具动作,不该污染用户的历史会话列表。
// 事件序列:credit_status → content_chunk×N → complete。
// 失败语义与 /chat 一致:发流前干净 JSON(含 402 积分不足),流中失败补 error 帧。

const TARGET_LANGUAGES: Record<string, string> = {
  en: "English",
  "zh-CN": "Simplified Chinese",
  "zh-TW": "Traditional Chinese",
  es: "Spanish",
  ko: "Korean",
  hi: "Hindi",
  ur: "Urdu",
};

const MAX_TEXT_CHARS = 6000;

function frame(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`event: frame\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const input = (await request.json().catch(() => ({}))) as { text?: unknown; target_language?: unknown };
    const text = String(input.text ?? "").trim().slice(0, MAX_TEXT_CHARS);
    const target = String(input.target_language ?? "");
    if (!text) return Response.json({ error: "text_required" }, { status: 400 });
    if (!TARGET_LANGUAGES[target]) return Response.json({ error: "unsupported_language" }, { status: 400 });

    await enforceRateLimit(await rateLimitKey("hyperknow-translate", member.email), 60, 60 * 60);

    // 配置缺失在流开始前暴露(fail-closed,干净 JSON)。
    try {
      resolveConfigOrThrow();
    } catch (error) {
      if (error instanceof HyperknowNotConfiguredError) {
        return Response.json({ error: error.code }, { status: error.status });
      }
      throw error;
    }

    // 扣费点与 /chat 一致:配置校验之后、发流之前;流中失败不退费。
    const remainingCredits = await consumeCredits(member.email, HK_CHAT_COST);
    if (remainingCredits === null) {
      const { remaining } = await currentCredits(member.email);
      return Response.json(
        { error: "insufficient_credits", credit_info: { remaining, max: HK_DAILY_CREDITS } },
        { status: 402 },
      );
    }

    const generator = streamChat(
      [
        {
          role: "system",
          content:
            `You are a precise translator. Translate the user's message into ${TARGET_LANGUAGES[target]}. ` +
            "Preserve markdown structure, code blocks, LaTeX, and links exactly as they appear. " +
            "Output ONLY the translation — no notes, no quotes, no preamble.",
        },
        { role: "user", content: text },
      ],
      { maxTokens: 2048, signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]) },
    );

    // 预取首个增量:上游在发流前失败时仍能回干净 JSON。
    let first: IteratorResult<{ type: "thinking" | "text"; text: string }>;
    try {
      first = await generator.next();
    } catch (error) {
      if (error instanceof HyperknowUpstreamError) {
        return Response.json({ error: error.code }, { status: error.status });
      }
      if (error instanceof HyperknowNotConfiguredError) {
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
          push({ type: "credit_status", message: "Processing request", credit_info: { remaining: remainingCredits, max: HK_DAILY_CREDITS } });
          try {
            for (let step = first; !step.done; step = await generator.next()) {
              const chunk = step.value;
              if (chunk.type === "text" && chunk.text) push({ type: "content_chunk", chunk: chunk.text });
            }
            push({ type: "complete" });
          } catch {
            push({ type: "error", message: "translate_failed" });
          }
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
