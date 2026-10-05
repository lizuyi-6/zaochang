import { NextResponse } from "next/server";
import { approveQrLogin, denyQrLogin } from "../../../_lib/qr-login";
import { jsonError } from "../../../_lib/errors";

export const dynamic = "force-dynamic";

// 扫码登录(反向)· 桌面端显式决定(必须已登录且为属主):
// POST /api/auth/qr/approve {token, decision: "allow" | "deny"}
// allow:pair_requested→confirmed(手机随后 claim 拿会话);deny:删行(手机得 expired)。
export async function POST(request: Request) {
  let body: { token?: unknown; decision?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const result = body?.decision === "deny"
      ? await denyQrLogin(request, body)
      : await approveQrLogin(request, body);
    return NextResponse.json(result, { status: "error" in result ? result.status : 200 });
  } catch (error) {
    return jsonError(error);
  }
}
