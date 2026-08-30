// OAuth provider 域的过期数据清理注册。纯 D1 工厂:不加载 provider 状态机、
// jose 密钥处理或 Next 适配层,worker cron 与契约测试共用同一份 SQL。
// 全部为幂等 DELETE;漏跑一轮只影响存储增长,不影响正确性。
export function oauthProviderPurgeStatements(db: D1Database) {
  return [
    { label: "oauth.authorization_requests", statement: db.prepare(`DELETE FROM oauth_provider_authorization_requests WHERE expires_at <= CURRENT_TIMESTAMP`) },
    { label: "oauth.authorization_codes", statement: db.prepare(`DELETE FROM oauth_provider_authorization_codes WHERE expires_at <= CURRENT_TIMESTAMP`) },
    { label: "oauth.access_tokens", statement: db.prepare(`DELETE FROM oauth_provider_access_tokens WHERE expires_at <= CURRENT_TIMESTAMP AND revoked_at IS NULL`) },
    { label: "oauth.refresh_tokens", statement: db.prepare(`DELETE FROM oauth_provider_refresh_tokens WHERE expires_at <= CURRENT_TIMESTAMP AND revoked_at IS NULL AND replaced_by_hash IS NULL`) },
  ];
}
