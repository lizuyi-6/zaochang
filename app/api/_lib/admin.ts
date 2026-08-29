// 角色白名单配置 + 管理动作审计。
// 守卫(requireAdmin/requireFounder/requireDocEditor)已收敛到 access-control.ts
// ——新代码从那里 import;本文件只提供角色判定的事实来源(isAdminEmail/isFounderEmail,
// 读两个独立 env 白名单)与 admin_audit_events 写入。
import { env } from "cloudflare:workers";
import { database } from "./community";

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

export async function auditAdminAction(actorEmail: string, action: string, targetType: string, targetRef: string, detail = "") {
  await adminAuditStatement(actorEmail, action, targetType, targetRef, detail).run();
}

export function adminAuditStatement(actorEmail: string, action: string, targetType: string, targetRef: string, detail = "") {
  return database().prepare(
    `INSERT INTO admin_audit_events (id, actor_email, action, target_type, target_ref, detail)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(`admin:${crypto.randomUUID()}`, actorEmail, action, targetType, targetRef, detail);
}
