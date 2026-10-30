// 造场账户申请 + 邀请码邮件发放 · 集成套件:真实 Wrangler 预览 + 假 CF Email 上游,覆盖:
// - 公开页 /apply 渲染、登录页申请入口
// - 公开提交:字段校验、跨站 403、统一 202(新建/重复待审/已是会员三态同响应且不回信)、每 IP 限流
// - 管理端安全矩阵(匿名 401 / 普通成员 403 / 缺 origin 403 / agent PATCH 放行、POST 拒绝)
// - 通过 → 邮件里的单次 ZC- 码(哈希 = 库存)→ 用它邮箱注册成功 → 码已用、重发 409
// - 发信失败 → 刚生成的码被撤销且确实不可注册 → 重发换新码
// - 拒绝不发信、并发通过只生效一次、管理员直邀
// 执行顺序由 tests/rendered-html.test.mjs 的注册顺序保证(套件串行)。
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  adminEmail,
  baseUrl,
  failNextFakeEmailSend,
  latestEmailCode,
  queryLocalD1,
  runId,
  sentEmails,
} from "../harness/preview.mjs";

const quoteSql = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const INVITE_CODE_PATTERN = /ZC-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}/;

let ipCounter = 0;
const nextIp = () => `203.0.113.${(ipCounter++ % 200) + 20}`;

function sessionCookie(response) {
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];
  return cookies.find((value) => value.startsWith("zaochang_session="))?.split(";")[0] ?? null;
}

async function login(email) {
  const response = await fetch(`${baseUrl}/api/auth/dev-login?email=${encodeURIComponent(email)}`, {
    headers: { origin: baseUrl },
    redirect: "manual",
  });
  assert.equal(response.status, 307, `test login must create a session for ${email}`);
  const cookie = sessionCookie(response);
  assert.ok(cookie, "dev-login must issue zaochang_session");
  return cookie;
}

let adminCookiePromise;
function adminCookie() {
  adminCookiePromise ??= login(adminEmail);
  return adminCookiePromise;
}

const jsonHeaders = (cookie) => ({ cookie, origin: baseUrl, "content-type": "application/json" });
const agentHeaders = { authorization: "Bearer test-agent-key", "content-type": "application/json", origin: baseUrl };
const applicantEmail = (local) => `apply-${local}-${runId}@example.com`;

async function apply(payload, headers = {}) {
  return fetch(`${baseUrl}/api/account-applications`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl, "cf-connecting-ip": nextIp(), ...headers },
    body: JSON.stringify(payload),
  });
}

async function applyOk(local, extra = {}) {
  const email = applicantEmail(local);
  const response = await apply({ name: `申请人${local}`, email, intro: "想在造场发布我做的小工具和独立游戏。", ...extra });
  assert.equal(response.status, 202, await response.clone().text());
  assert.deepEqual(await response.json(), { status: "received" });
  const rows = await queryLocalD1(`SELECT id FROM account_applications WHERE email = ${quoteSql(email)} AND status = 'pending'`);
  assert.equal(rows.length, 1, "提交后必须有且只有一条待审申请");
  return { email, id: rows[0].id };
}

async function decide(body, headers) {
  return fetch(`${baseUrl}/api/admin/account-applications`, {
    method: "PATCH",
    headers: headers ?? jsonHeaders(await adminCookie()),
    body: JSON.stringify(body),
  });
}

async function applicationRow(id) {
  return (await queryLocalD1(
    `SELECT a.status, a.mail_status AS mailStatus, a.mail_error AS mailError, a.invitation_id AS invitationId,
            a.decided_by AS decidedBy, a.source, a.decision_note AS decisionNote,
            i.code_hash AS codeHash, i.max_uses AS maxUses, i.uses_count AS usesCount, i.revoked_at AS revokedAt, i.expires_at AS expiresAt
     FROM account_applications a LEFT JOIN invitation_codes i ON i.id = a.invitation_id WHERE a.id = ${quoteSql(id)}`,
  ))[0];
}

function mailsTo(email) {
  return sentEmails.filter((entry) => entry.to?.[0] === email);
}

async function registerWithInvite(email, invitationCode) {
  return fetch(`${baseUrl}/api/auth/email/request`, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": nextIp() },
    body: JSON.stringify({ email, invitation_code: invitationCode }),
  });
}

export function register() {
test("account applications: /apply renders the form and /signin links to it", async () => {
  const page = await fetch(`${baseUrl}/apply`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /申请造场账户/);
  for (const field of ['name="name"', 'name="email"', 'name="intro"', 'name="link"']) {
    assert.ok(html.includes(field), `申请表单必须包含 ${field}`);
  }
  const signin = await (await fetch(`${baseUrl}/signin`)).text();
  assert.match(signin, /href="\/apply"/, "登录页必须有申请入口");
});

test("account applications: public submission validation, origin guard, uniform 202, no mail to applicant", async () => {
  const email = applicantEmail("validate");
  const base = { name: "校验", email, intro: "想在造场发布我做的小工具。" };
  for (const [payload, code] of [
    [{ ...base, name: "  " }, "invalid_name"],
    [{ ...base, email: "not-an-email" }, "invalid_email"],
    [{ ...base, intro: "太短" }, "invalid_intro"],
    [{ ...base, intro: "长".repeat(1001) }, "invalid_intro"],
    [{ ...base, link: "javascript:alert(1)" }, "invalid_link"],
    [{ ...base, link: "https://user:pass@example.com/" }, "invalid_link"],
  ]) {
    const response = await apply(payload);
    assert.equal(response.status, 400, JSON.stringify(payload));
    assert.deepEqual(await response.json(), { error: code });
  }
  const crossSite = await apply(base, { origin: "https://evil.example" });
  assert.equal(crossSite.status, 403);
  assert.equal((await queryLocalD1(`SELECT COUNT(*) AS n FROM account_applications WHERE email = ${quoteSql(email)}`))[0].n, 0, "被拒的提交不得落库");

  const mailsBefore = sentEmails.length;
  const first = await applyOk("validate", { email, link: "https://example.com/portfolio" });
  const row = (await queryLocalD1(
    `SELECT name, intro, link, source, status, mail_status AS mailStatus, invitation_id AS invitationId FROM account_applications WHERE id = ${quoteSql(first.id)}`,
  ))[0];
  assert.deepEqual({ ...row }, { name: "申请人validate", intro: "想在造场发布我做的小工具和独立游戏。", link: "https://example.com/portfolio", source: "public", status: "pending", mailStatus: "none", invitationId: null });

  // 同一邮箱再提交:同一 202,不新增待审行。
  const again = await apply({ ...base, email: email.toUpperCase() });
  assert.equal(again.status, 202);
  assert.deepEqual(await again.json(), { status: "received" });
  assert.equal((await queryLocalD1(`SELECT COUNT(*) AS n FROM account_applications WHERE email = ${quoteSql(email)}`))[0].n, 1);

  // 已是会员:同一 202,且不落库(不给匿名调用方成员存在性信号)。
  const memberEmail = applicantEmail("existing-member");
  await login(memberEmail);
  const memberApply = await apply({ ...base, email: memberEmail });
  assert.equal(memberApply.status, 202);
  assert.deepEqual(await memberApply.json(), { status: "received" });
  assert.equal((await queryLocalD1(`SELECT COUNT(*) AS n FROM account_applications WHERE email = ${quoteSql(memberEmail)}`))[0].n, 0);

  assert.equal(sentEmails.length, mailsBefore, "公开提交不得往任何邮箱发信");
});

test("account applications: per-IP limit returns 429 on the 6th submission within an hour", async () => {
  const ip = "198.51.100.201";
  for (let index = 0; index < 5; index += 1) {
    const response = await apply({ name: "限流", email: applicantEmail(`ratelimit-${index}`), intro: "想在造场发布我做的小工具。" }, { "cf-connecting-ip": ip });
    assert.equal(response.status, 202, `第 ${index + 1} 次应被受理`);
  }
  const blocked = await apply({ name: "限流", email: applicantEmail("ratelimit-6"), intro: "想在造场发布我做的小工具。" }, { "cf-connecting-ip": ip });
  assert.equal(blocked.status, 429);
  assert.deepEqual(await blocked.json(), { error: "rate_limited" });
  assert.equal((await queryLocalD1(`SELECT COUNT(*) AS n FROM account_applications WHERE email = ${quoteSql(applicantEmail("ratelimit-6"))}`))[0].n, 0);
});

test("account applications: admin security matrix", async () => {
  const target = await applyOk("matrix");
  const anon = await fetch(`${baseUrl}/api/admin/account-applications`);
  assert.equal(anon.status, 401);

  const regularCookie = await login(applicantEmail("matrix-regular"));
  const memberRead = await fetch(`${baseUrl}/api/admin/account-applications`, { headers: { cookie: regularCookie } });
  assert.equal(memberRead.status, 403);
  const memberWrite = await decide({ id: target.id, action: "reject" }, jsonHeaders(regularCookie));
  assert.equal(memberWrite.status, 403);

  const noOrigin = await decide({ id: target.id, action: "reject" }, { cookie: await adminCookie(), "content-type": "application/json" });
  assert.equal(noOrigin.status, 403);
  assert.deepEqual(await noOrigin.json(), { error: "invalid_origin" });

  // 机器通道:POST(直邀任意邮箱)不在能力表内 → worker 入口 403;PATCH 放行。
  const agentPost = await fetch(`${baseUrl}/api/admin/account-applications`, {
    method: "POST", headers: agentHeaders, body: JSON.stringify({ name: "x", email: applicantEmail("agent-direct") }),
  });
  assert.equal(agentPost.status, 403);
  assert.equal((await agentPost.json()).error, "agent_scope_forbidden");
  const agentReject = await decide({ id: target.id, action: "reject", note: "机器通道拒绝" }, agentHeaders);
  assert.equal(agentReject.status, 200, await agentReject.clone().text());
  const row = await applicationRow(target.id);
  assert.equal(row.status, "rejected");
  assert.equal(row.decisionNote, "机器通道拒绝");
  assert.equal(row.invitationId, null);

  for (const [body, code] of [
    [{ id: "apply:nope", action: "approve" }, "invalid_application_action"],
    [{ id: target.id, action: "delete" }, "invalid_application_action"],
  ]) {
    const response = await decide(body);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, code);
  }
  const missing = await decide({ id: "apply:00000000-0000-4000-8000-000000000000", action: "approve" });
  assert.equal(missing.status, 404);
});

test("account applications: approve mails a single-use code that registers exactly once", async () => {
  const applicant = await applyOk("approve", { name: "<b>小张</b>" });
  const badDays = await decide({ id: applicant.id, action: "approve", expiresDays: 91 });
  assert.equal(badDays.status, 400);
  assert.equal((await badDays.json()).error, "invalid_expires_days");
  assert.equal((await applicationRow(applicant.id)).status, "pending", "越界天数不得改动申请");

  const approved = await decide({ id: applicant.id, action: "approve", expiresDays: 7 });
  const approvedText = await approved.text();
  assert.equal(approved.status, 200, approvedText);
  assert.doesNotMatch(approvedText, /ZC-/, "邀请码明文不得出现在管理端响应里");
  const body = JSON.parse(approvedText);
  assert.equal(body.mailStatus, "sent");

  const row = await applicationRow(applicant.id);
  assert.equal(row.status, "approved");
  assert.equal(row.mailStatus, "sent");
  assert.equal(row.maxUses, 1);
  assert.equal(row.usesCount, 0);
  assert.equal(row.revokedAt, null);
  assert.equal(row.invitationId, body.invitation.id);
  assert.equal(row.decidedBy, adminEmail);

  const mails = mailsTo(applicant.email);
  assert.equal(mails.length, 1, "通过后恰好一封邀请邮件");
  const mail = mails[0];
  assert.equal(mail.from, "zaochang@aetherstudio.top");
  assert.equal(mail.subject, "你的造场账户申请已通过 · 邀请码");
  const code = mail.text.match(INVITE_CODE_PATTERN)?.[0];
  assert.ok(code, "纯文本正文必须带邀请码");
  assert.ok(mail.html.includes(code), "HTML 正文必须带同一张码");
  assert.equal(row.codeHash, sha256(code), "库存哈希必须与邮件明文一致");
  assert.ok(mail.html.includes("&lt;b&gt;小张&lt;/b&gt;"), "申请人自填称呼必须转义");
  assert.ok(!mail.html.includes("<b>小张</b>"));
  for (const href of mail.html.matchAll(/href="([^"]*)"/g)) {
    assert.ok(!href[1].includes(code), "邀请码不得进入任何链接");
  }
  assert.ok(mail.html.includes(`${baseUrl}/signin`));

  const audit = await queryLocalD1(
    `SELECT actor_email AS actor, detail FROM admin_audit_events WHERE action = 'account_application.approve' AND target_ref = ${quoteSql(applicant.id)}`,
  );
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actor, adminEmail);
  assert.ok(!audit[0].detail.includes(code), "审计不得记录邀请码明文");

  // 用邮件里的码走邮箱验证码注册:成员落库、码被消费。
  const requested = await registerWithInvite(applicant.email, code.toLowerCase());
  assert.equal(requested.status, 200, await requested.clone().text());
  const verified = await fetch(`${baseUrl}/api/auth/email/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: applicant.email, code: latestEmailCode(applicant.email) }),
  });
  assert.equal(verified.status, 200, await verified.clone().text());
  assert.equal((await queryLocalD1(`SELECT COUNT(*) AS n FROM members WHERE email = ${quoteSql(applicant.email)}`))[0].n, 1);
  assert.equal((await applicationRow(applicant.id)).usesCount, 1);

  // 第二个邮箱拿同一张码:单次码已用完。
  const reuse = await registerWithInvite(applicantEmail("approve-reuse"), code);
  assert.equal(reuse.status, 400);
  assert.deepEqual(await reuse.json(), { error: "invitation_invalid" });

  const resend = await decide({ id: applicant.id, action: "resend" });
  assert.equal(resend.status, 409);
  assert.equal((await resend.json()).error, "invitation_already_used");
  const reapprove = await decide({ id: applicant.id, action: "approve" });
  assert.equal(reapprove.status, 409);
  assert.equal((await reapprove.json()).error, "application_not_pending");

  const list = await fetch(`${baseUrl}/api/admin/account-applications?status=approved`, { headers: { cookie: await adminCookie() } });
  assert.equal(list.status, 200);
  const listed = (await list.json()).applications.find((entry) => entry.id === applicant.id);
  assert.equal(listed.isMember, true);
  assert.equal(listed.invitationUses, 1);
  assert.equal(listed.mailStatus, "sent");
});

test("account applications: mail failure revokes the fresh code; resend issues a new working one", async () => {
  const applicant = await applyOk("mailfail");
  failNextFakeEmailSend(1);
  const failed = await decide({ id: applicant.id, action: "approve" });
  assert.equal(failed.status, 502, await failed.clone().text());
  const failedBody = await failed.json();
  assert.equal(failedBody.error, "invite_mail_failed");
  assert.equal(failedBody.detail, "email_send_http_500");

  const afterFailure = await applicationRow(applicant.id);
  assert.equal(afterFailure.status, "approved", "审核决定不回退");
  assert.equal(afterFailure.mailStatus, "failed");
  assert.equal(afterFailure.mailError, "email_send_http_500");
  assert.notEqual(afterFailure.revokedAt, null, "发信失败的码必须被撤销");
  const failedAudit = await queryLocalD1(`SELECT COUNT(*) AS n FROM admin_audit_events WHERE action = 'account_application.mail_failed' AND target_ref = ${quoteSql(applicant.id)}`);
  assert.equal(failedAudit[0].n, 1);

  // 假上游记下了那次失败请求的正文:即使明文流出,撤销的码也注册不了。
  const leakedCode = mailsTo(applicant.email).at(-1).text.match(INVITE_CODE_PATTERN)[0];
  assert.equal(afterFailure.codeHash, sha256(leakedCode));
  const leakedAttempt = await registerWithInvite(applicant.email, leakedCode);
  assert.equal(leakedAttempt.status, 400);
  assert.deepEqual(await leakedAttempt.json(), { error: "invitation_invalid" });

  const resent = await decide({ id: applicant.id, action: "resend", expiresDays: 30 });
  assert.equal(resent.status, 200, await resent.clone().text());
  const afterResend = await applicationRow(applicant.id);
  assert.equal(afterResend.mailStatus, "sent");
  assert.notEqual(afterResend.invitationId, afterFailure.invitationId, "重发必须换一张新码");
  assert.equal(afterResend.revokedAt, null);
  const freshCode = mailsTo(applicant.email).at(-1).text.match(INVITE_CODE_PATTERN)[0];
  assert.notEqual(freshCode, leakedCode);
  assert.equal(afterResend.codeHash, sha256(freshCode));
  const usable = await registerWithInvite(applicant.email, freshCode);
  assert.equal(usable.status, 200, "重发的新码必须可用于注册");

  // 再重发一次:旧码(刚发出的那张,尚未消费)被撤销,换上第三张。
  const previousInvitation = afterResend.invitationId;
  const resentAgain = await decide({ id: applicant.id, action: "resend" });
  assert.equal(resentAgain.status, 200);
  const replaced = (await queryLocalD1(`SELECT revoked_at AS revokedAt FROM invitation_codes WHERE id = ${quoteSql(previousInvitation)}`))[0];
  assert.notEqual(replaced.revokedAt, null, "重发必须撤销被替换的码");
});

test("account applications: reject sends nothing; a rejected email may apply again", async () => {
  const applicant = await applyOk("reject");
  const mailsBefore = mailsTo(applicant.email).length;
  const rejected = await decide({ id: applicant.id, action: "reject", note: "资料不足" });
  assert.equal(rejected.status, 200);
  const row = await applicationRow(applicant.id);
  assert.equal(row.status, "rejected");
  assert.equal(row.mailStatus, "none");
  assert.equal(row.invitationId, null);
  assert.equal(mailsTo(applicant.email).length, mailsBefore, "拒绝不发邮件");

  const approveRejected = await decide({ id: applicant.id, action: "approve" });
  assert.equal(approveRejected.status, 409);
  const reapplied = await apply({ name: "再申请", email: applicant.email, intro: "补充了作品链接，再申请一次。" });
  assert.equal(reapplied.status, 202);
  assert.equal((await queryLocalD1(`SELECT COUNT(*) AS n FROM account_applications WHERE email = ${quoteSql(applicant.email)} AND status = 'pending'`))[0].n, 1);
});

// 端到端结果断言。注意:本地预览会把这三个请求串行化,落败者通常在读取阶段就 409,
// 走不到批次里的条件守卫——批次层的并发前提由 tests/account-applications.test.mjs
// 在 node:sqlite 上直接构造时序验证(删掉守卫时那边会红,这里不一定红)。
test("account applications: concurrent approvals take effect exactly once", async () => {
  const applicant = await applyOk("race");
  const responses = await Promise.all([1, 2, 3].map(() => decide({ id: applicant.id, action: "approve" })));
  const statuses = responses.map((response) => response.status).sort();
  assert.deepEqual(statuses, [200, 409, 409], `并发通过只能有一个生效,实际 ${statuses}`);
  assert.equal(mailsTo(applicant.email).length, 1, "并发通过只能发出一封邮件");
  const invitations = await queryLocalD1(`SELECT COUNT(*) AS n FROM invitation_codes WHERE label = ${quoteSql(`账户申请 ${applicant.email}`)}`);
  assert.equal(invitations[0].n, 1, "并发通过只能生成一张码");
  const audits = await queryLocalD1(`SELECT COUNT(*) AS n FROM admin_audit_events WHERE action = 'account_application.approve' AND target_ref = ${quoteSql(applicant.id)}`);
  assert.equal(audits[0].n, 1, "落败的并发请求不得留下通过审计");
});

test("account applications: admin direct invite reuses the same issuance path", async () => {
  const email = applicantEmail("direct");
  const invited = await fetch(`${baseUrl}/api/admin/account-applications`, {
    method: "POST",
    headers: jsonHeaders(await adminCookie()),
    body: JSON.stringify({ name: "直邀对象", email: email.toUpperCase(), note: "线下活动认识", expiresDays: 3 }),
  });
  const invitedText = await invited.text();
  assert.equal(invited.status, 201, invitedText);
  assert.doesNotMatch(invitedText, /ZC-/);
  const id = JSON.parse(invitedText).id;
  const row = await applicationRow(id);
  assert.equal(row.source, "admin");
  assert.equal(row.status, "approved");
  assert.equal(row.mailStatus, "sent");
  const code = mailsTo(email).at(-1).text.match(INVITE_CODE_PATTERN)[0];
  assert.equal(row.codeHash, sha256(code));

  const duplicatePending = await applyOk("direct-pending");
  const conflict = await fetch(`${baseUrl}/api/admin/account-applications`, {
    method: "POST",
    headers: jsonHeaders(await adminCookie()),
    body: JSON.stringify({ name: "重复", email: duplicatePending.email }),
  });
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: "application_pending_exists", id: duplicatePending.id });

  const memberEmail = applicantEmail("direct-member");
  await login(memberEmail);
  const memberInvite = await fetch(`${baseUrl}/api/admin/account-applications`, {
    method: "POST",
    headers: jsonHeaders(await adminCookie()),
    body: JSON.stringify({ name: "已是会员", email: memberEmail }),
  });
  assert.equal(memberInvite.status, 409);
  assert.equal((await memberInvite.json()).error, "applicant_already_member");
  assert.equal(mailsTo(memberEmail).length, 0);
});
}
