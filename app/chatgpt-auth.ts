import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getOAuthSessionUser } from "./oauth-session";
import { AGENT_DISPLAY_NAME, AGENT_EMAIL, isValidAgentToken, parseBearerToken } from "./api/_lib/agent-auth";

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
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";

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
  const values = env as unknown as Record<string, string | undefined>;
  if (values.TRUST_OAI_IDENTITY_HEADERS === "true") return true;
  return values.APP_ENV === "development" || values.APP_ENV === "test";
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
