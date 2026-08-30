// OIDC 发现文档(worker 入口的 /.well-known/openid-configuration 响应体)。
// 从 oauth-provider 抽出的轻量模块:worker 为这一个 JSON 不再需要加载完整的
// OAuth provider(jose 签名/DB 状态机)。issuer 随部署 origin 注入;字段集与
// RFC 8414 惯例一致,勿随意增删——第三方应用依赖此处的 endpoint 清单与
// scope/claim 白名单。
export function oidcDiscoveryDocument(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    userinfo_endpoint: `${origin}/api/oauth/userinfo`,
    jwks_uri: `${origin}/api/oauth/jwks`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    subject_types_supported: ["pairwise"],
    id_token_signing_alg_values_supported: ["ES256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["openid", "profile", "email", "fruit:balance", "fruit:pay", "fruit:refund"],
    claims_supported: ["sub", "name", "email", "email_verified"],
  };
}
