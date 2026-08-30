// 邮箱验证码域的过期数据清理注册:过期或已消费的验证码行。
// 纯 D1 工厂,不加载验证码状态机/Turnstile/邮件发送。
export function emailCodePurgeStatements(db: D1Database) {
  return [
    { label: "email-codes.login_codes", statement: db.prepare(`DELETE FROM email_login_codes WHERE expires_at <= datetime('now', '-1 day') OR consumed_at IS NOT NULL`) },
  ];
}
