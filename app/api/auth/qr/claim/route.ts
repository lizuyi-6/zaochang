import { NextResponse } from "next/server";
import { claimQrLogin } from "../../../_lib/qr-login";
import { jsonError } from "../../../_lib/errors";

export const dynamic = "force-dynamic";

// 扫码登录(反向)· 手机端轮询(匿名可调):POST /api/auth/qr/claim {token}
// confirmed → 原子消费并向手机签发会话(本响应 Set-Cookie,与其它渠道同管线)。
export async function POST(request: Request) {
  let body: { token?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    return NextResponse.json(await claimQrLogin(request, body));
  } catch (error) {
    return jsonError(error);
  }
}
