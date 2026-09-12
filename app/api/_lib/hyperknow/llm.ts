import { resolveConfigOrThrow, HyperknowNotConfiguredError } from "./config";
import { consumeMessagesSse, type StreamChunk } from "./protocol";

// Hyperknow LLM 客户端:StepFun/Anthropic Messages 协议,fetch + Web Streams
// (从原 llmService.js 移植,删掉 OpenAI SDK 回退)。错误语义分层与 reading-ai
// provider 对齐:
// - 配置缺失 → HyperknowNotConfiguredError(503,发流之前,路由可回干净 JSON);
// - 上游连接失败/非 2xx → HyperknowUpstreamError(发流之前,路由可回干净 JSON);
// - 流中失败 → 由路由补 error 帧收尾。
// 与 reading-ai 的关键差异:thinking_delta 不丢弃,原样上抛(映射为 directorAgent
// 思考过程);max_tokens/thinking 预算沿用原版数值(384 流式 / 256 JSON)。

export class HyperknowUpstreamError extends Error {
  readonly code: "ai_upstream_error" | "ai_auth_failed" | "ai_rate_limited";
  readonly status: number;
  constructor(code: "ai_upstream_error" | "ai_auth_failed" | "ai_rate_limited", status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatOptions = {
  model?: string;
  maxTokens?: number;
  budgetTokens?: number;
  signal?: AbortSignal;
};

// Messages API 要求首条必须是 user;system 抽出合并为顶层字段(原 _formatMessagesForAnthropic 逐字语义)。
export function formatMessagesForMessagesApi(messages: LlmMessage[]): { systemPrompt: string; formatted: Array<{ role: "user" | "assistant"; content: string }> } {
  let systemPrompt = "";
  const formatted: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const msg of messages) {
    if (msg.role === "system") {
      systemPrompt += (systemPrompt ? "\n\n" : "") + msg.content;
    } else {
      formatted.push({ role: msg.role === "assistant" ? "assistant" : "user", content: msg.content });
    }
  }
  if (formatted.length === 0 || formatted[0].role !== "user") {
    formatted.unshift({ role: "user", content: "Begin conversation." });
  }
  return { systemPrompt, formatted };
}

function messagesEndpoint(baseUrl: string): string {
  return baseUrl.endsWith("/messages") ? baseUrl : `${baseUrl.replace(/\/+$/, "")}/messages`;
}

function chatCompletionsEndpoint(baseUrl: string): string {
  if (baseUrl.includes("/chat/completions")) return baseUrl;
  const base = baseUrl.replace(/\/messages\/?$/, "").replace(/\/+$/, "");
  return `${base}/chat/completions`;
}

async function postMessages(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  const config = resolveConfigOrThrow();
  let response: Response;
  try {
    response = await fetch(messagesEndpoint(config.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new HyperknowUpstreamError("ai_upstream_error", 503);
  }
  if (!response.ok || !response.body) {
    if (response.status === 401 || response.status === 403) throw new HyperknowUpstreamError("ai_auth_failed", 503);
    if (response.status === 429) throw new HyperknowUpstreamError("ai_rate_limited", 429);
    throw new HyperknowUpstreamError("ai_upstream_error", 503);
  }
  return response;
}

async function postChatCompletions(
  messages: LlmMessage[],
  options: ChatOptions & { jsonMode?: boolean } = {},
): Promise<string> {
  const config = resolveConfigOrThrow();
  const endpoint = chatCompletionsEndpoint(config.baseUrl);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model || config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: options.maxTokens || 4096,
        ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new HyperknowUpstreamError("ai_upstream_error", 503);
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new HyperknowUpstreamError("ai_auth_failed", 503);
    if (response.status === 429) throw new HyperknowUpstreamError("ai_rate_limited", 429);
    throw new HyperknowUpstreamError("ai_upstream_error", 503);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    content?: Array<{ type?: unknown; text?: unknown }>;
  };
  const choiceContent = data.choices?.[0]?.message?.content;
  if (typeof choiceContent === "string") return choiceContent;
  const textBlock = data.content?.find((block) => block.type === "text");
  return typeof textBlock?.text === "string" ? textBlock.text : "";
}

// 流式对话(思维链 + 正文增量)。调用方在发 SSE 头之前先 next() 一次即可获得
// "发流前失败回 JSON"的语义(与 reading-ai 路由同款手法)。
export async function* streamChat(messages: LlmMessage[], options: ChatOptions = {}): AsyncGenerator<StreamChunk> {
  const config = resolveConfigOrThrow();
  const { systemPrompt, formatted } = formatMessagesForMessagesApi(messages);
  const response = await postMessages(
    {
      model: options.model || config.model,
      max_tokens: options.maxTokens || 8192,
      thinking: { type: "enabled", budget_tokens: options.budgetTokens || 384 },
      stream: true,
      system: systemPrompt || undefined,
      messages: formatted,
    },
    options.signal,
  );
  yield* consumeMessagesSse(response.body!, options.signal);
}

// 单次对话补全(JSON 模式:system 追加 JSON 指令,与原版 jsonMode 行为一致)。
// 双协议自适应:优先 Messages 协议,若上游为 OpenAI/StepFun 标准 chat/completions
// (如报 404/503 或未开 messages 接口),无缝切换走 chat/completions。
export async function chat(messages: LlmMessage[], options: ChatOptions & { jsonMode?: boolean } = {}): Promise<string> {
  const config = resolveConfigOrThrow();
  if (config.baseUrl.includes("/chat/completions")) {
    return postChatCompletions(messages, options);
  }

  try {
    const { systemPrompt, formatted } = formatMessagesForMessagesApi(messages);
    const response = await postMessages(
      {
        model: options.model || config.model,
        max_tokens: options.maxTokens || 4096,
        thinking: { type: "enabled", budget_tokens: options.budgetTokens || 256 },
        system: (systemPrompt || "") + (options.jsonMode ? "\nIMPORTANT: You must respond in valid JSON format only." : ""),
        messages: formatted,
      },
      options.signal,
    );
    const data = (await response.json()) as {
      content?: Array<{ type?: unknown; text?: unknown }>;
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const textBlock = data.content?.find((block) => block.type === "text");
    if (typeof textBlock?.text === "string") return textBlock.text;
    const choiceContent = data.choices?.[0]?.message?.content;
    if (typeof choiceContent === "string") return choiceContent;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof HyperknowUpstreamError && (error.code === "ai_auth_failed" || error.code === "ai_rate_limited")) {
      throw error;
    }
    // Messages 失败时自动尝试 chat/completions 兼容通道
    try {
      return await postChatCompletions(messages, options);
    } catch {
      throw error;
    }
  }
  return "";
}

export { HyperknowNotConfiguredError };
