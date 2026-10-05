import { NextResponse } from "next/server";
import { startQrLogin } from "../../../_lib/qr-login";
import { RateLimitError } from "../../../_lib/rate-limit";
import { jsonError } from "../../../_lib/errors";

export const dynamic = "force-dynamic";

// 扫码登录 · 第一步(桌面端,匿名可调):POST /api/auth/qr/start {return_to?}
// 签发一行 pending 会话,返回 confirm 页 URL——它就是 QR 码的内容。限流
// 10 次/10 分钟/IP;token 只存 SHA-256,2 分钟 TTL,过期行随签发顺手清理。
export async function POST(request: Request) {
  let body: { return_to?: unknown };
  try {
    body = await request.json().catch(() => ({})) as typeof body;
  } catch {
    body = {};
  }
  try {
    const start = await startQrLogin(request, body);
    return NextResponse.json(start);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    return jsonError(error);
  }
}
