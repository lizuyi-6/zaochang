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

test("admin 能力表:精确列名 moderation PATCH / invitations POST+PATCH / hk-redeem-codes POST+PATCH / incubation PATCH / mail-files POST / mail-status POST / recruit-candidates POST+PATCH / mail-send POST", () => {
  assert.equal(same(AGENT_ADMIN_CAPABILITIES), same([
    cap("PATCH", "/api/admin/moderation"),
    cap("POST", "/api/admin/invitations"),
    cap("PATCH", "/api/admin/invitations"),
    cap("POST", "/api/admin/hk-redeem-codes"),
    cap("PATCH", "/api/admin/hk-redeem-codes"),
    cap("PATCH", "/api/admin/incubation"),
    cap("POST", "/api/admin/mail-files"),
    cap("POST", "/api/admin/mail-status"),
    cap("POST", "/api/admin/recruit-candidates"),
    cap("PATCH", "/api/admin/recruit-candidates"),
    cap("POST", "/api/admin/mail-send"),
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
  assert.equal(isAgentWriteAllowed("POST", "/api/admin/mail-files"), true);
  assert.equal(isAgentWriteAllowed("POST", "/api/admin/mail-status"), true);
  assert.equal(isAgentWriteAllowed("POST", "/api/admin/recruit-candidates"), true);
  assert.equal(isAgentWriteAllowed("PATCH", "/api/admin/recruit-candidates"), true);
  assert.equal(isAgentWriteAllowed("DELETE", "/api/admin/recruit-candidates"), false); // 删除不可逆,人类专属
  assert.equal(isAgentWriteAllowed("POST", "/api/admin/mail-send"), true);
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
    ["POST", "/api/admin/mail-status/unknown"],   // 子路径不在表内
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

test("mail-files 挂载路由:adminOrAgent + 扫描管线 + public/PDF-only 语义不回退", () => {
  const src = readFileSync(new URL("../app/api/admin/mail-files/route.ts", import.meta.url), "utf8");
  assert.ok(src.includes('"adminOrAgent"'), "写守卫必须 adminOrAgent");
  assert.ok(src.includes("storeScannedUpload"), "必须走 ClamAV 扫描管线,不得直写 R2");
  assert.match(src, /visibility: "public"/, "读侧依赖 public 上传通道的匿名可读语义");
  assert.match(src, /file\.type !== "application\/pdf"/, "必须限 PDF");
  assert.ok(src.includes("auditAdminAction"), "挂载动作必须写管理审计");
});

test("mail-status 写入路由:adminOrAgent + 审计 + 局部更新合并", () => {
  const src = readFileSync(new URL("../app/api/admin/mail-status/route.ts", import.meta.url), "utf8");
  assert.ok(src.includes('"adminOrAgent"'), "写守卫必须 adminOrAgent");
  assert.ok(src.includes("upsertMailStatus"), "必须走共享的 upsert(token 校验/合并/归一化)");
  assert.ok(src.includes("auditAdminAction"), "进度更新必须写管理审计");
  assert.match(src, /MAIL_STATUS_TOKEN_PATTERN/, "调用方传入 token 必须过形状校验");
});

test("mail-status 列表读侧:requireAdminOrAgent,只读不改", () => {
  const src = readFileSync(new URL("../app/api/admin/mail-status/route.ts", import.meta.url), "utf8");
  assert.match(src, /export async function GET\(/, "管理台进度面板需要 GET 列表");
  assert.ok(src.includes("requireAdminOrAgent"), "GET 必须 requireAdminOrAgent");
  assert.ok(src.includes("listMailStatus"), "列表必须走共享 store 层");
});

test("recruit-candidates 路由:adminOrAgent + 校验纯逻辑 + 审计;无 DELETE(删除人类专属)", () => {
  const src = readFileSync(new URL("../app/api/admin/recruit-candidates/route.ts", import.meta.url), "utf8");
  assert.ok(src.includes("requireAdminOrAgent"), "GET 必须 requireAdminOrAgent");
  assert.ok(src.includes('"adminOrAgent"'), "写守卫必须 adminOrAgent");
  assert.ok(src.includes("normalizeRecruitCandidateInput"), "建档必须过共享校验");
  assert.ok(src.includes("normalizeRecruitCandidatePatch"), "局部更新必须过共享校验");
  assert.ok(src.includes("auditAdminAction"), "写操作必须写管理审计");
  assert.doesNotMatch(src, /export async function DELETE/, "删除不可逆,不在此路由暴露");
  assert.match(src, /recruit_candidate_email_exists/, "email 唯一冲突必须 409 稳定错误码");
  assert.match(src, /archived_at AS archivedAt/, "GET 必须带回归档标记,调用方才能过滤");
  assert.match(src, /recruit_candidate\.archive/, "归档必须单独记审计动作");
  assert.match(src, /recruit_candidate\.restore/, "恢复必须单独记审计动作");
  assert.match(src, /archived_at = CURRENT_TIMESTAMP/, "归档时间戳必须与表内口径一致");
});

test("mail-send 路由:一人一封去重 + 共享渲染 + 凭据 fail-closed + 候选人联动 + 审计", () => {
  const src = readFileSync(new URL("../app/api/admin/mail-send/route.ts", import.meta.url), "utf8");
  assert.ok(src.includes('"adminOrAgent"'), "写守卫必须 adminOrAgent");
  assert.ok(src.includes("renderMailTemplate"), "必须用共享渲染逻辑(预览=所发)");
  assert.ok(src.includes("sendSmtpMail"), "发送必须走 SMTP 库(cloudflare:sockets)");
  assert.match(src, /action = 'mail\.send' AND target_ref = \? AND detail = \?/, "同收件人同模板必须去重");
  assert.ok(src.includes("mail_already_sent"), "去重命中必须 409 稳定错误码");
  assert.ok(src.includes("mail_not_configured"), "凭据缺失必须 503 fail-closed");
  assert.ok(src.includes("dryRun"), "必须有 dryRun 探针(不连 SMTP 的全链路校验)");
  assert.ok(src.includes("auditAdminAction"), "发送必须写管理审计");
  assert.match(src, /UPDATE recruit_candidates/, "带 candidateId 必须联动推进环节");
  assert.match(src, /rate: \{ bucket: "mail-send"/, "发送必须单独限流桶");
  assert.ok(src.includes("assets.fetch"), "模板必须走 ASSETS binding 直读(同域自 fetch 会重进 Worker 管线)");
  assert.ok(src.includes("recruit_candidate_archived"), "归档候选人的发信必须在出信前被拦下(机器通道兜底)");
});

test("mail-send SMTP 库:续行读取 + 凭据不进错误 + 超时兜底", () => {
  const src = readFileSync(new URL("../app/api/_lib/mail-send.ts", import.meta.url), "utf8");
  assert.ok(src.includes('from "cloudflare:sockets"'), "Workers 上只能走 cloudflare:sockets");
  assert.match(src, /\^\\d\{3\} \//, "SMTP 续行必须读到「数字码+空格」末行");
  assert.ok(src.includes("smtp_timeout"), "必须有超时兜底");
  assert.doesNotMatch(src, /reply\.text.*pass|credentials\.pass.*Error/, "凭据不得进错误文本");
});

test("评审进度公开读侧:能力 URL 命中才返回、未命中 404、两路 no-store", () => {
  const src = readFileSync(new URL("../app/email/status/[token]/route.ts", import.meta.url), "utf8");
  assert.match(src, /MAIL_STATUS_TOKEN_PATTERN\.test\(token\)/, "token 形状必须先校验");
  assert.ok(src.includes('"cache-control": "no-store"'), "实时进度不得进任何缓存");
  assert.ok(src.includes("readMailStatus"), "必须按 token 单行读取");
  assert.match(src, /renderMailStatusPanelPng/, "PNG 表示必须实时渲染而非预生成");
  assert.ok(src.includes("escapeHtml"), "运营提供的文本必须转义后再进 HTML");
});

test("同源豁免必须限定 agent 身份(cookie 会话照常校验同源)", () => {
  const src = readFileSync(new URL("../app/api/_lib/route-guards.ts", import.meta.url), "utf8");
  // A8(2026-10 审计):豁免按 isAgent 判定(仅 Bearer 通道置位),不再按 email 字符串
  // 匹配——dev-login 自选 agent@zaochang 不得借此豁免同源校验。
  assert.match(src, /options\.sameOrigin && !member\.isAgent/);
});

test("requireAdminOrAgent:agent 直通,人类仍走邮箱白名单(admin_forbidden 语义不变)", () => {
  const src = readFileSync(new URL("../app/api/_lib/access-control.ts", import.meta.url), "utf8");
  // A8:agent 直通按 isAgent 判定(仅 agent Bearer token 路径置位)
  assert.match(src, /if \(member\.isAgent\) return member;/);
  assert.match(src, /accessError\("admin_forbidden", 403\)/);
  // requireAdmin 原语必须保持零变化(历史语义别名)
  assert.match(src, /export function requireAdmin\(\): Promise<MemberIdentity> \{\s*return requireRole\("admin"\);/);
});

test("capabilities 自描述端点:读面/写面如实上报两张能力表", () => {
  const src = readFileSync(new URL("../app/api/admin/capabilities/route.ts", import.meta.url), "utf8");
  assert.ok(src.includes("requireAdminOrAgent"));
  assert.ok(src.includes("[...AGENT_WRITE_CAPABILITIES, ...AGENT_ADMIN_CAPABILITIES]"));
  const reads = src.match(/reads:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
  assert.match(reads, /"\/api\/admin\/overview"/);
  assert.doesNotMatch(reads, /members|content|audit|wallets/);
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
