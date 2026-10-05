// 见界 SSE 帧构造的单一事实来源(2026-10 审计重构 #4):此前 chat/translate/
// course-generation 三处各抄一份同款 frame()。帧形状(`event: frame\ndata: {json}`)
// 是前后端契约,收敛后契约钉只看一处。
export function frame(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`event: frame\ndata: ${JSON.stringify(data)}\n\n`);
}

/** 见界 SSE 响应统一构造(2026-10 审计重构 #3):同一头三件套(content-type/
 * cache-control/x-accel-buffering)。x-accel-buffering 是反代理禁缓冲标记,此前个别
 * 回放分支漏带,流可能被中间层攒满才发。 */
export function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
