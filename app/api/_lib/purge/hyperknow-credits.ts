// 见界积分流水只保留 90 天;删除守卫与注册的条件使用同一 UTC 窗口。
export function hyperknowCreditPurgeStatements(db: D1Database) {
  return [
    {
      label: "hyperknow.credit_events",
      statement: db.prepare(`DELETE FROM hk_credit_events WHERE created_at <= datetime('now', '-90 days')`),
    },
  ];
}
