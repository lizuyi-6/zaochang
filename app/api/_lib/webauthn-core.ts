// Passkey(WebAuthn)纯逻辑域模块:RP/origin 推导、凭据名归一化。
// 零运行时依赖(仅引同为纯函数的 public-origin/crypto-utils),测试用
// --experimental-strip-types 直接 import;IO(cookie 读写、D1、simplewebauthn 调用)
// 在 _lib/webauthn.ts 与路由层——与 dev-login-gate/purge 的分层同一纪律。
import { constantTimeEquals } from "./crypto-utils.ts";
import { resolvePublicAppOrigin } from "../../lib/public-origin.ts";

export const WEBAUTHN_CHALLENGE_COOKIE = "zaochang_passkey_challenge";
export const WEBAUTHN_CHALLENGE_TTL_SECONDS = 300;
export const PASSKEY_RP_NAME = "造场";

// 挑战消费语义:challenge 值本体在 HttpOnly cookie(浏览器经 clientDataJSON 回传)
// 与 clientDataJSON 两处,服务端只存 SHA-256 并在 webauthn_challenges 表原子消费
// (consumed_at 条件 UPDATE + meta.changes,与 email_login_codes 同款)——纯 cookie
// 挑战对"无视 Set-Cookie 的重放"无防线,counter 判定又救不了 counter=0 的同步凭据,
// 服务端消费是唯一完备的一次性语义。
export type WebauthnChallengePurpose = "register" | "login";

// 与 email-codes.ts 的 EMAIL_PATTERN 逐字一致(那边不导出,这里独立声明并钉住语义)。
export const PASSKEY_EMAIL_PATTERN = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/;

export type WebAuthnRpConfig = { rpId: string; expectedOrigins: string[] };

// RP ID / expected origins 的唯一事实来源:与 OAuth 回调同走 PUBLIC_APP_ORIGIN 纪律
// (生产绝不从请求推导;未配置/畸形时按 resolvePublicAppOrigin 语义抛
// public_app_origin_required / invalid_public_app_origin)。非生产回落 requestUrl origin,
// 本地 dev 的 rpID 即 localhost/127.0.0.1。www 变体:生产 routes 同时挂 apex 与 www,
// 停在 www 的页面发起仪式时浏览器上报 www origin,须在放行列表内;仅对非 www、
// 非 IPv4 的多段域名追加,localhost/IP/dev origin 不受影响(多出的项永不命中)。
export function webauthnRpConfig(
  appEnv: string | undefined,
  configuredOrigin: string | undefined,
  requestUrl: string,
): WebAuthnRpConfig {
  const origin = resolvePublicAppOrigin(requestUrl, appEnv, configuredOrigin);
  const url = new URL(origin);
  const host = url.hostname;
  const expectedOrigins = [origin];
  if (!host.startsWith("www.") && host.includes(".") && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    expectedOrigins.push(`${url.protocol}//www.${host}`);
  }
  return { rpId: host, expectedOrigins };
}

// 防御性保持:constantTimeEquals 用于管理台对账等比对场景,此处 re-export 维持单一来源。
export { constantTimeEquals };

export const PASSKEY_NAME_MAX = 60;

// 凭据显示名:去控制字符压空白、截断;空输入回落默认名。
export function normalizeCredentialName(raw: unknown, fallback: string) {
  if (typeof raw !== "string") return fallback;
  const name = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, PASSKEY_NAME_MAX);
  return name || fallback;
}
