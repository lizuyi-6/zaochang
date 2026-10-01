// Admin API 机器通道契约:能力表内容、放行判定纯函数、fail-closed 不变量、
// 以及源码级契约(worker chokepoint 必须用共享判定;admin 路由必须用 adminOrAgent;
// 同源豁免必须限定在 agent 身份)。风格随 worker-contracts.test.mjs(纯 JS,无 D1)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AGENT_ADMIN_CAPABILITIES,
  AGENT_WRITE_CAPABILITIES,
  VISUAL_TICKET_TTL_SECONDS,
  isAgentWriteAllowed,
  signVisualTicket,
  verifyVisualTicket,
} from "../app/api/_lib/agent-auth.ts";

const cap = (method, pathname) => ({ method, pathname });
const same = (list) => JSON.stringify([...list].sort((a, b) => a.pathname.localeCompare(b.pathname) || a.method.localeCompare(b.method)));

// ---- 能力表内容逐字固定(扩面 = 显式改这里 + 改 agent-auth.ts,评审可见) ----

test("admin 能力表:精确列名 moderation PATCH / invitations POST+PATCH / incubation PATCH", () => {
  assert.equal(same(AGENT_ADMIN_CAPABILITIES), same([
    cap("PATCH", "/api/admin/moderation"),
    cap("POST", "/api/admin/invitations"),
    cap("PATCH", "/api/admin/invitations"),
    cap("PATCH", "/api/admin/incubation"),
  ]));
});

test("写能力表保持既有语义零变化(docs/products,不含 DELETE)", () => {
  assert.equal(same(AGENT_WRITE_CAPABILITIES), same([
    cap("POST", "/api/docs"),
    cap("PATCH", "/api/docs"),
    cap("POST", "/api/products"),
  ]));
});

// ---- 放行判定纯函数 ----

test("isAgentWriteAllowed:列名内精确命中(method+pathname 都要匹配)", () => {
  assert.equal(isAgentWriteAllowed("PATCH", "/api/admin/moderation"), true);
  assert.equal(isAgentWriteAllowed("POST", "/api/admin/invitations"), true);
  assert.equal(isAgentWriteAllowed("PATCH", "/api/admin/incubation"), true);
  assert.equal(isAgentWriteAllowed("POST", "/api/docs"), true);
  assert.equal(isAgentWriteAllowed("PATCH", "/api/products"), false); // method 不匹配
});

test("isAgentWriteAllowed:fail-closed——未列名/不可逆/财务/上传一律拒绝", () => {
  for (const [method, pathname] of [
    ["DELETE", "/api/docs"],
    ["DELETE", "/api/admin/moderation"],
    ["DELETE", "/api/admin/invitations"],
    ["POST", "/api/admin/moderation"],          // 未列名的 method
    ["PATCH", "/api/admin/capabilities"],        // 自描述端点只读
    ["POST", "/api/payments"],
    ["POST", "/api/v1/fruit/transfer"],
    ["POST", "/api/uploads"],
    ["PATCH", "/api/admin/unknown"],
    ["POST", "/api/admin"],
  ]) {
    assert.equal(isAgentWriteAllowed(method, pathname), false, `${method} ${pathname}`);
  }
});

// ---- 源码级契约:防回退(闸门与路由必须接在共享事实上) ----

test("worker chokepoint 使用共享判定 isAgentWriteAllowed,不得私写能力遍历", () => {
  const src = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(src, /isAgentWriteAllowed\(request\.method,\s*url\.pathname\)/);
  assert.doesNotMatch(src, /AGENT_WRITE_CAPABILITIES\.some/);
});

test("三个 admin 路由接入 adminOrAgent(读 requireAdminOrAgent,写 guardWrite adminOrAgent)", () => {
  for (const route of ["moderation", "invitations", "incubation"]) {
    const src = readFileSync(new URL(`../app/api/admin/${route}/route.ts`, import.meta.url), "utf8");
    assert.ok(src.includes("requireAdminOrAgent"), `${route}: GET 必须 requireAdminOrAgent`);
    assert.ok(src.includes('"adminOrAgent"'), `${route}: 写守卫必须 adminOrAgent`);
    assert.ok(!src.includes('"admin"'), `${route}: 不得残留旧 admin 角色`);
  }
});

test("同源豁免必须限定 agent 身份(cookie 会话照常校验同源)", () => {
  const src = readFileSync(new URL("../app/api/_lib/route-guards.ts", import.meta.url), "utf8");
  assert.match(src, /options\.sameOrigin && member\.email !== AGENT_EMAIL/);
});

test("requireAdminOrAgent:agent 直通,人类仍走邮箱白名单(admin_forbidden 语义不变)", () => {
  const src = readFileSync(new URL("../app/api/_lib/access-control.ts", import.meta.url), "utf8");
  assert.match(src, /member\.email === AGENT_EMAIL\) return member/);
  assert.match(src, /accessError\("admin_forbidden", 403\)/);
  // requireAdmin 原语必须保持零变化(历史语义别名)
  assert.match(src, /export function requireAdmin\(\): Promise<MemberIdentity> \{\s*return requireRole\("admin"\);/);
});

test("capabilities 自描述端点:读面/写面如实上报两张能力表", () => {
  const src = readFileSync(new URL("../app/api/admin/capabilities/route.ts", import.meta.url), "utf8");
  assert.ok(src.includes("requireAdminOrAgent"));
  assert.ok(src.includes("[...AGENT_WRITE_CAPABILITIES, ...AGENT_ADMIN_CAPABILITIES]"));
});


// ———— 视觉验收入场票(HMAC,无状态,10 分钟 TTL)————

test("入场票:签发即可验,过期/篡改/错钥/空票一律拒", async () => {
  const secret = "test-secret-key";
  const ticket = await signVisualTicket(secret, 1_700_000_000_000);
  assert.match(ticket, /^v1\.\d+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal((await verifyVisualTicket(secret, ticket, 1_700_000_000_000)).ok, true, "签发瞬间应验真");
  const expiredAt = 1_700_000_000_000 + (VISUAL_TICKET_TTL_SECONDS + 1) * 1000;
  assert.deepEqual(await verifyVisualTicket(secret, ticket, expiredAt), { ok: false, reason: "expired" });
  assert.equal((await verifyVisualTicket(secret, ticket + "x", 1_700_000_000_000)).ok, false, "签名篡改应拒");
  const other = await signVisualTicket("other-secret", 1_700_000_000_000);
  assert.deepEqual(await verifyVisualTicket(secret, other, 1_700_000_000_000), { ok: false, reason: "bad_signature" });
  for (const bad of [null, "", "v1", "v1.abc.def.ghi", "v2.9999999999.abc.def"]) {
    assert.notDeepEqual(await verifyVisualTicket(secret, bad, 1_700_000_000_000), { ok: true }, String(bad));
  }
  const fresh = await signVisualTicket(secret);
  assert.equal((await verifyVisualTicket(secret, fresh)).ok, true, "默认 now 签发应可验");
});

test("入场票:TTL 常量 = 600 秒", () => {
  assert.equal(VISUAL_TICKET_TTL_SECONDS, 600);
});

test("视觉会话两端点:铸票需鉴权+token 缺失 fail-closed;入场端发 HttpOnly 会话并 302 /lattice/", () => {
  const mint = readFileSync(new URL("../app/api/admin/visual-session/route.ts", import.meta.url), "utf8");
  assert.ok(mint.includes("requireAdminOrAgent"), "铸票必须过 adminOrAgent");
  assert.match(mint, /visual_session_disabled/, "token 未配置必须 503 fail-closed");
  assert.ok(mint.includes("signVisualTicket"));

  const enter = readFileSync(new URL("../app/api/admin/visual-session/enter/route.ts", import.meta.url), "utf8");
  assert.ok(enter.includes("verifyVisualTicket"), "入场必须验票");
  assert.ok(enter.includes("createOAuthSession"), "会话必须复用人类登录的会话实现");
  assert.ok(enter.includes("HttpOnly"), "会话 cookie 必须 HttpOnly");
  assert.match(enter, /Location: "\/lattice\/"|Location: .{0,4}\/lattice\//, "入场后固定去 /lattice/");
});
