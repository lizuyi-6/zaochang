import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { jsonError } from "../../../../_lib/errors";
import { RateLimitError, enforceRateLimit, requestActorKey } from "../../../../_lib/rate-limit";
import { issueChallenge, listCredentials, rpConfigForRequest, splitTransports } from "../../../../_lib/webauthn";
import { PASSKEY_EMAIL_PATTERN } from "../../../../_lib/webauthn-core";
import { requestSecure } from "../../../../../oauth-session";

export const dynamic = "force-dynamic";

// Passkey 登录 · 第一步(匿名可调):POST /api/auth/passkey/login/options {email?}
// 安全面:
// - 限流:每 IP 30 次/15 分钟;
// - email 可选:提供且格式合法时按该邮箱收紧 allowCredentials(email-scoped 回退
//   流程);不带 email 则 allowCredentials 为空(discoverable/usernameless 流程,
//   由 authenticator 弹账户选择器)。邮箱不存在/无凭据时同样返回空 allowCredentials
//   的合法 options——不泄露邮箱是否注册;
// - 挑战写入 HttpOnly cookie(login 变体,userHandle 段留空,不能用于注册)。
export async function POST(request: Request) {
  try {
    try {
      await enforceRateLimit(await requestActorKey(request, "passkey-login-options"), 30, 15 * 60);
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json({ error: "rate_limited" }, { status: 429 });
      }
      throw error;
    }

    let body: { email?: unknown } = {};
    try {
      body = await request.json() as typeof body;
    } catch {
      body = {};
    }
    const emailValue = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const email = PASSKEY_EMAIL_PATTERN.test(emailValue) ? emailValue : null;

    const rp = rpConfigForRequest(request);
    const allowCredentials = [];
    if (email) {
      const rows = await listCredentials(email);
      allowCredentials.push(...rows.map((row) => ({
        id: row.credentialId,
        transports: splitTransports(row.transports),
      })));
    }
    const options = await generateAuthenticationOptions({
      rpID: rp.rpId,
      allowCredentials,
      userVerification: "preferred",
    });
    await issueChallenge("login", options.challenge, null, await requestSecure(request));
    return NextResponse.json(options);
  } catch (error) {
    return jsonError(error);
  }
}
