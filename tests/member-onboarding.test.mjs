// 首次登录引导 + 唯一用户名 + 管理员直接开通 · 纯逻辑契约(无 Wrangler):
// 用户名/昵称/选填资料规则、Worker 引导门禁判定、开通通知模板、
// node:sqlite + 全量生产迁移执行共享 SQL 与 0043 触发器(格式/不可改/引导须先有用户名/唯一),
// 以及「存量会员迁移后不被拦」的升级语义。端到端在 tests/suites/21-member-onboarding.tests.mjs。
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  RESERVED_USERNAMES,
  normalizeNickname,
  normalizeOptionalProfile,
  normalizeUsername,
} from "../app/api/_lib/member-identity-rules.ts";
import {
  CLAIM_USERNAME_SQL,
  COMPLETE_ONBOARDING_SQL,
  EMAIL_REGISTER_MEMBER_SQL,
  OAUTH_REGISTER_MEMBER_SQL,
  PROVISION_MEMBER_SQL,
  SET_NICKNAME_SQL,
  SYNC_PROVIDER_DISPLAY_NAME_SQL,
} from "../app/api/_lib/member-identity-sql.ts";
import { PROVISIONED_EMAIL_SUBJECT, accountProvisionedEmail } from "../app/api/_lib/invite-mail.ts";
import { isDocumentNavigation, isOnboardingGatedPath, onboardingRedirect } from "../worker/onboarding-gate.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// ———— 规则 ————

test("用户名:NFKC/大小写/空白归一后按格式判定,保留名拒绝", () => {
  assert.deepEqual(normalizeUsername("  Lin_Xiaoman2 "), { ok: true, value: "lin_xiaoman2" });
  assert.deepEqual(normalizeUsername("ｌｉｎ＿ａ１"), { ok: true, value: "lin_a1" }, "全角输入归一为半角");
  assert.deepEqual(normalizeUsername("abc"), { ok: true, value: "abc" });
  assert.deepEqual(normalizeUsername("a".repeat(20)), { ok: true, value: "a".repeat(20) });
  for (const bad of ["ab", "a".repeat(21), "1abc", "_abc", "ab-c", "ab.c", "林小满", "", 42, null]) {
    assert.deepEqual(normalizeUsername(bad), { ok: false, error: "invalid_username" }, String(bad));
  }
  for (const reserved of ["admin", "Zaochang", "ROOT", "agent"]) {
    assert.deepEqual(normalizeUsername(reserved), { ok: false, error: "username_reserved" }, reserved);
  }
  for (const name of RESERVED_USERNAMES) assert.match(name, /^[a-z][a-z0-9_]*$/, `保留名必须是已归一形态:${name}`);
});

test("昵称:按码点计长 2–20、压空白、拒冒充词;可重复不在此判定", () => {
  assert.deepEqual(normalizeNickname("  林  小满 "), { ok: true, value: "林 小满" });
  assert.deepEqual(normalizeNickname("🎨🎨"), { ok: true, value: "🎨🎨" }, "emoji 按码点算 2 个字");
  assert.deepEqual(normalizeNickname("长".repeat(20)), { ok: true, value: "长".repeat(20) });
  for (const bad of ["林", "长".repeat(21), "   ", 7]) {
    assert.deepEqual(normalizeNickname(bad), { ok: false, error: "invalid_nickname" }, String(bad));
  }
  for (const bad of ["造场官方小助手", "社区管理员", "系统消息"]) {
    assert.deepEqual(normalizeNickname(bad), { ok: false, error: "nickname_reserved" }, bad);
  }
});

test("选填资料:空 = 保留现值(null),非空才校验;主页规则与 update_profile 同一条", () => {
  assert.deepEqual(normalizeOptionalProfile({}), { ok: true, value: { bio: null, location: null, website: null } });
  assert.deepEqual(normalizeOptionalProfile({ bio: "  做像素小游戏的人  ", location: " 上海 ", website: "https://example.com" }), {
    ok: true, value: { bio: "做像素小游戏的人", location: "上海", website: "https://example.com" },
  });
  assert.deepEqual(normalizeOptionalProfile({ website: "example.com/me" }).ok, true);
  for (const [input, error] of [
    [{ bio: "短" }, "invalid_bio"],
    [{ bio: "长".repeat(181) }, "invalid_bio"],
    [{ location: "地".repeat(41) }, "invalid_location"],
    [{ website: "javascript:alert(1)" }, "invalid_website"],
    [{ website: `https://example.com/${"a".repeat(120)}` }, "invalid_website"],
  ]) {
    assert.deepEqual(normalizeOptionalProfile(input), { ok: false, error }, JSON.stringify(input));
  }
  const updateProfile = read("../app/api/_lib/community-actions.ts");
  assert.ok(updateProfile.includes("/^(https?:\\/\\/|[\\w.-]+\\.[a-z]{2,})/i"), "update_profile 的主页规则字面量必须与引导一致");
});

// ———— Worker 引导门禁 ————

const nav = (path, headers = { "sec-fetch-mode": "navigate" }, method = "GET") =>
  new Request(`https://aetherstudio.top${path}`, { method, headers });

test("门禁判定:只认整页导航(sec-fetch-mode=navigate;无该头时 Accept 含 text/html)", () => {
  assert.equal(isDocumentNavigation(nav("/profile")), true);
  assert.equal(isDocumentNavigation(nav("/profile", { "sec-fetch-mode": "cors", accept: "text/html" })), false, "有 sec-fetch-mode 时以它为准");
  assert.equal(isDocumentNavigation(nav("/profile", { "sec-fetch-mode": "no-cors" })), false);
  assert.equal(isDocumentNavigation(nav("/profile", { accept: "text/html,application/xhtml+xml" })), true);
  assert.equal(isDocumentNavigation(nav("/profile", { accept: "text/x-component" })), false, "RSC 软导航不拦");
  assert.equal(isDocumentNavigation(nav("/profile", { "sec-fetch-mode": "navigate" }, "POST")), false);
});

test("门禁路径:引导页/登录/申请/API/静态资源豁免,站内页面与见界受门禁(前缀边界精确)", () => {
  for (const path of ["/welcome", "/welcome/x", "/signin", "/signin/qr/scan", "/signout", "/apply", "/api/community", "/api",
    "/_vinext/image", "/.well-known/openid-configuration", "/assets/a.js", "/product-apps/x/index.html", "/downloads/z.apk",
    "/email/status/abc", "/favicon.ico", "/og.png"]) {
    assert.equal(isOnboardingGatedPath(path), false, `${path} 应豁免`);
  }
  for (const path of ["/", "/profile", "/profile/edit", "/feed", "/admin", "/lattice/", "/oauth/authorize", "/welcomex", "/applyx", "/apis"]) {
    assert.equal(isOnboardingGatedPath(path), true, `${path} 应受门禁`);
  }
});

test("门禁响应:302 到 /welcome 并带回原路径与查询串,no-store", () => {
  const response = onboardingRedirect("https://aetherstudio.top/feed?tab=new");
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const location = new URL(response.headers.get("location"));
  assert.equal(location.pathname, "/welcome");
  assert.equal(location.searchParams.get("return_to"), "/feed?tab=new");
});

test("Worker 入口:门禁接在共享判定上,复用会话查询,见界分支同样拦整页导航", () => {
  const src = read("../worker/index.ts");
  assert.match(src, /if \(isDocumentNavigation\(request\) && isOnboardingGatedPath\(url\.pathname\)\) \{/);
  assert.match(src, /if \(member\?\.onboardingRequired\) \{\s*return withSecurityHeaders\(request, onboardingRedirect\(request\.url\), origin\);/);
  assert.match(src, /if \(user\.onboardingRequired && isDocumentNavigation\(request\)\) \{/);
  const session = read("../app/oauth-session.ts");
  assert.match(session, /m\.onboarding_required AS onboardingRequired/);
});

// ———— 开通通知模板 ————

test("开通通知:不含任何凭据、转义入参、唯一链接是登录页", () => {
  const mail = accountProvisionedEmail({ nickname: "<b>x</b>", email: "a&b@example.com", signinUrl: "https://aetherstudio.top/signin" });
  assert.equal(mail.subject, PROVISIONED_EMAIL_SUBJECT);
  // HTML 里有 #101416 之类的色值,六位数字只在纯文本版里查。
  assert.doesNotMatch(mail.text, /ZC-|\d{6}/, "通知里不得出现邀请码或验证码");
  assert.doesNotMatch(mail.html, /ZC-/);
  assert.ok(mail.html.includes("&lt;b&gt;x&lt;/b&gt;") && !mail.html.includes("<b>x</b>"));
  assert.ok(mail.html.includes("a&amp;b@example.com"));
  assert.deepEqual([...mail.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]), ["https://aetherstudio.top/signin"]);
  assert.match(mail.text, /用户名/);
});

// ———— node:sqlite + 全量迁移 ————

const migrationsDir = new URL("../drizzle/", import.meta.url);
const migrationNames = () => readdirSync(fileURLToPath(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();

function applyMigration(db, name) {
  for (const statement of readFileSync(new URL(name, migrationsDir), "utf8").split(/--> statement-breakpoint/g)) {
    if (statement.trim()) db.exec(statement);
  }
}

function migratedDb({ before } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const name of migrationNames()) {
    if (before && name >= before) break;
    applyMigration(db, name);
  }
  return db;
}

const member = (db, email) => db.prepare(
  `SELECT display_name AS name, username, onboarding_required AS onboarding, display_name_custom AS custom, bio, location, website FROM members WHERE email = ?`,
).get(email);

test("迁移 0043 升级语义:存量会员 onboarding_required=0、无用户名、昵称未锁——不会被引导门禁拦", () => {
  const db = migratedDb({ before: "0043" });
  db.prepare(`INSERT INTO members (email, display_name) VALUES ('old@example.com', '老会员')`).run();
  applyMigration(db, "0043_member_onboarding.sql");
  assert.deepEqual({ ...member(db, "old@example.com"), bio: undefined, location: undefined, website: undefined }, {
    name: "老会员", username: null, onboarding: 0, custom: 0, bio: undefined, location: undefined, website: undefined,
  });
  db.close();
});

test("0043 触发器:用户名格式、唯一、设定后不可改/不可清空、引导须先有用户名", () => {
  const db = migratedDb();
  db.prepare(`INSERT INTO members (email, display_name) VALUES ('a@example.com', 'A'), ('b@example.com', 'B')`).run();
  for (const bad of ["ab", "1abc", "Abc", "ab-c", "a".repeat(21)]) {
    assert.throws(() => db.prepare(`UPDATE members SET username = ? WHERE email = 'a@example.com'`).run(bad), /username_invalid/, bad);
    assert.throws(() => db.prepare(`INSERT INTO members (email, display_name, username) VALUES (?, 'x', ?)`).run(`${Math.random()}@x.com`, bad), /username_invalid/, bad);
  }
  db.prepare(`UPDATE members SET username = 'alpha' WHERE email = 'a@example.com'`).run();
  assert.throws(() => db.prepare(`UPDATE members SET username = 'alpha' WHERE email = 'b@example.com'`).run(), /UNIQUE constraint failed: members\.username/);
  assert.throws(() => db.prepare(`UPDATE members SET username = 'alpha2' WHERE email = 'a@example.com'`).run(), /username_immutable/);
  assert.throws(() => db.prepare(`UPDATE members SET username = NULL WHERE email = 'a@example.com'`).run(), /username_immutable/);
  db.prepare(`UPDATE members SET username = 'alpha' WHERE email = 'a@example.com'`).run(); // 同值不算修改
  db.prepare(`UPDATE members SET onboarding_required = 1 WHERE email = 'b@example.com'`).run();
  assert.throws(() => db.prepare(`UPDATE members SET onboarding_required = 0 WHERE email = 'b@example.com'`).run(), /onboarding_requires_username/);
  db.close();
});

test("注册 SQL:新成员带引导标记;换登录方式的已有成员不被重置,本人设定的昵称不被 GitHub 覆盖", () => {
  const db = migratedDb();
  db.prepare(EMAIL_REGISTER_MEMBER_SQL).run("new-email@example.com", "new-email");
  assert.equal(member(db, "new-email@example.com").onboarding, 1);
  db.prepare(OAUTH_REGISTER_MEMBER_SQL).run("new-gh@example.com", "GitHub 昵称");
  assert.equal(member(db, "new-gh@example.com").onboarding, 1);

  // 已有成员(完成过引导、设过昵称)再用 GitHub 绑定:不重置引导、不覆盖昵称。
  db.prepare(`INSERT INTO members (email, display_name, username, display_name_custom) VALUES ('done@example.com', '本人昵称', 'done_user', 1)`).run();
  db.prepare(OAUTH_REGISTER_MEMBER_SQL).run("done@example.com", "GitHub 昵称");
  assert.deepEqual([member(db, "done@example.com").name, member(db, "done@example.com").onboarding], ["本人昵称", 0]);
  db.prepare(EMAIL_REGISTER_MEMBER_SQL).run("done@example.com", "done");
  assert.equal(member(db, "done@example.com").name, "本人昵称");

  // GitHub 每次登录的昵称同步:custom=1 不动,custom=0 照旧同步。
  assert.equal(Number(db.prepare(SYNC_PROVIDER_DISPLAY_NAME_SQL).run("GitHub 新昵称", "done@example.com").changes), 0);
  db.prepare(`INSERT INTO members (email, display_name) VALUES ('legacy-gh@example.com', '旧 GitHub 昵称')`).run();
  assert.equal(Number(db.prepare(SYNC_PROVIDER_DISPLAY_NAME_SQL).run("GitHub 新昵称", "legacy-gh@example.com").changes), 1);
  assert.equal(member(db, "legacy-gh@example.com").name, "GitHub 新昵称");
  // 一旦本人改过昵称(资料页),之后同样不再被覆盖。
  db.prepare(SET_NICKNAME_SQL).run("自己起的", "legacy-gh@example.com");
  db.prepare(SYNC_PROVIDER_DISPLAY_NAME_SQL).run("GitHub 又一个", "legacy-gh@example.com");
  assert.equal(member(db, "legacy-gh@example.com").name, "自己起的");
  db.close();
});

test("完成引导 SQL:写用户名/昵称/选填资料(NULL 保留现值)并结束引导;只生效一次;不待引导的会员 0 行", () => {
  const db = migratedDb();
  db.prepare(PROVISION_MEMBER_SQL).run("p@example.com", "p");
  const before = member(db, "p@example.com");
  const run = (username, email) => Number(db.prepare(COMPLETE_ONBOARDING_SQL)
    .run(username, "小满", null, null, "上海", "上海", null, null, email).changes);
  assert.equal(run("xiaoman", "p@example.com"), 1);
  const after = member(db, "p@example.com");
  assert.deepEqual({ name: after.name, username: after.username, onboarding: after.onboarding, custom: after.custom, location: after.location },
    { name: "小满", username: "xiaoman", onboarding: 0, custom: 1, location: "上海" });
  assert.equal(after.bio, before.bio, "bio 传 NULL 保留现值");
  assert.equal(after.website, before.website);
  assert.equal(run("xiaoman2", "p@example.com"), 0, "已完成的引导不能再走一遍(也就改不了用户名)");
  db.prepare(`INSERT INTO members (email, display_name) VALUES ('old@example.com', '老会员')`).run();
  assert.equal(run("oldie", "old@example.com"), 0, "存量会员不走引导 SQL");
  assert.throws(() => db.prepare(PROVISION_MEMBER_SQL).run("p@example.com", "again"), /UNIQUE constraint failed: members\.email/);
  db.close();
});

test("资料页认领用户名:仅当为空时一次生效", () => {
  const db = migratedDb();
  db.prepare(`INSERT INTO members (email, display_name) VALUES ('old@example.com', '老会员')`).run();
  assert.equal(Number(db.prepare(CLAIM_USERNAME_SQL).run("oldie", "old@example.com").changes), 1);
  assert.equal(Number(db.prepare(CLAIM_USERNAME_SQL).run("oldie2", "old@example.com").changes), 0);
  assert.equal(member(db, "old@example.com").username, "oldie");
  db.close();
});

// ———— 源码契约 ————

test("源码契约:oauth-session 只经共享 SQL 写昵称;开通路由仅人类管理员;开通不进 agent 能力表", () => {
  const session = read("../app/oauth-session.ts");
  assert.doesNotMatch(session, /UPDATE members SET display_name = \? WHERE email = \?`/, "不得残留无条件覆盖昵称的 SQL");
  assert.match(session, /db\.prepare\(OAUTH_REGISTER_MEMBER_SQL\)/);
  assert.match(session, /db\.prepare\(EMAIL_REGISTER_MEMBER_SQL\)/);
  const route = read("../app/api/admin/accounts/route.ts");
  assert.equal((route.match(/member: "admin"/g) ?? []).length, 2, "POST/PATCH 都必须 guardWrite admin");
  assert.doesNotMatch(route, /"adminOrAgent"/);
  const capabilities = read("../app/api/_lib/agent-auth.ts");
  assert.doesNotMatch(capabilities, /\/api\/admin\/accounts/);
  const identity = read("../app/api/_lib/member-identity.ts");
  assert.match(identity, /member\.authVia === "session"/, "身份写入只认 Cookie 会话");
  const harness = read("./harness/preview.mjs");
  assert.ok(harness.includes('"0043_member_onboarding.sql"'), "集成 harness 必须应用 0043");
});
