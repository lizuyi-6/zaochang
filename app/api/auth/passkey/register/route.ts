import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { RateLimitError, enforceRateLimit, requestActorKey } from "../../../_lib/rate-limit";
import {
  consumeChallenge,
  findCredential,
  insertCredential,
  rpConfigForRequest,
  toBase64UrlFromBytes,
} from "../../../_lib/webauthn";
import { normalizeCredentialName } from "../../../_lib/webauthn-core";

export const dynamic = "force-dynamic";

function defaultCredentialName() {
  return `通行密钥 · ${new Date().toISOString().slice(0, 10)}`;
}

// Passkey 注册 · 第二步(已登录成员):POST /api/auth/passkey/register {credential, name?}
// 安全面:
// - 挑战 cookie 单次消费(先读后清):重放/并发只有第一次生效,验证失败必须重新
//   走 options——挑战是票据,不是可重试的口令;
// - verifyRegistrationResponse 校验挑战/origin/rpId/签名,fmt='none'(无 attestation
//   信任链,passkey 的安全来自凭据本身,不来自厂商证明);
// - credential_id 主键冲突(含并发竞态败者)→ 409 credential_exists;
// - uv 不强制(options 即 preferred):平台凭据几乎总带 UV,但跨设备钥匙可能不弹
//   验证,UP(在场)由库强制为 true。
export async function POST(request: Request) {
  try {
    const member = await requireMember();
    try {
      await enforceRateLimit(await requestActorKey(request, "passkey-register"), 30, 15 * 60);
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json({ error: "rate_limited" }, { status: 429 });
      }
      throw error;
    }

    let body: { credential?: unknown; name?: unknown };
    try {
      body = await request.json() as typeof body;
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    if (!body?.credential || typeof body.credential !== "object") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const consumed = await consumeChallenge(request, "register");
    if (!consumed?.userHandle) {
      // login/options 签发的挑战(userHandle 段为空)不能用于注册——用途隔离。
      return NextResponse.json({ error: "challenge_invalid" }, { status: 400 });
    }

    const rp = rpConfigForRequest(request);
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body.credential as Parameters<typeof verifyRegistrationResponse>[0]["response"],
        expectedChallenge: consumed.challenge,
        expectedOrigin: rp.expectedOrigins,
        expectedRPID: rp.rpId,
        requireUserVerification: false,
      });
    } catch {
      return NextResponse.json({ error: "verification_failed" }, { status: 400 });
    }
    if (!verification.verified) {
      return NextResponse.json({ error: "verification_failed" }, { status: 400 });
    }
    const info = verification.registrationInfo;
    const credentialId = info.credential.id;

    if (await findCredential(credentialId)) {
      return NextResponse.json({ error: "credential_exists" }, { status: 409 });
    }
    const name = normalizeCredentialName(body.name, defaultCredentialName());
    try {
      await insertCredential({
        credentialId,
        userHandle: consumed.userHandle,
        email: member.email,
        name,
        publicKey: toBase64UrlFromBytes(info.credential.publicKey),
        counter: info.credential.counter ?? 0,
        transports: info.credential.transports?.length ? info.credential.transports.join(",") : null,
        aaguid: info.aaguid ?? "",
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
      });
    } catch (error) {
      // 唯一主键并发竞态败者(精确匹配 UNIQUE,避免把 DB 故障误报成重复凭据)。
      const message = error instanceof Error ? error.message : "";
      if (/UNIQUE/i.test(message)) {
        return NextResponse.json({ error: "credential_exists" }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ status: "ok", credential_id: credentialId, name });
  } catch (error) {
    return jsonError(error);
  }
}
