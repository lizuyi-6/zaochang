// 外部果子支付域的过期数据清理注册:终态且过期的支付行。
// 纯 D1 工厂,不加载支付状态机。
export function externalFruitPurgeStatements(db: D1Database) {
  return [
    { label: "external-fruit.payments", statement: db.prepare(`DELETE FROM external_fruit_payments WHERE status IN ('expired', 'cancelled') AND expires_at <= datetime('now', '-7 days')`) },
  ];
}
