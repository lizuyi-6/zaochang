// 管理员直接开通账户(管理台「账户申请与开通」)。
//
// 这是唯一一条不经邀请码就能建出可登录会员的路径:邀请码门槛建在 oauth_accounts 的插入触发器上,
// 这里只建 members + 钱包(不写 oauth_accounts),对方用「邮箱验证码」登录时走「已是成员」分支。
// 因此:只有人类管理员会话可用(不进 agent 能力表),每次开通都写审计,并按管理员限流。
//
// 建号与通知解耦:通知邮件不含任何凭据(收件箱本身就是钥匙),发信失败不回滚建号,只记
// mail_status=failed,管理员可「重发通知」。新账户 onboarding_required=1,首次登录先去 /welcome。
import { env } from "cloudflare:workers";
import type { MemberIdentity } from "./access-control";
import { adminAuditStatement, auditAdminAction } from "./admin";
import { database } from "./community";
import { emailSendConfigured, sendEmail } from "./email-send";
import { accountProvisionedEmail } from "./invite-mail";
import { PROVISION_MEMBER_SQL } from "./member-identity-sql";
import { normalizeNickname } from "./member-identity-rules";
import { normalizeApplicationEmail, normalizeDecisionNote } from "./account-application-rules";
import { enforceRateLimit, rateLimitKey } from "./rate-limit";
import { resolvePublicAppOrigin } from "../../lib/public-origin";

function signinUrl(request: Request): string {
  const values = env as unknown as Record<string, string | undefined>;
  return `${resolvePublicAppOrigin(request.url, values.APP_ENV, values.PUBLIC_APP_ORIGIN)}/signin`;
}

async function deliverNotice(request: Request, admin: MemberIdentity, email: string, nickname: string): Promise<{ ok: true } | { ok: false; code: string }> {
  const mail = accountProvisionedEmail({ nickname, email, signinUrl: signinUrl(request) });
  const sent = await sendEmail({ to: email, ...mail });
  const db = database();
  if (sent.ok) {
    await db.prepare(
      `UPDATE admin_provisioned_accounts SET mail_status = 'sent', mail_error = NULL, mail_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE email = ?`,
    ).bind(email).run();
    return { ok: true };
  }
  await db.batch([
    db.prepare(
      `UPDATE admin_provisioned_accounts SET mail_status = 'failed', mail_error = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?`,
    ).bind(sent.code.slice(0, 80), email),
    adminAuditStatement(admin.email, "member.provision_mail_failed", "member", email, `code=${sent.code.slice(0, 80)}`),
  ]);
  return { ok: false, code: sent.code };
}

function mailFailure(code: string, email: string): Response {
  const status = code === "email_send_network_error" || code.startsWith("email_send_http_") ? 502 : 503;
  return Response.json({ error: "provision_mail_failed", detail: code, email, accountCreated: true, mailStatus: "failed" }, { status });
}

export async function listProvisionedAccounts(): Promise<Response> {
  const rows = await database().prepare(
    `SELECT p.email, p.created_by AS createdBy, p.note, p.mail_status AS mailStatus, p.mail_error AS mailError,
            p.mail_sent_at AS mailSentAt, p.created_at AS createdAt,
            m.display_name AS nickname, m.username, m.onboarding_required AS onboardingRequired,
            (SELECT MAX(created_at) FROM auth_sessions WHERE user_email = p.email) AS lastSignInAt
     FROM admin_provisioned_accounts p JOIN members m ON m.email = p.email
     ORDER BY p.created_at DESC, p.email
     LIMIT 200`,
  ).all<Record<string, unknown>>();
  return Response.json({
    accounts: rows.results.map((row) => ({ ...row, onboardingRequired: Number(row.onboardingRequired) === 1 })),
  });
}

// POST /api/admin/accounts {email, nickname?, note?}
export async function provisionAccount(request: Request, admin: MemberIdentity, input: Record<string, unknown>): Promise<Response> {
  const email = normalizeApplicationEmail(input.email);
  if (!email) return Response.json({ error: "invalid_email" }, { status: 400 });
  let displayName = email.slice(0, email.indexOf("@")).slice(0, 40) || email.slice(0, 40);
  if (typeof input.nickname === "string" && input.nickname.trim()) {
    const nickname = normalizeNickname(input.nickname);
    if (!nickname.ok) return Response.json({ error: nickname.error }, { status: 400 });
    displayName = nickname.value;
  }
  const note = normalizeDecisionNote(input.note);
  const db = database();
  if (await db.prepare(`SELECT email FROM members WHERE email = ?`).bind(email).first()) {
    return Response.json({ error: "account_already_exists" }, { status: 409 });
  }
  // 发信通道未配置:在建号之前 503(否则建出一个对方不知道存在的账户)。
  if (!emailSendConfigured()) return Response.json({ error: "email_not_configured" }, { status: 503 });
  await enforceRateLimit(await rateLimitKey("account-invite-mail", admin.email), 30, 60 * 60);

  try {
    await db.batch([
      db.prepare(PROVISION_MEMBER_SQL).bind(email, displayName),
      db.prepare(
        `INSERT OR IGNORE INTO wallets (user_email, balance, lifetime_earned, lifetime_spent) VALUES (?, 0, 0, 0)`,
      ).bind(email),
      db.prepare(
        `INSERT INTO admin_provisioned_accounts (email, created_by, note, mail_status) VALUES (?, ?, ?, 'sending')`,
      ).bind(email, admin.email, note),
      // 同邮箱的待审申请随之关闭(已直接开通,不再需要邀请码)。
      db.prepare(
        `UPDATE account_applications
         SET status = 'rejected', decided_by = ?, decided_at = CURRENT_TIMESTAMP,
             decision_note = '已由管理员直接开通账户', updated_at = CURRENT_TIMESTAMP
         WHERE email = ? AND status = 'pending'`,
      ).bind(admin.email, email),
      adminAuditStatement(admin.email, "member.provision", "member", email, `nickname=${displayName}; note=${note}`),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE constraint failed") || message.includes("PRIMARY KEY")) {
      return Response.json({ error: "account_already_exists" }, { status: 409 });
    }
    throw error;
  }

  const delivered = await deliverNotice(request, admin, email, displayName);
  if (!delivered.ok) return mailFailure(delivered.code, email);
  return Response.json({ ok: true, email, nickname: displayName, mailStatus: "sent", onboardingRequired: true }, { status: 201 });
}

// PATCH /api/admin/accounts {email, action: "resend_notice"}
// 只对「管理员开通、且对方还没完成首次引导」的账户重发;已完成引导的不再打扰。
export async function resendProvisionNotice(request: Request, admin: MemberIdentity, input: Record<string, unknown>): Promise<Response> {
  const email = normalizeApplicationEmail(input.email);
  if (!email || input.action !== "resend_notice") return Response.json({ error: "invalid_account_action" }, { status: 400 });
  const row = await database().prepare(
    `SELECT m.display_name AS nickname, m.onboarding_required AS onboardingRequired
     FROM admin_provisioned_accounts p JOIN members m ON m.email = p.email WHERE p.email = ?`,
  ).bind(email).first<{ nickname: string; onboardingRequired: number }>();
  if (!row) return Response.json({ error: "account_not_provisioned" }, { status: 404 });
  if (Number(row.onboardingRequired) !== 1) return Response.json({ error: "account_already_active" }, { status: 409 });
  if (!emailSendConfigured()) return Response.json({ error: "email_not_configured" }, { status: 503 });
  await enforceRateLimit(await rateLimitKey("account-invite-mail", admin.email), 30, 60 * 60);
  await database().prepare(
    `UPDATE admin_provisioned_accounts SET mail_status = 'sending', updated_at = CURRENT_TIMESTAMP WHERE email = ?`,
  ).bind(email).run();
  await auditAdminAction(admin.email, "member.provision_resend", "member", email, "");
  const delivered = await deliverNotice(request, admin, email, row.nickname);
  if (!delivered.ok) return mailFailure(delivered.code, email);
  return Response.json({ ok: true, email, mailStatus: "sent" });
}
