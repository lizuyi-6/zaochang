import { env } from "cloudflare:workers";
import { database, requireMember } from "./community";

export async function requireAdmin() {
  const member = await requireMember();
  const configured = String((env as unknown as Record<string, string | undefined>).ZAOCHANG_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!configured.length || !configured.includes(member.email.toLowerCase())) {
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
