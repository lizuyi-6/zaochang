import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { database } from "../../../_lib/community";
import { jsonError } from "../../../_lib/errors";
import { RateLimitError, enforceRateLimit, requestActorKey } from "../../../_lib/rate-limit";
import {
  consumeChallenge,
  findCredential,
  fromBase64Url,
  rpConfigForRequest,
  splitTransports,
  touchCredential,
} from "../../../_lib/webauthn";
import { createOAuthSession, requestSecure, safeReturnPath, setAuthCookies } from "../../../../oauth-session";

export const dynamic = "force-dynamic";

// Passkey 登录 · 第二步(匿名可调):POST /api/auth/passkey/login {credential, return_to?}
// 安全面:
// - 挑战 cookie 单次消费(先读后清),login 变体不要求 userHandle 段;
// - 错误码统一 passkey_invalid:不区分"凭据不存在"与"签名/挑战/origin 校验失败",
//   不向未认证调用方泄露凭据存在性(枚举防护);
// - 断言成功才回写 counter(max 防倒退)/deviceType/backedUp/last_used_at——同步型
//   凭据(backup 状态)counter 可恒 0,克隆判定由库按 credentialDeviceType 分流;
// - 会话与 GitHub/邮箱码完全同权:createOAuthSession(provider='passkey') +
//   setAuthCookies 同一管线,主站 SSO//lattice 门禁/OIDC 提供方零改动自动兼容。
export async function POST(request: Request) {
  try {
    try {
      await enforceRateLimit(await requestActorKey(request, "passkey-login"), 30, 15 * 60);
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json({ error: "rate_limited" }, { status: 429 });
      }
      throw error;
    }

    let body: { credential?: { id?: unknown }; return_to?: unknown };
    try {
      body = await request.json() as typeof body;
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const credential = body?.credential;
    if (!credential || typeof credential !== "object" || typeof credential.id !== "string") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const consumed = await consumeChallenge(request, "login");
    if (!consumed) {
      return NextResponse.json({ error: "challenge_invalid" }, { status: 400 });
    }

    const rp = rpConfigForRequest(request);
    const row = await findCredential(credential.id);
    if (!row) {
      return NextResponse.json({ error: "passkey_invalid" }, { status: 400 });
    }
    // 名义绑定防御:discoverable 断言必带 userHandle,与凭据行不符(张冠李戴)即拒。
    // 身份判定仍以 credential_id 为主键,这里只保证断言自洽。
    const assertedHandle = (credential as { response?: { userHandle?: unknown } }).response?.userHandle;
    if (typeof assertedHandle === "string" && assertedHandle && assertedHandle !== row.userHandle) {
      return NextResponse.json({ error: "passkey_invalid" }, { status: 400 });
    }
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: credential as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
        expectedChallenge: consumed.challenge,
        expectedOrigin: rp.expectedOrigins,
        expectedRPID: rp.rpId,
        credential: {
          id: row.credentialId,
          publicKey: fromBase64Url(row.publicKey),
          counter: row.counter,
          transports: splitTransports(row.transports),
        },
        requireUserVerification: false,
      });
    } catch {
      return NextResponse.json({ error: "passkey_invalid" }, { status: 400 });
    }
    if (!verification.verified) {
      return NextResponse.json({ error: "passkey_invalid" }, { status: 400 });
    }
    const info = verification.authenticationInfo;
    await touchCredential(row.credentialId, {
      counter: info.newCounter,
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
    });

    // FK 保证成员存在;防御分支兜底(直接 D1 删行等极端情形)不签发会话。
    const memberRow = await database()
      .prepare(`SELECT display_name FROM members WHERE email = ?`)
      .bind(row.email)
      .first<{ display_name: string }>();
    if (!memberRow) {
      return NextResponse.json({ error: "passkey_invalid" }, { status: 400 });
    }
    const user = { displayName: memberRow.display_name, email: row.email, fullName: memberRow.display_name };
    const session = await createOAuthSession(user, "passkey");
    const destination = await setAuthCookies(session.token, safeReturnPath(typeof body.return_to === "string" ? body.return_to : null), await requestSecure(request));
    return NextResponse.json({ status: "ok", return_to: destination });
  } catch (error) {
    return jsonError(error);
  }
}
