// 请求体上闸:所有带体的请求一律全量缓冲并限制在 MAX_REQUEST_BYTES 内,
// 超限即刻 413。从 worker/index.ts 抽出的独立管道阶段。

export const MAX_REQUEST_BYTES = 11 * 1024 * 1024;

export async function prepareRequestBody(request: Request): Promise<Request | Response> {
  // DELETE 也要盖住:founder 的 DELETE /api/docs 会 request.json(),不能留无上界入口。
  if (!request.body || !["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return request;
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: "request_too_large" }, { status: 413 });
  }
  if (Number.isFinite(contentLength) && contentLength > 0) {
    // 快路径:有可信 content-length 的请求一次性缓冲后按既有行为重建。
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_REQUEST_BYTES) {
      return Response.json({ error: "request_too_large" }, { status: 413 });
    }
    return new Request(request, { body });
  }
  // chunked/无长度:流式累计,超限即刻 413,不再把任意大小的 body 全量读进内存。
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel().catch(() => {});
      return Response.json({ error: "request_too_large" }, { status: 413 });
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request, { body });
}
