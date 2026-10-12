export const MCP_RESOURCE_PATH = "/api/mcp";
export const MCP_PROJECT_SCOPE = "mcp:projects";

export function mcpResourceMetadata(origin: string) {
  const normalizedOrigin = new URL(origin).origin;
  return {
    resource: `${normalizedOrigin}${MCP_RESOURCE_PATH}`,
    authorization_servers: [normalizedOrigin],
    scopes_supported: [MCP_PROJECT_SCOPE],
    bearer_methods_supported: ["header"],
  };
}

export function oauthAuthorizationServerMetadata(origin: string) {
  const normalizedOrigin = new URL(origin).origin;
  return {
    issuer: normalizedOrigin,
    authorization_endpoint: `${normalizedOrigin}/oauth/authorize`,
    token_endpoint: `${normalizedOrigin}/api/oauth/token`,
    registration_endpoint: `${normalizedOrigin}/api/oauth/register`,
    revocation_endpoint: `${normalizedOrigin}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
    // RFC 8414 允许只公布部分 scope。此文档是 MCP 客户端的发现入口:Codex CLI 0.162 会把这里的
    // scopes_supported 原样拿去动态注册,公布果子/邮箱 scope 会让注册被(正确地)拒绝。完整列表仍在
    // /.well-known/openid-configuration,开发者 OIDC 客户端不受影响。
    scopes_supported: [MCP_PROJECT_SCOPE],
  };
}
