// 全站可达性功能探针:30 条主站路由 × 匿名/登录双身份。
// 只发 GET(安全、可逆);记录状态码、重定向落点、内容类型、正文指纹。
// 这一层先建功能地图,再决定哪些页面值得开浏览器录像。
import fs from "node:fs";
import { ORIGIN, RUN, storageStatePath } from "./common.mjs";

const ROUTES = [
  "/", "/signin", "/bookshelf", "/feed", "/discover", "/galaxy",
  "/galaxy/products", "/galaxy/company", "/galaxy/incubator", "/galaxy/apply",
  "/circles", "/collections", "/challenges", "/wallet", "/studio", "/studio/new",
  "/studio/docs", "/docs", "/developers", "/developers/docs", "/guide",
  "/profile", "/profile/edit", "/notifications", "/app", "/admin", "/founder",
  "/oauth/authorize", "/oauth/payment/demo",
  "/product-apps/loops", "/product-apps/minute", "/product-apps/mori",
  "/product-apps/sprout", "/product-apps/typewave", "/product-apps/wander",
];

const st = JSON.parse(fs.readFileSync(storageStatePath(), "utf8"));
const cookie = st.cookies.filter((c) => c.name === "zaochang_session").map((c) => `${c.name}=${c.value}`).join("; ");

const textish = (ct) => /html|json|text/.test(ct || "");

async function probe(path, authed) {
  const headers = { "User-Agent": "zaochang-qa-audit/1.0 (read-only)" };
  if (authed && cookie) headers.Cookie = cookie;
  const started = Date.now();
  try {
    const res = await fetch(`${ORIGIN}${path}`, { headers, redirect: "manual" });
    const ct = res.headers.get("content-type") || "";
    let fingerprint = "", loc = "", bodyBytes = 0;
    if (textish(ct)) {
      const t = await res.text();
      bodyBytes = Buffer.byteLength(t);
      const stripped = t
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z#0-9]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      fingerprint = stripped.slice(0, 110);
    }
    loc = res.headers.get("location") || "";
    return {
      path,
      status: res.status,
      loc,
      ct: ct.split(";")[0],
      bytes: bodyBytes,
      ms: Date.now() - started,
      fp: fingerprint,
    };
  } catch (e) {
    return { path, status: "ERR", err: String(e).slice(0, 120), ms: Date.now() - started };
  }
}

const rows = [];
for (const p of ROUTES) {
  const anon = await probe(p, false);
  const auth = await probe(p, true);
  rows.push({ path: p, anon, auth });
  const diff = anon.status !== auth.status || anon.loc !== auth.loc;
  console.log(
    `${p.padEnd(28)} anon=${String(anon.status).padEnd(4)}${(anon.loc || "").slice(0, 26).padEnd(27)} auth=${String(auth.status).padEnd(4)}${(auth.loc || "").slice(0, 26).padEnd(27)} ${diff ? "DIFF" : ""} ${auth.ms}ms`
  );
}

fs.writeFileSync(`${RUN}/evidence/10-main-site-reachability.json`, JSON.stringify({ capturedAt: new Date().toISOString(), rows }, null, 2), "utf8");

// 差异汇总:登录门禁是否 fail-closed,有无匿名可达的管理/个人面
console.log("\n=== 登录门禁差异(anon != auth) ===");
rows.filter((r) => r.anon.status !== r.auth.status || r.anon.loc !== r.auth.loc)
  .forEach((r) => console.log(`  ${r.path.padEnd(26)} anon ${r.anon.status}${r.anon.loc ? " -> " + r.anon.loc : ""}   auth ${r.auth.status}${r.auth.loc ? " -> " + r.auth.loc : ""}`));
console.log("\n=== 匿名可达但疑似敏感面 ===");
rows.filter((r) => r.anon.status === 200 && /admin|founder|wallet|profile|notifications|studio/.test(r.path))
  .forEach((r) => console.log(`  ${r.path.padEnd(26)} anon=200  fp="${r.anon.fp.slice(0, 80)}"`));
console.log("\n=== 异常状态(4xx/5xx) ===");
rows.filter((r) => Number(r.auth.status) >= 400 || Number(r.anon.status) >= 400)
  .forEach((r) => console.log(`  ${r.path.padEnd(26)} anon=${r.anon.status} auth=${r.auth.status} loc=${r.auth.loc || "-"}`));
