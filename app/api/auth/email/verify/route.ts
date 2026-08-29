import { NextResponse } from "next/server";
import { verifyEmailCode } from "../../../_lib/email-codes";

// 邮箱验证码登录 · 第二步。安全语义(最新行选取/5 次锁定/原子消费/邀请码触发器
// 门槛)见 _lib/email-codes.ts 的 verifyEmailCode。
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  return await verifyEmailCode(request, body);
}
