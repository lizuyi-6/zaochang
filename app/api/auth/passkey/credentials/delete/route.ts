import { NextResponse } from "next/server";
import { requireMember } from "../../../../_lib/access-control";
import { jsonError } from "../../../../_lib/errors";
import { RateLimitError, enforceRateLimit, requestActorKey } from "../../../../_lib/rate-limit";
import { deleteCredential } from "../../../../_lib/webauthn";

export const dynamic = "force-dynamic";

// 删除通行密钥:POST /api/auth/passkey/credentials/delete {credential_id}
// WHERE 带 email——成员只能删自己的凭据。passkey 永远是追加凭据(不参与首次
// 注册),成员至少保有 GitHub/邮箱码之一,删除不存在锁定风险,无"最后一把"闸。
export async function POST(request: Request) {
  try {
    const member = await requireMember();
    try {
      await enforceRateLimit(await requestActorKey(request, "passkey-manage"), 30, 15 * 60);
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json({ error: "rate_limited" }, { status: 429 });
      }
      throw error;
    }

    let body: { credential_id?: unknown };
    try {
      body = await request.json() as typeof body;
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    if (typeof body.credential_id !== "string" || !body.credential_id) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const changed = await deleteCredential(member.email, body.credential_id);
    if (!changed) {
      return NextResponse.json({ error: "credential_not_found" }, { status: 404 });
    }
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    return jsonError(error);
  }
}
