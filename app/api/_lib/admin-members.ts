import { consentRevocationStatements } from "./oauth-provider";
import { database, type MemberIdentity } from "./community";
import { accessError } from "./errors";
import { hasRole } from "./access-control";
import { AGENT_EMAIL } from "./agent-auth";

type MemberRow = {
  email: string;
  displayName: string;
  memberNumber: number | null;
  joinedAt: string;
  suspendedAt: string | null;
  suspendedReason: string;
  suspendedBy: string | null;
  oauthProviders: string;
  hasPasskey: number;
  pendingProducts: number;
  approvedProducts: number;
  rejectedProducts: number;
  walletBalance: number | null;
  walletPendingBalance: number | null;
  walletStatus: string | null;
  activeSessions: number;
  activeApiKeys: number;
};

const MEMBER_FIELDS = `
  m.email, m.display_name AS displayName, m.member_number AS memberNumber,
  m.joined_at AS joinedAt, m.suspended_at AS suspendedAt,
  m.suspended_reason AS suspendedReason, m.suspended_by AS suspendedBy,
  COALESCE((SELECT group_concat(provider, ',') FROM (
    SELECT DISTINCT provider FROM oauth_accounts WHERE email = m.email ORDER BY provider
  )), '') AS oauthProviders,
  EXISTS(SELECT 1 FROM webauthn_credentials w WHERE w.email = m.email) AS hasPasskey,
  (SELECT COUNT(*) FROM products p WHERE p.owner_email = m.email AND p.review_status = 'pending_review') AS pendingProducts,
  (SELECT COUNT(*) FROM products p WHERE p.owner_email = m.email AND p.review_status = 'approved') AS approvedProducts,
  (SELECT COUNT(*) FROM products p WHERE p.owner_email = m.email AND p.review_status = 'rejected') AS rejectedProducts,
  (SELECT balance FROM wallets WHERE user_email = m.email) AS walletBalance,
  (SELECT pending_balance FROM wallets WHERE user_email = m.email) AS walletPendingBalance,
  (SELECT status FROM wallets WHERE user_email = m.email) AS walletStatus,
  (SELECT COUNT(*) FROM auth_sessions s WHERE s.user_email = m.email AND s.expires_at > CURRENT_TIMESTAMP) AS activeSessions,
  (SELECT COUNT(*) FROM api_keys k WHERE k.member_email = m.email AND k.revoked_at IS NULL AND k.expires_at > CURRENT_TIMESTAMP) AS activeApiKeys`;

function memberPayload(row: MemberRow) {
  const loginMethods = row.oauthProviders ? row.oauthProviders.split(",") : [];
  if (row.hasPasskey) loginMethods.push("passkey");
  return {
    email: row.email,
    displayName: row.displayName,
    memberNumber: row.memberNumber,
    joinedAt: row.joinedAt,
    loginMethods,
    products: {
      pendingReview: Number(row.pendingProducts ?? 0),
      approved: Number(row.approvedProducts ?? 0),
      rejected: Number(row.rejectedProducts ?? 0),
    },
    wallet: {
      balance: Number(row.walletBalance ?? 0),
      pendingBalance: Number(row.walletPendingBalance ?? 0),
      status: row.walletStatus,
    },
    activeSessions: Number(row.activeSessions ?? 0),
    activeApiKeys: Number(row.activeApiKeys ?? 0),
    suspendedAt: row.suspendedAt,
    suspendedReason: row.suspendedReason,
    suspendedBy: row.suspendedBy,
  };
}

function encodeCursor(joinedAt: string, email: string) {
  return `${encodeURIComponent(joinedAt)}|${encodeURIComponent(email)}`;
}

function decodeCursor(cursor: string): { joinedAt: string; email: string } {
  const separator = cursor.indexOf("|");
  if (separator < 1) throw accessError("invalid_cursor", 400);
  try {
    const joinedAt = decodeURIComponent(cursor.slice(0, separator));
    const email = decodeURIComponent(cursor.slice(separator + 1));
    if (!joinedAt || !email || !email.includes("@")) throw new Error("invalid");
    return { joinedAt, email };
  } catch {
    throw accessError("invalid_cursor", 400);
  }
}

export async function listAdminMembers(args: { q: string; cursor: string; filter: "all" | "suspended" }) {
  const conditions: string[] = [];
  const bindings: string[] = [];
  if (args.filter === "suspended") conditions.push("m.suspended_at IS NOT NULL");
  if (args.q) {
    // 用 instr 而非 LIKE:D1 对 LIKE 模式有长度上限(完整长邮箱即触发
    // "LIKE or GLOB pattern too complex" 500),且 LIKE 会把输入里的 % _ 当通配符。
    const needle = args.q.toLowerCase();
    conditions.push("(instr(lower(m.email), ?) > 0 OR instr(lower(m.display_name), ?) > 0 OR instr(CAST(m.member_number AS TEXT), ?) > 0)");
    bindings.push(needle, needle, needle);
  }
  if (args.cursor) {
    const cursor = decodeCursor(args.cursor);
    conditions.push("(m.joined_at < ? OR (m.joined_at = ? AND m.email > ?))");
    bindings.push(cursor.joinedAt, cursor.joinedAt, cursor.email);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await database().prepare(
    `SELECT ${MEMBER_FIELDS} FROM members m ${where}
     ORDER BY m.joined_at DESC, m.email ASC LIMIT 51`,
  ).bind(...bindings).all<MemberRow>();
  const rows = result.results ?? [];
  const hasMore = rows.length > 50;
  const page = rows.slice(0, 50);
  return {
    members: page.map(memberPayload),
    nextCursor: hasMore && page.length ? encodeCursor(page[page.length - 1].joinedAt, page[page.length - 1].email) : null,
  };
}

export async function getAdminMemberDetail(email: string) {
  const db = database();
  const row = await db.prepare(`SELECT ${MEMBER_FIELDS} FROM members m WHERE m.email = ?`)
    .bind(email).first<MemberRow>();
  if (!row) throw accessError("member_not_found", 404);
  const [audit, products] = await Promise.all([
    db.prepare(
      `SELECT id, actor_email AS actorEmail, action, target_type AS targetType,
              target_ref AS targetRef, detail, created_at AS createdAt
       FROM admin_audit_events WHERE target_ref = ? ORDER BY created_at DESC, id DESC LIMIT 20`,
    ).bind(email).all(),
    db.prepare(
      `SELECT id, title, review_status AS reviewStatus, status, moderation_status AS moderationStatus,
              created_at AS createdAt, submitted_at AS submittedAt
       FROM products WHERE owner_email = ? ORDER BY created_at DESC, id DESC LIMIT 20`,
    ).bind(email).all(),
  ]);
  return { member: memberPayload(row), audit: audit.results ?? [], recentProducts: products.results ?? [] };
}

// 受保护账号按"该邮箱以会话登录时会不会拿到 admin/founder 角色"判定:白名单判断
// 只走 access-control 的 hasRole 统一入口(role-eligibility 测试守着这条边界)。
function isProtectedMember(actor: MemberIdentity, targetEmail: string) {
  const normalized = targetEmail.trim().toLowerCase();
  const asSession = { email: normalized, authVia: "session" as const };
  return normalized === actor.email.trim().toLowerCase()
    || normalized === AGENT_EMAIL.trim().toLowerCase()
    || hasRole(asSession, "admin")
    || hasRole(asSession, "founder");
}

export async function changeMemberSuspension(
  actor: MemberIdentity,
  action: "suspend" | "unsuspend",
  email: string,
  reason: string,
) {
  const targetEmail = email.trim().toLowerCase();
  if (isProtectedMember(actor, targetEmail)) throw accessError("member_protected", 403);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail) || targetEmail.length > 254) {
    throw accessError("invalid_member_email", 400);
  }
  if (reason.trim().length < 4) throw accessError("invalid_admin_reason", 400);

  const db = database();
  const current = await db.prepare(`SELECT suspended_at AS suspendedAt FROM members WHERE email = ?`)
    .bind(targetEmail).first<{ suspendedAt: string | null }>();
  if (!current) throw accessError("member_not_found", 404);
  if (action === "suspend" && current.suspendedAt) throw accessError("member_already_suspended", 409);
  if (action === "unsuspend" && !current.suspendedAt) throw accessError("member_not_suspended", 409);

  const detail = JSON.stringify({ reason: reason.trim() });
  const auditId = `admin:${crypto.randomUUID()}`;
  const update = action === "suspend"
    ? db.prepare(
      `UPDATE members SET suspended_at = CURRENT_TIMESTAMP, suspended_reason = ?, suspended_by = ?
       WHERE email = ? AND suspended_at IS NULL`,
    ).bind(reason.trim(), actor.email, targetEmail)
    : db.prepare(
      `UPDATE members SET suspended_at = NULL, suspended_reason = '', suspended_by = NULL
       WHERE email = ? AND suspended_at IS NOT NULL`,
    ).bind(targetEmail);
  const audit = db.prepare(
    `INSERT INTO admin_audit_events (id, actor_email, action, target_type, target_ref, detail)
     SELECT ?, ?, ?, 'member', ?, ? WHERE changes() > 0`,
  ).bind(auditId, actor.email, action === "suspend" ? "suspend_member" : "unsuspend_member", targetEmail, detail);

  const statements = [update, audit];
  if (action === "suspend") {
    statements.push(
      db.prepare(`DELETE FROM auth_sessions WHERE user_email = ?`).bind(targetEmail),
      db.prepare(`UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE member_email = ? AND revoked_at IS NULL`).bind(targetEmail),
      ...consentRevocationStatements(targetEmail),
      db.prepare(`UPDATE oauth_provider_authorization_codes SET used_at = COALESCE(used_at, CURRENT_TIMESTAMP) WHERE user_email = ?`).bind(targetEmail),
    );
  }
  const results = await db.batch(statements);
  if (Number(results[0]?.meta?.changes ?? 0) === 0) {
    throw accessError(action === "suspend" ? "member_already_suspended" : "member_not_suspended", 409);
  }
  return action === "suspend"
    ? {
      updated: true,
      removedSessions: Number(results[2]?.meta?.changes ?? 0),
      revokedApiKeys: Number(results[3]?.meta?.changes ?? 0),
    }
    : { updated: true };
}
