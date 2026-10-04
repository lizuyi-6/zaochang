// Hyperknow SSE 帧构造的单一事实来源(2026-10 审计重构 #4):此前 chat/translate/
// course-generation 三处各抄一份同款 frame()。帧形状(`event: frame\ndata: {json}`)
// 是前后端契约,收敛后契约钉只看一处。
export function frame(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`event: frame\ndata: ${JSON.stringify(data)}\n\n`);
}
