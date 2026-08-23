import { env } from "cloudflare:workers";
import {
  resolveReadingAiConfig,
  type BuiltPrompt,
  type RawEnv,
  type ReadingAiConfig,
  type ReadingAiMode,
} from "./reading-ai-prompts";
// OpenAI 兼容 chat-completions 流式客户端(DeepSeek / OpenRouter / Moonshot 等通用),
// 另支持专家模型走 Anthropic Messages 协议(见下方 useMessages)。
// env 访问走模块作用域(见 CLAUDE.md「Bindings access」),类型收窄镜像 upload-security.ts。
//
// 失败语义分层:
// - 配置缺失/非法 → AiNotConfiguredError(fail-closed,功能惰性);
// - 上游在**发流之前**失败(连接失败、非 2xx)→ AiUpstreamError,路由此时还没发
//   SSE 头,可以回干净的 JSON 错误;
// - 上游**发流之后**失败/中断 → 由路由的 pump 捕获并补发一帧 error 再关闭。

export class AiNotConfiguredError extends Error {
  readonly code = "ai_not_configured";
  readonly status = 503;
  constructor() {
    super("Reading AI is not configured");
  }
}

export type AiUpstreamErrorCode = "ai_upstream_error" | "ai_auth_failed" | "ai_rate_limited";

export class AiUpstreamError extends Error {
  readonly code: AiUpstreamErrorCode;
  readonly status: number;
  constructor(code: AiUpstreamErrorCode, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function resolveConfigOrThrow(): ReadingAiConfig {
  const config = resolveReadingAiConfig(env as unknown as RawEnv);
  if (!config) throw new AiNotConfiguredError();
  return config;
}

type ChatCompletionChunk = {
  choices?: Array<{ delta?: { content?: unknown } }>;
};

function extractDelta(chunk: ChatCompletionChunk): string {
  const content = chunk.choices?.[0]?.delta?.content;
  return typeof content === "string" ? content : "";
}

// Anthropic Messages API 流帧:只取 content_block_delta/delta.type==="text_delta" 的正文。
// thinking_delta(思维链)刻意丢弃:既是模型内部推理不属于答案,也避免把内部内容漏给用户。
type MessagesChunk = {
  type?: unknown;
  delta?: { type?: unknown; text?: unknown };
};

function extractMessagesText(chunk: MessagesChunk): string {
  if (chunk.type === "content_block_delta" && chunk.delta?.type === "text_delta") {
    const text = chunk.delta.text;
    if (typeof text === "string") return text;
  }
  return "";
}

// 逐段增量输出。解析规则:data 行取 choices[0].delta.content;"data: [DONE]" 结束;
// 忽略未知字段(fake 上游的 echo 元数据因此可穿透而不破坏解析)。按行累积缓冲以处理
// 跨 chunk 断行;空行(SSE 事件分隔)直接跳过。
// 模式路由在 resolveConfigOrThrow 之后:fast→AI_CHAT_MODEL,expert→AI_CHAT_MODEL_EXPERT
// (未配置时 expertModel===model,同轨)。模型名只进上游请求,永不进发往客户端的帧。
export async function* streamReadingAiCompletion(options: {
  prompt: BuiltPrompt;
  mode: ReadingAiMode;
  maxTokens: number;
  temperature: number;
  signal: AbortSignal;
}): AsyncGenerator<string> {
  const { baseUrl, apiKey, model, expertModel, expertTransport } = resolveConfigOrThrow();
  const chosenModel = options.mode === "expert" ? expertModel : model;
  // 专家模型可切 Anthropic Messages 传输(AI_CHAT_EXPERT_TRANSPORT=messages):
  // StepFun step-explore 等模型仅开放 /v1/messages,不支持 chat/completions。fast 恒走 chat。
  const useMessages = options.mode === "expert" && expertTransport === "messages";
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${useMessages ? "/messages" : "/chat/completions"}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: useMessages
        ? JSON.stringify({
            model: chosenModel,
            stream: true,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            // Messages 协议里 system 是顶层字段,不在 messages 数组内。
            system: options.prompt.system,
            messages: [{ role: "user", content: options.prompt.user }],
          })
        : JSON.stringify({
            model: chosenModel,
            stream: true,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            messages: [
              { role: "system", content: options.prompt.system },
              { role: "user", content: options.prompt.user },
            ],
          }),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal.aborted) throw error; // 客户端已断开,原样上抛让 pump 静默收尾
    throw new AiUpstreamError("ai_upstream_error", 503);
  }
  if (!response.ok || !response.body) {
    // 上游状态不外泄详情:401/403 归为配置问题(ai_auth_failed),429 原样语义,其余归 upstream。
    if (response.status === 401 || response.status === 403) throw new AiUpstreamError("ai_auth_failed", 503);
    if (response.status === 429) throw new AiUpstreamError("ai_rate_limited", 429);
    throw new AiUpstreamError("ai_upstream_error", 503);
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let parsed: ChatCompletionChunk & MessagesChunk | null = null;
        try {
          parsed = JSON.parse(payload) as ChatCompletionChunk & MessagesChunk;
        } catch {
          continue; // 非法 JSON 行忽略,不让单个坏帧杀死整条流
        }
        if (useMessages && parsed.type === "error") {
          // Messages 协议的错误帧:转为上游错误(流中抛出由路由补 error 帧收尾)
          throw new AiUpstreamError("ai_upstream_error", 503);
        }
        const delta = useMessages ? extractMessagesText(parsed) : extractDelta(parsed);
        if (delta) yield delta;
      }
    }
    buffer += decoder.decode();
    const tailLine = buffer.replace(/\r$/, "");
    if (tailLine.startsWith("data:")) {
      const payload = tailLine.slice(5).trim();
      if (payload && payload !== "[DONE]") {
        try {
          const parsed = JSON.parse(payload) as ChatCompletionChunk & MessagesChunk;
          const delta = useMessages ? extractMessagesText(parsed) : extractDelta(parsed);
          if (delta) yield delta;
        } catch {
          /* 尾行坏 JSON 同样忽略 */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
