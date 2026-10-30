// 管理员直接开通 + 首次登录引导 + 唯一用户名 · 集成套件:真实 Wrangler 预览 + 假 CF Email 上游。
// - 开通安全矩阵(匿名 401 / 普通成员 403 / agent 403 / 缺 origin 403)
// - 开通 → 通知邮件(无凭据)→ 免邀请码邮箱登录 → 整页导航被 302 到 /welcome、API 不受影响
// - 引导提交:格式/保留名/冒充昵称/占用 → 成功后门禁解除、资料落库、不可重复引导
// - 邀请码注册的新成员同样被引导;dev-login/存量会员不被拦
// - 资料页:昵称可改、用户名一次性认领;开通通知发信失败不回滚建号、可重发
// 执行顺序由 tests/rendered-html.test.mjs 的注册顺序保证(套件串行)。
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
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
let ipCounter = 0;
const nextIp = () => `198.18.${Math.floor(ipCounter / 200)}.${(ipCounter++ % 200) + 20}`;
const freshUsername = () => `u${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
const emailFor = (local) => `onboard-${local}-${runId}@example.com`;

function sessionCookie(response) {
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];
  return cookies.find((value) => value.startsWith("zaochang_session="))?.split(";")[0] ?? null;
}

async function devLogin(email) {
  const response = await fetch(`${baseUrl}/api/auth/dev-login?email=${encodeURIComponent(email)}`, {
    headers: { origin: baseUrl },
    redirect: "manual",
  });
  assert.equal(response.status, 307);
  return sessionCookie(response);
}

let adminCookiePromise;
const adminCookie = () => (adminCookiePromise ??= devLogin(adminEmail));
const jsonHeaders = (cookie) => ({ cookie, origin: baseUrl, "content-type": "application/json" });

// 真实邮箱验证码登录(可带邀请码),返回会话 cookie。
async function emailLogin(email, invitationCode) {
  const requested = await fetch(`${baseUrl}/api/auth/email/request`, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": nextIp() },
    body: JSON.stringify({ email, invitation_code: invitationCode }),
  });
  assert.equal(requested.status, 200, await requested.clone().text());
  const verified = await fetch(`${baseUrl}/api/auth/email/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code: latestEmailCode(email) }),
  });
  assert.equal(verified.status, 200, await verified.clone().text());
  const cookie = sessionCookie(verified);
  assert.ok(cookie, "邮箱验证码登录必须签发会话");
  return cookie;
}

// 浏览器整页导航(sec-fetch-mode: navigate)。不能用全局 fetch:undici 会把 sec-fetch-mode
// 强制改写成 "cors"(实测 worker 收到的是 cors),整页导航只能用 node:http 原样发出。
// 返回与 fetch Response 同名的最小接口(status / headers.get / text())。
function navigate(path, cookie) {
  return new Promise((resolve, reject) => {
    const target = new URL(path, baseUrl);
    const req = httpRequest(target, {
      method: "GET",
      headers: { cookie, "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", accept: "text/html" },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode,
          headers: { get: (name) => { const value = res.headers[name.toLowerCase()]; return Array.isArray(value) ? value.join(", ") : value ?? null; } },
          text: async () => body,
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function provision(body, headers) {
  return fetch(`${baseUrl}/api/admin/accounts`, {
    method: "POST",
    headers: headers ?? jsonHeaders(await adminCookie()),
    body: JSON.stringify(body),
  });
}

const onboard = (cookie, body) => fetch(`${baseUrl}/api/onboarding`, {
  method: "POST", headers: jsonHeaders(cookie), body: JSON.stringify(body),
});

const memberRow = async (email) => (await queryLocalD1(
  `SELECT display_name AS name, username, onboarding_required AS onboarding, display_name_custom AS custom, bio, location, website
   FROM members WHERE email = ${quoteSql(email)}`,
))[0];

export function register() {
test("member onboarding: admin provisioning security matrix", async () => {
  const body = { email: emailFor("matrix") };
  const anon = await provision(body, { "content-type": "application/json", origin: baseUrl });
  assert.equal(anon.status, 401);
  const regular = await provision(body, jsonHeaders(await devLogin(emailFor("matrix-regular"))));
  assert.equal(regular.status, 403);
  const agent = await provision(body, { authorization: "Bearer test-agent-key", "content-type": "application/json", origin: baseUrl });
  assert.equal(agent.status, 403);
  assert.equal((await agent.json()).error, "agent_scope_forbidden", "开通不在 agent 能力表内");
  const noOrigin = await provision(body, { cookie: await adminCookie(), "content-type": "application/json" });
  assert.equal(noOrigin.status, 403);
  assert.equal((await queryLocalD1(`SELECT COUNT(*) AS n FROM members WHERE email = ${quoteSql(body.email)}`))[0].n, 0, "被拒的请求不得建号");
});

test("member onboarding: provision → notice mail → invite-free email login → gated until /welcome completes", async () => {
  const email = emailFor("provisioned");
  const created = await provision({ email: email.toUpperCase(), nickname: "开通对象", note: "线下活动" });
  assert.equal(created.status, 201, await created.clone().text());
  assert.deepEqual(await created.json(), { ok: true, email, nickname: "开通对象", mailStatus: "sent", onboardingRequired: true });
  assert.deepEqual({ ...(await memberRow(email)), bio: undefined, location: undefined, website: undefined },
    { name: "开通对象", username: null, onboarding: 1, custom: 0, bio: undefined, location: undefined, website: undefined });
  assert.equal((await queryLocalD1(`SELECT COUNT(*) AS n FROM wallets WHERE user_email = ${quoteSql(email)}`))[0].n, 1);
  const record = (await queryLocalD1(`SELECT created_by AS by, note, mail_status AS mail FROM admin_provisioned_accounts WHERE email = ${quoteSql(email)}`))[0];
  assert.deepEqual({ ...record }, { by: adminEmail, note: "线下活动", mail: "sent" });
  assert.equal((await queryLocalD1(`SELECT COUNT(*) AS n FROM admin_audit_events WHERE action = 'member.provision' AND target_ref = ${quoteSql(email)}`))[0].n, 1);
  assert.equal((await queryLocalD1(`SELECT COUNT(*) AS n FROM oauth_accounts WHERE email = ${quoteSql(email)}`))[0].n, 0, "开通不写 oauth_accounts(不碰注册邀请码触发器)");

  const notice = sentEmails.filter((entry) => entry.to?.[0] === email).at(-1);
  assert.equal(notice.subject, "你的造场账户已开通");
  // 收件地址里有 runId 时间戳,先剔除再查六位数字验证码。
  assert.doesNotMatch(notice.text.replaceAll(email, ""), /ZC-|\d{6}/, "开通通知不含任何凭据");
  assert.ok(notice.html.includes(`${baseUrl}/signin`));

  const duplicate = await provision({ email });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error, "account_already_exists");

  // 免邀请码登录(已是成员分支)。
  const cookie = await emailLogin(email);

  const gated = await navigate("/profile", cookie);
  assert.equal(gated.status, 302);
  const location = new URL(gated.headers.get("location"));
  assert.equal(location.pathname, "/welcome");
  assert.equal(location.searchParams.get("return_to"), "/profile");
  assert.equal(gated.headers.get("cache-control"), "no-store");
  assert.equal((await navigate("/feed?tab=new", cookie)).headers.get("location"), `${baseUrl}/welcome?return_to=%2Ffeed%3Ftab%3Dnew`);
  // 非整页导航不拦:API 与无 sec-fetch-mode 的请求照常。
  const api = await fetch(`${baseUrl}/api/community`, { headers: { cookie, accept: "application/json" } });
  assert.equal(api.status, 200);
  // 全局 fetch 会以 sec-fetch-mode: cors 发出——正好代表 RSC 软导航/预取这类非整页请求。
  const rsc = await fetch(`${baseUrl}/profile`, { headers: { cookie, accept: "text/x-component" }, redirect: "manual" });
  assert.notEqual(rsc.status, 302, "非整页请求不拦");
  // 豁免页可直达。
  const welcome = await navigate("/welcome?return_to=%2Fprofile", cookie);
  assert.equal(welcome.status, 200);
  assert.match(await welcome.text(), /欢迎来到造场/);
  assert.equal((await navigate("/apply", cookie)).status, 200);

  for (const [body, code] of [
    [{ username: "1abc", nickname: "小满" }, "invalid_username"],
    [{ username: "Admin", nickname: "小满" }, "username_reserved"],
    [{ username: freshUsername(), nickname: "造场官方" }, "nickname_reserved"],
    [{ username: freshUsername(), nickname: "满" }, "invalid_nickname"],
    [{ username: freshUsername(), nickname: "小满", bio: "短" }, "invalid_bio"],
    [{ username: freshUsername(), nickname: "小满", website: "javascript:alert(1)" }, "invalid_website"],
  ]) {
    const response = await onboard(cookie, body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal((await response.json()).error, code);
  }
  assert.equal((await memberRow(email)).onboarding, 1, "校验失败不得结束引导");

  // 用户名被他人占用 → 409。
  const takenBy = emailFor("taken-owner");
  const takenCookie = await devLogin(takenBy);
  const taken = freshUsername();
  assert.equal((await fetch(`${baseUrl}/api/profile/identity`, { method: "POST", headers: jsonHeaders(takenCookie), body: JSON.stringify({ username: taken }) })).status, 200);
  const clash = await onboard(cookie, { username: taken.toUpperCase(), nickname: "小满" });
  assert.equal(clash.status, 409);
  assert.equal((await clash.json()).error, "username_taken");

  const username = freshUsername();
  const done = await onboard(cookie, { username: `  ${username.toUpperCase()} `, nickname: " 林  小满 ", location: "上海", return_to: "/profile" });
  assert.equal(done.status, 200, await done.clone().text());
  assert.deepEqual(await done.json(), { ok: true, username, nickname: "林 小满", return_to: "/profile" });
  const row = await memberRow(email);
  assert.deepEqual({ name: row.name, username: row.username, onboarding: row.onboarding, custom: row.custom, location: row.location },
    { name: "林 小满", username, onboarding: 0, custom: 1, location: "上海" });

  const profile = await navigate("/profile", cookie);
  assert.equal(profile.status, 200, "完成引导后门禁解除");
  assert.ok((await profile.text()).includes(`@${username}`), "主页展示 @用户名");
  const again = await onboard(cookie, { username: freshUsername(), nickname: "再来一次" });
  assert.equal(again.status, 409);
  assert.equal((await again.json()).error, "onboarding_not_required");
  assert.equal((await memberRow(email)).username, username, "用户名不可借引导再改");
  const welcomeAfter = await navigate("/welcome", cookie);
  assert.ok([302, 303, 307, 308].includes(welcomeAfter.status), "已完成引导再访问 /welcome 会被送走");

  const list = await fetch(`${baseUrl}/api/admin/accounts`, { headers: { cookie: await adminCookie() } });
  const listed = (await list.json()).accounts.find((account) => account.email === email);
  assert.equal(listed.onboardingRequired, false);
  assert.equal(listed.username, username);
  assert.ok(listed.lastSignInAt);
  const resend = await fetch(`${baseUrl}/api/admin/accounts`, { method: "PATCH", headers: jsonHeaders(await adminCookie()), body: JSON.stringify({ email, action: "resend_notice" }) });
  assert.equal(resend.status, 409);
  assert.equal((await resend.json()).error, "account_already_active");
});

test("member onboarding: invite-code registration is onboarded too; dev-login members are never gated", async () => {
  const created = await fetch(`${baseUrl}/api/admin/invitations`, {
    method: "POST", headers: jsonHeaders(await adminCookie()), body: JSON.stringify({ label: "引导测试", maxUses: 1, expiresDays: 1 }),
  });
  assert.equal(created.status, 201);
  const { invitation } = await created.json();
  const email = emailFor("invitee");
  const cookie = await emailLogin(email, invitation.code);
  assert.equal((await memberRow(email)).onboarding, 1, "邀请码注册的新成员同样要完善资料");
  const gated = await navigate("/", cookie);
  assert.equal(gated.status, 302);
  assert.equal(new URL(gated.headers.get("location")).pathname, "/welcome");

  const devEmail = emailFor("devlogin");
  const devCookie = await devLogin(devEmail);
  assert.equal((await memberRow(devEmail)).onboarding, 0);
  assert.equal((await navigate("/profile", devCookie)).status, 200, "dev-login/存量会员不被引导拦");
});

test("member onboarding: profile identity — nickname editable, username claimable exactly once", async () => {
  const email = emailFor("identity");
  const cookie = await devLogin(email);
  const call = (body) => fetch(`${baseUrl}/api/profile/identity`, { method: "POST", headers: jsonHeaders(cookie), body: JSON.stringify(body) });
  const empty = await call({});
  assert.equal(empty.status, 400);
  const badNick = await call({ nickname: "管理员小号" });
  assert.equal(badNick.status, 400);
  assert.equal((await badNick.json()).error, "nickname_reserved");

  const username = freshUsername();
  const claimed = await call({ username, nickname: "改过的昵称" });
  assert.equal(claimed.status, 200);
  assert.deepEqual(await claimed.json(), { ok: true, username, nickname: "改过的昵称" });
  const row = await memberRow(email);
  assert.deepEqual([row.username, row.name, row.custom], [username, "改过的昵称", 1]);

  // 已有用户名再认领:409,且同请求里的昵称不得被写入(先判后写,无半成功)。
  const second = await call({ username: freshUsername(), nickname: "不该写进去" });
  assert.equal(second.status, 409);
  assert.equal((await second.json()).error, "username_already_set");
  assert.equal((await memberRow(email)).name, "改过的昵称");
  const rename = await call({ nickname: "第二个昵称" });
  assert.equal(rename.status, 200);
  assert.equal((await memberRow(email)).name, "第二个昵称");
  // 会话里的显示名随之更新(requireMember 的 upsert 不会把它改回去)。
  const community = await (await fetch(`${baseUrl}/api/community`, { headers: { cookie, accept: "application/json" } })).json();
  assert.equal(JSON.stringify(community).includes("第二个昵称"), true);
  assert.equal((await memberRow(email)).name, "第二个昵称");
});

test("member onboarding: provisioning mail failure keeps the account and allows a resend; pending application is closed", async () => {
  const email = emailFor("mailfail");
  const applied = await fetch(`${baseUrl}/api/account-applications`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl, "cf-connecting-ip": nextIp() },
    body: JSON.stringify({ name: "申请人", email, intro: "想在造场发布作品，先申请账户。" }),
  });
  assert.equal(applied.status, 202);

  failNextFakeEmailSend(1);
  const failed = await provision({ email });
  assert.equal(failed.status, 502, await failed.clone().text());
  const body = await failed.json();
  assert.deepEqual([body.error, body.accountCreated, body.mailStatus], ["provision_mail_failed", true, "failed"]);
  assert.equal((await memberRow(email)).onboarding, 1, "通知失败不回滚建号");
  assert.equal((await queryLocalD1(`SELECT mail_status AS m FROM admin_provisioned_accounts WHERE email = ${quoteSql(email)}`))[0].m, "failed");
  const application = (await queryLocalD1(`SELECT status, decision_note AS note FROM account_applications WHERE email = ${quoteSql(email)}`))[0];
  assert.deepEqual({ ...application }, { status: "rejected", note: "已由管理员直接开通账户" }, "同邮箱待审申请随开通关闭");

  const resend = await fetch(`${baseUrl}/api/admin/accounts`, { method: "PATCH", headers: jsonHeaders(await adminCookie()), body: JSON.stringify({ email, action: "resend_notice" }) });
  assert.equal(resend.status, 200, await resend.clone().text());
  assert.equal((await queryLocalD1(`SELECT mail_status AS m FROM admin_provisioned_accounts WHERE email = ${quoteSql(email)}`))[0].m, "sent");
  assert.equal(sentEmails.filter((entry) => entry.to?.[0] === email && entry.subject === "你的造场账户已开通").length, 2);
  const audits = await queryLocalD1(`SELECT action FROM admin_audit_events WHERE target_ref = ${quoteSql(email)} ORDER BY created_at, id`);
  assert.deepEqual(audits.map((row) => row.action).sort(), ["member.provision", "member.provision_mail_failed", "member.provision_resend"]);
});
}
