import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { getOAuthSessionUser } from "./oauth-session";
import { AGENT_DISPLAY_NAME, AGENT_EMAIL, isValidAgentToken, parseBearerToken } from "./api/_lib/agent-auth";
import { legacyIdentityHeadersEnabled } from "./api/_lib/dev-login-gate";
import { resolveUserApiKey } from "./api/_lib/user-api-key";

export type ChatGPTUser = {
  displayName: string;
  email: string;
  fullName: string | null;
  isAgent?: boolean;
  isAdmin?: boolean;
  isFounder?: boolean;
  authVia?: "session" | "api_key" | "agent" | "legacy";
  apiKeyId?: string;
};

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";

async function agentFromRequest(authHeader: string | null): Promise<ChatGPTUser | null> {
  const secret = (env as unknown as Record<string, string | undefined>).ZAOCHANG_AGENT_TOKEN;
  if (!secret) return null;
  const token = parseBearerToken(authHeader);
  if (!isValidAgentToken(token, secret)) return null;
  return {
    email: AGENT_EMAIL,
    displayName: AGENT_DISPLAY_NAME,
    fullName: null,
    isAgent: true,
    isAdmin: false,
    isFounder: false,
    authVia: "agent",
  };
}

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const authorization = requestHeaders.get("authorization");
  const bearer = parseBearerToken(authorization);
  // zc_ 凭据命中前缀即进入 key 路径。不存在/吊销/过期时抛 401，绝不回落到
  // 同请求可能携带的 Cookie 或遗留身份头。
  if (bearer?.startsWith("zc_")) return resolveUserApiKey(bearer);

  // Agent Bearer token 与个人 key 独立识别;Authorization 头不由浏览器自动携带。
  const agent = await agentFromRequest(authorization);
  if (agent) return agent;
  const oauthUser = await getOAuthSessionUser();
  if (oauthUser) return { ...oauthUser, authVia: "session" };
  if (!oaiIdentityHeadersEnabled()) return null;
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
    authVia: "legacy",
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
