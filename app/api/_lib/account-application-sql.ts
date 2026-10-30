// 账户申请发码批次的 SQL(零 import)。路由与 tests/account-applications.test.mjs 共用同一份文本:
// 测试在 node:sqlite + 生产迁移上直接构造「两个请求都读到待审、一个先提交」的时序,
// 断言落败批次的每一条语句都是 0 行——集成预览里并发请求会被串行化,测不到这一层。
//
// 每条语句都以申请当前状态为前提;同一批次(D1 db.batch 是事务)里任何一条前提不成立,
// 其余语句也不成立,不会出现「码插进去了但申请没挂上」或「留下一条假的通过审计」。

// 通过 · 1/3:生成单次码,前提是申请仍待审。
// 绑定:invitationId, codeHash, label, expiresAt, createdBy, applicationId
export const APPROVE_INSERT_INVITATION_SQL = `INSERT INTO invitation_codes (id, code_hash, label, max_uses, expires_at, created_by)
SELECT ?, ?, ?, 1, ?, ?
WHERE EXISTS (SELECT 1 FROM account_applications WHERE id = ? AND status = 'pending')`;

// 通过 · 2/3:申请挂上这张码。绑定:invitationId, decidedBy, note, applicationId, invitationId
export const APPROVE_CLAIM_SQL = `UPDATE account_applications
SET status = 'approved', invitation_id = ?, mail_status = 'sending', mail_error = NULL,
    decided_by = ?, decided_at = CURRENT_TIMESTAMP, decision_note = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM invitation_codes WHERE id = ?)`;

// 重发 · 1/3:撤销旧码,前提是旧码仍未被使用且申请此刻挂的正是它。
// 绑定:oldInvitationId, applicationId, oldInvitationId
export const RESEND_REVOKE_OLD_SQL = `UPDATE invitation_codes SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
WHERE id = ? AND uses_count = 0
  AND EXISTS (SELECT 1 FROM account_applications WHERE id = ? AND status = 'approved' AND invitation_id = ?)`;

// 重发 · 2/3:生成新码。绑定:invitationId, codeHash, label, expiresAt, createdBy, applicationId, oldInvitationId
export const RESEND_INSERT_INVITATION_SQL = `INSERT INTO invitation_codes (id, code_hash, label, max_uses, expires_at, created_by)
SELECT ?, ?, ?, 1, ?, ?
WHERE EXISTS (
  SELECT 1 FROM account_applications a JOIN invitation_codes i ON i.id = a.invitation_id
  WHERE a.id = ? AND a.status = 'approved' AND a.invitation_id = ? AND i.uses_count = 0
)`;

// 重发 · 3/3:申请换挂新码。绑定:invitationId, applicationId, oldInvitationId, invitationId
export const RESEND_CLAIM_SQL = `UPDATE account_applications
SET invitation_id = ?, mail_status = 'sending', mail_error = NULL, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND status = 'approved' AND invitation_id = ? AND EXISTS (SELECT 1 FROM invitation_codes WHERE id = ?)`;

// 通过/重发的审计:只有申请此刻挂的正是这张新码才写。
// 绑定:auditId, actorEmail, action, applicationId, detail, applicationId, invitationId
export const ISSUE_AUDIT_SQL = `INSERT INTO admin_audit_events (id, actor_email, action, target_type, target_ref, detail)
SELECT ?, ?, ?, 'account_application', ?, ?
WHERE EXISTS (SELECT 1 FROM account_applications WHERE id = ? AND invitation_id = ?)`;

// 发信失败:撤销刚生成的码(未被使用时)。绑定:invitationId
export const MAIL_FAILED_REVOKE_SQL = `UPDATE invitation_codes SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE id = ? AND uses_count = 0`;

// 发信失败:记投递失败。绑定:mailError, applicationId, invitationId
export const MAIL_FAILED_MARK_SQL = `UPDATE account_applications SET mail_status = 'failed', mail_error = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND invitation_id = ?`;

// 发信成功:记已发送。绑定:applicationId, invitationId
export const MAIL_SENT_MARK_SQL = `UPDATE account_applications SET mail_status = 'sent', mail_sent_at = CURRENT_TIMESTAMP, mail_error = NULL, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND invitation_id = ?`;

// 拒绝。绑定:decidedBy, note, applicationId
export const REJECT_SQL = `UPDATE account_applications
SET status = 'rejected', decided_by = ?, decided_at = CURRENT_TIMESTAMP, decision_note = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND status = 'pending'`;

// 拒绝的审计:必须排在 REJECT_SQL 之前、同一批次执行——两条看到的是同一个「仍待审」前提,
// 同时成立或同时不成立(同一管理员双击时,落败批次不会因 decided_by 相同而补写一条审计)。
// 绑定:auditId, actorEmail, applicationId, detail, applicationId
export const REJECT_AUDIT_SQL = `INSERT INTO admin_audit_events (id, actor_email, action, target_type, target_ref, detail)
SELECT ?, ?, 'account_application.reject', 'account_application', ?, ?
WHERE EXISTS (SELECT 1 FROM account_applications WHERE id = ? AND status = 'pending')`;
