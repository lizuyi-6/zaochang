// 见界会员兑换码 · 契约钉:码格式/归一化、路由守卫三段式、机器通道能力表、
// 授权档位解析与迁移落位。域模块链路经 community/admin 依赖 cloudflare:workers,
// 纯文本钉读源码(与 role-eligibility/hyperknow-hardening 同法);运行时行为在
// tests/suites/19-hk-redeem.tests.mjs 用真实 Wrangler 预览验证。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { AGENT_ADMIN_CAPABILITIES } from "../app/api/_lib/agent-auth.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${repoRoot}${path}`, "utf8");

test("hk redeem: agent machine channel may issue and revoke codes", () => {
  const paths = AGENT_ADMIN_CAPABILITIES.filter((cap) => cap.pathname === "/api/admin/hk-redeem-codes");
  assert.deepEqual(
    paths.map(({ method }) => method).sort(),
    ["PATCH", "POST"],
    "兑换码发放/撤销必须显式列入 AGENT_ADMIN_CAPABILITIES(机器通道唯一事实来源)",
  );
});

test("hk redeem: code generator shares the unambiguous invitation alphabet with HK- prefix", () => {
  const redeem = read("app/api/_lib/hyperknow/redeem.ts");
  assert.match(redeem, /return `HK-\$\{Array\.from\(bytes, \(value\) => alphabet\[value & 31\]\)\.join\(""\)\}`/,
    "码必须是 HK- 前缀 + 16 位无混淆表取样");
  assert.match(redeem, /const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";/,
    "alphabet 必须与邀请码同源(去 0/O/1/I),归一化才是恒等变换");
  assert.match(redeem, /hashInvitationCode/, "库存哈希必须复用邀请码的归一化+SHA-256 管线");
});

test("hk redeem: SPA consumes the result with the non-strict narrowing idiom", () => {
  const modal = read("hyperknow-spa/src/lattice/SettingsModal.tsx");
  // SPA tsconfig 未开 strict:非 strict 模式下 TS 5.x(CI 回退到根 node_modules 的
  // 5.9.3)不按 if (result.ok) 收窄布尔判别联合——本地 SPA 自带 TS 6 能过、CI 挂。
  // 既有 ChatPage 同款联合一律用 === false/=== true,这里必须同律。
  assert.match(modal, /if \(result\.ok === false\) \{/,
    "兑换结果判别必须用 === false 显式比较(非 strict 收窄惯例)");
  assert.doesNotMatch(modal, /\} else if \(result\.ok\)/, "不得用 if (result.ok) 收窄(CI 的 TS 5.x 下必挂)");
});

test("hk redeem: member endpoint keeps the member+sameOrigin+rateLimit trio", () => {
  const route = read("app/api/hyperknow/redeem/route.ts");
  assert.match(route, /requireMember\(\)/, "兑换是会员动作,必须先过 requireMember");
  assert.match(route, /assertSameOrigin\(request\)/, "兑换码是凭据类写操作,必须同源断言");
  assert.match(route, /rateLimitKey\("hyperknow-redeem", member\.email\), 10, 60 \* 60/,
    "兑换限流 10/小时(暴力尝试的纵深防御)");
});

test("hk redeem: redemption is an atomic guarded batch, errors stay non-enumerating", () => {
  const redeem = read("app/api/_lib/hyperknow/redeem.ts");
  // 条件扣次数:撤销/过期/用尽在并发下也只有一个赢家
  assert.match(redeem, /SET uses_count = uses_count \+ 1, last_used_at = CURRENT_TIMESTAMP\s+WHERE id = \? AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP AND uses_count < max_uses/,
    "扣次数必须是条件 UPDATE,把可用性守卫放进 WHERE");
  assert.match(redeem, /INSERT INTO hk_redeem_grants[\s\S]*UNIQUE/,
    "同人同码由 UNIQUE(user_email, code_id) 兜底(并发重复整批回滚)");
  assert.match(redeem, /adminAuditStatement\(\s*member\.email,\s*"hk_redeem_code\.redeem"/,
    "兑换必须与扣次数同批写审计");
  assert.match(redeem, /"redeem_invalid" }, \{ status: 400 \}/, "未知码固定 redeem_invalid/400");
  assert.match(redeem, /"redeem_unavailable" }, \{ status: 400 \}/, "撤销/过期/用尽固定 redeem_unavailable/400");
  assert.match(redeem, /"redeem_already_used" }, \{ status: 409 \}/, "本人重复兑换 409");
  // 判定顺序:本人重复先于可用性——单次码被本人兑完即用尽,409 比笼统 400 更真实
  const existingIdx = redeem.indexOf("SELECT id FROM hk_redeem_grants WHERE user_email = ? AND code_id = ?");
  const unavailableIdx = redeem.indexOf("redeem_unavailable");
  assert.ok(existingIdx > 0 && unavailableIdx > existingIdx,
    "已持有授权的判定必须排在可用性之前(单次码用尽=本人重复,不该报成不可用)");
  assert.match(redeem, /durationDays === null \? null : isoStampAt/, "永久码授权不过期,计期码从兑换时刻起算");
  assert.match(redeem, /UPDATE hk_credits SET balance = max\(balance, \?\), updated_at = CURRENT_TIMESTAMP\s+WHERE user_email = \? AND reset_date = \?/,
    "升档当日即享当日额度(只升不降),与扣次数同批事务");
  assert.match(redeem, /TIER_CONFIG\[code\.tier\]\.maxCredits, member\.email, beijingToday\(\)/,
    "抬额上限取新档位每日额度,日期用北京日界(与 hk_credits 的 reset_date 同源)");
});

test("hk redeem: admin route guards and audit actions", () => {
  const route = read("app/api/admin/hk-redeem-codes/route.ts");
  assert.match(route, /guardWrite\(request, \{ member: "adminOrAgent", sameOrigin: true \}\)/,
    "发放/撤销必须走 adminOrAgent + 同源守卫(与 invitations 逐字同款)");
  assert.match(route, /requireAdminOrAgent\(\)/, "GET 列表必须 adminOrAgent");
  const redeem = read("app/api/_lib/hyperknow/redeem.ts");
  assert.match(redeem, /"hk_redeem_code\.create"/, "发放必须写审计");
  assert.match(redeem, /"hk_redeem_code\.revoke"/, "撤销必须写审计");
});

test("hk redeem: tier resolution unions grant table with env/role tier", () => {
  const credits = read("app/api/_lib/hyperknow/credits.ts");
  assert.match(credits, /FROM hk_redeem_grants\s+WHERE user_email = \? AND \(expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP\)/,
    "授权查询必须过滤过期行,永久(NULL)长期有效");
  assert.match(credits, /ORDER BY CASE tier WHEN 'MAX' THEN 0 WHEN 'PRO' THEN 1 ELSE 2 END,\s+expires_at IS NULL DESC, expires_at DESC/,
    "取档位最高者;同档位永久优先,其次到期最晚");
  assert.match(credits, /export async function dailyCreditsFor/, "dailyCreditsFor 改 async 以纳入授权解析");
  assert.match(credits, /TIER_RANK\[grant\.tier\] <= TIER_RANK\[base\]\) return \{ tier: base, expiresAt: null \}/,
    "env/角色档位不低时不用授权到期日虚构截止时间");
  const info = read("app/api/hyperknow/auth/get_user_info/route.ts");
  assert.match(info, /expires_at: credits\.expiresAt/, "get_user_info 必须把授权到期透传给前端");
});

test("hk redeem: migration 0039 exists and is wired into the integration harness", () => {
  const migration = read("drizzle/0039_hk_redeem_codes.sql");
  assert.match(migration, /CREATE TABLE `hk_redeem_codes`/);
  assert.match(migration, /CREATE TABLE `hk_redeem_grants`/);
  assert.match(migration, /CREATE UNIQUE INDEX `hk_redeem_grants_user_code_idx`/);
  const preview = read("tests/harness/preview.mjs");
  assert.match(preview, /"0039_hk_redeem_codes\.sql"/, "迁移清单是硬编码,漏加会导致集成库缺表");
});
