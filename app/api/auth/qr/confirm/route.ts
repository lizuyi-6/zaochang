import { NextResponse } from "next/server";
import { confirmQrLogin } from "../../../_lib/qr-login";
import { jsonError } from "../../../_lib/errors";

export const dynamic = "force-dynamic";

// 扫码登录 · 第二步(手机端,必须已登录):POST /api/auth/qr/confirm {token}
// 显式批准"在桌面端登录我的账号"。pending→confirmed 原子迁移;未登录 401、
// 过期 410、无效/重放统一 400(不给枚举面)。限流 10 次/10 分钟/成员。
export async function POST(request: Request) {
  let body: { token?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const result = await confirmQrLogin(request, body);
    return NextResponse.json(result, { status: "error" in result ? result.status : 200 });
  } catch (error) {
    return jsonError(error);
  }
}
