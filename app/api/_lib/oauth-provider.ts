import { exportJWK, importJWK, SignJWT, type JWK } from "jose";
import { env } from "cloudflare:workers";
import { database } from "./community";
import { hashToken, publicAppOrigin, randomToken } from "../../oauth-session";
import { AuthRequiredError } from "./errors";
import { RateLimitError } from "./rate-limit";
import { isLoopbackHttpRedirect, loopbackRedirectAllowed, type LoopbackRedirectPurpose, type LoopbackRegistrationSource } from "./loopback-redirect";
import { MCP_PROJECT_SCOPE, MCP_RESOURCE_PATH } from "./oauth-resource";

export const OAUTH_SCOPES = {
  openid: { label: "识别你的造场账号", description: "向应用提供一个只属于该应用的匿名账号标识。" },
  profile: { label: "读取公开资料", description: "读取你的造场昵称与公开个人资料。" },
  email: { label: "读取邮箱地址", description: "向应用提供你的造场账号邮箱。" },
  "fruit:balance": { label: "读取果子余额", description: "只读查看可用与待结算余额，不能扣除果子。" },
  "fruit:pay": { label: "发起果子支付", description: "应用只能创建待确认订单，每笔扣果仍需回到造场确认。" },
  "fruit:refund": { label: "申请订单退款", description: "仅能处理该应用创建且仍满足退款条件的订单。" },
  "mcp:projects": { label: "管理你自己的项目", description: "通过 AI 助手查看、提交、修改你的项目并上传封面；提交与修改都会重新审核。不能动果子、不能读邮箱。" },
} as const;

export type OAuthScope = keyof typeof OAUTH_SCOPES;

const ALL_SCOPES = Object.keys(OAUTH_SCOPES) as OAuthScope[];
const WRITE_SCOPES = new Set<OAuthScope>(["fruit:pay", "fruit:refund"]);
const ACCESS_TOKEN_SECONDS = 60 * 60;
const REFRESH_TOKEN_SECONDS = 60 * 60 * 24 * 30;
const AUTHORIZATION_CODE_SECONDS = 5 * 60;
const AUTHORIZATION_REQUEST_SECONDS = 10 * 60;

type ClientRow = {
  clientId: string;
  ownerEmail: string | null;
  name: string;
  description: string;
  websiteUrl: string;
  clientType: "public" | "confidential";
  clientSecretHash: string | null;
  allowedScopes: string;
  status: "active" | "revoked";
  reviewStatus: "unverified" | "verified" | "rejected";
  writeAccessApproved: number;
  registrationSource: "developer" | "dynamic";
  allowedGrants: string;
};

type AuthorizationRequestRow = {
  requestHash: string;
  clientId: string;
  userEmail: string;
  redirectUri: string;
  scope: string;
  state: string;
  nonce: string | null;
  codeChallenge: string;
  resource: string | null;
  expiresAt: string;
  usedAt: string | null;
};

type AuthorizationCodeRow = {
  codeHash: string;
  clientId: string;
  userEmail: string;
  redirectUri: string;
  scope: string;
  nonce: string | null;
  codeChallenge: string;
  resource: string | null;
  expiresAt: string;
  usedAt: string | null;
};

type TokenIdentity = {
  tokenHash: string;
  clientId: string;
  clientName: string;
  clientOwnerEmail: string | null;
  userEmail: string;
  displayName: string;
  scope: string;
  subject: string;
  expiresAt: string;
  resource: string | null;
};

export type OAuthMcpIdentity = {
  email: string;
  displayName: string;
  fullName: string | null;
  initial: string;
  authVia: "oauth";
  clientId: string;
  isAdmin: false;
  isFounder: false;
  isAgent: false;
};

export class OAuthProviderError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public description = "",
  ) {
    super(code);
  }
}

function sqliteTimestamp(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function expiresIn(seconds: number) {
  return sqliteTimestamp(new Date(Date.now() + seconds * 1000));
}

function parseScopes(value: string) {
  const requested = [...new Set(value.trim().split(/\s+/).filter(Boolean))];
  if (!requested.length || !requested.every((scope): scope is OAuthScope => ALL_SCOPES.includes(scope as OAuthScope))) {
    throw new OAuthProviderError("invalid_scope", 400, "请求包含未开放的授权范围。");
  }
  return ALL_SCOPES.filter((scope) => requested.includes(scope));
}

function canonicalScopes(scopes: OAuthScope[]) {
  return ALL_SCOPES.filter((scope) => scopes.includes(scope)).join(" ");
}

function hasScopes(granted: string, required: OAuthScope[]) {
  const values = new Set(granted.split(/\s+/).filter(Boolean));
  return required.every((scope) => values.has(scope));
}

function clientAllowsScopes(client: Pick<ClientRow, "allowedScopes" | "status" | "reviewStatus" | "writeAccessApproved" | "registrationSource">, scopes: OAuthScope[]) {
  if (client.status !== "active" || client.reviewStatus === "rejected" || !hasScopes(client.allowedScopes, scopes)) return false;
  if (client.registrationSource === "dynamic" && (!scopes.includes(MCP_PROJECT_SCOPE) || scopes.some((scope) => scope !== "openid" && scope !== MCP_PROJECT_SCOPE))) return false;
  return !scopes.some((scope) => WRITE_SCOPES.has(scope)) || (client.reviewStatus === "verified" && client.writeAccessApproved === 1);
}

function isValidState(value: string) {
  return /^[A-Za-z0-9._~-]{8,200}$/.test(value);
}

function isValidPkce(value: string) {
  // RFC 7636 §4.1:verifier 字符集含 unreserved(.-_~)——原正则漏了 `.` 与 `~`,
  // 合法客户端会被误拒(L6)。
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(value);
}

function validClientText(value: unknown, min: number, max: number) {
  const text = String(value ?? "").trim();
  if (text.length < min || text.length > max) throw new OAuthProviderError("invalid_client_metadata", 400);
  return text;
}

function validHttpsUrl(
  value: unknown,
  context: { registrationSource?: LoopbackRegistrationSource; purpose?: LoopbackRedirectPurpose } = {},
) {
  const raw = String(value ?? "").trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new OAuthProviderError("invalid_client_metadata", 400, "网址格式无效。");
  }
  const source = context.registrationSource ?? "developer";
  const purpose = context.purpose ?? "authorization";
  const local = isLoopbackHttpRedirect(raw)
    && loopbackRedirectAllowed({ appEnv: runtimeValues().APP_ENV, registrationSource: source, purpose });
  if ((parsed.protocol !== "https:" && !local) || parsed.username || parsed.password || parsed.hash) {
    throw new OAuthProviderError("invalid_client_metadata", 400, "仅允许 HTTPS。");
  }
  return parsed.toString();
}

function runtimeValues() {
  return env as unknown as Record<string, string | undefined>;
}

async function clientById(clientId: string) {
  return database().prepare(
    `SELECT client_id AS clientId, owner_email AS ownerEmail, name, description,
            website_url AS websiteUrl, client_type AS clientType,
            client_secret_hash AS clientSecretHash, allowed_scopes AS allowedScopes, status,
            review_status AS reviewStatus, write_access_approved AS writeAccessApproved,
            registration_source AS registrationSource, allowed_grants AS allowedGrants
     FROM oauth_provider_clients WHERE client_id = ?`,
  ).bind(clientId).first<ClientRow>();
}

async function redirectRegistered(clientId: string, redirectUri: string, purpose: LoopbackRedirectPurpose = "authorization") {
  const source = await database().prepare(
    `SELECT registration_source AS registrationSource FROM oauth_provider_clients WHERE client_id = ?`,
  ).bind(clientId).first<{ registrationSource: LoopbackRegistrationSource }>();
  if (!source) return false;
  let parsed: URL;
  try { parsed = new URL(redirectUri); } catch { return false; }
  const isLoopback = isLoopbackHttpRedirect(redirectUri);
  const loopbackAllowed = loopbackRedirectAllowed({
    appEnv: runtimeValues().APP_ENV,
    registrationSource: source.registrationSource,
    purpose,
  });
  if ((parsed.protocol !== "https:" && !(isLoopback && loopbackAllowed))
    || (isLoopback && !loopbackAllowed)) return false;
  return Boolean(await database().prepare(
    `SELECT 1 AS valid FROM oauth_provider_redirect_uris
     WHERE client_id = ? AND redirect_uri = ?`,
  ).bind(clientId, redirectUri).first<{ valid: number }>());
}

export async function isClientRedirectUri(clientId: string, redirectUri: string) {
  return redirectRegistered(clientId, redirectUri, "payment");
}

async function subjectFor(clientId: string, userEmail: string) {
  const db = database();
  const existing = await db.prepare(
    `SELECT subject FROM oauth_provider_subjects WHERE client_id = ? AND user_email = ?`,
  ).bind(clientId, userEmail).first<{ subject: string }>();
  if (existing) return existing.subject;
  const subject = `zcsub_${randomToken(24)}`;
  await db.prepare(
    `INSERT OR IGNORE INTO oauth_provider_subjects (client_id, user_email, subject) VALUES (?, ?, ?)`,
  ).bind(clientId, userEmail, subject).run();
  const created = await db.prepare(
    `SELECT subject FROM oauth_provider_subjects WHERE client_id = ? AND user_email = ?`,
  ).bind(clientId, userEmail).first<{ subject: string }>();
  if (!created) throw new OAuthProviderError("server_error", 500);
  return created.subject;
}

export async function listDeveloperClients(ownerEmail: string) {
  const db = database();
  const clients = await db.prepare(
    `SELECT client_id AS clientId, name, description, website_url AS websiteUrl,
             client_type AS clientType, allowed_scopes AS allowedScopes, status,
             review_status AS reviewStatus, write_access_approved AS writeAccessApproved,
            created_at AS createdAt
     FROM oauth_provider_clients WHERE owner_email = ? ORDER BY created_at DESC`,
  ).bind(ownerEmail).all<Record<string, unknown>>();
  const redirects = await db.prepare(
    `SELECT r.client_id AS clientId, r.redirect_uri AS redirectUri
     FROM oauth_provider_redirect_uris r JOIN oauth_provider_clients c ON c.client_id = r.client_id
     WHERE c.owner_email = ? ORDER BY r.redirect_uri`,
  ).bind(ownerEmail).all<{ clientId: string; redirectUri: string }>();
  return clients.results.map((client) => ({
    ...client,
    redirectUris: redirects.results.filter((row) => row.clientId === client.clientId).map((row) => row.redirectUri),
  }));
}

export async function createDeveloperClient(ownerEmail: string, input: Record<string, unknown>) {
  const name = validClientText(input.name, 2, 60);
  const description = String(input.description ?? "").trim().slice(0, 240);
  const websiteUrl = validHttpsUrl(input.websiteUrl);
  const clientType = input.clientType === "public" ? "public" : "confidential";
  const redirectValues = Array.isArray(input.redirectUris) ? input.redirectUris : String(input.redirectUris ?? "").split(/[\n,]/);
  const redirectUris = [...new Set(redirectValues.map((value) => validHttpsUrl(value)).filter(Boolean))];
  if (!redirectUris.length || redirectUris.length > 5) throw new OAuthProviderError("invalid_client_metadata", 400, "需要 1 到 5 个精确回调地址。");
  const requestedScopes = parseScopes(String(input.allowedScopes ?? "openid profile email"));
  if (!requestedScopes.includes("openid")) requestedScopes.unshift("openid");
  if (clientType === "public" && requestedScopes.some((scope) => WRITE_SCOPES.has(scope))) {
    throw new OAuthProviderError("public_client_write_scope_forbidden", 400, "公开客户端不能申请果子写权限。");
  }

  const clientId = `zc_${randomToken(18)}`;
  const clientSecret = clientType === "confidential" ? `zcs_${randomToken(32)}` : null;
  const db = database();
  await db.batch([
    db.prepare(
      `INSERT INTO oauth_provider_clients
       (client_id, owner_email, name, description, website_url, client_type, client_secret_hash, allowed_scopes,
        review_status, write_access_approved)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unverified', 0)`,
    ).bind(clientId, ownerEmail, name, description, websiteUrl, clientType, clientSecret ? await hashToken(clientSecret) : null, canonicalScopes(requestedScopes)),
    ...redirectUris.map((redirectUri) => db.prepare(
      `INSERT INTO oauth_provider_redirect_uris (client_id, redirect_uri) VALUES (?, ?)`,
    ).bind(clientId, redirectUri)),
  ]);
  return {
    clientId,
    clientSecret,
    name,
    clientType,
    allowedScopes: canonicalScopes(requestedScopes),
    redirectUris,
    reviewStatus: "unverified",
    writeAccessApproved: false,
  };
}

function dynamicClientName(value: unknown) {
  if (value !== undefined && typeof value !== "string") throw new OAuthProviderError("invalid_client_metadata", 400);
  const raw = typeof value === "string" ? value : "";
  const name = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().replace(/\s+/g, " ");
  const nameLength = [...name].length;
  if (value !== undefined && (nameLength < 1 || nameLength > 60)) throw new OAuthProviderError("invalid_client_metadata", 400);
  const visibleName = value === undefined ? "未命名 AI 客户端" : name;
  // MCP 客户端常把用户本地给服务器起的名字放进末尾括号(Claude Code 2.1.296 实测发
  // "Claude Code (zaochang)");括号内是用户自己的配置而非客户端自称身份,防冒充只看括号前的
  // 主名称。主名称为空(整名只有括号)时退回检查全名。同意页仍以「自称：」展示完整名称。
  const primaryName = visibleName.replace(/\s*[（(][^（）()]*[)）]\s*$/u, "").trim() || visibleName;
  const identity = primaryName.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
  if (["造场", "zaochang", "aetherstudio", "官方", "official", "admin", "管理员"].some((term) => identity.includes(term))) {
    throw new OAuthProviderError("invalid_client_metadata", 400, "应用名称不能冒充造场官方、管理员或平台名称。");
  }
  return visibleName;
}

function dynamicRedirectUri(value: unknown) {
  if (typeof value !== "string" || !value || value !== value.trim()) throw new OAuthProviderError("invalid_client_metadata", 400, "回调地址必须是 HTTPS 或精确的本机 HTTP 地址。");
  const raw = value;
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new OAuthProviderError("invalid_client_metadata", 400, "回调地址格式无效。"); }
  const local = isLoopbackHttpRedirect(raw)
    && loopbackRedirectAllowed({ appEnv: runtimeValues().APP_ENV, registrationSource: "dynamic", purpose: "authorization" });
  if ((parsed.protocol !== "https:" && !local) || parsed.username || parsed.password || parsed.hash) {
    throw new OAuthProviderError("invalid_client_metadata", 400, "只允许 HTTPS 或 localhost、127.0.0.1、[::1] 的 HTTP 回调地址。");
  }
  return raw;
}

function dynamicMetadataArray(value: unknown, fallback: string[], allowed: readonly string[], field: string) {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !allowed.includes(item))) {
    throw new OAuthProviderError("invalid_client_metadata", 400, `${field} 包含不支持的值。`);
  }
  return [...new Set(value as string[])];
}

export async function registerDynamicOAuthClient(input: Record<string, unknown>) {
  const redirectInput = input.redirect_uris;
  if (!Array.isArray(redirectInput) || redirectInput.length < 1 || redirectInput.length > 5) {
    throw new OAuthProviderError("invalid_client_metadata", 400, "redirect_uris 必须包含 1 到 5 个地址。");
  }
  const redirectUris = [...new Set(redirectInput.map(dynamicRedirectUri))];
  const authMethod = input.token_endpoint_auth_method === undefined ? "none" : input.token_endpoint_auth_method;
  if (authMethod !== "none" || Object.prototype.hasOwnProperty.call(input, "client_secret")) {
    throw new OAuthProviderError("invalid_client_metadata", 400, "动态注册只支持 token_endpoint_auth_method=none。");
  }
  const grantTypes = dynamicMetadataArray(input.grant_types, ["authorization_code", "refresh_token"], ["authorization_code", "refresh_token"], "grant_types");
  if (!grantTypes.includes("authorization_code")) throw new OAuthProviderError("invalid_client_metadata", 400, "动态客户端必须支持 authorization_code。");
  const responseTypes = dynamicMetadataArray(input.response_types, ["code"], ["code"], "response_types");
  // RFC 7591 的 scope 可选;Codex CLI 0.162 等客户端会发空字符串,视同未提供,取默认 mcp:projects。
  const scopeText = input.scope === undefined || input.scope === null ? "" : String(input.scope).trim();
  const requestedScopes = scopeText === "" ? [MCP_PROJECT_SCOPE] : scopeText.split(/\s+/).filter(Boolean);
  if (!requestedScopes.length || requestedScopes.some((scope) => scope !== "openid" && scope !== MCP_PROJECT_SCOPE)
    || !requestedScopes.includes(MCP_PROJECT_SCOPE)) {
    throw new OAuthProviderError("invalid_client_metadata", 400, "动态客户端只能申请 mcp:projects，可选附加 openid。");
  }
  const scopes = parseScopes(requestedScopes.join(" "));
  const name = dynamicClientName(input.client_name);
  const db = database();
  const capacity = await db.prepare(
    `SELECT COUNT(*) AS count FROM oauth_provider_clients c
     WHERE c.registration_source = 'dynamic' AND c.created_at >= datetime('now', '-7 days')
       AND NOT EXISTS (SELECT 1 FROM oauth_provider_consents x WHERE x.client_id = c.client_id)
       AND NOT EXISTS (SELECT 1 FROM oauth_provider_access_tokens x WHERE x.client_id = c.client_id)
       AND NOT EXISTS (SELECT 1 FROM oauth_provider_refresh_tokens x WHERE x.client_id = c.client_id)`,
  ).first<{ count: number }>();
  if (Number(capacity?.count ?? 0) >= 2000) throw new OAuthProviderError("registration_capacity_exceeded", 429);

  const clientId = `zc_${randomToken(18)}`;
  const allowedGrants = ["authorization_code", "refresh_token"].filter((grant) => grantTypes.includes(grant)).join(" ");
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO oauth_provider_clients
         (client_id, owner_email, name, description, website_url, client_type, client_secret_hash,
          allowed_scopes, status, review_status, write_access_approved, registration_source, allowed_grants)
         VALUES (?, NULL, ?, '', '', 'public', NULL, ?, 'active', 'unverified', 0, 'dynamic', ?)`,
      ).bind(clientId, name, canonicalScopes(scopes), allowedGrants),
      ...redirectUris.map((redirectUri) => db.prepare(
        `INSERT INTO oauth_provider_redirect_uris (client_id, redirect_uri) VALUES (?, ?)`,
      ).bind(clientId, redirectUri)),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("registration_capacity_exceeded")) {
      throw new OAuthProviderError("registration_capacity_exceeded", 429);
    }
    throw error;
  }
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: name,
    redirect_uris: redirectUris,
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: "none",
    scope: canonicalScopes(scopes),
  };
}

export async function updateDeveloperClient(ownerEmail: string, clientId: string, action: string) {
  const db = database();
  const owned = await db.prepare(
    `SELECT client_type AS clientType FROM oauth_provider_clients WHERE client_id = ? AND owner_email = ?`,
  ).bind(clientId, ownerEmail).first<{ clientType: string }>();
  if (!owned) throw new OAuthProviderError("client_not_found", 404);
  if (action === "revoke") {
    await db.batch([
      db.prepare(`UPDATE oauth_provider_clients SET status = 'revoked', updated_at = CURRENT_TIMESTAMP WHERE client_id = ? AND owner_email = ?`).bind(clientId, ownerEmail),
      db.prepare(`UPDATE oauth_provider_access_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE client_id = ? AND revoked_at IS NULL`).bind(clientId),
      db.prepare(`UPDATE oauth_provider_refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE client_id = ? AND revoked_at IS NULL`).bind(clientId),
      db.prepare(`UPDATE oauth_provider_consents SET revoked_at = CURRENT_TIMESTAMP WHERE client_id = ? AND revoked_at IS NULL`).bind(clientId),
      db.prepare(`UPDATE external_fruit_payments SET status = 'cancelled', approval_challenge_hash = NULL WHERE client_id = ? AND status = 'pending'`).bind(clientId),
    ]);
    return { revoked: true };
  }
  if (action === "rotate_secret" && owned.clientType === "confidential") {
    const clientSecret = `zcs_${randomToken(32)}`;
    await db.prepare(
      `UPDATE oauth_provider_clients SET client_secret_hash = ?, updated_at = CURRENT_TIMESTAMP
       WHERE client_id = ? AND owner_email = ? AND status = 'active'`,
    ).bind(await hashToken(clientSecret), clientId, ownerEmail).run();
    return { clientSecret };
  }
  throw new OAuthProviderError("invalid_client_action", 400);
}

export async function listUserConsents(userEmail: string) {
  const rows = await database().prepare(
    `SELECT c.client_id AS clientId, c.name, NULLIF(c.website_url, '') AS websiteUrl,
            c.registration_source AS registrationSource,
            x.scope, x.granted_at AS grantedAt
     FROM oauth_provider_consents x JOIN oauth_provider_clients c ON c.client_id = x.client_id
     WHERE x.user_email = ? AND x.revoked_at IS NULL AND c.status = 'active'
     ORDER BY x.granted_at DESC`,
  ).bind(userEmail).all<{ clientId: string; name: string; websiteUrl: string | null; registrationSource: "developer" | "dynamic"; scope: string; grantedAt: string }>();
  return rows.results;
}

export async function revokeUserConsent(userEmail: string, clientId: string) {
  const db = database();
  const consent = await db.prepare(
    `SELECT 1 AS found FROM oauth_provider_consents
     WHERE client_id = ? AND user_email = ? AND revoked_at IS NULL`,
  ).bind(clientId, userEmail).first<{ found: number }>();
  if (!consent) throw new OAuthProviderError("consent_not_found", 404);
  await db.batch(consentRevocationStatements(userEmail, clientId));
  return { revoked: true };
}

// 会员封禁与用户主动撤销同意共用这组更新语句:撤销 consent 会即时吊销该用户
// 对应的 access/refresh token,并取消尚未确认的果子支付。调用方可将这些语句并入
// 更大的 D1 batch,保证封禁和 OAuth 凭证撤销处于同一事务。
export function consentRevocationStatements(userEmail: string, clientId?: string) {
  const scoped = clientId !== undefined;
  const consentFilter = scoped ? "client_id = ? AND user_email = ?" : "user_email = ?";
  const binds = scoped ? [clientId, userEmail] : [userEmail];
  const paymentFilter = scoped
    ? "client_id = ? AND payer_email = ?"
    : "payer_email = ? AND client_id IN (SELECT client_id FROM oauth_provider_consents WHERE user_email = ?)";
  const paymentBinds = scoped ? [clientId, userEmail] : [userEmail, userEmail];
  return [
    database().prepare(`UPDATE oauth_provider_consents SET revoked_at = CURRENT_TIMESTAMP WHERE ${consentFilter} AND revoked_at IS NULL`).bind(...binds),
    database().prepare(`UPDATE oauth_provider_access_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE ${consentFilter} AND revoked_at IS NULL`).bind(...binds),
    database().prepare(`UPDATE oauth_provider_refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE ${consentFilter} AND revoked_at IS NULL`).bind(...binds),
    database().prepare(`UPDATE external_fruit_payments SET status = 'cancelled', approval_challenge_hash = NULL WHERE ${paymentFilter} AND status = 'pending'`).bind(...paymentBinds),
  ];
}

export async function createAuthorizationRequest(url: URL, userEmail: string) {
  const clientId = url.searchParams.get("client_id") ?? "";
  const client = await clientById(clientId);
  if (!client || client.status !== "active") throw new OAuthProviderError("invalid_client", 400);
  if (url.searchParams.get("response_type") !== "code") throw new OAuthProviderError("unsupported_response_type", 400);
  const redirectUri = url.searchParams.get("redirect_uri") ?? "";
  if (!await redirectRegistered(clientId, redirectUri)) throw new OAuthProviderError("invalid_redirect_uri", 400);
  const state = url.searchParams.get("state") ?? "";
  if (!isValidState(state)) throw new OAuthProviderError("invalid_request", 400, "state 缺失或格式无效。");
  const nonce = url.searchParams.get("nonce");
  if (nonce && !isValidState(nonce)) throw new OAuthProviderError("invalid_request", 400, "nonce 格式无效。");
  const challenge = url.searchParams.get("code_challenge") ?? "";
  if (url.searchParams.get("code_challenge_method") !== "S256" || !isValidPkce(challenge)) {
    throw new OAuthProviderError("invalid_request", 400, "必须使用 PKCE S256。");
  }
  const requestedScope = (url.searchParams.get("scope") ?? "").trim();
  // 动态客户端只为 MCP 注册;授权请求不带 scope 时按 RFC 6749 §3.3 取其默认 mcp:projects。
  // 开发者客户端仍必须显式给出 scope(且须含 openid),行为不变。
  const scopes = parseScopes(requestedScope === "" && client.registrationSource === "dynamic" ? MCP_PROJECT_SCOPE : requestedScope);
  const isMcp = scopes.includes(MCP_PROJECT_SCOPE);
  if (!isMcp && !scopes.includes("openid")) throw new OAuthProviderError("invalid_scope", 400, "登录请求必须包含 openid。");
  const resources = url.searchParams.getAll("resource");
  if (resources.length > 1) throw new OAuthProviderError("invalid_target", 400);
  const origin = publicAppOrigin(new Request(url));
  const expectedMcpResource = `${origin}${MCP_RESOURCE_PATH}`;
  let resource: string | null = null;
  if (isMcp) {
    if (resources.length && resources[0] !== expectedMcpResource) throw new OAuthProviderError("invalid_target", 400);
    resource = expectedMcpResource;
  } else if (resources.length) {
    throw new OAuthProviderError("invalid_target", 400);
  }
  if (client.clientType === "public" && scopes.some((scope) => WRITE_SCOPES.has(scope))) {
    throw new OAuthProviderError("invalid_scope", 400, "公开客户端不能请求果子写权限。");
  }
  if (!clientAllowsScopes(client, scopes)) {
    throw new OAuthProviderError("unauthorized_client", 403, "果子写权限需要完成应用验证与人工审核。");
  }

  const requestToken = randomToken(32);
  await database().prepare(
    `INSERT INTO oauth_provider_authorization_requests
     (request_hash, client_id, user_email, redirect_uri, scope, state, nonce, code_challenge, resource, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(await hashToken(requestToken), clientId, userEmail, redirectUri, canonicalScopes(scopes), state, nonce, challenge, resource, expiresIn(AUTHORIZATION_REQUEST_SECONDS)).run();
  return { requestToken, client, scopes, redirectUri, resource };
}

function oauthRedirect(redirectUri: string, params: Record<string, string>) {
  const target = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  return target.toString();
}

export async function decideAuthorization(userEmail: string, requestToken: string, decision: string) {
  const db = database();
  const requestHash = await hashToken(requestToken);
  const pending = await db.prepare(
    `SELECT request_hash AS requestHash, client_id AS clientId, user_email AS userEmail,
            redirect_uri AS redirectUri, scope, state, nonce,
            code_challenge AS codeChallenge, resource, expires_at AS expiresAt, used_at AS usedAt
     FROM oauth_provider_authorization_requests WHERE request_hash = ?`,
  ).bind(requestHash).first<AuthorizationRequestRow>();
  if (!pending || pending.userEmail !== userEmail || pending.usedAt || Date.parse(`${pending.expiresAt}Z`) <= Date.now()) {
    throw new OAuthProviderError("invalid_request", 400, "授权请求已失效。");
  }
  if (decision !== "allow") {
    await db.prepare(
      `UPDATE oauth_provider_authorization_requests SET used_at = CURRENT_TIMESTAMP
       WHERE request_hash = ? AND used_at IS NULL`,
    ).bind(requestHash).run();
    return oauthRedirect(pending.redirectUri, { error: "access_denied", state: pending.state });
  }

  const client = await clientById(pending.clientId);
  const pendingScopes = parseScopes(pending.scope);
  if (!client || !clientAllowsScopes(client, pendingScopes)) {
    await db.prepare(
      `UPDATE oauth_provider_authorization_requests SET used_at = CURRENT_TIMESTAMP
       WHERE request_hash = ? AND used_at IS NULL`,
    ).bind(requestHash).run();
    throw new OAuthProviderError("unauthorized_client", 403, "应用状态或授权范围已经改变，请重新发起授权。");
  }

  if (client.registrationSource === "dynamic") {
    const previous = await db.prepare(
      `SELECT 1 AS found FROM oauth_provider_consents WHERE client_id = ? AND user_email = ? AND revoked_at IS NULL`,
    ).bind(pending.clientId, userEmail).first<{ found: number }>();
    if (!previous) {
      const activeCount = await db.prepare(
        `SELECT COUNT(*) AS count FROM oauth_provider_consents x
         JOIN oauth_provider_clients c ON c.client_id = x.client_id
         WHERE x.user_email = ? AND x.revoked_at IS NULL
           AND c.registration_source = 'dynamic' AND c.status = 'active'`,
      ).bind(userEmail).first<{ count: number }>();
      if (Number(activeCount?.count ?? 0) >= 10) {
        throw new OAuthProviderError("dynamic_authorization_limit", 403, "每位会员最多同时授权 10 个自动注册客户端。请先到开发者接入中心的「已授权应用」撤销一个旧授权，再重试。");
      }
    }
  }

  await subjectFor(pending.clientId, userEmail);
  const code = `zcc_${randomToken(32)}`;
  const codeHash = await hashToken(code);
  try {
    await db.batch([
      db.prepare(
        `UPDATE oauth_provider_authorization_requests SET used_at = CURRENT_TIMESTAMP
         WHERE request_hash = ? AND used_at IS NULL`,
      ).bind(requestHash),
      db.prepare(
        `INSERT INTO oauth_provider_authorization_codes
         (code_hash, request_hash, client_id, user_email, redirect_uri, scope, nonce, code_challenge, resource, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(codeHash, requestHash, pending.clientId, userEmail, pending.redirectUri, pending.scope, pending.nonce, pending.codeChallenge, pending.resource, expiresIn(AUTHORIZATION_CODE_SECONDS)),
      db.prepare(
        `INSERT INTO oauth_provider_consents (client_id, user_email, scope, revoked_at)
         VALUES (?, ?, ?, NULL)
         ON CONFLICT(client_id, user_email) DO UPDATE SET scope = excluded.scope,
           granted_at = CURRENT_TIMESTAMP, revoked_at = NULL`,
      ).bind(pending.clientId, userEmail, pending.scope),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("dynamic_authorization_limit")) {
      throw new OAuthProviderError("dynamic_authorization_limit", 403, "每位会员最多同时授权 10 个自动注册客户端。请先到开发者接入中心的「已授权应用」撤销一个旧授权，再重试。");
    }
    throw new OAuthProviderError("invalid_request", 400, "授权请求已经使用。");
  }
  return oauthRedirect(pending.redirectUri, { code, state: pending.state });
}

function decodeBasic(value: string | null) {
  if (!value?.startsWith("Basic ")) return null;
  try {
    const decoded = atob(value.slice(6));
    const split = decoded.indexOf(":");
    if (split < 1) return null;
    return { clientId: decodeURIComponent(decoded.slice(0, split)), clientSecret: decodeURIComponent(decoded.slice(split + 1)) };
  } catch {
    return null;
  }
}

async function authenticateTokenClient(request: Request, params: URLSearchParams) {
  const basic = decodeBasic(request.headers.get("authorization"));
  const clientId = basic?.clientId ?? params.get("client_id") ?? "";
  const client = await clientById(clientId);
  if (!client || client.status !== "active" || client.reviewStatus === "rejected") throw new OAuthProviderError("invalid_client", 401);
  if (client.clientType === "confidential") {
    const secret = basic?.clientSecret ?? params.get("client_secret") ?? "";
    if (!secret || !client.clientSecretHash || await hashToken(secret) !== client.clientSecretHash) {
      throw new OAuthProviderError("invalid_client", 401);
    }
  } else if (basic?.clientSecret || params.get("client_secret")) {
    throw new OAuthProviderError("invalid_client", 401);
  }
  return client;
}

async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

type SigningKeyRow = { kid: string; privateJwk: string; publicJwk: string };

async function activeSigningKey() {
  const values = runtimeValues();
  if (values.OIDC_SIGNING_PRIVATE_JWK) {
    try {
      const privateJwk = JSON.parse(values.OIDC_SIGNING_PRIVATE_JWK) as JWK;
      const kid = String(privateJwk.kid ?? values.OIDC_SIGNING_KEY_ID ?? "");
      if (privateJwk.kty !== "EC" || privateJwk.crv !== "P-256" || !privateJwk.d || !privateJwk.x || !privateJwk.y || !kid) {
        throw new Error("invalid signing key");
      }
      const publicJwk = { kty: privateJwk.kty, crv: privateJwk.crv, x: privateJwk.x, y: privateJwk.y, alg: "ES256", use: "sig", kid };
      return { kid, privateJwk: JSON.stringify({ ...privateJwk, alg: "ES256", use: "sig", kid }), publicJwk: JSON.stringify(publicJwk) };
    } catch {
      throw new OAuthProviderError("server_error", 500, "OIDC 签名密钥配置无效。");
    }
  }
  if (values.APP_ENV !== "development" && values.APP_ENV !== "test") {
    throw new OAuthProviderError("server_error", 500, "生产环境缺少 OIDC 签名密钥。");
  }
  const db = database();
  const existing = await db.prepare(
    `SELECT kid, private_jwk AS privateJwk, public_jwk AS publicJwk
     FROM oauth_provider_signing_keys WHERE status = 'active'`,
  ).first<SigningKeyRow>();
  if (existing) return existing;
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const kid = `zck_${randomToken(12)}`;
  const privateJwk = { ...await exportJWK(pair.privateKey), alg: "ES256", use: "sig", kid };
  const publicJwk = { ...await exportJWK(pair.publicKey), alg: "ES256", use: "sig", kid };
  try {
    await db.prepare(
      `INSERT INTO oauth_provider_signing_keys (kid, private_jwk, public_jwk) VALUES (?, ?, ?)`,
    ).bind(kid, JSON.stringify(privateJwk), JSON.stringify(publicJwk)).run();
  } catch {
    const winner = await db.prepare(
      `SELECT kid, private_jwk AS privateJwk, public_jwk AS publicJwk
       FROM oauth_provider_signing_keys WHERE status = 'active'`,
    ).first<SigningKeyRow>();
    if (winner) return winner;
    throw new OAuthProviderError("server_error", 500);
  }
  return { kid, privateJwk: JSON.stringify(privateJwk), publicJwk: JSON.stringify(publicJwk) };
}

export async function providerJwks() {
  const active = await activeSigningKey();
  const values = runtimeValues();
  if (values.OIDC_SIGNING_PRIVATE_JWK) {
    let previous: JWK[] = [];
    if (values.OIDC_PREVIOUS_PUBLIC_JWKS) {
      try {
        const parsed = JSON.parse(values.OIDC_PREVIOUS_PUBLIC_JWKS) as { keys?: JWK[] } | JWK[];
        previous = Array.isArray(parsed) ? parsed : parsed.keys ?? [];
      } catch {
        throw new OAuthProviderError("server_error", 500, "OIDC 历史公钥配置无效。");
      }
    }
    return { keys: [JSON.parse(active.publicJwk), ...previous.filter((key) => !key.d)] };
  }
  const rows = await database().prepare(
    `SELECT public_jwk AS publicJwk FROM oauth_provider_signing_keys
     WHERE status IN ('active', 'retired') ORDER BY created_at DESC`,
  ).all<{ publicJwk: string }>();
  if (!rows.results.length) return { keys: [JSON.parse(active.publicJwk)] };
  return { keys: rows.results.map((row) => JSON.parse(row.publicJwk)) };
}

async function signIdToken(origin: string, clientId: string, userEmail: string, scope: string, nonce: string | null) {
  const [keyRow, member, subject] = await Promise.all([
    activeSigningKey(),
    database().prepare(`SELECT display_name AS displayName FROM members WHERE email = ?`).bind(userEmail).first<{ displayName: string }>(),
    subjectFor(clientId, userEmail),
  ]);
  if (!member) throw new OAuthProviderError("server_error", 500);
  const key = await importJWK(JSON.parse(keyRow.privateJwk) as JWK, "ES256");
  const scopes = new Set(scope.split(" "));
  const claims: Record<string, unknown> = {};
  if (scopes.has("profile")) claims.name = member.displayName;
  if (scopes.has("email")) {
    claims.email = userEmail;
    claims.email_verified = true;
  }
  if (nonce) claims.nonce = nonce;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: keyRow.kid, typ: "JWT" })
    .setIssuer(origin)
    .setAudience(clientId)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime("1h")
    .setJti(randomToken(16))
    .sign(key);
}

async function issueTokens(origin: string, client: ClientRow, userEmail: string, scope: string, nonce: string | null, source: { codeHash?: string; refreshHash?: string; refreshFamilyId?: string; resource: string | null }) {
  const currentClient = await clientById(client.clientId);
  const tokenScopes = parseScopes(scope);
  if (!currentClient || !clientAllowsScopes(currentClient, tokenScopes)) throw new OAuthProviderError("unauthorized_client", 403);
  client = currentClient;
  const accessToken = `zca_${randomToken(32)}`;
  const mayRefresh = client.allowedGrants.split(/\s+/).includes("refresh_token");
  const refreshToken = mayRefresh ? `zcr_${randomToken(48)}` : null;
  const accessHash = await hashToken(accessToken);
  const refreshHash = refreshToken ? await hashToken(refreshToken) : null;
  const refreshFamilyId = source.refreshFamilyId ?? `zcf_${randomToken(24)}`;
  const idToken = scope.split(/\s+/).includes("openid")
    ? await signIdToken(origin, client.clientId, userEmail, scope, nonce)
    : null;
  const db = database();
  const statements = [
    db.prepare(
      `INSERT INTO oauth_provider_access_tokens
       (token_hash, client_id, user_email, scope, authorization_code_hash, refresh_parent_hash, family_id, resource, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(accessHash, client.clientId, userEmail, scope, source.codeHash ?? null, source.refreshHash ?? null, refreshFamilyId, source.resource, expiresIn(ACCESS_TOKEN_SECONDS)),
  ];
  if (refreshToken && refreshHash) statements.push(db.prepare(
    `INSERT INTO oauth_provider_refresh_tokens
     (token_hash, client_id, user_email, scope, family_id, resource, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(refreshHash, client.clientId, userEmail, scope, refreshFamilyId, source.resource, expiresIn(REFRESH_TOKEN_SECONDS)));
  if (source.codeHash) {
    statements.unshift(db.prepare(
      `UPDATE oauth_provider_authorization_codes SET used_at = CURRENT_TIMESTAMP
       WHERE code_hash = ? AND used_at IS NULL`,
    ).bind(source.codeHash));
  }
  if (source.refreshHash) {
    if (!refreshHash) throw new OAuthProviderError("unauthorized_client", 403);
    statements.unshift(db.prepare(
      `UPDATE oauth_provider_refresh_tokens SET revoked_at = CURRENT_TIMESTAMP, replaced_by_hash = ?
       WHERE token_hash = ? AND revoked_at IS NULL`,
    ).bind(refreshHash, source.refreshHash));
  }
  await db.batch(statements);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_SECONDS,
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
    scope,
    ...(idToken ? { id_token: idToken } : {}),
  };
}

export async function exchangeToken(request: Request, params: URLSearchParams) {
  const client = await authenticateTokenClient(request, params);
  const origin = publicAppOrigin(request);
  const grantType = params.get("grant_type");
  const suppliedResources = params.getAll("resource");
  if (suppliedResources.length > 1) throw new OAuthProviderError("invalid_target", 400);
  if (grantType === "authorization_code") {
    if (!client.allowedGrants.split(/\s+/).includes("authorization_code")) throw new OAuthProviderError("unauthorized_client", 400);
    const code = params.get("code") ?? "";
    const verifier = params.get("code_verifier") ?? "";
    const redirectUri = params.get("redirect_uri") ?? "";
    if (!code.startsWith("zcc_") || !isValidPkce(verifier)) throw new OAuthProviderError("invalid_grant", 400);
    const codeHash = await hashToken(code);
    const row = await database().prepare(
      `SELECT code_hash AS codeHash, client_id AS clientId, user_email AS userEmail,
              redirect_uri AS redirectUri, scope, nonce, code_challenge AS codeChallenge,
              resource, expires_at AS expiresAt, used_at AS usedAt
       FROM oauth_provider_authorization_codes WHERE code_hash = ?`,
    ).bind(codeHash).first<AuthorizationCodeRow>();
    if (!row || row.clientId !== client.clientId || row.redirectUri !== redirectUri || Date.parse(`${row.expiresAt}Z`) <= Date.now()) {
      throw new OAuthProviderError("invalid_grant", 400);
    }
    if (suppliedResources.length && suppliedResources[0] !== row.resource) throw new OAuthProviderError("invalid_target", 400);
    if (row.usedAt) {
      /* RFC 6749 §4.1.2(SHOULD,审计 L3):授权码重放说明码可能被窃,该码换出的
       * 令牌族(access+refresh)必须连坐吊销——原实现只回 invalid_grant,已签发
       * 令牌继续可用。 */
      const family = await database().prepare(
        `SELECT family_id AS familyId FROM oauth_provider_access_tokens
         WHERE authorization_code_hash = ? AND family_id IS NOT NULL LIMIT 1`,
      ).bind(codeHash).first<{ familyId: string }>();
      if (family) {
        const db = database();
        await db.batch([
          db.prepare(`UPDATE oauth_provider_access_tokens SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE family_id = ?`).bind(family.familyId),
          db.prepare(`UPDATE oauth_provider_refresh_tokens SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE family_id = ?`).bind(family.familyId),
        ]);
      }
      throw new OAuthProviderError("invalid_grant", 400);
    }
    if (!clientAllowsScopes(client, parseScopes(row.scope))) throw new OAuthProviderError("unauthorized_client", 403);
    if (await pkceChallenge(verifier) !== row.codeChallenge) throw new OAuthProviderError("invalid_grant", 400);
    try {
      return await issueTokens(origin, client, row.userEmail, row.scope, row.nonce, { codeHash, resource: row.resource });
    } catch (error) {
      if (error instanceof OAuthProviderError) throw error;
      console.error("[oauth-provider] authorization_code issuance failed:", error);
      throw new OAuthProviderError("server_error", 500);
    }
  }
  if (grantType === "refresh_token") {
    if (!client.allowedGrants.split(/\s+/).includes("refresh_token")) throw new OAuthProviderError("unauthorized_client", 400);
    const raw = params.get("refresh_token") ?? "";
    const refreshHash = await hashToken(raw);
    const row = await database().prepare(
      `SELECT client_id AS clientId, user_email AS userEmail, scope, family_id AS familyId, resource,
              expires_at AS expiresAt, revoked_at AS revokedAt, replaced_by_hash AS replacedByHash
       FROM oauth_provider_refresh_tokens WHERE token_hash = ?`,
    ).bind(refreshHash).first<{ clientId: string; userEmail: string; scope: string; familyId: string; resource: string | null; expiresAt: string; revokedAt: string | null; replacedByHash: string | null }>();
    if (row?.clientId === client.clientId && row.revokedAt && row.replacedByHash) {
      const db = database();
      await db.batch([
        db.prepare(`UPDATE oauth_provider_refresh_tokens SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE family_id = ?`).bind(row.familyId),
        /* 谱系吊销按 family_id 直查(审计 L2):授权码直出的首枚 access token
         * refresh_parent_hash 为 NULL,按父 hash 反查会漏掉它——重放检测触发时
         * 全族 access 必须一起作废。 */
        db.prepare(
          `UPDATE oauth_provider_access_tokens SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
           WHERE family_id = ?`,
        ).bind(row.familyId),
      ]);
      throw new OAuthProviderError("invalid_grant", 400);
    }
    if (!row || row.clientId !== client.clientId || row.revokedAt || Date.parse(`${row.expiresAt}Z`) <= Date.now()) {
      throw new OAuthProviderError("invalid_grant", 400);
    }
    if (suppliedResources.length && suppliedResources[0] !== row.resource) throw new OAuthProviderError("invalid_target", 400);
    let scope = row.scope;
    if (params.get("scope")) {
      const requested = parseScopes(params.get("scope") ?? "");
      if (!hasScopes(row.scope, requested)) throw new OAuthProviderError("invalid_scope", 400);
      scope = canonicalScopes(requested);
    }
    if (!clientAllowsScopes(client, parseScopes(scope))) throw new OAuthProviderError("unauthorized_client", 403);
    try {
      return await issueTokens(origin, client, row.userEmail, scope, null, { refreshHash, refreshFamilyId: row.familyId, resource: row.resource });
    } catch (error) {
      if (error instanceof OAuthProviderError) throw error;
      console.error("[oauth-provider] refresh_token issuance failed:", error);
      throw new OAuthProviderError("server_error", 500);
    }
  }
  throw new OAuthProviderError("unsupported_grant_type", 400);
}

export async function revokeOAuthToken(request: Request, params: URLSearchParams) {
  const client = await authenticateTokenClient(request, params);
  const tokenHash = await hashToken(params.get("token") ?? "");
  const db = database();
  /* RFC 7009(审计 L4):撤销 refresh token 时,同家族的 access token 一并吊销——
   * 原实现只按精确 hash 命中,refresh 被撤后其族内 access 仍可继续用到过期。 */
  const refresh = await db.prepare(
    `SELECT family_id AS familyId FROM oauth_provider_refresh_tokens WHERE token_hash = ? AND client_id = ?`,
  ).bind(tokenHash, client.clientId).first<{ familyId: string }>();
  const statements = [
    db.prepare(`UPDATE oauth_provider_access_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND client_id = ?`).bind(tokenHash, client.clientId),
    db.prepare(`UPDATE oauth_provider_refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND client_id = ?`).bind(tokenHash, client.clientId),
  ];
  if (refresh?.familyId) {
    statements.push(
      db.prepare(`UPDATE oauth_provider_access_tokens SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE family_id = ?`).bind(refresh.familyId),
      db.prepare(`UPDATE oauth_provider_refresh_tokens SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE family_id = ?`).bind(refresh.familyId),
    );
  }
  await db.batch(statements);
}

export async function requireBearer(
  request: Request,
  required: OAuthScope[],
): Promise<Omit<TokenIdentity, "clientOwnerEmail"> & { clientOwnerEmail: string }> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new OAuthProviderError("invalid_token", 401);
  const tokenHash = await hashToken(authorization.slice(7));
  const row = await database().prepare(
    `SELECT t.token_hash AS tokenHash, t.client_id AS clientId, c.name AS clientName,
             c.owner_email AS clientOwnerEmail, t.user_email AS userEmail,
             m.display_name AS displayName, t.scope, s.subject,
             t.expires_at AS expiresAt, t.resource, c.allowed_scopes AS allowedScopes,
             c.status, c.review_status AS reviewStatus,
             c.write_access_approved AS writeAccessApproved,
             c.registration_source AS registrationSource
     FROM oauth_provider_access_tokens t
     JOIN oauth_provider_clients c ON c.client_id = t.client_id
     JOIN members m ON m.email = t.user_email
     JOIN oauth_provider_subjects s ON s.client_id = t.client_id AND s.user_email = t.user_email
     WHERE t.token_hash = ? AND t.revoked_at IS NULL AND t.expires_at > CURRENT_TIMESTAMP
       AND c.status = 'active' AND m.suspended_at IS NULL`,
  ).bind(tokenHash).first<TokenIdentity & Pick<ClientRow, "allowedScopes" | "status" | "reviewStatus" | "writeAccessApproved" | "registrationSource">>();
  if (!row) throw new OAuthProviderError("invalid_token", 401);
  const clientOwnerEmail = row.clientOwnerEmail;
  if (row.resource !== null || clientOwnerEmail === null) throw new OAuthProviderError("invalid_token", 401);
  if (!hasScopes(row.scope, required)) throw new OAuthProviderError("insufficient_scope", 403);
  if (!clientAllowsScopes(row, required)) throw new OAuthProviderError("invalid_token", 401);
  return { ...row, clientOwnerEmail };
}

export async function requireMcpOAuthBearer(request: Request): Promise<OAuthMcpIdentity> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new OAuthProviderError("invalid_token", 401);
  const token = authorization.slice(7);
  if (!/^zca_[A-Za-z0-9_-]{43}$/.test(token)) throw new OAuthProviderError("invalid_token", 401);
  const tokenHash = await hashToken(token);
  const row = await database().prepare(
    `SELECT t.client_id AS clientId, t.user_email AS userEmail, t.scope, t.resource,
            m.display_name AS displayName, c.allowed_scopes AS allowedScopes,
            c.status, c.review_status AS reviewStatus,
            c.write_access_approved AS writeAccessApproved,
            c.registration_source AS registrationSource
     FROM oauth_provider_access_tokens t
     JOIN oauth_provider_clients c ON c.client_id = t.client_id
     JOIN members m ON m.email = t.user_email
     WHERE t.token_hash = ? AND t.revoked_at IS NULL AND t.expires_at > CURRENT_TIMESTAMP
       AND c.status = 'active' AND m.suspended_at IS NULL`,
  ).bind(tokenHash).first<Pick<ClientRow, "allowedScopes" | "status" | "reviewStatus" | "writeAccessApproved" | "registrationSource"> & {
    clientId: string; userEmail: string; scope: string; resource: string | null; displayName: string;
  }>();
  if (!row) throw new OAuthProviderError("invalid_token", 401);
  const expectedResource = `${publicAppOrigin(request)}${MCP_RESOURCE_PATH}`;
  if (row.resource !== expectedResource) throw new OAuthProviderError("invalid_token", 401);
  if (!hasScopes(row.scope, [MCP_PROJECT_SCOPE])) throw new OAuthProviderError("insufficient_scope", 403);
  if (!clientAllowsScopes(row, [MCP_PROJECT_SCOPE])) throw new OAuthProviderError("invalid_token", 401);
  return {
    email: row.userEmail,
    displayName: row.displayName,
    fullName: row.displayName,
    initial: (row.displayName.trim()[0] || row.userEmail[0] || "造").toUpperCase(),
    authVia: "oauth",
    clientId: row.clientId,
    isAdmin: false,
    isFounder: false,
    isAgent: false,
  };
}

export function oauthJsonError(error: unknown) {
  let current = error instanceof OAuthProviderError ? error : null;
  // requireMember 的未登录错误必须映射 401(与 /api/oauth/token 等一致),不能落
  // server_error 500——否则每次匿名探测都被监控记成服务端故障(qa-runs P-005)。
  if (!current && error instanceof AuthRequiredError) {
    current = new OAuthProviderError("auth_required", 401);
  }
  // M4(2026-10 审计):v1 读端点补限流后,RateLimitError 若落进 server_error 500,
  // 第三方客户端会把它当服务端故障重试,放大而非退避。
  const rateLimited = !current && error instanceof RateLimitError ? error : null;
  if (rateLimited) {
    current = new OAuthProviderError(rateLimited.code, 429);
  }
  if (!current) current = new OAuthProviderError("server_error", 500);
  return Response.json(
    { error: current.code, ...(current.description ? { error_description: current.description } : {}) },
    {
      status: current.status,
      headers: {
        "cache-control": "no-store",
        pragma: "no-cache",
        ...(current.status === 401 ? { "www-authenticate": `Bearer error="${current.code}"` } : {}),
        ...(rateLimited?.retryAfterSeconds ? { "retry-after": String(Math.floor(rateLimited.retryAfterSeconds)) } : {}),
        "access-control-allow-origin": "*",
      },
    },
  );
}

export function oauthCorsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, idempotency-key",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "cache-control": "no-store",
  };
}

export function publicTokenIdentity(identity: TokenIdentity) {
  const scopes = new Set(identity.scope.split(" "));
  return {
    sub: identity.subject,
    ...(scopes.has("profile") ? { name: identity.displayName } : {}),
    ...(scopes.has("email") ? { email: identity.userEmail, email_verified: true } : {}),
  };
}

// OIDC 发现文档与过期数据清理注册已分别抽离到 oauth-discovery.ts 与
// purge/oauth-provider.ts:worker 不再需要为这两件事加载本模块(签名/DB 状态机)。
