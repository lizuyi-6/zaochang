import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adminEmail,
  operationsAdminEmail,
  baseUrl,
  runId,
  creditTestFruit,
  executeLocalD1,
  queryLocalD1,
} from "../harness/preview.mjs";

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

async function adminPatch(path, cookie, payload, extraHeaders = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { ...jsonHeaders(cookie), ...extraHeaders },
    body: JSON.stringify(payload),
  });
}

async function createMember(email) {
  const cookie = await login(email);
  return { email, cookie };
}

async function createApiKey(cookie, name) {
  const response = await fetch(`${baseUrl}/api/api-keys`, {
    method: "POST",
    headers: jsonHeaders(cookie),
    body: JSON.stringify({ name, expires_in_days: 30 }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  assert.match(body.token, /^zc_[A-Za-z0-9_-]{43}$/);
  return body;
}

export function register() {
test("admin platform routes keep PII and write access out of the agent scope", async () => {
  const regular = await createMember(`admin-platform-reader-${runId}@example.com`);
  const admin = await adminCookie();
  const protectedGets = [
    "/api/admin/members",
    "/api/admin/members/detail?email=missing%40example.com",
    "/api/admin/content?type=product",
    "/api/admin/overview",
    "/api/admin/audit",
    "/api/admin/wallets/review",
  ];
  for (const path of protectedGets) {
    const response = await fetch(`${baseUrl}${path}`, { headers: { cookie: regular.cookie } });
    assert.equal(response.status, 403, `${path} must reject a regular member`);
    assert.equal((await response.json()).error, "admin_forbidden");
  }

  const agentHeaders = { authorization: "Bearer test-agent-key", "content-type": "application/json" };
  const agentMembers = await fetch(`${baseUrl}/api/admin/members`, { headers: agentHeaders });
  assert.equal(agentMembers.status, 403);
  assert.equal((await agentMembers.json()).error, "admin_forbidden");
  const agentMemberPatch = await fetch(`${baseUrl}/api/admin/members`, {
    method: "PATCH",
    headers: { ...agentHeaders, origin: baseUrl },
    body: JSON.stringify({ action: "suspend", email: regular.email, reason: "agent should not suspend" }),
  });
  assert.equal(agentMemberPatch.status, 403);
  assert.equal((await agentMemberPatch.json()).error, "agent_scope_forbidden");
  const agentContentPatch = await fetch(`${baseUrl}/api/admin/content`, {
    method: "PATCH",
    headers: { ...agentHeaders, origin: baseUrl },
    body: JSON.stringify({ action: "takedown", type: "post", ref: "1", reason: "agent should not hide" }),
  });
  assert.equal(agentContentPatch.status, 403);
  assert.equal((await agentContentPatch.json()).error, "agent_scope_forbidden");

  const agentOverview = await fetch(`${baseUrl}/api/admin/overview`, { headers: { authorization: "Bearer test-agent-key" } });
  assert.equal(agentOverview.status, 200);
  const overview = await agentOverview.json();
  assert.equal(typeof overview.members.total, "number");
  assert.equal("email" in overview.members, false);
  // 总览只给聚合数字:返回体里任何位置出现邮箱(含 @)都算 PII 泄露。
  assert.doesNotMatch(JSON.stringify(overview), /@/);

  for (const path of ["/api/admin/members", "/api/admin/content"]) {
    const missingOrigin = await fetch(`${baseUrl}${path}`, {
      method: "PATCH",
      headers: { cookie: admin, "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(missingOrigin.status, 403);
    assert.equal((await missingOrigin.json()).error, "invalid_origin");
    const malformed = await fetch(`${baseUrl}${path}`, {
      method: "PATCH",
      headers: jsonHeaders(admin),
      body: "{bad json",
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error, "invalid_request");
  }
});

test("suspension revokes credentials, blocks stale identity, and unsuspension does not restore keys", async () => {
  const member = await createMember(`admin-platform-suspend-${runId}@example.com`);
  const key = await createApiKey(member.cookie, `suspend-${runId}`);
  const before = await queryLocalD1(
    `SELECT (SELECT COUNT(*) FROM auth_sessions WHERE user_email = ${quoteSql(member.email)}) AS sessions,
            (SELECT COUNT(*) FROM api_keys WHERE id = ${quoteSql(key.key.id)} AND revoked_at IS NULL) AS activeKeys`,
  );
  assert.equal(before[0].sessions, 1);
  assert.equal(before[0].activeKeys, 1);

  const reason = `欺诈测试-${runId}`;
  const suspendedResponse = await adminPatch("/api/admin/members", await adminCookie(), {
    action: "suspend", email: member.email, reason,
  });
  const suspendedBody = await suspendedResponse.json();
  assert.equal(suspendedResponse.status, 200, JSON.stringify(suspendedBody));
  assert.equal(suspendedBody.updated, true);
  assert.equal(suspendedBody.removedSessions, 1);
  assert.equal(suspendedBody.revokedApiKeys, 1);

  const state = await queryLocalD1(
    `SELECT m.suspended_at AS suspendedAt, m.suspended_reason AS reason, m.suspended_by AS suspendedBy,
            (SELECT COUNT(*) FROM auth_sessions WHERE user_email = m.email) AS sessions,
            (SELECT revoked_at FROM api_keys WHERE id = ${quoteSql(key.key.id)}) AS keyRevokedAt,
            (SELECT COUNT(*) FROM admin_audit_events WHERE action = 'suspend_member' AND target_ref = m.email) AS auditCount
     FROM members m WHERE m.email = ${quoteSql(member.email)}`,
  );
  assert.equal(state.length, 1);
  assert.ok(state[0].suspendedAt);
  assert.equal(state[0].reason, reason);
  assert.equal(state[0].suspendedBy, adminEmail);
  assert.equal(state[0].sessions, 0);
  assert.ok(state[0].keyRevokedAt);
  assert.equal(state[0].auditCount, 1);

  const membersResponse = await fetch(`${baseUrl}/api/admin/members?q=${encodeURIComponent(member.email)}&filter=suspended`, {
    headers: { cookie: await adminCookie() },
  });
  const membersBody = await membersResponse.json();
  assert.equal(membersResponse.status, 200, JSON.stringify(membersBody));
  const listedMember = membersBody.members.find((item) => item.email === member.email);
  assert.equal(listedMember.displayName, member.email.split("@")[0]);
  assert.equal(listedMember.suspendedReason, reason);
  assert.equal(listedMember.suspendedBy, adminEmail);
  assert.equal(listedMember.activeSessions, 0);
  assert.equal(listedMember.activeApiKeys, 0);
  assert.deepEqual(listedMember.products, { pendingReview: 0, approved: 0, rejected: 0 });
  assert.equal(typeof listedMember.wallet.balance, "number");
  const detailResponse = await fetch(`${baseUrl}/api/admin/members/detail?email=${encodeURIComponent(member.email)}`, {
    headers: { cookie: await adminCookie() },
  });
  const detailBody = await detailResponse.json();
  assert.equal(detailResponse.status, 200, JSON.stringify(detailBody));
  assert.equal(detailBody.member.email, member.email);
  assert.equal(detailBody.audit.some((event) => event.action === "suspend_member" && event.targetRef === member.email), true);
  assert.deepEqual(detailBody.recentProducts, []);

  const staleCookie = await fetch(`${baseUrl}/api/api-keys`, { headers: { cookie: member.cookie } });
  assert.equal(staleCookie.status, 401);
  assert.equal((await staleCookie.json()).error, "auth_required");
  const staleKey = await fetch(`${baseUrl}/api/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${key.token}`, "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  assert.equal(staleKey.status, 401);
  assert.equal((await staleKey.json()).error, "invalid_api_key");

  const loginAgain = await fetch(`${baseUrl}/api/auth/dev-login?email=${encodeURIComponent(member.email)}`, {
    headers: { origin: baseUrl },
    redirect: "manual",
  });
  const loginAgainBody = await loginAgain.json();
  assert.equal(loginAgain.status, 403);
  assert.equal(loginAgainBody.error, "member_suspended");
  assert.equal(loginAgainBody.message, "该账号已被停用，如有疑问请联系管理员。");
  assert.equal(JSON.stringify(loginAgainBody).includes(reason), false);
  const sessionRows = await queryLocalD1(`SELECT COUNT(*) AS count FROM auth_sessions WHERE user_email = ${quoteSql(member.email)}`);
  assert.equal(sessionRows[0].count, 0);

  const unsuspendedResponse = await adminPatch("/api/admin/members", await adminCookie(), {
    action: "unsuspend", email: member.email, reason: "复核后恢复登录",
  });
  const unsuspendedBody = await unsuspendedResponse.json();
  assert.equal(unsuspendedResponse.status, 200, JSON.stringify(unsuspendedBody));
  assert.equal(unsuspendedBody.updated, true);
  const unsuspendedState = await queryLocalD1(
    `SELECT suspended_at AS suspendedAt, suspended_reason AS reason, suspended_by AS suspendedBy,
            (SELECT revoked_at FROM api_keys WHERE id = ${quoteSql(key.key.id)}) AS keyRevokedAt,
            (SELECT COUNT(*) FROM admin_audit_events WHERE action = 'unsuspend_member' AND target_ref = members.email) AS auditCount
     FROM members WHERE email = ${quoteSql(member.email)}`,
  );
  // D1 行是 null-prototype 对象,展开成普通对象再做深比较。
  assert.deepEqual({ ...unsuspendedState[0] }, { suspendedAt: null, reason: "", suspendedBy: null, keyRevokedAt: state[0].keyRevokedAt, auditCount: 1 });
  const oldKeyAfterUnsuspend = await fetch(`${baseUrl}/api/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${key.token}`, "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  });
  assert.equal(oldKeyAfterUnsuspend.status, 401);
  assert.equal((await oldKeyAfterUnsuspend.json()).error, "invalid_api_key");
  const relogin = await fetch(`${baseUrl}/api/auth/dev-login?email=${encodeURIComponent(member.email)}`, {
    headers: { origin: baseUrl },
    redirect: "manual",
  });
  assert.equal(relogin.status, 307);
  const freshCookie = sessionCookie(relogin);
  assert.ok(freshCookie);
  const freshRequest = await fetch(`${baseUrl}/api/api-keys`, { headers: { cookie: freshCookie } });
  assert.equal(freshRequest.status, 200);
  const freshKeys = await freshRequest.json();
  assert.equal(freshKeys.keys.some((item) => item.id === key.key.id && item.status === "revoked"), true);
});

test("protected and already suspended members return conflict without changing target rows", async () => {
  const admin = await adminCookie();
  await login(operationsAdminEmail);
  const protectedEmails = [adminEmail, operationsAdminEmail, "agent@zaochang"];
  for (const email of protectedEmails) {
    const before = await queryLocalD1(
      `SELECT suspended_at AS suspendedAt, suspended_reason AS reason, suspended_by AS suspendedBy,
              (SELECT COUNT(*) FROM auth_sessions WHERE user_email = members.email) AS sessions,
              (SELECT COUNT(*) FROM api_keys WHERE member_email = members.email) AS apiKeys
       FROM members WHERE email = ${quoteSql(email)}`,
    );
    const response = await adminPatch("/api/admin/members", admin, {
      action: "suspend", email, reason: "受保护对象",
    });
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.error, "member_protected");
    const after = await queryLocalD1(
      `SELECT suspended_at AS suspendedAt, suspended_reason AS reason, suspended_by AS suspendedBy,
              (SELECT COUNT(*) FROM auth_sessions WHERE user_email = members.email) AS sessions,
              (SELECT COUNT(*) FROM api_keys WHERE member_email = members.email) AS apiKeys
       FROM members WHERE email = ${quoteSql(email)}`,
    );
    assert.deepEqual(after, before);
  }

  const member = await createMember(`admin-platform-repeat-${runId}@example.com`);
  const first = await adminPatch("/api/admin/members", admin, {
    action: "suspend", email: member.email, reason: "重复封禁测试",
  });
  assert.equal(first.status, 200);
  const beforeRepeat = await queryLocalD1(
    `SELECT suspended_at AS suspendedAt, suspended_reason AS reason,
            (SELECT COUNT(*) FROM admin_audit_events WHERE action = 'suspend_member' AND target_ref = members.email) AS audits
     FROM members WHERE email = ${quoteSql(member.email)}`,
  );
  const repeated = await adminPatch("/api/admin/members", admin, {
    action: "suspend", email: member.email, reason: "再次封禁测试",
  });
  assert.equal(repeated.status, 409);
  assert.equal((await repeated.json()).error, "member_already_suspended");
  const afterRepeat = await queryLocalD1(
    `SELECT suspended_at AS suspendedAt, suspended_reason AS reason,
            (SELECT COUNT(*) FROM admin_audit_events WHERE action = 'suspend_member' AND target_ref = members.email) AS audits
     FROM members WHERE email = ${quoteSql(member.email)}`,
  );
  assert.deepEqual(afterRepeat, beforeRepeat);
});

test("direct product takedown hides public access, remediates paid purchase, and database guards stay closed", async () => {
  const owner = await createMember(`admin-platform-content-owner-${runId}@example.com`);
  const buyer = await createMember(`admin-platform-content-buyer-${runId}@example.com`);
  const settledBuyer = await createMember(`admin-platform-content-settled-buyer-${runId}@example.com`);
  // 新账号购买会被 account_too_new_for_transfer 拦下(与 06 号套件同法回拨注册时间)。
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email IN (${quoteSql(buyer.email)}, ${quoteSql(settledBuyer.email)})`);
  const title = `管理台主动下架 ${runId}`;
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: jsonHeaders(owner.cookie),
    body: JSON.stringify({ title, description: "用于验证主动下架、订单补救和数据库保护。", category: "互动体验", pricingModel: "one_time", price: 5 }),
  });
  const createdBody = await created.json();
  assert.equal(created.status, 201, JSON.stringify(createdBody));
  const productId = Number(createdBody.product.id);
  const approved = await adminPatch("/api/admin/moderation", await adminCookie(), {
    action: "approve_product", targetRef: String(productId), note: "下架集成测试前批准作品。",
  });
  assert.equal(approved.status, 200, JSON.stringify(await approved.clone().json()));
  const publicBefore = await fetch(`${baseUrl}/product/${productId}`);
  assert.equal(publicBefore.status, 200);
  await publicBefore.arrayBuffer();

  await creditTestFruit(buyer.email, 10, `admin_platform_${runId}`);
  await creditTestFruit(settledBuyer.email, 10, `admin_platform_settled_${runId}`);
  const checkout = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: jsonHeaders(buyer.cookie),
    body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `admin_platform_purchase_${runId}` }),
  });
  const checkoutBody = await checkout.json();
  assert.equal(checkout.status, 200, JSON.stringify(checkoutBody));
  assert.equal(checkoutBody.access, true);
  const settledCheckout = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: jsonHeaders(settledBuyer.cookie),
    body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `admin_platform_settled_purchase_${runId}` }),
  });
  const settledCheckoutBody = await settledCheckout.json();
  assert.equal(settledCheckout.status, 200, JSON.stringify(settledCheckoutBody));
  assert.equal(settledCheckoutBody.access, true);
  await executeLocalD1(`UPDATE product_orders SET available_at = '2020-01-01 00:00:00' WHERE product_id = ${productId} AND buyer_email = ${quoteSql(settledBuyer.email)}`);
  const settlementRead = await fetch(`${baseUrl}/api/community`, { headers: { cookie: owner.cookie } });
  assert.equal(settlementRead.status, 200);
  const settledState = await queryLocalD1(
    `SELECT status FROM product_orders WHERE product_id = ${productId} AND buyer_email = ${quoteSql(settledBuyer.email)}`,
  );
  assert.equal(settledState[0].status, "settled");
  const reason = `主动下架原因 ${runId}`;
  const takedown = await adminPatch("/api/admin/content", await adminCookie(), {
    action: "takedown", type: "product", ref: String(productId), reason,
  });
  const takedownBody = await takedown.json();
  assert.equal(takedown.status, 200, JSON.stringify(takedownBody));
  assert.equal(takedownBody.updated, true);
  assert.deepEqual(takedownBody.remediation, { refundedPending: 1, compensatedSettled: 1, revokedEntitlements: 2 });

  const productState = await queryLocalD1(
    `SELECT moderation_status AS moderationStatus, status, review_status AS reviewStatus,
            approved_version AS approvedVersion, review_version AS reviewVersion
     FROM products WHERE id = ${productId}`,
  );
  assert.equal(productState[0].moderationStatus, "hidden");
  assert.equal(productState[0].status, "published");
  assert.equal(productState[0].reviewStatus, "approved");
  const remediationState = await queryLocalD1(
    `SELECT o.status AS orderStatus, o.refund_operation_id AS refundOperationId, e.status AS entitlementStatus,
            (SELECT COUNT(*) FROM fruit_operations f WHERE f.kind = 'moderation_refund' AND f.reference_id = o.id) AS refunds,
            (SELECT detail FROM admin_audit_events WHERE action = 'takedown_content' AND target_ref = ${quoteSql(String(productId))} ORDER BY created_at DESC LIMIT 1) AS auditDetail
     FROM product_orders o JOIN product_entitlements e ON e.order_id = o.id
     WHERE o.product_id = ${productId} AND o.buyer_email IN (${quoteSql(buyer.email)}, ${quoteSql(settledBuyer.email)})`,
  );
  assert.equal(remediationState.length, 2);
  assert.equal(remediationState.every((row) => row.orderStatus === "refunded"), true);
  assert.equal(remediationState.every((row) => /^moderation-(refund|compensation):/.test(row.refundOperationId)), true);
  assert.equal(remediationState.every((row) => row.entitlementStatus === "revoked"), true);
  assert.equal(remediationState.reduce((total, row) => total + row.refunds, 0), 1);
  assert.equal(remediationState.every((row) => row.auditDetail.includes(reason)), true);
  const publicAfter = await fetch(`${baseUrl}/product/${productId}`);
  assert.equal(publicAfter.status, 404);
  await publicAfter.arrayBuffer();

  const contentSearch = await fetch(`${baseUrl}/api/admin/content?type=product&q=${encodeURIComponent(title)}`, { headers: { cookie: await adminCookie() } });
  assert.equal(contentSearch.status, 200);
  const searched = await contentSearch.json();
  assert.equal(searched.items.some((item) => item.id === productId && item.moderationStatus === "hidden"), true);

  const directOrderFailure = await executeLocalD1(`
    INSERT INTO product_orders (id, buyer_email, product_id, seller_email, pricing_model, amount, idempotency_key, purchase_operation_id, available_at)
    SELECT 'admin-platform-blocked-order-${runId}', ${quoteSql(buyer.email)}, id, owner_email, pricing_model, price,
           'admin-platform-blocked-order-${runId}', 'missing-purchase-operation', CURRENT_TIMESTAMP
    FROM products WHERE id = ${productId}
  `, false);
  assert.match(directOrderFailure, /product_order_product_not_approved/);
  const directLikeFailure = await executeLocalD1(
    `INSERT INTO product_likes (product_id, user_email) VALUES (${productId}, ${quoteSql(buyer.email)})`,
    false,
  );
  assert.match(directLikeFailure, /product_like_product_not_approved/);
  const directTipFailure = await executeLocalD1(`
    INSERT INTO fruit_operations (id, kind, idempotency_key, target_email, amount, reference_type, reference_id, description)
    VALUES ('admin-platform-blocked-tip-${runId}', 'tip', 'admin-platform-blocked-tip-${runId}', ${quoteSql(owner.email)}, 1, 'product', '${productId}', 'blocked after takedown')
  `, false);
  assert.match(directTipFailure, /product_tip_product_not_approved/);

  const versionBeforeAuthorEdit = productState[0].reviewVersion;
  await executeLocalD1(`UPDATE products SET description = description || ' 作者更新后重新提交。' WHERE id = ${productId}`);
  const resubmission = await queryLocalD1(
    `SELECT moderation_status AS moderationStatus, status, review_status AS reviewStatus,
            approved_version AS approvedVersion, review_version AS reviewVersion
     FROM products WHERE id = ${productId}`,
  );
  assert.equal(resubmission[0].moderationStatus, "visible");
  assert.equal(resubmission[0].status, "pending_review");
  assert.equal(resubmission[0].reviewStatus, "pending_review");
  assert.ok(resubmission[0].reviewVersion > versionBeforeAuthorEdit);
  assert.equal(resubmission[0].approvedVersion < resubmission[0].reviewVersion, true);
  const pendingPublicPage = await fetch(`${baseUrl}/product/${productId}`);
  assert.equal(pendingPublicPage.status, 404);
  await pendingPublicPage.arrayBuffer();
});

test("fruit risk resolution requires a reason and records the audit reason", async () => {
  const member = await createMember(`admin-platform-risk-${runId}@example.com`);
  const admin = await adminCookie();
  const riskId = `admin-platform-risk-${runId}`;
  await executeLocalD1(`INSERT INTO fruit_risk_events (id, user_email, kind, severity, evidence)
    VALUES (${quoteSql(riskId)}, ${quoteSql(member.email)}, 'admin_test', 'high', '{"source":"integration"}')`);
  const rejected = await adminPatch("/api/admin/moderation", admin, {
    action: "resolve_risk", targetRef: riskId, note: "x",
  });
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json()).error, "invalid_risk_resolution");
  const open = await queryLocalD1(`SELECT status FROM fruit_risk_events WHERE id = ${quoteSql(riskId)}`);
  assert.equal(open[0].status, "open");

  const resolved = await adminPatch("/api/admin/moderation", admin, {
    action: "resolve_risk", targetRef: riskId, note: "复核证据已核实",
  });
  assert.equal(resolved.status, 200);
  const final = await queryLocalD1(`
    SELECT r.status, a.detail
    FROM fruit_risk_events r JOIN admin_audit_events a ON a.target_ref = r.id
    WHERE r.id = ${quoteSql(riskId)} AND a.action = 'resolve_risk'
  `);
  assert.equal(final[0].status, "resolved");
  assert.equal(final[0].detail, "note=复核证据已核实");
});

test("posts can be actively hidden and restored, and overview and audit fields match D1", async () => {
  const author = await createMember(`admin-platform-post-author-${runId}@example.com`);
  const postResponse = await fetch(`${baseUrl}/api/actions`, {
    method: "POST",
    headers: jsonHeaders(author.cookie),
    body: JSON.stringify({ action: "post", content: `管理台主动内容测试 ${runId}。` }),
  });
  const postBody = await postResponse.json();
  assert.equal(postResponse.status, 201, JSON.stringify(postBody));
  const postId = Number(postBody.post.id);
  const admin = await adminCookie();
  const hide = await adminPatch("/api/admin/content", admin, {
    action: "takedown", type: "post", ref: String(postId), reason: "帖子主动下架测试",
  });
  const hideBody = await hide.json();
  assert.equal(hide.status, 200, JSON.stringify(hideBody));
  assert.equal(hideBody.updated, true);
  let postState = await queryLocalD1(`SELECT moderation_status AS moderationStatus FROM posts WHERE id = ${postId}`);
  assert.equal(postState[0].moderationStatus, "hidden");
  const restore = await adminPatch("/api/admin/content", admin, {
    action: "restore", type: "post", ref: String(postId), reason: "复核后恢复帖子",
  });
  const restoreBody = await restore.json();
  assert.equal(restore.status, 200, JSON.stringify(restoreBody));
  assert.equal(restoreBody.updated, true);
  postState = await queryLocalD1(`SELECT moderation_status AS moderationStatus FROM posts WHERE id = ${postId}`);
  assert.equal(postState[0].moderationStatus, "visible");

  const actual = await queryLocalD1(`
    SELECT
      (SELECT COUNT(*) FROM members) AS membersTotal,
      (SELECT SUM(CASE WHEN joined_at >= datetime('now', 'start of day') THEN 1 ELSE 0 END) FROM members) AS newToday,
      (SELECT SUM(CASE WHEN joined_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) FROM members) AS new7Days,
      (SELECT SUM(CASE WHEN suspended_at IS NOT NULL THEN 1 ELSE 0 END) FROM members) AS suspended,
      (SELECT SUM(CASE WHEN review_status = 'pending_review' THEN 1 ELSE 0 END) FROM products) AS pendingProducts,
      (SELECT SUM(CASE WHEN review_status = 'approved' THEN 1 ELSE 0 END) FROM products) AS approvedProducts,
      (SELECT SUM(CASE WHEN review_status = 'rejected' THEN 1 ELSE 0 END) FROM products) AS rejectedProducts,
      (SELECT COUNT(*) FROM posts) AS postsTotal,
      (SELECT COUNT(*) FROM fruit_risk_events WHERE status = 'open') AS fruitRisk,
      (SELECT COUNT(*) FROM fruit_risk_events WHERE status = 'open' AND severity = 'high') AS fruitRiskHigh,
      (SELECT COUNT(*) FROM content_reports WHERE status = 'pending') AS reportsPending,
      (SELECT COUNT(*) FROM products WHERE review_status = 'pending_review') AS productReviews,
      (SELECT COUNT(*) FROM oauth_provider_clients WHERE registration_source = 'developer' AND status = 'active'
        AND (review_status <> 'verified' OR (allowed_scopes LIKE '%fruit:%' AND write_access_approved = 0))) AS thirdPartyApps,
      (SELECT COUNT(*) FROM incubation_projects WHERE status <> '进入银河') AS incubationPending,
      (SELECT COALESCE(SUM(balance), 0) FROM wallets) AS walletBalanceTotal,
      (SELECT COALESCE(SUM(pending_balance), 0) FROM wallets) AS walletPendingBalanceTotal,
      (SELECT COALESCE(SUM(balance + pending_balance), 0) FROM wallets) AS walletCombinedTotal,
      (SELECT SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) FROM wallets) AS reviewWallets,
      (SELECT COUNT(*) FROM fruit_operations WHERE created_at >= datetime('now', '-24 hours')) AS operationsLast24h
  `);
  const overviewResponse = await fetch(`${baseUrl}/api/admin/overview`, { headers: { cookie: admin } });
  const overviewBody = await overviewResponse.json();
  assert.equal(overviewResponse.status, 200, JSON.stringify(overviewBody));
  assert.equal(overviewBody.members.total, actual[0].membersTotal);
  assert.equal(overviewBody.members.newToday, Number(actual[0].newToday ?? 0));
  assert.equal(overviewBody.members.new7Days, Number(actual[0].new7Days ?? 0));
  assert.equal(overviewBody.members.suspended, Number(actual[0].suspended ?? 0));
  assert.deepEqual(overviewBody.products.byReviewStatus, {
    pendingReview: Number(actual[0].pendingProducts ?? 0),
    approved: Number(actual[0].approvedProducts ?? 0),
    rejected: Number(actual[0].rejectedProducts ?? 0),
  });
  assert.equal(overviewBody.posts.total, actual[0].postsTotal);
  assert.deepEqual(overviewBody.queues, {
    fruitRisk: { total: actual[0].fruitRisk, high: actual[0].fruitRiskHigh },
    reports: actual[0].reportsPending,
    productReviews: actual[0].productReviews,
    thirdPartyApps: actual[0].thirdPartyApps,
    incubation: actual[0].incubationPending,
  });
  assert.equal(overviewBody.fruit.walletBalanceTotal, actual[0].walletBalanceTotal);
  assert.equal(overviewBody.fruit.walletPendingBalanceTotal, actual[0].walletPendingBalanceTotal);
  assert.equal(overviewBody.fruit.walletCombinedTotal, actual[0].walletCombinedTotal);
  assert.equal(overviewBody.fruit.reviewWallets, Number(actual[0].reviewWallets ?? 0));
  assert.equal(overviewBody.fruit.operationsLast24h, actual[0].operationsLast24h);

  const auditResponse = await fetch(`${baseUrl}/api/admin/audit?source=admin&action=restore_content`, { headers: { cookie: admin } });
  const auditBody = await auditResponse.json();
  assert.equal(auditResponse.status, 200, JSON.stringify(auditBody));
  assert.equal(auditBody.events.some((event) => event.action === "restore_content" && event.targetRef === String(postId) && event.source === "admin"), true);
  assert.equal(typeof auditBody.nextCursor === "string" || auditBody.nextCursor === null, true);

  const walletRows = await queryLocalD1(`SELECT COUNT(*) AS count FROM wallets WHERE status = 'review'`);
  const reviewWalletsResponse = await fetch(`${baseUrl}/api/admin/wallets/review`, { headers: { cookie: admin } });
  const walletBody = await reviewWalletsResponse.json();
  assert.equal(reviewWalletsResponse.status, 200, JSON.stringify(walletBody));
  assert.equal(walletBody.wallets.length, Math.min(walletRows[0].count, 50));
  assert.equal(walletBody.reviewTimeField, "wallets.updated_at");
  assert.equal("action" in (walletBody.wallets[0] ?? {}), false);
});

test("takedown reserve failure leaves the product, order, entitlement, and audit unchanged", async () => {
  const owner = await createMember(`admin-platform-failure-owner-${runId}@example.com`);
  const buyer = await createMember(`admin-platform-failure-buyer-${runId}@example.com`);
  // 新账号购买会被 account_too_new_for_transfer 拦下(与 06 号套件同法回拨注册时间)。
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = ${quoteSql(buyer.email)}`);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: jsonHeaders(owner.cookie),
    body: JSON.stringify({
      title: `管理台补偿失败 ${runId}`,
      description: "注入待结算储备不足，确认主动下架整批回滚。",
      category: "互动体验",
      pricingModel: "one_time",
      price: 5,
    }),
  });
  const createdBody = await created.json();
  assert.equal(created.status, 201, JSON.stringify(createdBody));
  const productId = Number(createdBody.product.id);
  const admin = await adminCookie();
  const approved = await adminPatch("/api/admin/moderation", admin, {
    action: "approve_product", targetRef: String(productId), note: "补偿失败测试前批准作品。",
  });
  assert.equal(approved.status, 200);
  await creditTestFruit(buyer.email, 5, `admin_platform_failure_${runId}`);
  const checkout = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: jsonHeaders(buyer.cookie),
    body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `admin_platform_failure_purchase_${runId}` }),
  });
  const checkoutBody = await checkout.json();
  assert.equal(checkout.status, 200, JSON.stringify(checkoutBody));
  const orderId = checkoutBody.order.id;
  await executeLocalD1(`UPDATE wallets SET pending_balance = 0 WHERE user_email = ${quoteSql(owner.email)}`);

  const failed = await adminPatch("/api/admin/content", admin, {
    action: "takedown", type: "product", ref: String(productId), reason: "待结算储备不足测试",
  });
  const failedBody = await failed.json();
  assert.equal(failed.status, 409);
  assert.equal(failedBody.error, "moderation_refund_reserve_unavailable");
  const finalState = await queryLocalD1(
    `SELECT p.moderation_status AS moderationStatus, o.status AS orderStatus,
            e.status AS entitlementStatus,
            (SELECT COUNT(*) FROM fruit_operations f WHERE f.reference_id = o.id AND f.kind IN ('moderation_refund', 'moderation_compensation')) AS remediationOperations,
            (SELECT COUNT(*) FROM admin_audit_events a WHERE a.action = 'takedown_content' AND a.target_ref = CAST(p.id AS TEXT)) AS takedownAudits
     FROM products p JOIN product_orders o ON o.product_id = p.id
       JOIN product_entitlements e ON e.order_id = o.id
     WHERE p.id = ${productId} AND o.id = ${quoteSql(orderId)}`,
  );
  assert.equal(finalState.length, 1);
  assert.equal(finalState[0].moderationStatus, "visible");
  assert.equal(finalState[0].orderStatus, "paid");
  assert.equal(finalState[0].entitlementStatus, "active");
  assert.equal(finalState[0].remediationOperations, 0);
  assert.equal(finalState[0].takedownAudits, 0);
  const stillPublic = await fetch(`${baseUrl}/product/${productId}`);
  assert.equal(stillPublic.status, 200);
  await stillPublic.arrayBuffer();
});
}
