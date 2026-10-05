// 扫码登录纯逻辑单测 + 源码契约钉(与 passkey-core 同纪律)。
// qr-login-core 零依赖直连(strip-types);qr-login.ts 与三个路由做源码扫描,
// 锁定安全不变量:token 只存哈希、confirm/poll 双向原子消费、会话走共享管线、
// 限流齐全、UA 不透传入库。活服务器端到端在 tests/suites/13-qr-login.tests.mjs。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  QR_CONFIRM_PATH_PATTERN,
  QR_LOGIN_TOKEN_PATTERN,
  QR_LOGIN_TTL_SECONDS,
  QR_PAIR_ATTEMPTS_LIMIT,
  QR_PAIR_CODE_PATTERN,
  desktopLabelFromUserAgent,
  formatPairCode,
  parseQrLoginUrl,
} from "../app/api/_lib/qr-login-core.ts";

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), "utf8");

// ---- token / URL 形态 ----

test("qr-core: token 是 43 字符 base64url;两条路径模式只接受固定形态", () => {
  const token = "a".repeat(43);
  assert.match(token, QR_LOGIN_TOKEN_PATTERN);
  assert.match("/signin/qr/" + token, QR_CONFIRM_PATH_PATTERN);
  assert.match("/signin/qr/" + token + "/", QR_CONFIRM_PATH_PATTERN);
  assert.match("/signin/qr-pair/" + token, /^\/signin\/qr-pair\/[A-Za-z0-9_-]{43}\/?$/);
  assert.doesNotMatch("/signin/qr/" + "+".repeat(43), QR_CONFIRM_PATH_PATTERN, "标准 base64 字符(+/)拒绝");
  assert.doesNotMatch("/signin/qr/" + "a".repeat(42), QR_CONFIRM_PATH_PATTERN, "短 token 拒绝");
  assert.doesNotMatch("/signin/qr/" + token + "/extra", QR_CONFIRM_PATH_PATTERN, "追加路径拒绝");
  assert.doesNotMatch("/signin/qr/" + token + "?x=1", QR_CONFIRM_PATH_PATTERN, "query 落在 pathname 之外");
  assert.doesNotMatch("/signin/qr-pair/" + token, QR_CONFIRM_PATH_PATTERN, "配对路径不冒充确认路径");
});

test("qr-core: 配对码形态与展示分组", () => {
  assert.match("037592", QR_PAIR_CODE_PATTERN);
  assert.doesNotMatch("03759", QR_PAIR_CODE_PATTERN);
  assert.doesNotMatch("03759a", QR_PAIR_CODE_PATTERN);
  assert.equal(formatPairCode("037592"), "037 592");
  assert.equal(formatPairCode("bad"), "bad", "非形态原样返回(不应出现)");
  assert.equal(QR_PAIR_ATTEMPTS_LIMIT, 5);
});

test("qr-core: parseQrLoginUrl 区分两个方向,只接受同源登录链接", () => {
  const token = "b".repeat(43);
  const origin = "https://aetherstudio.top";
  assert.deepEqual(parseQrLoginUrl(`https://aetherstudio.top/signin/qr/${token}`, origin), { kind: "confirm", token });
  assert.deepEqual(parseQrLoginUrl(`https://aetherstudio.top/signin/qr/${token}/`, origin), { kind: "confirm", token }, "尾斜杠容忍");
  assert.deepEqual(parseQrLoginUrl(`https://aetherstudio.top/signin/qr-pair/${token}`, origin), { kind: "pair", token });
  // 大小写不敏感的 host 比对
  assert.deepEqual(parseQrLoginUrl(`https://AetherStudio.Top/signin/qr/${token}`, origin), { kind: "confirm", token });
  assert.equal(parseQrLoginUrl(`https://evil.example/signin/qr/${token}`, origin), null, "外站拒绝");
  assert.equal(parseQrLoginUrl(`https://aetherstudio.top.evil.example/signin/qr/${token}`, origin), null, "后缀伪装拒绝");
  assert.equal(parseQrLoginUrl(`http://aetherstudio.top/signin/qr/${token}`, origin), null, "协议必须一致");
  assert.equal(parseQrLoginUrl(`javascript:alert(1)`, origin), null, "scheme 注入拒绝");
  assert.equal(parseQrLoginUrl(`https://aetherstudio.top/signin/other/${token}`, origin), null, "路径不对拒绝");
  assert.equal(parseQrLoginUrl("not a url", origin), null);
});

// ---- desktopLabel:白名单词拼装,UA 子串不入库 ----

test("qr-core: desktopLabel 只由白名单词拼出", () => {
  assert.equal(desktopLabelFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"), "Chrome · Windows");
  assert.equal(desktopLabelFromUserAgent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0"), "Edge · Windows");
  assert.equal(desktopLabelFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"), "Safari · macOS");
  assert.equal(desktopLabelFromUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0"), "Firefox · Linux");
  assert.equal(desktopLabelFromUserAgent(null), "桌面端");
  assert.equal(desktopLabelFromUserAgent("SomeRandomBot/1.0"), "浏览器", "未识别 UA 回落通用词");
});

// ---- TTL ----

test("qr-core: 会话 TTL 为 120 秒", () => {
  assert.equal(QR_LOGIN_TTL_SECONDS, 120);
});

// ---- 源码契约:qr-login.ts ----

test("qr-contract: token 只存 SHA-256,本体只出现在 QR URL", () => {
  const source = read("app/api/_lib/qr-login.ts");
  assert.match(source, /hashToken\(token\)/, "token 必须哈希后入库");
  assert.match(source, /`INSERT INTO qr_login_sessions[\s\S]*?token_hash/, "写表列是 token_hash");
  assert.doesNotMatch(source, /VALUES \(\?, \?, \?, \?, \?\)[^]*?token[^)]/, "不将 token 本体直接绑参入库");
});

test("qr-contract: poll 消费是条件 UPDATE + meta.changes(防并发双登录)", () => {
  const source = read("app/api/_lib/qr-login.ts");
  assert.match(
    source,
    /SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP[\s\S]*?WHERE token_hash = \? AND status = 'confirmed'/,
    "confirmed→consumed 必须带状态前置条件",
  );
  assert.match(source, /meta\.changes \?\? 0\) === 0\) return \{ status: "taken" \}/, "并发败者必须得到 taken");
  assert.match(
    source,
    /SET status = 'confirmed', member_email = \?, confirmed_at = CURRENT_TIMESTAMP[\s\S]*?WHERE token_hash = \? AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP/,
    "confirm 必须 pending 且未过期才可迁移",
  );
});

test("qr-contract: 会话走共享管线 createOAuthSession(provider 'qr') + setAuthCookies", () => {
  const source = read("app/api/_lib/qr-login.ts");
  assert.match(source, /createOAuthSession\(user, "qr"\)/);
  assert.match(source, /setAuthCookies\(session\.token/);
});

test("qr-contract: 三个方向都有限流;confirm 必须先取会话身份", () => {
  const source = read("app/api/_lib/qr-login.ts");
  assert.match(source, /enforceRateLimit\(await requestActorKey\(request, "qr-login-start"\), 10, 10 \* 60\)/);
  assert.match(source, /enforceRateLimit\(await requestActorKey\(request, "qr-login-poll"\), 300, 60\)/);
  assert.match(source, /enforceRateLimit\(await rateLimitKey\("qr-login-confirm", user\.email\), 10, 10 \* 60\)/);
  const confirmPart = source.slice(source.indexOf("export async function confirmQrLogin"));
  assert.match(confirmPart, /getOAuthSessionUser\(\)/, "confirm 必须验证成员会话");
  assert.match(confirmPart, /if \(!user\) return \{ error: "login_required", status: 401 \}/);
});

test("qr-contract: UA 只经 desktopLabelFromUserAgent 白名单化,不透传入库", () => {
  const source = read("app/api/_lib/qr-login.ts");
  const uaUses = source.match(/user-agent/g)?.length ?? 0;
  assert.equal(uaUses, 1, "user-agent 只允许出现一次(送白名单化)");
  assert.match(source, /desktopLabelFromUserAgent\(request\.headers\.get\("user-agent"\)\)/);
});

test("qr-contract: 路由是薄壳;start/poll 匿名可调不引会话库", () => {
  const startRoute = read("app/api/auth/qr/start/route.ts");
  const pollRoute = read("app/api/auth/qr/poll/route.ts");
  const confirmRoute = read("app/api/auth/qr/confirm/route.ts");
  assert.match(startRoute, /startQrLogin\(request, body\)/);
  assert.match(pollRoute, /pollQrLogin\(request, body\)/);
  assert.match(confirmRoute, /confirmQrLogin\(request, body\)/);
  assert.doesNotMatch(startRoute, /getOAuthSessionUser|oauth-session/, "start 不触碰会话");
  assert.doesNotMatch(pollRoute, /getOAuthSessionUser|next\/headers/, "poll 不读 cookie(会话在 lib 的成功分支)");
});

// ---- 迁移钉:0029 ----

test("qr-contract: 0029 迁移建 qr_login_sessions(含配对列)并把 provider CHECK 扩到 'qr'", () => {
  const sql = read("drizzle/0029_public_marten_broadcloak.sql");
  assert.match(sql, /CREATE TABLE `qr_login_sessions`/);
  assert.match(sql, /`pair_code_hash` text DEFAULT '' NOT NULL/);
  assert.match(sql, /`pair_attempts` integer DEFAULT 0 NOT NULL/);
  assert.match(sql, /CHECK\("qr_login_sessions"\."status" in \('pending', 'pair_requested', 'confirmed', 'consumed'\)\)/);
  assert.match(sql, /"session_provider_valid" CHECK\("__new_auth_sessions"\."provider" in \('google', 'github', 'email', 'passkey', 'qr'\)\)/);
  assert.match(sql, /INSERT INTO `__new_auth_sessions`[\s\S]*?SELECT .* FROM `auth_sessions`/, "旧会话行必须整表搬运");
});

test("qr-contract: harness 迁移清单包含 0029(集成库不缺表)", () => {
  const harness = read("tests/harness/preview.mjs");
  assert.match(harness, /"0029_public_marten_broadcloak\.sql"/);
});

// ---- 反向(电脑已登录 → 手机未登录)契约钉:配对码 + 桌面允许两道验证 ----

test("qr-contract: host 必须登录且按成员限流;配对码只存哈希、明文仅回显一次", () => {
  const source = read("app/api/_lib/qr-login.ts");
  const hostPart = source.slice(source.indexOf("export async function hostQrLogin"), source.indexOf("export async function pairQrLogin"));
  assert.match(hostPart, /getOAuthSessionUser\(\)/, "host 必须验证成员会话");
  assert.match(hostPart, /if \(!user\) return \{ error: "login_required", status: 401 \}/);
  assert.match(hostPart, /enforceRateLimit\(await rateLimitKey\("qr-host", user\.email\), 5, 10 \* 60\)/);
  assert.match(hostPart, /await hashToken\(code\)/, "配对码必须哈希入库");
  assert.match(hostPart, /pairCode: code/, "明文码只在 host 响应回显");
});

test("qr-contract: pair 有 5 次错码锁死(达限删行,枚举面归零)", () => {
  const source = read("app/api/_lib/qr-login.ts");
  const pairPart = source.slice(source.indexOf("export async function pairQrLogin"), source.indexOf("export async function claimQrLogin"));
  assert.match(pairPart, /QR_PAIR_ATTEMPTS_LIMIT/);
  assert.match(pairPart, /DELETE FROM qr_login_sessions WHERE token_hash = \?/, "达限必须删行");
  assert.match(pairPart, /QR_PAIR_CODE_PATTERN\.test\(code\)/, "配对码必须 6 位数字形态");
});

test("qr-contract: 方向互斥——poll/confirm 只碰正向行,claim/approve 只碰反向行", () => {
  const source = read("app/api/_lib/qr-login.ts");
  assert.match(source, /WHERE token_hash = \? AND pair_code_hash = ''/, "poll 查询锁正向");
  assert.match(source, /AND status = 'confirmed' AND pair_code_hash = ''/, "poll 消费锁正向");
  assert.match(source, /AND status = 'pending' AND pair_code_hash = '' AND expires_at > CURRENT_TIMESTAMP/, "confirm 迁移锁正向");
  assert.match(source, /WHERE token_hash = \? AND pair_code_hash != ''/, "claim 查询锁反向");
  assert.match(source, /AND status = 'confirmed' AND pair_code_hash != ''/, "claim 消费锁反向");
});

test("qr-contract: approve/deny 仅属主可操作;host-state 非属主得 expired", () => {
  const source = read("app/api/_lib/qr-login.ts");
  const approvePart = source.slice(source.indexOf("export async function approveQrLogin"));
  assert.match(approvePart, /AND member_email = \?/, "approve 必须校验属主");
  assert.match(approvePart, /status = 'pair_requested'/, "只能从 pair_requested 迁移");
  const denyPart = source.slice(source.indexOf("export async function denyQrLogin"));
  assert.match(denyPart, /AND member_email = \?/, "deny 必须校验属主");
  const statePart = source.slice(source.indexOf("export async function hostStateQrLogin"), source.indexOf("export async function approveQrLogin"));
  assert.match(statePart, /AND member_email = \?/, "host-state 查询必须按属主过滤");
});

test("qr-contract: 反向路由齐备(host/pair/claim/host-state/approve 是薄壳)", () => {
  const routes = [
    ["host", "hostQrLogin"],
    ["pair", "pairQrLogin"],
    ["claim", "claimQrLogin"],
    ["host-state", "hostStateQrLogin"],
    ["approve", "approveQrLogin"],
  ];
  for (const [name, fn] of routes) {
    const route = read(`app/api/auth/qr/${name}/route.ts`);
    assert.match(route, new RegExp(`${fn}\\(request`), `${name} 路由必须薄壳调用 ${fn}`);
  }
});
