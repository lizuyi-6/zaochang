import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { getOAuthSessionUser } from "./oauth-session";
import { AGENT_DISPLAY_NAME, AGENT_EMAIL, isValidAgentToken, parseBearerToken } from "./api/_lib/agent-auth";
import { legacyIdentityHeadersEnabled } from "./api/_lib/dev-login-gate";

export type ChatGPTUser = {
  displayName: string;
  email: string;
  fullName: string | null;
  isAgent?: boolean;
};

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";

async function agentFromRequest(): Promise<ChatGPTUser | null> {
  const secret = (env as unknown as Record<string, string | undefined>).ZAOCHANG_AGENT_TOKEN;
  if (!secret) return null;
  const requestHeaders = await headers();
  const token = parseBearerToken(requestHeaders.get("authorization"));
  if (!isValidAgentToken(token, secret)) return null;
  return { email: AGENT_EMAIL, displayName: AGENT_DISPLAY_NAME, fullName: null, isAgent: true };
}

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  // Agent Bearer token 最先识别:命中 → 返回 agent 服务账户身份(独立于人类登录)。
  // Authorization 头不被浏览器自动携带(非 cookie),无 CSRF 风险。
  const agent = await agentFromRequest();
  if (agent) return agent;
  const oauthUser = await getOAuthSessionUser();
  if (oauthUser) return oauthUser;
  if (!oaiIdentityHeadersEnabled()) return null;
  const requestHeaders = await headers();
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!email) return null;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    displayName: fullName ?? email,
    email,
    fullName,
  };
}

export function oaiIdentityHeadersEnabled() {
  // 判定本体是 dev-login-gate 里的零 import 纯函数(可单测):oai-authenticated-user-*
  // 遗留身份头只在 APP_ENV ∈ {development, test} 被信任,与 dev-login 同一口径。
  // production / staging / 未设置 / 拼写错误一律拒绝。原 TRUST_OAI_IDENTITY_HEADERS
  // 开关会在 staging 或 APP_ENV 未设置时打开该门,已移除(2026-10 全库审查 A4)。
  return legacyIdentityHeadersEnabled(env as unknown as Record<string, string | undefined>);
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
