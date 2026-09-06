import { env } from "cloudflare:workers";

// Hyperknow Agent 的上游配置解析。密钥面复用阅读 AI 的 AI_CHAT_BASE_URL/AI_CHAT_API_KEY
// (同一把上游 key 驱动 LLM 与 TTS,与原复刻项目 .env 的 OPENAI_API_KEY 单钥设计一致),
// 另提供 HYPERKNOW_* 三段覆盖位:上游供应商/模型与阅读 AI 不同时不必动共享配置。
// 缺配置 fail-closed → HyperknowNotConfiguredError(503 ai_not_configured,语义与
// reading-ai 的 AiNotConfiguredError 对齐)。
//
// 注意协议:复刻版只说 Anthropic Messages 协议({base}/messages,thinking 预算流式)
// ——这是 StepFun step-explore 的原生协议,也是复刻项目验证过的唯一路径。不提供
// OpenAI chat/completions 回退:原版回退分支只为本地 mock 存在,Workers 版把
// "上游必须支持 Messages 协议"写成显式契约(见 HYPERKNOW.md)。

export class HyperknowNotConfiguredError extends Error {
  readonly code = "ai_not_configured";
  readonly status = 503;
  constructor() {
    super("Hyperknow AI is not configured");
  }
}

export type HyperknowAiConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  // TTS 上游(默认 StepFun 原生;测试注入假上游用覆盖位)
  ttsBaseUrl: string;
  ttsModel: string;
};

export function resolveHyperknowAiConfig(): HyperknowAiConfig | null {
  const values = env as unknown as Record<string, string | undefined>;
  const baseUrl = values.HYPERKNOW_AI_BASE_URL || values.AI_CHAT_BASE_URL;
  const apiKey = values.HYPERKNOW_AI_API_KEY || values.AI_CHAT_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return {
    baseUrl,
    apiKey,
    model: values.HYPERKNOW_AI_MODEL || values.AI_CHAT_MODEL || "step-explore",
    ttsBaseUrl: values.HYPERKNOW_TTS_BASE_URL || "https://api.stepfun.com/v1",
    ttsModel: values.HYPERKNOW_TTS_MODEL || "step-tts-mini",
  };
}

export function resolveConfigOrThrow(): HyperknowAiConfig {
  const config = resolveHyperknowAiConfig();
  if (!config) throw new HyperknowNotConfiguredError();
  return config;
}
