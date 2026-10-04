// Passkey(WebAuthn)IO 域模块:挑战 cookie 读写与凭据表 CRUD。路由只留请求体
// 解析与 simplewebauthn 调用;纯判定(rp/origin 推导、cookie 编解码、名称归一化)
// 在 webauthn-core.ts,测试直连该层。生命周期:凭据是持久行,不进 purge 注册
// (挑战只存 cookie,无表可清)。
import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { database } from "./community";
import { toBase64Url } from "./crypto-utils";
import { expiryTimestamp, hashToken, randomToken, requestSecure } from "../../oauth-session";
import {
  WEBAUTHN_CHALLENGE_COOKIE,
  WEBAUTHN_CHALLENGE_TTL_SECONDS,
  webauthnRpConfig,
  type WebauthnChallengePurpose,
  type WebAuthnRpConfig,
} from "./webauthn-core";

export type WebAuthnCredentialRow = {
  credentialId: string;
  userHandle: string;
  email: string;
  name: string;
  publicKey: string;
  counter: number;
  transports: string | null;
  aaguid: string;
  deviceType: string;
  backedUp: number;
  createdAt: string;
  lastUsedAt: string | null;
};

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function toBase64UrlFromBytes(bytes: Uint8Array) {
  return toBase64Url(bytes);
}

export function splitTransports(value: string | null): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

// userHandle:成员稳定标识(16 字节随机 → 22 字符 base64url,规范上限 64 字节)。
// 不携带 PII;首把凭据注册时随行落库,后续注册复用同一 handle(authenticator 的
// 账户选择器把同一成员的多把钥匙归到同一"账户"下)。
export function randomUserHandle() {
  return randomToken(16);
}

export function rpConfigForRequest(request: Request): WebAuthnRpConfig {
  const values = env as unknown as Record<string, string | undefined>;
  try {
    return webauthnRpConfig(values.APP_ENV, values.PUBLIC_APP_ORIGIN, request.url);
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_public_app_origin";
    // 与 oauth-session.publicAppOrigin 的错误包装逐字同语义,jsonError 据此映射 503/500。
    throw Object.assign(new Error(code), { code, status: code === "public_app_origin_required" ? 503 : 500 });
  }
}

// 签发挑战:必须用 simplewebauthn 生成的 options.challenge(客户端把它原样放进
// clientDataJSON,服务端以 cookie/DB 里的同一值作 expectedChallenge——自造随机值
// 会和 options.challenge 错位,所有仪式必然失败)。cookie 存原值,SHA-256 落
// webauthn_challenges 行(purpose 隔离注册/登录;register 行携带本次 options 的
// userHandle,verify 时用它把凭据绑到正确成员)。
export async function issueChallenge(
  purpose: WebauthnChallengePurpose,
  challenge: string,
  userHandle: string | null,
  secure: boolean,
) {
  const cookieStore = await cookies();
  cookieStore.set(WEBAUTHN_CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: WEBAUTHN_CHALLENGE_TTL_SECONDS,
  });
  await database()
    .prepare(
      `INSERT INTO webauthn_challenges (challenge_hash, purpose, user_handle, expires_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(
      await hashToken(challenge),
      purpose,
      userHandle,
      expiryTimestamp(WEBAUTHN_CHALLENGE_TTL_SECONDS),
    )
    .run();
  return challenge;
}

export type ConsumedChallenge = { challenge: string; userHandle: string | null };

// 单次消费:读 cookie 里的 challenge 原值 → 哈希定位未消费、未过期、purpose 匹配的
// 行 → consumed_at 条件 UPDATE,meta.changes=1 才算消费成功。重放/并发双提交只有
// 第一次生效;恶意客户端无视 Set-Cookie 重试也过不了 DB 消费闸。验证失败必须重新
// 走 options——挑战是票据,不是可重试的口令。
export async function consumeChallenge(
  request: Request,
  purpose: WebauthnChallengePurpose,
): Promise<ConsumedChallenge | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(WEBAUTHN_CHALLENGE_COOKIE)?.value;
  const secure = await requestSecure(request);
  cookieStore.set(WEBAUTHN_CHALLENGE_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  if (!raw) return null;
  const consumed = await database()
    .prepare(
      `UPDATE webauthn_challenges SET consumed_at = CURRENT_TIMESTAMP
       WHERE challenge_hash = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
    )
    .bind(await hashToken(raw), purpose)
    .run();
  if (Number(consumed.meta.changes ?? 0) === 0) return null;
  const row = await database()
    .prepare(`SELECT user_handle FROM webauthn_challenges WHERE challenge_hash = ?`)
    .bind(await hashToken(raw))
    .first<{ user_handle: string | null }>();
  return { challenge: raw, userHandle: row?.user_handle ?? null };
}

const CREDENTIAL_COLUMNS = `credential_id AS credentialId, user_handle AS userHandle, email,
  name, public_key AS publicKey, counter, transports, aaguid, device_type AS deviceType,
  backed_up AS backedUp, created_at AS createdAt, last_used_at AS lastUsedAt`;

export async function listCredentials(email: string) {
  return await database()
    .prepare(`SELECT ${CREDENTIAL_COLUMNS} FROM webauthn_credentials WHERE email = ? ORDER BY created_at DESC`)
    .bind(email)
    .all<WebAuthnCredentialRow>()
    .then((result) => result.results);
}

export async function findCredential(credentialId: string) {
  return await database()
    .prepare(`SELECT ${CREDENTIAL_COLUMNS} FROM webauthn_credentials WHERE credential_id = ?`)
    .bind(credentialId)
    .first<WebAuthnCredentialRow>();
}

export async function insertCredential(row: {
  credentialId: string;
  userHandle: string;
  email: string;
  name: string;
  publicKey: string;
  counter: number;
  transports: string | null;
  aaguid: string;
  deviceType: string;
  backedUp: boolean;
}) {
  await database()
    .prepare(
      `INSERT INTO webauthn_credentials
       (credential_id, user_handle, email, name, public_key, counter, transports, aaguid, device_type, backed_up)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.credentialId,
      row.userHandle,
      row.email,
      row.name,
      row.publicKey,
      row.counter,
      row.transports,
      row.aaguid,
      row.deviceType,
      row.backedUp ? 1 : 0,
    )
    .run();
}

// 断言成功后回写:counter 取 max 防倒退;deviceType/backedUp 按 WebAuthn L3 语义
// 允许变化(同步凭据的 backup 状态随设备状态演进,变化不是异常)。
export async function touchCredential(
  credentialId: string,
  info: { counter: number; deviceType: string; backedUp: boolean },
) {
  await database()
    .prepare(
      `UPDATE webauthn_credentials
       SET counter = ?, device_type = ?, backed_up = ?, last_used_at = CURRENT_TIMESTAMP
       WHERE credential_id = ?`,
    )
    .bind(Math.max(info.counter, 0), info.deviceType, info.backedUp ? 1 : 0, credentialId)
    .run();
}

export async function renameCredential(email: string, credentialId: string, name: string) {
  const result = await database()
    .prepare(`UPDATE webauthn_credentials SET name = ? WHERE credential_id = ? AND email = ?`)
    .bind(name, credentialId, email)
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}

export async function deleteCredential(email: string, credentialId: string) {
  const result = await database()
    .prepare(`DELETE FROM webauthn_credentials WHERE credential_id = ? AND email = ?`)
    .bind(credentialId, email)
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}
