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

export async function auditAdminAction(actorEmail: string, action: string, targetType: string, targetRef: string, detail = "") {
  await adminAuditStatement(actorEmail, action, targetType, targetRef, detail).run();
}

export function adminAuditStatement(actorEmail: string, action: string, targetType: string, targetRef: string, detail = "") {
  return database().prepare(
    `INSERT INTO admin_audit_events (id, actor_email, action, target_type, target_ref, detail)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(`admin:${crypto.randomUUID()}`, actorEmail, action, targetType, targetRef, detail);
}
