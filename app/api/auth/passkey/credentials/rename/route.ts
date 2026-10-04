import { NextResponse } from "next/server";
import { requireMember } from "../../../../_lib/access-control";
import { jsonError } from "../../../../_lib/errors";
import { RateLimitError, enforceRateLimit, requestActorKey } from "../../../../_lib/rate-limit";
import { renameCredential } from "../../../../_lib/webauthn";
import { normalizeCredentialName } from "../../../../_lib/webauthn-core";

export const dynamic = "force-dynamic";

// 重命名通行密钥:POST /api/auth/passkey/credentials/rename {credential_id, name}
// WHERE 带 email——成员只能改自己的凭据。空名回落默认名,与注册侧同一归一化。
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

    let body: { credential_id?: unknown; name?: unknown };
    try {
      body = await request.json() as typeof body;
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    if (typeof body.credential_id !== "string" || !body.credential_id) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const name = normalizeCredentialName(body.name, "通行密钥");
    const changed = await renameCredential(member.email, body.credential_id, name);
    if (!changed) {
      return NextResponse.json({ error: "credential_not_found" }, { status: 404 });
    }
    return NextResponse.json({ status: "ok", name });
  } catch (error) {
    return jsonError(error);
  }
}
