import { NextResponse } from "next/server";
import { hostStateQrLogin } from "../../../_lib/qr-login";
import { jsonError } from "../../../_lib/errors";

export const dynamic = "force-dynamic";

// 扫码登录(反向)· 桌面端状态轮询(必须已登录且为属主):POST /api/auth/qr/host-state {token}
// 非属主一律 expired(不泄露会话存在性)。
export async function POST(request: Request) {
  let body: { token?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    return NextResponse.json(await hostStateQrLogin(request, body));
  } catch (error) {
    return jsonError(error);
  }
}
