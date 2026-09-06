// Hyperknow 运行时纯逻辑(零 import,单测直接加载):
// - MessagesStreamParser:StepFun/Anthropic Messages SSE 的增量行解析器,把
//   thinking_delta 与 text_delta 分流(与 reading-ai-provider 刻意丢弃思维链不同,
//   复刻版把 thinking 增量映射为 directorAgent 思考过程实时展示,这是产品语义的一部分)。
// - TTS 文本净化 / 缓存 key / 讲步时长:从原 ttsService.js 与 whiteboardWs.js 逐字搬运。

export type StreamChunk = { type: "thinking" | "text"; text: string };

type MessagesStreamEvent = {
  type?: unknown;
  delta?: { type?: unknown; thinking?: unknown; text?: unknown };
};

// 按行喂入 SSE 文本,产出解析出的增量。跨行断帧由调用方缓冲原始文本后按 \n 切分——
// 这里只做单行语义:非 "data: " 前缀行忽略;[DONE] 忽略;非法 JSON 行忽略(不让单个
// 坏帧杀死整条流,与原 llmService.js 的 try/catch 行为一致)。
export function parseMessagesSseLine(line: string): StreamChunk[] {
  if (!line.startsWith("data: ")) return [];
  const jsonStr = line.slice(6).trim();
  if (!jsonStr || jsonStr === "[DONE]") return [];
  let ev: MessagesStreamEvent;
  try {
    ev = JSON.parse(jsonStr) as MessagesStreamEvent;
  } catch {
    return [];
  }
  if (ev.type !== "content_block_delta") return [];
  if (ev.delta?.type === "thinking_delta" && typeof ev.delta.thinking === "string" && ev.delta.thinking) {
    return [{ type: "thinking", text: ev.delta.thinking }];
  }
  if (ev.delta?.type === "text_delta" && typeof ev.delta.text === "string" && ev.delta.text) {
    return [{ type: "text", text: ev.delta.text }];
  }
  return [];
}

// 流式读取器:把上游 ReadableStream<Uint8Array> 消费成增量序列,内部处理跨 chunk 断行。
export async function* consumeMessagesSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<StreamChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        for (const chunk of parseMessagesSseLine(line)) yield chunk;
      }
    }
    // 尾行(无换行结尾)同样要解析——上游偶尔最后一帧不带换行。
    for (const chunk of parseMessagesSseLine(buffer)) yield chunk;
  } finally {
    reader.releaseLock();
    if (signal?.aborted) {
      /* 客户端断开:调用方捕获 AbortError 后静默收尾 */
    }
  }
}

// 白板单步讲解节奏:正文字数 × 180ms,最少 4 秒(原 whiteboardWs.js deliverStep 逐字一致)。
// 服务端 setTimeout 链已改为客户端驱动播放,这个公式同时用于服务端(无)与客户端(适配器),
// 放在纯模块保证两端节奏一致。
export function stepDurationMs(spokenText: string): number {
  return Math.max(4000, spokenText.length * 180);
}

// TTS 文本净化:剥 HTML 标签、截 500 字、空兜底(原 streamAudioPipe 逐字一致)。
export function sanitizeTtsText(text: string, fallback = "你好，我是你的 Hyperknow 学习导师。"): string {
  return text.replace(/<[^>]*>/g, "").trim().slice(0, 500) || fallback;
}

// TTS 缓存 key:原版 md5(voiceId:speed:text) → voiceId_hash;Workers 无 md5,
// 换 Web Crypto SHA-256(key 只用于寻址,摘要算法更换不影响语义)。
export async function ttsCacheKey(text: string, voiceId: string, speed: number): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${voiceId}:${speed}:${text}`));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${voiceId}_${hash}`;
}
