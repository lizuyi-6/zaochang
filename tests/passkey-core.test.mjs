// Passkey 纯逻辑单测 + 结构契约钉。webauthn-core 零依赖直连(strip-types),
// 路由/库层做源码扫描锁定安全不变量——与 dev-login-gate/hyperknow-hardening 同纪律:
// 挑战必须服务端原子消费、会话必须走共享管线、错误码必须不泄露凭据存在性。
// 活服务器端到端(真实 ES256 断言 fixture)在 tests/suites/12-passkey.tests.mjs。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PASSKEY_EMAIL_PATTERN,
  WEBAUTHN_CHALLENGE_COOKIE,
  normalizeCredentialName,
  webauthnRpConfig,
} from "../app/api/_lib/webauthn-core.ts";

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), "utf8");

// ---- RP/origin 推导(单一事实来源:PUBLIC_APP_ORIGIN) ----

test("rpConfig: 生产配置推导 rpId 与 expectedOrigins,并为 apex 追加 www 变体", () => {
  const config = webauthnRpConfig("production", "https://aetherstudio.top", "https://aetherstudio.top/signin");
  assert.equal(config.rpId, "aetherstudio.top");
  assert.deepEqual(config.expectedOrigins, ["https://aetherstudio.top", "https://www.aetherstudio.top"]);
});

test("rpConfig: www 配置不再追加变体;IP 与单段域名不追加", () => {
  assert.deepEqual(
    webauthnRpConfig("production", "https://www.aetherstudio.top", "https://www.aetherstudio.top/").expectedOrigins,
    ["https://www.aetherstudio.top"],
  );
  const ip = webauthnRpConfig("test", undefined, "http://127.0.0.1:4179/signin");
  assert.equal(ip.rpId, "127.0.0.1");
  assert.deepEqual(ip.expectedOrigins, ["http://127.0.0.1:4179"]);
  const localhost = webauthnRpConfig("development", undefined, "http://localhost:3000/");
  assert.deepEqual(localhost.expectedOrigins, ["http://localhost:3000"]);
});

test("rpConfig: 生产未配置/畸形按 public-origin 语义 fail-closed", () => {
  assert.throws(() => webauthnRpConfig("production", undefined, "https://x/"), /public_app_origin_required/);
  assert.throws(() => webauthnRpConfig("production", "http://aetherstudio.top", "https://x/"), /invalid_public_app_origin/);
  assert.throws(() => webauthnRpConfig("production", "not a url", "https://x/"), /invalid_public_app_origin/);
});

// ---- 凭据名归一化 ----

test("credential name: 控制字符/多余空白清理,截断 60,空输入回落默认名", () => {
  assert.equal(normalizeCredentialName("  我的\u0007钥匙\t ", "通行密钥"), "我的 钥匙");
  assert.equal(normalizeCredentialName("x".repeat(80), "通行密钥"), "x".repeat(60));
  assert.equal(normalizeCredentialName("   ", "默认名"), "默认名");
  assert.equal(normalizeCredentialName(undefined, "默认名"), "默认名");
  assert.equal(normalizeCredentialName(42, "默认名"), "默认名");
});

test("email pattern 与 email-codes 的 EMAIL_PATTERN 逐字一致", () => {
  const source = read("app/api/_lib/email-codes.ts");
  const match = source.match(/const EMAIL_PATTERN = (.+);/);
  assert.ok(match, "email-codes.ts 必须声明 EMAIL_PATTERN");
  assert.equal(String(PASSKEY_EMAIL_PATTERN), match[1], "两份 pattern 必须逐字相同");
});

// ---- 结构契约:挑战生命周期与会话管线 ----

test("挑战必须服务端原子消费:consume 用条件 UPDATE + changes 判定,只存哈希", () => {
  const io = read("app/api/_lib/webauthn.ts");
  assert.match(io, /UPDATE webauthn_challenges SET consumed_at = CURRENT_TIMESTAMP\s*\n\s+WHERE challenge_hash = \? AND purpose = \? AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP/);
  assert.match(io, /consumed\.meta\.changes \?\? 0\) === 0\)\s*\n?\s*return null;/);
  assert.match(io, /hashToken\(raw\)/, "服务端只存挑战哈希");
  assert.equal(io.includes("parseChallengeCookie"), false, "纯 cookie 挑战的重放缺口不得回归");
});

test("register 路由:必须 requireMember + register purpose 隔离 + userHandle 绑定", () => {
  const register = read("app/api/auth/passkey/register/route.ts");
  const options = read("app/api/auth/passkey/register/options/route.ts");
  assert.match(options, /requireMember\(\)/, "passkey 是追加凭据,注册 options 必须已登录");
  assert.match(options, /issueChallenge\("register", options\.challenge, userHandle/, "挑战必须用库生成的 options.challenge,不得自造");
  assert.match(register, /consumeChallenge\(request, "register"\)/);
  assert.match(register, /!consumed\?\.userHandle/, "无 userHandle 的挑战(如 login 签发)不得用于注册");
  assert.match(register, /expectedChallenge: consumed\.challenge/);
});

test("login 路由:login purpose 隔离 + 同权会话管线 + return_to 净化", () => {
  const login = read("app/api/auth/passkey/login/route.ts");
  const options = read("app/api/auth/passkey/login/options/route.ts");
  assert.match(options, /issueChallenge\("login", options\.challenge, null/);
  assert.match(login, /consumeChallenge\(request, "login"\)/);
  assert.match(login, /createOAuthSession\(user, "passkey"\)/, "passkey 会话必须走共享签发管线");
  assert.match(login, /setAuthCookies\(session\.token, safeReturnPath\(/);
});

test("login 错误码不泄露凭据存在性:未知凭据与验证失败统一 passkey_invalid", () => {
  const login = read("app/api/auth/passkey/login/route.ts");
  assert.ok(!login.includes("credential_not_found"), "未认证面不得区分凭据是否存在");
  const passes = [...login.matchAll(/"passkey_invalid"/g)].length;
  assert.ok(passes >= 3, `未知凭据/异常/verified=false 三分支都要 passkey_invalid(实际 ${passes})`);
});

test("options 端点全部接限流(register/login 各自 IP 桶)", () => {
  for (const route of [
    "app/api/auth/passkey/register/options/route.ts",
    "app/api/auth/passkey/login/options/route.ts",
    "app/api/auth/passkey/register/route.ts",
    "app/api/auth/passkey/login/route.ts",
  ]) {
    assert.match(read(route), /enforceRateLimit\(await requestActorKey\(request, "passkey-/, route);
  }
});

test("purge 注册:挑战清理进入统一 cron 注册表", () => {
  const index = read("app/api/_lib/purge/index.ts");
  assert.match(index, /webauthnChallengePurgeStatements\(db\)/);
  const purge = read("app/api/_lib/purge/webauthn-challenges.ts");
  assert.match(purge, /consumed_at IS NOT NULL/);
  assert.match(purge, /expires_at < datetime\('now', '-1 day'\)/);
});

test("会话 provider 枚举扩宽:oauth-session 与 0028 迁移同步含 passkey", () => {
  assert.match(read("app/oauth-session.ts"), /SessionProvider = OAuthProvider \| "email" \| "passkey"/);
  const migration = read("drizzle/0028_confused_maximus.sql");
  assert.match(migration, /'google', 'github', 'email', 'passkey'/);
  assert.match(migration, /CREATE TABLE `webauthn_credentials`/);
  assert.match(migration, /CREATE TABLE `webauthn_challenges`/);
});

test("cookie 名固定且挑战 TTL 常量为 300s", () => {
  assert.equal(WEBAUTHN_CHALLENGE_COOKIE, "zaochang_passkey_challenge");
});

test("前端:登录按钮必须特性检测(不支持 WebAuthn 不渲染)", () => {
  const button = read("app/signin/passkey-button.tsx");
  assert.match(button, /browserSupportsWebAuthn\(\)/);
  assert.match(button, /if \(!supported\) return null;/);
});
