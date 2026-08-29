import { NextResponse } from "next/server";
import { requestEmailCode } from "../../../_lib/email-codes";

// 邮箱验证码登录 · 第一步。安全语义(双层限流/Turnstile/验证码采样/补偿删除)见
// _lib/email-codes.ts 的 requestEmailCode。
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  return await requestEmailCode(request, body);
}
