// 见界会员兑换码 · 集成套件:真实 Wrangler 预览,覆盖:
// - 管理端安全矩阵(匿名 401 / 普通成员 403 / 缺 origin 403 / agent 机器通道放行)
// - 发放(PRO 30 天 / MAX 永久)→ 兑换 → get_user_info 档位/积分/到期如实上涨
// - 本人重复 409、用尽/撤销/过期/错码、审计留痕与授权行落库
// 执行顺序由 tests/rendered-html.test.mjs 的注册顺序保证(套件串行)。
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { adminEmail, baseUrl, runId, executeLocalD1, queryLocalD1 } from "../harness/preview.mjs";

const quoteSql = (value) => `'${String(value).replaceAll("'", "''")}'`;

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

async function createMember(local) {
  const email = `hk-redeem-${local}-${runId}@example.com`;
  return { email, cookie: await login(email) };
}

async function adminCreateCodes(payload) {
  const response = await fetch(`${baseUrl}/api/admin/hk-redeem-codes`, {
    method: "POST",
    headers: jsonHeaders(await adminCookie()),
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return body;
}

async function redeem(cookie, code, extraHeaders = {}) {
  return fetch(`${baseUrl}/api/hyperknow/redeem`, {
    method: "POST",
    headers: { ...jsonHeaders(cookie), ...extraHeaders },
    body: JSON.stringify({ code }),
  });
}

async function getSubscription(cookie) {
  const response = await fetch(`${baseUrl}/api/hyperknow/auth/get_user_info`, { headers: { cookie } });
  assert.equal(response.status, 200);
  return (await response.json()).data.subscription;
}

export function register() {
test("hk redeem codes: admin issuance security matrix", async () => {
  const regular = await createMember("matrix");
  const payload = JSON.stringify({ label: "安全矩阵", tier: "PRO", maxUses: 1, expiresDays: 30 });

  const anon = await fetch(`${baseUrl}/api/admin/hk-redeem-codes`, {
    method: "POST", headers: { "content-type": "application/json" }, body: payload,
  });
  assert.equal(anon.status, 401);

  const memberAttempt = await fetch(`${baseUrl}/api/admin/hk-redeem-codes`, {
    method: "POST", headers: jsonHeaders(regular.cookie), body: payload,
  });
  assert.equal(memberAttempt.status, 403);
  assert.equal((await memberAttempt.json()).error, "admin_forbidden");

  // 管理员 cookie 但缺 Origin 头 → 同源守卫 403(机器通道除外,靠 Bearer)
  const noOrigin = await fetch(`${baseUrl}/api/admin/hk-redeem-codes`, {
    method: "POST", headers: { cookie: await adminCookie(), "content-type": "application/json" }, body: payload,
  });
  assert.equal(noOrigin.status, 403);
  assert.equal((await noOrigin.json()).error, "invalid_origin");

  // agent token 在能力表内 → 放行;明文只在创建响应出现一次
  const agent = await fetch(`${baseUrl}/api/admin/hk-redeem-codes`, {
    method: "POST", headers: agentHeaders,
    body: JSON.stringify({ label: "机器通道", tier: "MAX", durationDays: null, maxUses: 2, expiresDays: 30, count: 2 }),
  });
  assert.equal(agent.status, 201);
  const agentBody = await agent.json();
  assert.equal(agentBody.codes.length, 2);
  for (const code of agentBody.codes) {
    assert.match(code.code, /^HK-[A-HJ-NP-Z2-9]{16}$/, "HK- 前缀 + 16 位无混淆表");
    assert.equal(code.tier, "MAX");
    assert.equal(code.durationDays, null);
  }

  // 列表:普通成员 403,管理员 200 且能看到机器通道发的码
  const memberList = await fetch(`${baseUrl}/api/admin/hk-redeem-codes`, { headers: { cookie: regular.cookie } });
  assert.equal(memberList.status, 403);
  const adminList = await fetch(`${baseUrl}/api/admin/hk-redeem-codes`, { headers: { cookie: await adminCookie() } });
  assert.equal(adminList.status, 200);
  const listed = (await adminList.json()).codes;
  assert.ok(listed.some((code) => code.id === agentBody.codes[0].id));
  assert.ok(!("code" in listed[0]), "列表不得回吐明文");
});

test("hk redeem: PRO 30d code lifts tier, daily credits and reports expiry", async () => {
  const member = await createMember("pro30");
  const created = await adminCreateCodes({ label: "PRO 30 天测试", tier: "PRO", durationDays: 30, maxUses: 1, expiresDays: 30, count: 1 });
  const code = created.codes[0];

  // 基线:FREE / 20 / 无到期
  const before = await getSubscription(member.cookie);
  assert.equal(before.tier, "FREE");
  assert.equal(before.max_credits, 20);
  assert.equal(before.expires_at, null);

  // 兑换端点同样受同源守卫
  const noOrigin = await fetch(`${baseUrl}/api/hyperknow/redeem`, {
    method: "POST", headers: { cookie: member.cookie, "content-type": "application/json" },
    body: JSON.stringify({ code: code.code }),
  });
  assert.equal(noOrigin.status, 403);
  assert.equal((await noOrigin.json()).error, "invalid_origin");

  // 小写手输也应命中(归一化恒等);兑换后档位/每日积分/到期即时生效
  const response = await redeem(member.cookie, code.code.toLowerCase());
  const redeemed = await response.json();
  assert.equal(response.status, 200, JSON.stringify(redeemed));
  assert.equal(redeemed.tier, "PRO");
  assert.ok(redeemed.expiresAt, "计期码授权必须有到期");

  const after = await getSubscription(member.cookie);
  assert.equal(after.tier, "PRO");
  assert.equal(after.max_credits, 100);
  assert.equal(after.remaining_credits, 100, "当日余额整额续满到 PRO 档");
  assert.ok(after.expires_at);

  // 本人重复兑换 → 409,次数不重复扣
  const again = await redeem(member.cookie, code.code);
  assert.equal(again.status, 409);
  assert.equal((await again.json()).error, "redeem_already_used");
  const codeRows = await queryLocalD1(`SELECT uses_count FROM hk_redeem_codes WHERE id = ${quoteSql(code.id)}`);
  assert.equal(codeRows[0].uses_count, 1);

  // 授权行与审计留痕
  const grants = await queryLocalD1(
    `SELECT tier, expires_at FROM hk_redeem_grants WHERE user_email = ${quoteSql(member.email)}`,
  );
  assert.equal(grants.length, 1);
  assert.equal(grants[0].tier, "PRO");
  assert.ok(grants[0].expires_at);
  const audits = await queryLocalD1(
    `SELECT action FROM admin_audit_events WHERE action = 'hk_redeem_code.redeem' AND actor_email = ${quoteSql(member.email)}`,
  );
  assert.equal(audits.length, 1);
});

test("hk redeem: MAX permanent code shares across users then exhausts; revoke blocks future only", async () => {
  const created = await adminCreateCodes({ label: "MAX 永久共享", tier: "MAX", durationDays: null, maxUses: 2, expiresDays: 90, count: 2 });
  const [shared, toRevoke] = created.codes;
  const userA = await createMember("maxperm-a");
  const userB = await createMember("maxperm-b");
  const userC = await createMember("maxperm-c");

  const first = await redeem(userA.cookie, shared.code);
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.tier, "MAX");
  assert.equal(firstBody.expiresAt, null, "永久码授权不过期");
  const subA = await getSubscription(userA.cookie);
  assert.equal(subA.tier, "MAX");
  assert.equal(subA.max_credits, 500);
  assert.equal(subA.expires_at, null, "永久授权不虚构到期时间");

  assert.equal((await redeem(userB.cookie, shared.code)).status, 200, "第二个成员用同一张码(每码 2 次)");
  const exhausted = await redeem(userC.cookie, shared.code);
  assert.equal(exhausted.status, 400);
  assert.equal((await exhausted.json()).error, "redeem_unavailable");

  // 撤销:拦未消耗的兑换,已发授权保留
  const revoke = await fetch(`${baseUrl}/api/admin/hk-redeem-codes`, {
    method: "PATCH", headers: jsonHeaders(await adminCookie()),
    body: JSON.stringify({ id: toRevoke.id, action: "revoke", reason: "测试撤销发放" }),
  });
  assert.equal(revoke.status, 200);
  const revokedAttempt = await redeem(userC.cookie, toRevoke.code);
  assert.equal(revokedAttempt.status, 400);
  assert.equal((await revokedAttempt.json()).error, "redeem_unavailable");
  const subAAfterRevoke = await getSubscription(userA.cookie);
  assert.equal(subAAfterRevoke.tier, "MAX", "撤码不回收已发授权");

  // 错码(格式合法但不存在)与错格式
  const invalid = await redeem(userC.cookie, "HK-QQ2W3E4R5T6Y7U8I");
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error, "redeem_invalid");
  const malformed = await redeem(userC.cookie, "不是兑换码");
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error, "redeem_invalid");

  // 过期码:直接落库一个已过有效期的码,兑换必须被拦
  const expiredPlain = "HK-EXPIREDTESTCODE1";
  const expiredHash = createHash("sha256").update(expiredPlain).digest("hex");
  await executeLocalD1(`
    INSERT INTO hk_redeem_codes (id, code_hash, label, tier, duration_days, max_uses, expires_at, created_by)
    VALUES ('hkcode:expired-test', '${expiredHash}', '过期测试', 'PRO', 30, 1, '2020-01-01 00:00:00', 'test');
  `);
  const expiredAttempt = await redeem(userC.cookie, expiredPlain.toLowerCase());
  assert.equal(expiredAttempt.status, 400);
  assert.equal((await expiredAttempt.json()).error, "redeem_unavailable");

  // 审计:发放与撤销都有留痕(批次发放的审计挂在首张码上)
  const createAudits = await queryLocalD1(
    `SELECT action FROM admin_audit_events WHERE target_type = 'hk_redeem_code' AND target_ref = ${quoteSql(shared.id)} AND action = 'hk_redeem_code.create'`,
  );
  assert.equal(createAudits.length, 1);
  const revokeAudits = await queryLocalD1(
    `SELECT action FROM admin_audit_events WHERE target_type = 'hk_redeem_code' AND target_ref = ${quoteSql(toRevoke.id)} AND action = 'hk_redeem_code.revoke'`,
  );
  assert.equal(revokeAudits.length, 1);
});
}
