// 托管域过期记录清理。故障状态迁移遵守 0032 的数据库状态机约束。
export function hostingPurgeStatements(db: D1Database) {
  return [
    {
      label: "hosting.upload_tokens",
      statement: db.prepare(
        `DELETE FROM hosting_upload_tokens
         WHERE created_at <= datetime('now', '-7 days')
           AND (used_at IS NOT NULL OR julianday(expires_at) <= julianday('now'))`,
      ),
    },
    {
      label: "hosting.exhausted_jobs.deploy",
      statement: db.prepare(
        `UPDATE product_hostings SET state = 'failed',
           failure_code = CASE WHEN desired = 'removed' THEN 'ambiguous' ELSE 'internal' END,
           failure_detail = CASE WHEN desired = 'removed'
             THEN 'deploy lease expired after removal; remote state requires manual reconciliation'
             ELSE 'lease expired over one hour with attempts exhausted; manual reconciliation required' END,
           lease_token_hash = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE lease_expires_at IS NOT NULL
           AND julianday(lease_expires_at) < julianday('now', '-1 hour')
           AND attempts >= 5 AND state IN ('queued', 'deploying')
           AND NOT (state = 'queued' AND desired = 'removed' AND site_id IS NULL)`,
      ),
    },
    {
      label: "hosting.exhausted_jobs.promote",
      // promoting→failed 不属于 0032 允许的跳转；以 promoting→staged 记内部失败并锁住重领。
      statement: db.prepare(
        `UPDATE product_hostings SET state = 'staged', failure_code = 'internal',
           failure_detail = 'promote lease expired over one hour with attempts exhausted; manual reconciliation required',
           lease_token_hash = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE lease_expires_at IS NOT NULL
           AND julianday(lease_expires_at) < julianday('now', '-1 hour')
           AND attempts >= 5 AND state = 'promoting'`,
      ),
    },
  ];
}
