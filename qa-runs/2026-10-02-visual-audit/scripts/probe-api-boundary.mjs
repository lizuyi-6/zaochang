// API 权限边界探针:不带凭据 / 伪造凭据 请求写面,验证是否 fail-closed。
//
// 安全边界:只发「无授权」与「伪造授权」请求 —— 目的正是验证这些请求被拒。
// 不用有效凭据(避免真的创建生产数据),故若某端点 fail-open,产生的也是匿名垃圾数据
// (可用伪造 cookie 归因),且本探针不传任何业务必填字段,失败概率高。
// 观察的是「拒绝」这一性质,不是业务成功。
import fs from "node:fs";
import { ORIGIN, RUN } from "./common.mjs";

const BAD_COOKIE = "zaochang_session=" + "f".repeat(64);
const BAD_BEARER = "Bearer " + "f".repeat(64);

// [path, method, 需要 body?]
const ENDPOINTS = [
  ["/api/community", "GET"],
  ["/api/shell-state", "GET"],
  ["/api/actions", "POST", {}],
  ["/api/comments", "GET"],
  ["/api/comments", "POST", {}],
  ["/api/docs", "GET"],
  ["/api/docs", "POST", {}],
  ["/api/docs", "PATCH", {}],
  ["/api/docs", "DELETE", {}],
  ["/api/docs/cover", "POST", {}],
  ["/api/products", "POST", {}],
  ["/api/uploads", "POST"],
  ["/api/wallet", "GET"],
  ["/api/v1/fruit/wallet", "GET"],
  ["/api/v1/fruit/payments", "POST", {}],
  ["/api/v1/fruit/payments/approve", "POST", {}],
  ["/api/payments", "GET"],
  ["/api/payments", "POST", {}],
  ["/api/reading-progress", "GET"],
  ["/api/reading-progress", "POST", {}],
  ["/api/reports", "POST", {}],
  ["/api/incubation", "GET"],
  ["/api/incubation", "POST", {}],
  ["/api/developer/clients", "GET"],
  ["/api/developer/clients", "POST", {}],
  ["/api/admin/capabilities", "GET"],
  ["/api/admin/moderation", "GET"],
  ["/api/admin/moderation", "PATCH", {}],
  ["/api/admin/invitations", "GET"],
  ["/api/admin/invitations", "POST", {}],
  ["/api/admin/incubation", "GET"],
  ["/api/admin/visual-session", "GET"],
  ["/api/auth/logout", "GET"],
  ["/api/auth/dev-login", "GET"],
  ["/api/ai/reading", "POST", {}],
  ["/api/hyperknow/chat", "POST", {}],
  ["/api/hyperknow/whiteboard/plan", "POST", {}],
  ["/api/hyperknow/course-generation", "POST", {}],
  ["/api/hyperknow/course-inquiry", "POST", {}],
  ["/api/hyperknow/translate", "POST", {}],
  ["/api/hyperknow/model-check", "POST", {}],
  ["/api/hyperknow/tts/stream", "GET"],
  ["/api/hyperknow/feed", "GET"],
  ["/api/hyperknow/marketplace/courses", "GET"],
  ["/api/hyperknow/conversations/list_past_conversations", "GET"],
  ["/api/hyperknow/auth/get_user_info", "GET"],
  ["/api/hyperknow/whiteboard/interject", "POST", {}],
  ["/api/hyperknow/whiteboard/image", "POST", {}],
  ["/api/oauth/jwks", "GET"],
  ["/api/oauth/consents", "GET"],
  ["/api/oauth/token", "POST", {}],
  ["/api/oauth/authorize", "POST", {}],
  ["/api/oauth/revoke", "POST", {}],
  ["/api/app-shell", "GET"],
];

const MODES = [
  { key: "no-cred", headers: {} },
  { key: "bad-cookie", headers: { Cookie: BAD_COOKIE } },
  { key: "bad-bearer", headers: { Authorization: BAD_BEARER } },
];

const out = [];
for (const [path, method, body] of ENDPOINTS) {
  const row = { path, method };
  for (const m of MODES) {
    const init = { method, headers: { "User-Agent": "zaochang-qa-audit/1.0 (read-only)", ...m.headers }, redirect: "manual" };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    try {
      const res = await fetch(`${ORIGIN}${path}`, init);
      let snippet = "";
      try { snippet = (await res.text()).replace(/\s+/g, " ").slice(0, 90); } catch { snippet = "(unreadable body)"; }
      row[m.key] = { status: res.status, loc: res.headers.get("location") || "", body: snippet };
    } catch (e) {
      row[m.key] = { status: "ERR", err: String(e).slice(0, 100) };
    }
  }
  out.push(row);
  const s = MODES.map((m) => String(row[m.key].status).padEnd(4)).join(" ");
  console.log(`${method.padEnd(6)} ${path.padEnd(46)} no-cred=${s}`);
}
fs.writeFileSync(`${RUN}/evidence/14-api-boundary.json`, JSON.stringify({ capturedAt: new Date().toISOString(), out }, null, 2), "utf8");

console.log("\n=== fail-open 嫌疑(无凭据却拿到 2xx) ===");
const suspects = out.filter((r) => {
  const s = r["no-cred"].status;
  return (typeof s === "number" && s >= 200 && s < 300) && r.method !== "GET";
});
if (!suspects.length) console.log("  无:所有非 GET 端点在无凭据下均未返回 2xx");
suspects.forEach((r) => console.log(`  !! ${r.method} ${r.path} -> ${r["no-cred"].status}  body="${r["no-cred"].body}"`));

console.log("\n=== 伪造凭据是否被识破(应与无凭据同样被拒) ===");
const spoofed = out.filter((r) => r["bad-cookie"].status !== r["no-cred"].status || r["bad-bearer"].status !== r["no-cred"].status);
if (!spoofed.length) console.log("  全部一致:伪造 cookie / Bearer 未获得任何额外权限");
spoofed.forEach((r) => console.log(`  ${r.method.padEnd(6)} ${r.path.padEnd(44)} no-cred=${r["no-cred"].status} bad-cookie=${r["bad-cookie"].status} bad-bearer=${r["bad-bearer"].status}`));

console.log("\n=== 匿名可达的 GET(可能是公开面,也可能是漏门禁) ===");
out.filter((r) => r.method === "GET" && r["no-cred"].status === 200)
  .forEach((r) => console.log(`  ${r.path.padEnd(46)} body="${r["no-cred"].body.slice(0, 70)}"`));
