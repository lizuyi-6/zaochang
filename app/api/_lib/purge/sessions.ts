// 会话域的过期数据清理注册:过期 auth_sessions 行。旧 Cookie 重放不受影响
// (查表时 expires_at 条件已挡)。纯 D1 工厂,不加载会话/Next headers 层。
export function sessionPurgeStatements(db: D1Database) {
  return [
    { label: "sessions.auth_sessions", statement: db.prepare(`DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP`) },
  ];
}
