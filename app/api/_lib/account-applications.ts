// 造场账户申请域模块:公开提交(/apply)、管理台审核、通过即发邀请码邮件。
//
// 发码语义(为什么这样排序):
// 1) 一次 db.batch 原子完成「生成单次邀请码 + 申请置 approved/mail_status=sending + 审计」,
//    三条语句都以申请当前状态为条件——两个管理员同时点「通过」只有一个生效,另一个 409;
// 2) 批次落库后才外发邮件。邀请码明文只存在于这一次请求的内存和那封邮件里:
//    不进响应、不进审计、不进日志;库里只有 SHA-256(与 invitations.ts 同纪律)。
// 3) 发信失败(binding 抛错/上游非 2xx)→ 立即撤销刚生成的码并记 mail_status=failed:
//    「申请人没收到」时库里不会留一张谁都不知道明文、却仍然有效的码;审核决定不回退,
//    管理员点「重发」换一张新码再投。
// 4) 发信成功但回写 sent 失败 → 申请停在 sending(管理台显示「投递结果未确认」),
//    码有效且已送达;管理员可「重发」(撤旧换新)。
// 申请人的码与邮箱不绑定(邀请码是持有即可用的凭据,注册门槛仍是 SQLite 触发器);
// 邮件正文提示勿转发,这是已知取舍,不在此改动注册触发器。
import { env } from "cloudflare:workers";
import type { MemberIdentity } from "./access-control";
import { adminAuditStatement } from "./admin";
import { database } from "./community";
import { emailSendConfigured, sendEmail } from "./email-send";
import { generateInvitationCode } from "./invitations";
import { invitationEmail } from "./invite-mail";
import { enforceRateLimit, RateLimitError, rateLimitKey, requestActorKey } from "./rate-limit";
import { assertSameOrigin } from "./request-origin";
import { verifyTurnstile } from "./turnstile";
import {
  APPROVE_CLAIM_SQL,
  APPROVE_INSERT_INVITATION_SQL,
  ISSUE_AUDIT_SQL,
  MAIL_FAILED_MARK_SQL,
  MAIL_FAILED_REVOKE_SQL,
  MAIL_SENT_MARK_SQL,
  REJECT_AUDIT_SQL,
  REJECT_SQL,
  RESEND_CLAIM_SQL,
  RESEND_INSERT_INVITATION_SQL,
  RESEND_REVOKE_OLD_SQL,
} from "./account-application-sql";
import {
  ACCOUNT_APPLICATION_LIMITS,
  normalizeApplicationInput,
  normalizeApplicationEmail,
  normalizeApplicationName,
  normalizeDecisionNote,
  normalizeInviteDays,
} from "./account-application-rules";
import { resolvePublicAppOrigin } from "../../lib/public-origin";
import { hashInvitationCode, hashToken, turnstileConfig } from "../../oauth-session";

const APPLICATION_ID_PATTERN = /^apply:[a-f0-9-]{36}$/;

type ApplicationRow = {
  id: string;
  email: string;
  name: string;
  status: "pending" | "approved" | "rejected";
  invitationId: string | null;
  invitationUses: number | null;
};

// ———— 公开提交 ————

// POST /api/account-applications {name, email, intro, link?, cf-turnstile-response?}
// 响应对「新建 / 该邮箱已有待审申请 / 该邮箱已是会员」三种情况完全一致(202 received),
// 不给匿名调用方一个静默的成员存在性探针;页面文案提示已是会员的直接登录。
// 不给申请人自动回信:否则这个公开表单就成了往任意邮箱发信的工具。
export async function submitApplication(request: Request, body: Record<string, unknown>): Promise<Response> {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const parsed = normalizeApplicationInput(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const { name, email, intro, link } = parsed.value;

  // 人机验证先于一切限流(与 email-codes.ts 同理:垃圾 token 不得消耗真实额度)。
  const turnstile = turnstileConfig();
  if (turnstile) {
    const token = typeof body["cf-turnstile-response"] === "string" ? body["cf-turnstile-response"] : null;
    const humanVerified = await verifyTurnstile(
      token,
      turnstile.secret,
      new URL(request.url).hostname,
      request.headers.get("cf-connecting-ip") ?? undefined,
    );
    if (!humanVerified) return Response.json({ error: "turnstile_invalid" }, { status: 400 });
  }

  try {
    await enforceRateLimit(await requestActorKey(request, "account-apply-ip"), 5, 60 * 60);
    await enforceRateLimit(await rateLimitKey("account-apply-addr", email), 3, 24 * 60 * 60);
    await enforceRateLimit(await rateLimitKey("account-apply-global", "all"), 200, 24 * 60 * 60);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": "3600" } });
    }
    throw error;
  }

  const db = database();
  const member = await db.prepare(`SELECT email FROM members WHERE email = ?`).bind(email).first<{ email: string }>();
  if (!member) {
    const requestIpHash = await hashToken(request.headers.get("cf-connecting-ip") || "unknown");
    // 同一邮箱已有待审申请时 DO NOTHING(部分唯一索引 account_applications_one_pending_idx)。
    await db.prepare(
      `INSERT INTO account_applications (id, email, name, intro, link, source, request_ip_hash)
       VALUES (?, ?, ?, ?, ?, 'public', ?)
       ON CONFLICT DO NOTHING`,
    ).bind(`apply:${crypto.randomUUID()}`, email, name, intro, link, requestIpHash).run();
  }
  return Response.json({ status: "received" }, { status: 202 });
}

// ———— 管理台读侧 ————

export async function listApplications(url: URL): Promise<Response> {
  const requested = url.searchParams.get("status") ?? "all";
  const status = ["pending", "approved", "rejected"].includes(requested) ? requested : "all";
  const db = database();
  const [rows, counts] = await Promise.all([
    db.prepare(
      `SELECT a.id, a.email, a.name, a.intro, a.link, a.source, a.status,
              a.mail_status AS mailStatus, a.mail_error AS mailError, a.mail_sent_at AS mailSentAt,
              a.decided_by AS decidedBy, a.decided_at AS decidedAt, a.decision_note AS decisionNote,
              a.created_at AS createdAt, a.updated_at AS updatedAt,
              a.invitation_id AS invitationId,
              i.uses_count AS invitationUses, i.expires_at AS invitationExpiresAt, i.revoked_at AS invitationRevokedAt,
              CASE WHEN m.email IS NULL THEN 0 ELSE 1 END AS isMember
       FROM account_applications a
       LEFT JOIN invitation_codes i ON i.id = a.invitation_id
       LEFT JOIN members m ON m.email = a.email
       WHERE (? = 'all' OR a.status = ?)
       ORDER BY CASE a.status WHEN 'pending' THEN 0 ELSE 1 END, a.created_at DESC, a.id DESC
       LIMIT 200`,
    ).bind(status, status).all(),
    db.prepare(`SELECT status, COUNT(*) AS total FROM account_applications GROUP BY status`).all<{ status: string; total: number }>(),
  ]);
  const totals = { pending: 0, approved: 0, rejected: 0 };
  for (const row of counts.results) {
    if (row.status in totals) totals[row.status as keyof typeof totals] = Number(row.total);
  }
  return Response.json({
    applications: rows.results.map((row) => ({ ...row, isMember: Number((row as { isMember: number }).isMember) === 1 })),
    counts: totals,
  });
}

// ———— 管理台写侧 ————

async function loadApplication(id: string): Promise<ApplicationRow | null> {
  return database().prepare(
    `SELECT a.id, a.email, a.name, a.status, a.invitation_id AS invitationId, i.uses_count AS invitationUses
     FROM account_applications a LEFT JOIN invitation_codes i ON i.id = a.invitation_id
     WHERE a.id = ?`,
  ).bind(id).first<ApplicationRow>();
}

function signinUrl(request: Request): string {
  const values = env as unknown as Record<string, string | undefined>;
  return `${resolvePublicAppOrigin(request.url, values.APP_ENV, values.PUBLIC_APP_ORIGIN)}/signin`;
}

// 通过(mode=approve,待审 → 已通过)或重发(mode=resend,已通过且旧码未被使用 → 撤旧换新)。
async function issueInvitation(
  request: Request,
  admin: MemberIdentity,
  application: ApplicationRow,
  mode: "approve" | "resend",
  days: number,
  note: string,
): Promise<Response> {
  if (mode === "approve" && application.status !== "pending") {
    return Response.json({ error: "application_not_pending" }, { status: 409 });
  }
  if (mode === "resend") {
    if (application.status !== "approved" || !application.invitationId) {
      return Response.json({ error: "application_not_approved" }, { status: 409 });
    }
    if (Number(application.invitationUses ?? 0) > 0) {
      return Response.json({ error: "invitation_already_used" }, { status: 409 });
    }
  }
  const db = database();
  const member = await db.prepare(`SELECT email FROM members WHERE email = ?`).bind(application.email).first();
  if (member) return Response.json({ error: "applicant_already_member" }, { status: 409 });
  // 发信通道未配置:在任何写入之前 503,不生成一张注定发不出去的码。
  if (!emailSendConfigured()) return Response.json({ error: "email_not_configured" }, { status: 503 });
  const loginUrl = signinUrl(request);

  // 真出信:按管理员单独限流(与 mail-send 同量级),异常批量调用在这里拦下。
  await enforceRateLimit(await rateLimitKey("account-invite-mail", admin.email), 30, 60 * 60);

  const code = generateInvitationCode();
  const codeHash = await hashInvitationCode(code);
  if (!codeHash) throw new Error("generated_invitation_invalid");
  const invitationId = `invite:${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
  const label = `账户申请 ${application.email}`.slice(0, 80);
  const auditDetail = `email=${application.email}; invitation=${invitationId}; expiresAt=${expiresAt}${mode === "resend" ? `; replaced=${application.invitationId}` : ""}`;

  const statements = mode === "approve"
    ? [
      db.prepare(APPROVE_INSERT_INVITATION_SQL).bind(invitationId, codeHash, label, expiresAt, admin.email, application.id),
      db.prepare(APPROVE_CLAIM_SQL).bind(invitationId, admin.email, note, application.id, invitationId),
    ]
    : [
      // 旧码只在「仍未被使用」时撤销;与下两条同一前提,任何一条前提不成立整批都不生效。
      db.prepare(RESEND_REVOKE_OLD_SQL).bind(application.invitationId, application.id, application.invitationId),
      db.prepare(RESEND_INSERT_INVITATION_SQL).bind(invitationId, codeHash, label, expiresAt, admin.email, application.id, application.invitationId),
      db.prepare(RESEND_CLAIM_SQL).bind(invitationId, application.id, application.invitationId, invitationId),
    ];
  const claimIndex = statements.length - 1;
  // 审计以「申请此刻挂的正是这张新码」为条件:批次前提不成立时不留一条假的通过记录。
  statements.push(db.prepare(ISSUE_AUDIT_SQL).bind(
    `admin:${crypto.randomUUID()}`,
    admin.email,
    mode === "approve" ? "account_application.approve" : "account_application.resend",
    application.id,
    auditDetail,
    application.id,
    invitationId,
  ));
  const results = await db.batch(statements);
  if (Number(results[claimIndex]?.meta?.changes ?? 0) !== 1) {
    return Response.json({ error: "application_state_changed" }, { status: 409 });
  }

  const mail = invitationEmail({ name: application.name, email: application.email, code, expiresAt, signinUrl: loginUrl });
  const sent = await sendEmail({ to: application.email, ...mail });
  if (!sent.ok) {
    await db.batch([
      db.prepare(MAIL_FAILED_REVOKE_SQL).bind(invitationId),
      db.prepare(MAIL_FAILED_MARK_SQL).bind(sent.code.slice(0, 80), application.id, invitationId),
      adminAuditStatement(admin.email, "account_application.mail_failed", "account_application", application.id, `invitation=${invitationId}; code=${sent.code.slice(0, 80)}; invitation revoked`),
    ]);
    const status = sent.code === "email_send_network_error" || sent.code.startsWith("email_send_http_") ? 502 : 503;
    return Response.json({ error: "invite_mail_failed", detail: sent.code, id: application.id, mailStatus: "failed" }, { status });
  }
  await db.prepare(MAIL_SENT_MARK_SQL).bind(application.id, invitationId).run();
  return Response.json({
    ok: true,
    id: application.id,
    status: "approved",
    mailStatus: "sent",
    invitation: { id: invitationId, expiresAt },
  });
}

async function rejectApplication(admin: MemberIdentity, application: ApplicationRow, note: string): Promise<Response> {
  if (application.status !== "pending") return Response.json({ error: "application_not_pending" }, { status: 409 });
  const db = database();
  // 审计排在前面:两条语句看到同一个「仍待审」前提(见 REJECT_AUDIT_SQL 注释)。
  const results = await db.batch([
    db.prepare(REJECT_AUDIT_SQL).bind(`admin:${crypto.randomUUID()}`, admin.email, application.id, `email=${application.email}; note=${note}`, application.id),
    db.prepare(REJECT_SQL).bind(admin.email, note, application.id),
  ]);
  if (Number(results[1]?.meta?.changes ?? 0) !== 1) {
    return Response.json({ error: "application_state_changed" }, { status: 409 });
  }
  return Response.json({ ok: true, id: application.id, status: "rejected" });
}

// PATCH /api/admin/account-applications {id, action: approve|reject|resend, expiresDays?, note?}
export async function decideApplication(request: Request, admin: MemberIdentity, input: Record<string, unknown>): Promise<Response> {
  const id = typeof input.id === "string" ? input.id : "";
  const action = input.action;
  if (!APPLICATION_ID_PATTERN.test(id) || (action !== "approve" && action !== "reject" && action !== "resend")) {
    return Response.json({ error: "invalid_application_action" }, { status: 400 });
  }
  const note = normalizeDecisionNote(input.note);
  const application = await loadApplication(id);
  if (!application) return Response.json({ error: "application_not_found" }, { status: 404 });
  if (action === "reject") return rejectApplication(admin, application, note);
  const days = normalizeInviteDays(input.expiresDays);
  if (days === null) return Response.json({ error: "invalid_expires_days" }, { status: 400 });
  return issueInvitation(request, admin, application, action, days, note);
}

// POST /api/admin/account-applications {name, email, note?, expiresDays?}
// 管理员直接给某个邮箱发邀请:建一条 source=admin 的申请再走同一条通过链路,
// 发码、发信、审计与公开申请完全同一套代码。
export async function inviteDirectly(request: Request, admin: MemberIdentity, input: Record<string, unknown>): Promise<Response> {
  const name = normalizeApplicationName(input.name);
  if (!name) return Response.json({ error: "invalid_name" }, { status: 400 });
  const email = normalizeApplicationEmail(input.email);
  if (!email) return Response.json({ error: "invalid_email" }, { status: 400 });
  const days = normalizeInviteDays(input.expiresDays);
  if (days === null) return Response.json({ error: "invalid_expires_days" }, { status: 400 });
  const note = normalizeDecisionNote(input.note);
  const db = database();
  if (await db.prepare(`SELECT email FROM members WHERE email = ?`).bind(email).first()) {
    return Response.json({ error: "applicant_already_member" }, { status: 409 });
  }
  if (!emailSendConfigured()) return Response.json({ error: "email_not_configured" }, { status: 503 });
  const pending = await db.prepare(
    `SELECT id FROM account_applications WHERE email = ? AND status = 'pending'`,
  ).bind(email).first<{ id: string }>();
  if (pending) return Response.json({ error: "application_pending_exists", id: pending.id }, { status: 409 });

  const id = `apply:${crypto.randomUUID()}`;
  const intro = (note || "管理员直接邀请").slice(0, ACCOUNT_APPLICATION_LIMITS.introMax);
  await db.prepare(
    `INSERT INTO account_applications (id, email, name, intro, source) VALUES (?, ?, ?, ?, 'admin')`,
  ).bind(id, email, name, intro).run();
  const application = await loadApplication(id);
  if (!application) throw new Error("application_insert_lost");
  const response = await issueInvitation(request, admin, application, "approve", days, note);
  // 通过链路的结果原样返回;201 只表示「新建了一条直邀记录且邮件已发出」。
  return response.status === 200
    ? Response.json({ ...(await response.json() as Record<string, unknown>) }, { status: 201 })
    : response;
}
