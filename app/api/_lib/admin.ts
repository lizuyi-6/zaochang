import { env } from "cloudflare:workers";
import { database, requireMember } from "./community";

function configuredEmails(name: "ZAOCHANG_ADMIN_EMAILS" | "ZAOCHANG_FOUNDER_EMAIL") {
  return String((env as unknown as Record<string, string | undefined>)[name] ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string) {
  const configured = configuredEmails("ZAOCHANG_ADMIN_EMAILS");
  return configured.length > 0 && configured.includes(email.trim().toLowerCase());
}

export function isFounderEmail(email: string) {
  const configured = configuredEmails("ZAOCHANG_FOUNDER_EMAIL");
  return configured.length === 1 && configured[0] === email.trim().toLowerCase();
}

export async function requireAdmin() {
  const member = await requireMember();
  if (!isAdminEmail(member.email)) {
    throw Object.assign(new Error("admin_forbidden"), { code: "admin_forbidden", status: 403 });
  }
  return member;
}

export async function requireFounder() {
  const member = await requireMember();
  if (!isFounderEmail(member.email)) {
    throw Object.assign(new Error("founder_forbidden"), { code: "founder_forbidden", status: 403 });
  }
  return member;
}

// 文档编辑准入:founder 或 agent。后者由 worker 入口能力表保证只命中 POST/PATCH /api/docs;
// DELETE 走 requireFounder → agent 被拦。agent 不继承 founder 的其他权限(财务/admin 等)。
export async function requireDocEditor() {
  const member = await requireMember();
  if (member.isAgent) return member;
  if (isFounderEmail(member.email)) return member;
  throw Object.assign(new Error("founder_forbidden"), { code: "founder_forbidden", status: 403 });
}

export async function auditAdminAction(actorEmail: string, action: string, targetType: string, targetRef: string, detail = "") {
  await adminAuditStatement(actorEmail, action, targetType, targetRef, detail).run();
}

export function adminAuditStatement(actorEmail: string, action: string, targetType: string, targetRef: string, detail = "") {
  return database().prepare(
    `INSERT INTO admin_audit_events (id, actor_email, action, target_type, target_ref, detail)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(`admin:${crypto.randomUUID()}`, actorEmail, action, targetType, targetRef, detail);
}
