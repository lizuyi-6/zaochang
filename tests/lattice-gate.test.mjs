// /lattice/* 登录门禁契约测试:路径匹配、cookie 解析、302 门禁响应。
// 纯 Request/Response 级,不启动 Wrangler、不依赖 D1(会话 D1 查询与
// getOAuthSessionUser 共用 oauth-session 核心,不进 Node 单测)。
// 注意:Node 的类型剥离只覆盖 .ts/.mts,本文件(.mjs)必须是纯 JavaScript。
import { test } from "node:test";
import assert from "node:assert/strict";
import { LATTICE_BASE, isLatticePath, cookieValue, latticeGateRedirect } from "../worker/lattice-gate.ts";

test("lattice-gate: /lattice 与 /lattice/* 受门禁,相邻前缀不受", () => {
  for (const p of ["/lattice", "/lattice/", "/lattice/index.html", "/lattice/assets/index-abc.js"]) {
    assert.equal(isLatticePath(p), true, p);
  }
  for (const p of ["/", "/api", "/latticefake", "/latticefake/x", "/api/lattice", "/LATTICE/"]) {
    assert.equal(isLatticePath(p), false, p);
  }
  assert.equal(LATTICE_BASE, "/lattice");
});

test("lattice-gate: cookie 值解析,名字精确匹配且容忍空白", () => {
  const header = "other=1; zaochang_session=abc123; zaochang_session_extra=zz; empty=";
  assert.equal(cookieValue(header, "zaochang_session"), "abc123");
  assert.equal(cookieValue(header, "zaochang_session_extra"), "zz");
  assert.equal(cookieValue(header, "session"), null);
  assert.equal(cookieValue(header, "missing"), null);
  assert.equal(cookieValue(header, "empty"), null);
  assert.equal(cookieValue(null, "zaochang_session"), null);
  assert.equal(cookieValue("zaochang_session=tok", "zaochang_session"), "tok");
});

test("lattice-gate: 门禁 302 去登录页 lattice 变体并带回原路径,响应不可缓存", () => {
  const res = latticeGateRedirect("https://aetherstudio.top/lattice/?topic=%E5%8F%A4%E5%85%B8");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const location = new URL(res.headers.get("location"), "https://aetherstudio.top");
  assert.equal(location.origin, "https://aetherstudio.top");
  assert.equal(location.pathname, "/signin");
  // via=lattice: 登录页渲染"仅造场账户"变体(标题/文案不同,登录方式与主站一致:
  // GitHub + 邮箱验证码,见 tests/suites/03-auth-invite.tests.mjs 的变体断言)
  assert.equal(location.searchParams.get("via"), "lattice");
  // return_to 解码后是站内绝对路径(以 / 开头,非 //),safeReturnPath 会放行
  const returnTo = location.searchParams.get("return_to");
  assert.equal(returnTo, "/lattice/?topic=%E5%8F%A4%E5%85%B8");
  assert.ok(returnTo.startsWith("/") && !returnTo.startsWith("//"));
});
