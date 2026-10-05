import { NextResponse } from "next/server";
import { hostQrLogin } from "../../../_lib/qr-login";
import { jsonError } from "../../../_lib/errors";

export const dynamic = "force-dynamic";

// 扫码登录(反向)· 桌面端发起(必须已登录):POST /api/auth/qr/host
// 签发一行 pending 会话 + 6 位配对码;QR 内容为 /signin/qr-pair/<token>,
// 配对码明文只在本次响应(桌面屏展示),库存 SHA-256。限流 5 次/10 分钟/成员。
export async function POST(request: Request) {
  try {
    const result = await hostQrLogin(request);
    return NextResponse.json(result, { status: "error" in result ? result.status : 200 });
  } catch (error) {
    return jsonError(error);
  }
}
