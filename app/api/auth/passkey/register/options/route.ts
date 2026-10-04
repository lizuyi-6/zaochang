import { generateRegistrationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { requireMember } from "../../../../_lib/access-control";
import { jsonError } from "../../../../_lib/errors";
import { RateLimitError, enforceRateLimit, requestActorKey } from "../../../../_lib/rate-limit";
import {
  fromBase64Url,
  issueChallenge,
  listCredentials,
  randomUserHandle,
  rpConfigForRequest,
  splitTransports,
} from "../../../../_lib/webauthn";
import { PASSKEY_RP_NAME } from "../../../../_lib/webauthn-core";
import { requestSecure } from "../../../../../oauth-session";

export const dynamic = "force-dynamic";

// Passkey 注册 · 第一步(已登录成员):POST /api/auth/passkey/register/options
// 为当前成员签发注册挑战。安全面:
// - 必须已登录(passkey 是已有成员的追加凭据,不参与首次注册——邀请码门槛不经过这里);
// - 限流:每 IP 30 次/15 分钟(挑战本身无外发成本,限流只为挡挑战农场);
// - excludeCredentials 带上成员已有凭据,阻止同一认证器重复注册;
// - userHandle 复用成员首把凭据的 handle(无则生成新的),同一成员的多把钥匙在
//   authenticator 账户选择器里归并为一个身份;
// - 挑战写入 HttpOnly cookie(5 分钟,verify 单次消费),响应体原样返回
//   PublicKeyCredentialCreationOptionsJSON 供 startRegistration({ optionsJSON })。
export async function POST(request: Request) {
  try {
    const member = await requireMember();
    try {
      await enforceRateLimit(await requestActorKey(request, "passkey-register-options"), 30, 15 * 60);
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json({ error: "rate_limited" }, { status: 429 });
      }
      throw error;
    }

    const rp = rpConfigForRequest(request);
    const existing = await listCredentials(member.email);
    const userHandle = existing[0]?.userHandle ?? randomUserHandle();
    const options = await generateRegistrationOptions({
      rpName: PASSKEY_RP_NAME,
      rpID: rp.rpId,
      userName: member.email,
      userDisplayName: member.displayName,
      userID: fromBase64Url(userHandle),
      attestationType: "none",
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
      excludeCredentials: existing.map((row) => ({
        id: row.credentialId,
        transports: splitTransports(row.transports),
      })),
    });
    await issueChallenge("register", options.challenge, userHandle, await requestSecure(request));
    return NextResponse.json(options);
  } catch (error) {
    return jsonError(error);
  }
}
