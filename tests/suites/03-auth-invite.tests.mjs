// 认证·邀请·邮箱验证码·登出:自 tests/rendered-html.test.mjs 保序拆分(测试体逐字未改)。
// 执行顺序由 tests/rendered-html.test.mjs 的注册顺序保证。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { spawn, spawnSync } from "node:child_process";
import { githubConnectionPage } from "../../app/api/auth/[provider]/start/github-connection-page.ts";
import { APP_DOWNLOAD } from "../../app/api/_lib/app-download.ts";
import { resolvePublicAppOrigin } from "../../app/lib/public-origin.ts";
import { fetchWithTimeout } from "../../app/lib/fetch-with-timeout.ts";
import { GITHUB_CONNECTION_CSP } from "../../app/lib/security-policy.ts";
import {
  port,
  baseUrl,
  runId,
  adminEmail,
  projectRoot,
  sentEmails,
  latestEmailCode,
  authHeaders,
  executeLocalD1,
  queryLocalD1,
} from "../harness/preview.mjs";

export function register() {
test("uses GitHub-only invite registration and keeps unconfigured providers fail-closed", async () => {
  const signin = await fetch(`${baseUrl}/signin?return_to=%2Fwallet`, { headers: { accept: "text/html" } });
  assert.equal(signin.status, 200);
  const html = await signin.text();
  assert.match(html, /使用 GitHub 登录/);
  assert.match(html, /name="invitation_code"/);
  assert.match(html, /首次注册必填/);
  assert.match(html, /使用邀请码注册/);
  assert.match(html, /action="\/api\/auth\/github\/start"/);
  assert.match(html, /method="post"/);
  assert.doesNotMatch(html, /method="get"/);
  assert.doesNotMatch(html, /使用 Google 登录|使用 ChatGPT 登录/);
  assert.match(html, /待配置/);
  assert.match(html, /class="auth-provider github is-disabled" aria-disabled="true"/);
  assert.doesNotMatch(html, /href="\/api\/auth\/github\/start\?return_to=%2Fwallet"/);
  const source = readFileSync(join(projectRoot, "app", "signin", "page.tsx"), "utf8");
  assert.match(source, /<a className="auth-provider github" href=\{loginHref\}>/);
  assert.match(source, /action="\/api\/auth\/github\/start" method="post"/);
  // google 登录入口已移除(死代码清理):/api/auth/google/start 必须 404,
  // 不再伪装成"未配置的可用 provider"。
  const googleStart = await fetch(`${baseUrl}/api/auth/google/start?return_to=%2Fwallet`, { redirect: "manual" });
  assert.equal(googleStart.status, 404);
  const githubUnconfigured = await fetch(`${baseUrl}/api/auth/github/start?return_to=%2Fwallet`, { redirect: "manual" });
  assert.equal(githubUnconfigured.status, 307);
  assert.match(githubUnconfigured.headers.get("location") ?? "", /\/signin\?error=not_configured&provider=/);
  const submitted = await fetch(`${baseUrl}/api/auth/github/start`, {
    method: "POST",
    body: new URLSearchParams({ return_to: "/wallet" }),
    redirect: "manual",
  });
  assert.equal(submitted.status, 303);
  assert.match(submitted.headers.get("location") ?? "", /\/signin\?error=not_configured&provider=github/);
});

test("GitHub connection page fails visibly before OAuth navigation", () => {
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", "public-test-client");
  authorizeUrl.searchParams.set("redirect_uri", "https://aetherstudio.top/api/auth/github/callback");
  authorizeUrl.searchParams.set("state", "github.test-state");
  const html = githubConnectionPage(authorizeUrl, "/wallet");
  assert.match(html, /正在连接 GitHub/);
  assert.match(html, /maxAttempts = 3/);
  assert.match(html, /timeoutMs = 5000/);
  assert.match(html, /github\.com\/favicon\.ico/);
  assert.match(html, /当前网络暂时无法连接 GitHub，请检查网络后重试/);
  assert.match(html, /location\.replace\(target\)/);
  assert.match(html, /image\.onerror = \(\) => finish\(false\)/);
  assert.match(html, /\/signin\?error=github_unreachable&amp;return_to=%2Fwallet/);
  assert.doesNotMatch(html, /invitation_code|邀请码/);
  assert.match(GITHUB_CONNECTION_CSP, /default-src 'none'/);
  assert.match(GITHUB_CONNECTION_CSP, /img-src https:\/\/github\.com/);
  assert.match(GITHUB_CONNECTION_CSP, /frame-ancestors 'none'/);

  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.equal(typeof script, "string");
  const images = [];
  const timers = new Map();
  let timerId = 0;
  let navigatedTo = "";
  const status = { textContent: "" };
  const visibleClasses = new Set();
  const actions = { classList: { add: (value) => visibleClasses.add(value), remove: (value) => visibleClasses.delete(value) } };
  const retry = { click: undefined, addEventListener: (_type, handler) => { retry.click = handler; } };
  class FakeImage {
    constructor() { images.push(this); }
    remove() {}
  }
  runInNewContext(script, {
    Date,
    Image: FakeImage,
    clearTimeout: (id) => timers.delete(id),
    document: {
      body: { appendChild: () => undefined },
      getElementById: (id) => ({ status, actions, retry })[id],
    },
    location: { replace: (value) => { navigatedTo = value; } },
    setTimeout: (handler, timeout) => {
      timerId += 1;
      timers.set(timerId, { handler, timeout });
      return timerId;
    },
  });
  const runRetryTimer = () => {
    const retryTimer = [...timers.entries()].find(([, value]) => value.timeout === 350);
    assert.ok(retryTimer);
    timers.delete(retryTimer[0]);
    retryTimer[1].handler();
  };
  images.at(-1).onerror();
  runRetryTimer();
  images.at(-1).onerror();
  runRetryTimer();
  images.at(-1).onerror();
  assert.equal(navigatedTo, "");
  assert.equal(visibleClasses.has("visible"), true);
  assert.match(status.textContent, /当前网络暂时无法连接 GitHub/);

  retry.click();
  images.at(-1).onload();
  assert.equal(new URL(navigatedTo).hostname, "github.com");
});

test("OAuth provider timeout sends one request and reaches a bounded failure", async () => {
  let requestCount = 0;
  const slowProvider = createServer((_request, response) => {
    requestCount += 1;
    setTimeout(() => {
      if (!response.destroyed) response.writeHead(200).end("late");
    }, 250);
  });
  await new Promise((resolve, reject) => {
    slowProvider.once("error", reject);
    slowProvider.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = slowProvider.address();
    assert.equal(typeof address, "object");
    const startedAt = Date.now();
    await assert.rejects(
      fetchWithTimeout(`http://127.0.0.1:${address.port}/token`, { method: "POST", body: "code=one-time" }, 50),
      (error) => error instanceof Error && error.name === "TimeoutError",
    );
    assert.equal(requestCount, 1);
    assert.equal(Date.now() - startedAt < 220, true);
  } finally {
    slowProvider.closeAllConnections();
    await new Promise((resolve) => slowProvider.close(resolve));
  }
});

test("production public origin is explicit, HTTPS-only, and fail-closed", () => {
  assert.throws(
    () => resolvePublicAppOrigin("http://127.0.0.1:3001", "production", undefined),
    /public_app_origin_required/,
  );
  assert.throws(
    () => resolvePublicAppOrigin("http://127.0.0.1:3001", "production", "http://aetherstudio.top"),
    /invalid_public_app_origin/,
  );
  assert.equal(
    resolvePublicAppOrigin("http://127.0.0.1:3001", "production", "https://aetherstudio.top"),
    "https://aetherstudio.top",
  );
});

test("android app-shell compatibility manifest is no-store JSON with a shell version gate", async () => {
  const response = await fetch(`${baseUrl}/api/app-shell`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const manifest = await response.json();
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.web.mode, "remote");
  assert.equal(manifest.web.minShellVersionCode, 1);
  assert.equal(manifest.web.bridgeApiVersion, 0);
  assert.equal(typeof manifest.web.buildId, "string");
  assert.ok(manifest.web.buildId.length > 0);
  assert.ok(manifest.web.url.startsWith("http"));
  assert.equal(manifest.android.required, false);
  assert.ok(manifest.android.downloadUrl.endsWith(`/${APP_DOWNLOAD.filePath}`));
  assert.match(manifest.android.sha256, /^[0-9a-f]{64}$/);
  assert.equal(manifest.android.latestVersionCode, APP_DOWNLOAD.versionCode);
});

test("android APK download serves the exact published bytes with the manifest's sha256", async () => {
  const response = await fetch(`${baseUrl}/${APP_DOWNLOAD.filePath}`);
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /application\/vnd\.android\.package-archive|application\/octet-stream/,
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.byteLength, APP_DOWNLOAD.sizeBytes);
  // APK 是 ZIP:文件头魔数 PK\x03\x04,防止误把 HTML 错误页当安装包。
  assert.deepEqual([...bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), APP_DOWNLOAD.sha256);
});

test("/app download page links to the published APK", async () => {
  const response = await fetch(`${baseUrl}/app`, { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, new RegExp(`href="/${APP_DOWNLOAD.filePath}"`));
  assert.match(html, new RegExp(APP_DOWNLOAD.sha256));
  assert.match(html, /造场 App/);
});

test("keeps sign-in outside the community shell", async () => {
  const response = await fetch(`${baseUrl}/signin`, { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /class="auth-page"/);
  assert.match(html, /class="auth-brand"/);
  assert.doesNotMatch(html, /deep-topbar|deep-sidebar|deep-mobile-nav|deep-account/);
});

test("requires and atomically consumes an invitation for each new OAuth identity", async () => {
  const adminHeaders = authHeaders("发布审核管理员", adminEmail);
  const denied = await fetch(`${baseUrl}/api/admin/invitations`, { headers: authHeaders("普通成员", `invite-denied-${runId}@example.com`) });
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { error: "admin_forbidden" });

  const created = await fetch(`${baseUrl}/api/admin/invitations`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ label: "集成测试邀请", maxUses: 1, expiresDays: 14 }),
  });
  assert.equal(created.status, 201);
  const invitation = (await created.json()).invitation;
  assert.match(invitation.code, /^ZC-[A-HJ-NP-Z2-9]{16}$/);
  assert.equal(invitation.maxUses, 1);
  assert.equal(invitation.usesCount, 0);

  const listedBefore = await (await fetch(`${baseUrl}/api/admin/invitations`, { headers: adminHeaders })).json();
  const listedInvitation = listedBefore.invitations.find((item) => item.id === invitation.id);
  assert.equal(listedInvitation.usesCount, 0);
  assert.equal(Object.hasOwn(listedInvitation, "code"), false);
  assert.equal(Object.hasOwn(listedInvitation, "codeHash"), false);

  const firstEmail = `invite-first-${runId}@example.com`;
  const secondEmail = `invite-second-${runId}@example.com`;
  await fetch(`${baseUrl}/api/community`, { headers: authHeaders("首位受邀者", firstEmail) });
  await fetch(`${baseUrl}/api/community`, { headers: authHeaders("第二位受邀者", secondEmail) });

  const bypass = await executeLocalD1(
    `INSERT INTO oauth_accounts (provider, provider_account_id, email, display_name)
     VALUES ('github', 'invite-first-bypass-${runId}', '${firstEmail}', '绕过邀请码')`,
    false,
  );
  assert.match(bypass, /oauth_registration_invitation_required/);

  const codeHash = createHash("sha256").update(invitation.code).digest("hex");
  const providerAccountId = `invite-first-${runId}`;
  const redemptionId = `invite-redemption-${runId}`;
  await executeLocalD1(`
    INSERT INTO invitation_redemptions (id, invitation_id, provider, provider_account_id, user_email)
      SELECT '${redemptionId}', id, 'github', '${providerAccountId}', '${firstEmail}'
      FROM invitation_codes WHERE code_hash = '${codeHash}';
    INSERT INTO oauth_accounts (provider, provider_account_id, email, display_name)
      VALUES ('github', '${providerAccountId}', '${firstEmail}', '首位受邀者');
    CREATE TABLE invitation_state_assertion (id integer);
    CREATE TRIGGER invitation_state_assertion_guard BEFORE INSERT ON invitation_state_assertion
    WHEN NOT EXISTS (
      SELECT 1 FROM invitation_codes c
      JOIN invitation_redemptions r ON r.invitation_id = c.id
      JOIN oauth_accounts a ON a.provider = r.provider AND a.provider_account_id = r.provider_account_id
      WHERE c.id = '${invitation.id}' AND c.uses_count = 1 AND c.last_used_at IS NOT NULL
        AND r.id = '${redemptionId}' AND r.user_email = '${firstEmail}'
        AND a.email = '${firstEmail}'
    ) BEGIN SELECT RAISE(ABORT, 'invitation_state_invalid'); END;
    INSERT INTO invitation_state_assertion (id) VALUES (1);
    DROP TRIGGER invitation_state_assertion_guard;
    DROP TABLE invitation_state_assertion
  `);

  const reused = await executeLocalD1(
    `INSERT INTO invitation_redemptions (id, invitation_id, provider, provider_account_id, user_email)
       VALUES ('invite-reuse-${runId}', '${invitation.id}', 'github', 'invite-second-${runId}', '${secondEmail}')`,
    false,
  );
  assert.match(reused, /invitation_not_available/);
  const mutable = await executeLocalD1(`UPDATE invitation_redemptions SET user_email = '${secondEmail}' WHERE id = '${redemptionId}'`, false);
  assert.match(mutable, /invitation_redemption_immutable/);
  const deletable = await executeLocalD1(`DELETE FROM invitation_redemptions WHERE id = '${redemptionId}'`, false);
  assert.match(deletable, /invitation_redemption_immutable/);

  const listedAfter = await (await fetch(`${baseUrl}/api/admin/invitations`, { headers: adminHeaders })).json();
  assert.equal(listedAfter.invitations.find((item) => item.id === invitation.id).usesCount, 1);
  const revoked = await fetch(`${baseUrl}/api/admin/invitations`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ action: "revoke", id: invitation.id }),
  });
  assert.equal(revoked.status, 200);
  assert.deepEqual(await revoked.json(), { updated: true, id: invitation.id });
});

test("email verification-code login registers with an invitation and issues an equivalent session", async () => {
  const adminHeaders = authHeaders("发布审核管理员", adminEmail);
  const email = `email-code-${runId}@example.com`;

  // 全新地址无邀请码:拒绝发生在发码之前——不外发、不写库。
  const sentBefore = sentEmails.length;
  const noInvite = await fetch(`${baseUrl}/api/auth/email/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  assert.equal(noInvite.status, 400);
  assert.deepEqual(await noInvite.json(), { error: "invitation_required" });
  assert.equal(sentEmails.length, sentBefore);
  assert.equal((await queryLocalD1(`SELECT COUNT(*) AS n FROM email_login_codes WHERE email = '${email}'`))[0].n, 0);

  // 创建邀请码(maxUses 1)→ 带码发码:对假上游的请求做字段级断言。
  const created = await fetch(`${baseUrl}/api/admin/invitations`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ label: "邮箱登录集成测试", maxUses: 1, expiresDays: 1 }),
  });
  assert.equal(created.status, 201);
  const invitation = (await created.json()).invitation;

  const sent = await fetch(`${baseUrl}/api/auth/email/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, invitation_code: invitation.code }),
  });
  assert.equal(sent.status, 200);
  assert.equal((await sent.json()).status, "sent");
  assert.equal(sentEmails.length, sentBefore + 1);
  const mail = sentEmails.at(-1);
  assert.equal(mail.account, "test-email-account");
  assert.equal(mail.from, "zaochang@aetherstudio.top");
  assert.deepEqual(mail.to, [email]);
  assert.match(mail.subject, /\d{6}/);
  assert.match(mail.html, /\d{6}/);

  // DB 中只有 SHA-256 哈希,且哈希与邮件明文验证码一致(可证伪)。
  const realCode = latestEmailCode(email);
  assert.match(realCode ?? "", /^\d{6}$/);
  const codeRow = (await queryLocalD1(
    `SELECT code_hash AS codeHash, invitation_hash AS invitationHash, consumed_at AS consumedAt, attempts
     FROM email_login_codes WHERE email = '${email}'`,
  ))[0];
  assert.match(codeRow.codeHash, /^[0-9a-f]{64}$/);
  assert.equal(codeRow.codeHash, createHash("sha256").update(realCode).digest("hex"));
  assert.equal(codeRow.consumedAt, null);
  assert.equal(codeRow.attempts, 0);

  // 错误验证码:attempts 累计,不下发会话。
  const wrongCode = realCode === "000000" ? "111111" : "000000";
  const wrong = await fetch(`${baseUrl}/api/auth/email/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code: wrongCode }),
  });
  assert.equal(wrong.status, 400);
  assert.deepEqual(await wrong.json(), { error: "code_invalid" });
  assert.equal((await queryLocalD1(`SELECT attempts FROM email_login_codes WHERE email = '${email}'`))[0].attempts, 1);

  // 正确验证码:会话 cookie + 完整注册落库(members/wallets/redemption/oauth_accounts/auth_sessions)。
  const verified = await fetch(`${baseUrl}/api/auth/email/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code: realCode, return_to: "/wallet" }),
  });
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).return_to, "/wallet");
  const setCookies = typeof verified.headers.getSetCookie === "function"
    ? verified.headers.getSetCookie()
    : [verified.headers.get("set-cookie") ?? ""];
  const sessionCookie = setCookies.find((value) => value.startsWith("zaochang_session="))?.match(/^zaochang_session=([^;]+)/)?.[1];
  assert.ok(sessionCookie, `no zaochang_session cookie in ${JSON.stringify(setCookies)}`);

  const redemption = (await queryLocalD1(
    `SELECT provider, provider_account_id AS providerAccountId, user_email AS userEmail
     FROM invitation_redemptions WHERE user_email = '${email}'`,
  ))[0];
  assert.equal(redemption.provider, "email");
  assert.equal(redemption.providerAccountId, email);
  assert.equal(redemption.userEmail, email);

  const account = (await queryLocalD1(
    `SELECT provider FROM oauth_accounts WHERE provider = 'email' AND provider_account_id = '${email}'`,
  ))[0];
  assert.equal(account.provider, "email");

  assert.equal((await queryLocalD1(`SELECT COUNT(*) AS n FROM wallets WHERE user_email = '${email}'`))[0].n, 1);
  assert.equal(
    (await queryLocalD1(`SELECT uses_count AS usesCount FROM invitation_codes WHERE id = '${invitation.id}'`))[0].usesCount,
    1,
  );
  assert.equal(
    (await queryLocalD1(`SELECT provider FROM auth_sessions WHERE user_email = '${email}' ORDER BY created_at DESC LIMIT 1`))[0].provider,
    "email",
  );
  assert.notEqual(
    (await queryLocalD1(`SELECT consumed_at AS consumedAt FROM email_login_codes WHERE email = '${email}'`))[0].consumedAt,
    null,
  );

  // 会话与 GitHub 登录同权:cookie 换 /api/community 的成员视图(signedIn 字段断言)。
  const community = await fetch(`${baseUrl}/api/community`, {
    headers: { accept: "application/json", cookie: `zaochang_session=${sessionCookie}` },
  });
  assert.equal(community.status, 200);
  assert.equal((await community.json()).signedIn, true);

  // 已是成员:再次发码无需邀请码(登录场景),新码与旧码不同,消费不重复扣邀请码。
  const again = await fetch(`${baseUrl}/api/auth/email/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  assert.equal(again.status, 200);
  const secondCode = latestEmailCode(email);
  assert.match(secondCode ?? "", /^\d{6}$/);
  assert.notEqual(secondCode, realCode);
  const secondLogin = await fetch(`${baseUrl}/api/auth/email/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code: secondCode }),
  });
  assert.equal(secondLogin.status, 200);
  assert.equal(
    (await queryLocalD1(`SELECT uses_count AS usesCount FROM invitation_codes WHERE id = '${invitation.id}'`))[0].usesCount,
    1,
  );
});

test("invitation entry tolerates lowercase, full-width, and stray-space transcription", async () => {
  const adminHeaders = authHeaders("发布审核管理员", adminEmail);
  const email = `email-invite-case-${runId}@example.com`;

  const created = await fetch(`${baseUrl}/api/admin/invitations`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ label: "转写归一化测试", maxUses: 1, expiresDays: 1 }),
  });
  assert.equal(created.status, 201);
  const invitation = (await created.json()).invitation;

  // 手抄形态:全角前缀「ｚｃ－」+ 小写正文 + 正文中一个全角空格。与原文哈希必然不同
  // (sha256 对输入确定),归一化缺失时会得到 invitation_invalid——这正是生产上
  // 用户拿新邀请码被拒的机制。
  const typed = `ｚｃ－${invitation.code.slice(3).toLowerCase().slice(0, 8)}　${invitation.code.slice(3).toLowerCase().slice(8)}`;
  assert.notEqual(typed, invitation.code);
  assert.notEqual(
    createHash("sha256").update(typed).digest("hex"),
    createHash("sha256").update(invitation.code).digest("hex"),
  );

  const sent = await fetch(`${baseUrl}/api/auth/email/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, invitation_code: typed }),
  });
  assert.equal(sent.status, 200);
  assert.equal((await sent.json()).status, "sent");

  // 归一化后的哈希必须等于原文哈希(存进 code 行的 invitation_hash 与
  // invitation_codes.code_hash 同源,后续 ensureEmailUser 的兑换 batch 才能命中)。
  const row = (await queryLocalD1(
    `SELECT invitation_hash AS invitationHash FROM email_login_codes WHERE email = '${email}'`,
  ))[0];
  assert.equal(
    row.invitationHash,
    createHash("sha256").update(invitation.code).digest("hex"),
  );

  // 全链路:验码后兑换正常消耗邀请码(uses_count 1),不是只过了预检。
  const realCode = latestEmailCode(email);
  assert.match(realCode ?? "", /^\d{6}$/);
  const verified = await fetch(`${baseUrl}/api/auth/email/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code: realCode }),
  });
  assert.equal(verified.status, 200);
  assert.equal(
    (await queryLocalD1(`SELECT uses_count AS usesCount FROM invitation_codes WHERE id = '${invitation.id}'`))[0].usesCount,
    1,
  );
  const redemption = (await queryLocalD1(
    `SELECT provider FROM invitation_redemptions WHERE user_email = '${email}'`,
  ))[0];
  assert.equal(redemption.provider, "email");
});

test("email verification codes lock after five wrong attempts and send failures leave no phantom state", async () => {
  const adminHeaders = authHeaders("发布审核管理员", adminEmail);
  const email = `email-lock-${runId}@example.com`;
  const created = await fetch(`${baseUrl}/api/admin/invitations`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ label: "验证码锁定测试", maxUses: 1, expiresDays: 1 }),
  });
  assert.equal(created.status, 201);
  const invitation = (await created.json()).invitation;

  const sent = await fetch(`${baseUrl}/api/auth/email/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, invitation_code: invitation.code }),
  });
  assert.equal(sent.status, 200);
  const realCode = latestEmailCode(email);
  assert.match(realCode ?? "", /^\d{6}$/);
  const wrongCode = realCode === "000000" ? "111111" : "000000";

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/auth/email/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code: wrongCode }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: attempt === 5 ? "code_locked" : "code_invalid" });
  }
  assert.equal((await queryLocalD1(`SELECT attempts FROM email_login_codes WHERE email = '${email}'`))[0].attempts, 5);

  // 锁定后正确验证码也进不来(锁定优先于比对),且无任何注册副作用。
  const lockedOut = await fetch(`${baseUrl}/api/auth/email/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code: realCode }),
  });
  assert.equal(lockedOut.status, 400);
  assert.deepEqual(await lockedOut.json(), { error: "code_locked" });
  assert.equal((await queryLocalD1(`SELECT COUNT(*) AS n FROM auth_sessions WHERE user_email = '${email}'`))[0].n, 0);
  assert.equal((await queryLocalD1(`SELECT COUNT(*) AS n FROM members WHERE email = '${email}'`))[0].n, 0);

  // 发送失败(上游 500):验证码行必须删除、邀请码零消耗、无成员(操作未生效语义)。
  const failEmail = `fail-email-test-${runId}@example.com`;
  const failRequest = await fetch(`${baseUrl}/api/auth/email/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: failEmail, invitation_code: invitation.code }),
  });
  assert.equal(failRequest.status, 502);
  assert.deepEqual(await failRequest.json(), { error: "email_send_http_500" });
  assert.equal(sentEmails.filter((entry) => entry.to?.[0] === failEmail).length, 1);
  assert.equal((await queryLocalD1(`SELECT COUNT(*) AS n FROM email_login_codes WHERE email = '${failEmail}'`))[0].n, 0);
  assert.equal((await queryLocalD1(`SELECT COUNT(*) AS n FROM members WHERE email = '${failEmail}'`))[0].n, 0);
  assert.equal(
    (await queryLocalD1(`SELECT uses_count AS usesCount FROM invitation_codes WHERE id = '${invitation.id}'`))[0].usesCount,
    0,
  );
});

test("email code requests are rate limited per address before any send", async () => {
  const email = `email-rate-${runId}@example.com`;
  const payload = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/auth/email/request`, payload);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invitation_required" });
  }
  const fourth = await fetch(`${baseUrl}/api/auth/email/request`, payload);
  assert.equal(fourth.status, 429);
  assert.deepEqual(await fourth.json(), { error: "rate_limited", retry_after: "15m" });
  assert.equal(fourth.headers.get("retry-after"), "900");
  assert.equal(sentEmails.filter((entry) => entry.to?.[0] === email).length, 0);
});

test("logout deletes the server session so a copied cookie cannot be replayed", async () => {
  const email = `logout-session-${runId}@example.com`;
  await fetch(`${baseUrl}/api/community`, { headers: authHeaders("退出登录用户", email) });
  const rawToken = `session_${runId}`.replaceAll("-", "_");
  const tokenHash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken))).toString("hex");
  await executeLocalD1(`INSERT INTO auth_sessions (token_hash, user_email, provider, expires_at) VALUES ('${tokenHash}', '${email}', 'github', datetime('now', '+1 day'))`);
  const cookie = `zaochang_session=${rawToken}`;
  const authenticated = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "x" }),
  });
  assert.equal(authenticated.status, 400);
  assert.deepEqual(await authenticated.json(), { error: "invalid_product" });

  const logout = await fetch(`${baseUrl}/api/auth/logout?return_to=%2Fsignin`, { headers: { cookie }, redirect: "manual" });
  assert.equal(logout.status, 307);
  assert.match(logout.headers.get("set-cookie") ?? "", /zaochang_session=;.*Max-Age=0/i);
  const replay = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "x" }),
  });
  assert.equal(replay.status, 401);
  assert.deepEqual(await replay.json(), { error: "auth_required" });
});

test("production rejects forged workspace identity headers unless explicitly trusted", async () => {
  const productionPort = port + 1;
  const productionRoot = join(tmpdir(), `zaochang-production-root-${runId}`);
  const productionStateDir = join(tmpdir(), `zaochang-production-auth-${runId}`);
  let productionOutput = "";
  await cp(join(projectRoot, "dist"), join(productionRoot, "dist"), { recursive: true, force: true });
  const productionArgs = [
    join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js"),
    "dev",
    "--config", "dist/server/wrangler.json",
    "--port", String(productionPort),
    "--persist-to", productionStateDir,
    "--var", "APP_ENV:production",
    "--var", "LOCAL_DEV_LOGIN:1",
    "--var", "PUBLIC_APP_ORIGIN:https://production.example",
    "--var", "GITHUB_OAUTH_CLIENT_ID:public-test-client",
    "--var", "GITHUB_OAUTH_CLIENT_SECRET:test-secret",
  ];
  const productionServer = spawn(process.execPath, productionArgs, {
    cwd: productionRoot,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  productionServer.stdout.on("data", (chunk) => { productionOutput += chunk.toString(); });
  productionServer.stderr.on("data", (chunk) => { productionOutput += chunk.toString(); });
  try {
    const deadline = Date.now() + 15000;
    let response;
    while (Date.now() < deadline) {
      if (productionServer.exitCode !== null) throw new Error(`Production auth preview exited early:\n${productionOutput}`);
      try {
        response = await fetch(`http://127.0.0.1:${productionPort}/api/products`, {
          method: "POST",
          headers: authHeaders("伪造身份", "forged@example.com"),
          body: JSON.stringify({ title: "x" }),
          signal: AbortSignal.timeout(1500),
        });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    assert.equal(response?.status, 401, productionOutput);
    assert.deepEqual(await response.json(), { error: "auth_required" });
    const discovery = await fetch(`http://127.0.0.1:${productionPort}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(5000) });
    assert.equal(discovery.status, 200);
    assert.equal((await discovery.json()).issuer, "https://production.example");
    assert.match(discovery.headers.get("strict-transport-security") ?? "", /max-age=31536000/);

    const githubStart = await fetch(`http://127.0.0.1:${productionPort}/api/auth/github/start?return_to=%2Fwallet`, {
      headers: { "x-forwarded-proto": "https" },
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(githubStart.status, 200);
    assert.equal(githubStart.headers.get("cache-control"), "no-store, max-age=0");
    assert.equal(githubStart.headers.get("content-security-policy"), GITHUB_CONNECTION_CSP);
    assert.equal(githubStart.headers.get("x-frame-options"), "DENY");
    assert.equal(githubStart.headers.get("referrer-policy"), "no-referrer");
    assert.equal(githubStart.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=(), payment=()");
    assert.match(githubStart.headers.get("content-type") ?? "", /^text\/html; charset=utf-8/);
    const githubHtml = await githubStart.text();
    assert.match(githubHtml, /https:\/\/github\.com\/login\/oauth\/authorize/);
    assert.match(githubHtml, /redirect_uri=https%3A%2F%2Fproduction\.example%2Fapi%2Fauth%2Fgithub%2Fcallback/);
    assert.doesNotMatch(githubHtml, /invitation_code|邀请码/);
    const setCookies = typeof githubStart.headers.getSetCookie === "function"
      ? githubStart.headers.getSetCookie()
      : [githubStart.headers.get("set-cookie") ?? ""];
    const stateCookie = setCookies.find((value) => value.startsWith("zaochang_oauth_state="));
    // 生产 fail-closed:请求 URL 是 http、伪造的 x-forwarded-proto: https 不得把
    // Cookie 标成 Secure(旧实现采信该头,可被用以制造 Secure 位翻转)。
    // 真实生产中 Cloudflare 对 https 请求注入的 request.url 即为 https scheme,
    // Secure 由 URL 协议决定,与此本地模拟场景(http 明文)相反。
    assert.match(stateCookie ?? "", /; HttpOnly; SameSite=lax/i);
    assert.doesNotMatch(stateCookie ?? "", /Secure/i);
    const cookieState = stateCookie?.match(/^zaochang_oauth_state=([^;]+)/)?.[1];
    const pageState = githubHtml.match(/[?&]state=([^&"\\]+)/)?.[1];
    assert.ok(cookieState);
    assert.ok(pageState);
    assert.equal(decodeURIComponent(pageState), cookieState);

    // dev-login 在生产即使显式 LOCAL_DEV_LOGIN=1 也必须 404 且不落任何 cookie(fail-closed 第一道门)
    const prodDevLogin = await fetch(`http://127.0.0.1:${productionPort}/api/auth/dev-login`, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    assert.equal(prodDevLogin.status, 404);
    assert.equal(prodDevLogin.headers.get("set-cookie"), null);
    assert.deepEqual(await prodDevLogin.json(), { error: "not_found" });

    // 邮件外发未配置(无 EMAIL binding、无 EMAIL_SEND_* vars)→ 惰性 503,与 ai_not_configured
    // 同语义;显式报不可用,绝不静默吞掉发码请求。
    const prodEmailRequest = await fetch(`http://127.0.0.1:${productionPort}/api/auth/email/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `inert-${runId}@example.com` }),
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(prodEmailRequest.status, 503);
    assert.deepEqual(await prodEmailRequest.json(), { error: "email_not_configured" });
  } finally {
    const waitForProductionExit = (timeoutMs) => {
      if (productionServer.exitCode !== null) return Promise.resolve(true);
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), timeoutMs);
        productionServer.once("exit", () => {
          clearTimeout(timer);
          resolve(true);
        });
      });
    };
    let stopped = productionServer.exitCode !== null;
    if (!stopped && productionServer.pid && process.platform === "win32") {
      const forced = spawnSync("taskkill", ["/pid", String(productionServer.pid), "/T", "/F"], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 10000,
      });
      assert.notEqual(forced.error?.code, "ETIMEDOUT", `taskkill timed out for production preview ${productionServer.pid}`);
      assert.equal(forced.status, 0, forced.stderr || forced.stdout);
      stopped = await waitForProductionExit(2000);
    } else if (!stopped && productionServer.pid) {
      process.kill(-productionServer.pid, "SIGTERM");
      stopped = await waitForProductionExit(5000);
    }
    assert.equal(stopped, true, `production preview ${productionServer.pid ?? "unknown"} did not exit`);

    const closeDeadline = Date.now() + 3000;
    let portClosed = false;
    while (Date.now() < closeDeadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${productionPort}/`, { signal: AbortSignal.timeout(300) });
        await response.body?.cancel();
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch {
        portClosed = true;
        break;
      }
    }
    assert.equal(portClosed, true, `production preview port ${productionPort} remained reachable`);
    await rm(productionStateDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 120 });
    await rm(productionRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 120 });
  }
});
}
