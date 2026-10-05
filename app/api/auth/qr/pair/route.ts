import { NextResponse } from "next/server";
import { pairQrLogin } from "../../../_lib/qr-login";
import { jsonError } from "../../../_lib/errors";

export const dynamic = "force-dynamic";

// 扫码登录(反向)· 手机端输配对码(匿名可调):POST /api/auth/qr/pair {token, code}
// pending→pair_requested;配对码错 5 次整行作废。限流 10 次/10 分钟/IP。
export async function POST(request: Request) {
  let body: { token?: unknown; code?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const result = await pairQrLogin(request, body);
    return NextResponse.json(result, { status: "error" in result ? result.status : 200 });
  } catch (error) {
    return jsonError(error);
  }
}
