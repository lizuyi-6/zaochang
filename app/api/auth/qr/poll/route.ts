import { NextResponse } from "next/server";
import { pollQrLogin } from "../../../_lib/qr-login";
import { jsonError } from "../../../_lib/errors";

export const dynamic = "force-dynamic";

// 扫码登录 · 第三步(桌面端轮询,匿名可调):POST /api/auth/qr/poll {token}
// pending → 继续轮;confirmed → 原子消费并发会话(本响应 Set-Cookie,与
// GitHub/邮箱码/passkey 同管线);consumed/expired → 确定性终态。响应不含
// 任何成员信息之外的敏感面,token 用后即焚。
export async function POST(request: Request) {
  let body: { token?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    return NextResponse.json(await pollQrLogin(request, body));
  } catch (error) {
    return jsonError(error);
  }
}
