// OAuth provider 域的过期数据清理注册。纯 D1 工厂:不加载 provider 状态机、
// jose 密钥处理或 Next 适配层,worker cron 与契约测试共用同一份 SQL。
// 全部为幂等 DELETE;漏跑一轮只影响存储增长,不影响正确性。
export function oauthProviderPurgeStatements(db: D1Database) {
  return [
    { label: "oauth.access_tokens", statement: db.prepare(`DELETE FROM oauth_provider_access_tokens WHERE expires_at <= CURRENT_TIMESTAMP`) },
    { label: "oauth.refresh_tokens", statement: db.prepare(`DELETE FROM oauth_provider_refresh_tokens WHERE expires_at <= CURRENT_TIMESTAMP`) },
    { label: "oauth.authorization_codes", statement: db.prepare(`DELETE FROM oauth_provider_authorization_codes WHERE expires_at <= CURRENT_TIMESTAMP OR EXISTS (SELECT 1 FROM oauth_provider_authorization_requests r WHERE r.request_hash = oauth_provider_authorization_codes.request_hash AND r.expires_at <= CURRENT_TIMESTAMP)`) },
    { label: "oauth.authorization_requests", statement: db.prepare(`DELETE FROM oauth_provider_authorization_requests WHERE expires_at <= CURRENT_TIMESTAMP`) },
    { label: "oauth.dynamic_clients", statement: db.prepare(`DELETE FROM oauth_provider_clients WHERE registration_source = 'dynamic' AND created_at <= datetime('now', '-7 days') AND NOT EXISTS (SELECT 1 FROM oauth_provider_consents x WHERE x.client_id = oauth_provider_clients.client_id) AND NOT EXISTS (SELECT 1 FROM oauth_provider_access_tokens x WHERE x.client_id = oauth_provider_clients.client_id) AND NOT EXISTS (SELECT 1 FROM oauth_provider_refresh_tokens x WHERE x.client_id = oauth_provider_clients.client_id)`) },
    { label: "mcp.write_audit", statement: db.prepare(`DELETE FROM mcp_write_audit WHERE created_at <= datetime('now', '-90 days')`) },
    { label: "api-keys.expired-or-revoked", statement: db.prepare(`DELETE FROM api_keys WHERE revoked_at IS NOT NULL OR expires_at <= datetime('now', '-90 days')`) },
  ];
}
