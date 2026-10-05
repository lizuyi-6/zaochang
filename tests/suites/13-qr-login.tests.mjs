// 扫码登录端到端:真实 HTTP 打活预览服务器(迁移齐全的本地 D1),覆盖
// start → poll pending → 未登录 confirm 401 → 手机端(dev-login 会话)确认 →
// 桌面端 poll 拿到会话(provider 'qr',与 GitHub/邮箱码同权)→ 重放/竞态终态、
// 过期确认 410。契约钉在 tests/qr-login.test.mjs。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { baseUrl, runId, queryLocalD1 } from "../harness/preview.mjs";

const tokenHash = (token) => createHash("sha256").update(token).digest("hex");

function captureSessionCookie(response) {
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];
  return cookies.find((value) => value.startsWith("zaochang_session="))?.split(";")[0] ?? null;
}

async function devLoginSession(email) {
  const issued = await fetch(`${baseUrl}/api/auth/dev-login?email=${encodeURIComponent(email)}`, {
    headers: { origin: baseUrl },
    redirect: "manual",
  });
  assert.equal(issued.status, 307, "dev-login 应签发会话");
  const cookie = captureSessionCookie(issued);
  assert.ok(cookie, "session cookie issued");
  return cookie;
}

export function register() {
  test("qr login: start 签发同源 confirm 链接,poll 初始为 pending", async () => {
    const start = await fetch(`${baseUrl}/api/auth/qr/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ return_to: "/bookshelf" }),
    });
    assert.equal(start.status, 200);
    const data = await start.json();
    assert.match(data.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(data.url, `${baseUrl}/signin/qr/${data.token}`);
    assert.ok(data.expiresIn > 0 && data.expiresIn <= 120);
    assert.ok(data.desktopLabel.length > 0, "发起端标签非空(白名单词)");

    const poll = await fetch(`${baseUrl}/api/auth/qr/poll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: data.token }),
    });
    assert.equal(poll.status, 200);
    const pollData = await poll.json();
    assert.equal(pollData.status, "pending");
    assert.ok(pollData.expiresIn > 0);
  });

  test("qr login: 未登录 confirm 401;登录成员确认后桌面 poll 拿到同权会话", async () => {
    const start = await fetch(`${baseUrl}/api/auth/qr/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const { token } = await start.json();

    const unauth = await fetch(`${baseUrl}/api/auth/qr/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    assert.equal(unauth.status, 401);
    assert.equal((await unauth.json()).error, "login_required");

    const phoneEmail = `qr-phone-${runId}@example.com`;
    const phoneCookie = await devLoginSession(phoneEmail);
    const confirm = await fetch(`${baseUrl}/api/auth/qr/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: phoneCookie },
      body: JSON.stringify({ token }),
    });
    assert.equal(confirm.status, 200);
    assert.equal((await confirm.json()).status, "ok");

    const poll = await fetch(`${baseUrl}/api/auth/qr/poll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    assert.equal(poll.status, 200);
    const pollData = await poll.json();
    assert.equal(pollData.status, "ok");
    assert.equal(pollData.return_to, "/");
    const sessionCookie = captureSessionCookie(poll);
    assert.ok(sessionCookie, "桌面端 poll 响应必须 Set-Cookie 会话");

    // 会话行:provider 'qr',user_email 即确认成员;token 哈希与 cookie 一致。
    const rows = await queryLocalD1(
      `SELECT provider, user_email FROM auth_sessions WHERE token_hash = '${tokenHash(sessionCookie.split("=")[1])}'`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].provider, "qr");
    assert.equal(rows[0].user_email, phoneEmail);

    // 会话真实可用:登录态访问 /signin 应 307 跳走(SSO 同一 cookie)。
    const check = await fetch(`${baseUrl}/signin`, { headers: { cookie: sessionCookie }, redirect: "manual" });
    assert.equal(check.status, 302, "qr 会话与其它渠道同权(登录态生效)");
  });

  test("qr login: 一次性语义——消费后 poll 重放 taken,confirm 重放 qr_invalid", async () => {
    const start = await fetch(`${baseUrl}/api/auth/qr/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const { token } = await start.json();
    const phoneCookie = await devLoginSession(`qr-once-${runId}@example.com`);

    const confirm = await fetch(`${baseUrl}/api/auth/qr/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: phoneCookie },
      body: JSON.stringify({ token }),
    });
    assert.equal(confirm.status, 200);
    const poll = await fetch(`${baseUrl}/api/auth/qr/poll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    assert.equal((await poll.json()).status, "ok", "首次 poll 胜者拿会话");

    const pollReplay = await fetch(`${baseUrl}/api/auth/qr/poll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    assert.equal((await pollReplay.json()).status, "taken", "重放 poll 不得再签发会话");
    const confirmReplay = await fetch(`${baseUrl}/api/auth/qr/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: phoneCookie },
      body: JSON.stringify({ token }),
    });
    assert.equal(confirmReplay.status, 400, "消费后 confirm 重放拒绝");
  });

  test("qr login: 未知/畸形 token 给确定性终态;过期 pending 确认得 410", async () => {
    const unknown = "c".repeat(43);
    const pollUnknown = await fetch(`${baseUrl}/api/auth/qr/poll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: unknown }),
    });
    assert.equal((await pollUnknown.json()).status, "expired");
    const confirmUnknown = await fetch(`${baseUrl}/api/auth/qr/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: await devLoginSession(`qr-unk-${runId}@example.com`) },
      body: JSON.stringify({ token: unknown }),
    });
    assert.equal(confirmUnknown.status, 400);

    const badShape = await fetch(`${baseUrl}/api/auth/qr/poll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "javascript:alert(1)" }),
    });
    assert.equal((await badShape.json()).status, "expired", "畸形 token 不进 DB 查询");

    const start = await fetch(`${baseUrl}/api/auth/qr/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const { token } = await start.json();
    const { executeD1Sql } = await import("../harness/preview.mjs");
    await executeD1Sql(`UPDATE qr_login_sessions SET expires_at = '2020-01-01 00:00:00' WHERE token_hash = '${tokenHash(token)}'`);
    const confirmExpired = await fetch(`${baseUrl}/api/auth/qr/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: await devLoginSession(`qr-exp-${runId}@example.com`) },
      body: JSON.stringify({ token }),
    });
    assert.equal(confirmExpired.status, 410);
    assert.equal((await confirmExpired.json()).error, "qr_expired");
    const pollExpired = await fetch(`${baseUrl}/api/auth/qr/poll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    assert.equal((await pollExpired.json()).status, "expired");
  });

  test("qr 反向:匿名 host 401;完整链路 host → 错码 → 正码 → 他属主 approve 拒 → 属主允许 → claim 发会话", async () => {
    const anonHost = await fetch(`${baseUrl}/api/auth/qr/host`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(anonHost.status, 401, "host 必须已登录");

    const desktopEmail = `qr-host-${runId}@example.com`;
    const desktopCookie = await devLoginSession(desktopEmail);
    const host = await fetch(`${baseUrl}/api/auth/qr/host`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: desktopCookie },
      body: "{}",
    });
    assert.equal(host.status, 200);
    const hostData = await host.json();
    assert.match(hostData.url, new RegExp(`^${baseUrl}/signin/qr-pair/[A-Za-z0-9_-]{43}$`));
    assert.match(hostData.pairCode, /^\d{6}$/);

    const { token, pairCode } = hostData;
    // 错码:pair_code_invalid
    const wrong = await fetch(`${baseUrl}/api/auth/qr/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, code: pairCode === "000000" ? "000001" : "000000" }),
    });
    assert.equal(wrong.status, 400);
    assert.equal((await wrong.json()).error, "pair_code_invalid");

    // 正码 → pair_requested
    const pair = await fetch(`${baseUrl}/api/auth/qr/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, code: pairCode }),
    });
    assert.equal(pair.status, 200);

    // claim 在 pair_requested 阶段不给会话
    const claimWaiting = await fetch(`${baseUrl}/api/auth/qr/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    assert.equal((await claimWaiting.json()).status, "pair_requested");

    // 非属主 approve 必须被拒
    const otherCookie = await devLoginSession(`qr-other-host-${runId}@example.com`);
    const foreign = await fetch(`${baseUrl}/api/auth/qr/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: otherCookie },
      body: JSON.stringify({ token, decision: "allow" }),
    });
    assert.equal(foreign.status, 400, "非属主不得允许");

    // 属主允许 → confirmed
    const allow = await fetch(`${baseUrl}/api/auth/qr/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: desktopCookie },
      body: JSON.stringify({ token, decision: "allow" }),
    });
    assert.equal(allow.status, 200);

    // 手机 claim:confirmed → consumed + 会话(provider 'qr'、属主邮箱)
    const claim = await fetch(`${baseUrl}/api/auth/qr/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    assert.equal(claim.status, 200);
    const claimData = await claim.json();
    assert.equal(claimData.status, "ok");
    assert.equal(claimData.displayName.length > 0, true);
    const phoneCookie = captureSessionCookie(claim);
    assert.ok(phoneCookie, "claim 响应必须 Set-Cookie 会话");
    const rows = await queryLocalD1(
      `SELECT provider, user_email FROM auth_sessions WHERE token_hash = '${tokenHash(phoneCookie.split("=")[1])}'`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].provider, "qr");
    assert.equal(rows[0].user_email, desktopEmail);

    // 会话真实可用 + claim 重放不得再发
    const check = await fetch(`${baseUrl}/signin`, { headers: { cookie: phoneCookie }, redirect: "manual" });
    assert.equal(check.status, 302, "反向会话与其它渠道同权(登录态生效)");
    const claimReplay = await fetch(`${baseUrl}/api/auth/qr/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    assert.equal((await claimReplay.json()).status, "taken");
  });

  test("qr 反向:方向互斥——反向行不得被正向 poll/confirm 消费;错码 5 次锁死", async () => {
    const desktopCookie = await devLoginSession(`qr-host2-${runId}@example.com`);
    const host = await fetch(`${baseUrl}/api/auth/qr/host`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: desktopCookie },
      body: "{}",
    });
    const { token, pairCode } = await host.json();

    // 正向 poll 对反向行一律 expired
    const forwardPoll = await fetch(`${baseUrl}/api/auth/qr/poll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    assert.equal((await forwardPoll.json()).status, "expired", "反向行不得进入正向消费");
    // 正向 confirm(即使是属主自己)也拒绝反向行
    const forwardConfirm = await fetch(`${baseUrl}/api/auth/qr/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: desktopCookie },
      body: JSON.stringify({ token }),
    });
    assert.equal(forwardConfirm.status, 400, "反向行不得被正向 confirm 迁移");

    // 错码 5 次 → 行删除 → 正码也 qr_invalid(锁死)
    const wrongCode = pairCode === "999999" ? "999998" : "999999";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrong = await fetch(`${baseUrl}/api/auth/qr/pair`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, code: wrongCode }),
      });
      assert.equal(wrong.status, 400);
    }
    const afterLock = await fetch(`${baseUrl}/api/auth/qr/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, code: pairCode }),
    });
    assert.equal(afterLock.status, 400, "锁死后正码也不再接受");

    // deny:属主拒绝删行 → 手机 claim 得 expired
    const host2 = await fetch(`${baseUrl}/api/auth/qr/host`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: desktopCookie },
      body: "{}",
    });
    assert.equal(host2.status, 200, "成员限流内应能再次发起");
    const host2Data = await host2.json();
    const pair2 = await fetch(`${baseUrl}/api/auth/qr/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: host2Data.token, code: host2Data.pairCode }),
    });
    assert.equal(pair2.status, 200);
    const deny = await fetch(`${baseUrl}/api/auth/qr/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: desktopCookie },
      body: JSON.stringify({ token: host2Data.token, decision: "deny" }),
    });
    assert.equal(deny.status, 200);
    const claimDenied = await fetch(`${baseUrl}/api/auth/qr/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: host2Data.token }),
    });
    assert.equal((await claimDenied.json()).status, "expired", "拒绝后手机不得登录");
  });

}
