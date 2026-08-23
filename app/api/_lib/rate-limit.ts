import { database } from "./community";

export class RateLimitError extends Error {
  constructor(public code = "rate_limit_exceeded", public status = 429) {
    super(code);
  }
}

export async function rateLimitKey(namespace: string, value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${namespace}:${value}`));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${namespace}:${hash}`;
}

export async function requestActorKey(request: Request, namespace: string) {
  // 只信任 Cloudflare 注入的 cf-connecting-ip 作限流键。x-forwarded-for 是客户端可控头,
  // 用作回退会让攻击者轮换该头绕过限流(登录/oauth-token/发帖/点赞等)。
  // cf-connecting-ip 缺失时统一落入 "unknown" 桶——更严格,而非信任伪造头。
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  return rateLimitKey(namespace, ip);
}

export async function enforceRateLimit(bucket: string, limit: number, windowSeconds: number) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
  const row = await database().prepare(
    `INSERT INTO api_rate_limits (bucket, window_start, request_count, updated_at)
     VALUES (?, ?, 1, CURRENT_TIMESTAMP)
     ON CONFLICT(bucket, window_start) DO UPDATE SET
       request_count = request_count + 1,
       updated_at = CURRENT_TIMESTAMP
     RETURNING request_count AS requestCount`,
  ).bind(bucket, windowStart).first<{ requestCount: number }>();
  if (Number(row?.requestCount ?? limit + 1) > limit) throw new RateLimitError();
  if (crypto.getRandomValues(new Uint8Array(1))[0] < 4) {
    await database().prepare(`DELETE FROM api_rate_limits WHERE window_start < ?`).bind(nowSeconds - 7 * 24 * 60 * 60).run();
  }
}
