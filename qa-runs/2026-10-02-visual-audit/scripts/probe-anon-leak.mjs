// 泄露核查:匿名 vs 登录,对 200-for-anonymous 的个人面做正文 diff。
// 判据:匿名响应里是否出现登录态才应有的内容(余额/邮箱/会员号/昵称/作品数/通知条目)。
import fs from "node:fs";
import { ORIGIN, RUN, storageStatePath } from "./common.mjs";

const SUSPECT = ["/wallet", "/profile", "/studio", "/studio/new", "/notifications", "/collections", "/challenges", "/circles", "/discover", "/feed"];

const st = JSON.parse(fs.readFileSync(storageStatePath(), "utf8"));
const cookie = st.cookies.filter((c) => c.name === "zaochang_session").map((c) => `${c.name}=${c.value}`).join("; ");

// 只读 GET
async function get(path, authed) {
  const headers = { "User-Agent": "zaochang-qa-audit/1.0 (read-only)" };
  if (authed) headers.Cookie = cookie;
  const res = await fetch(`${ORIGIN}${path}`, { headers, redirect: "manual" });
  return { status: res.status, html: await res.text() };
}
const text = (h) =>
  h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
   .replace(/<[^>]+>/g, "\n").replace(/&[a-z#0-9]+;/gi, " ").split("\n")
   .map((s) => s.trim()).filter(Boolean);

// 登录态才应出现的特征词(验收号已知值 + 通用个人数据词)
const AGENT = ["agent@zaochang", "造场 Agent", "agent"];
const PERSONAL = ["余额", "balance", "钱包余额", "会员号", "member", "果子", "我的钱包", "通知", "已读", "发布新作品", "登录以", "请先登录", "sign in", "Sign in"];

const out = [];
for (const p of SUSPECT) {
  const [a, b] = await Promise.all([get(p, false), get(p, true)]);
  const ta = text(a.html);
  const tb = text(b.html);
  const setB = new Set(tb);
  const onlyAuthed = tb.filter((x) => x.length > 1 && !ta.includes(x));
  const leaked = ta.filter((x) => AGENT.some((k) => x.includes(k)));
  const personal = ta.filter((x) => PERSONAL.some((k) => x.includes(k)));
  out.push({
    path: p,
    anonTextNodes: ta.length,
    authTextNodes: tb.length,
    anonAgentValueLeak: leaked,
    anonPersonalMarkers: personal.slice(0, 12),
    authOnlySamples: onlyAuthed.slice(0, 10),
  });
  console.log(`\n=== ${p} ===  anon_nodes=${ta.length} auth_nodes=${tb.length}`);
  if (leaked.length) console.log(`  !! 匿名响应含验收号身份值: ${JSON.stringify(leaked.slice(0, 5))}`);
  else console.log("  匿名响应无验收号身份值泄漏");
  if (personal.length) console.log(`  匿名个人面标记: ${JSON.stringify(personal.slice(0, 8))}`);
  if (onlyAuthed.length) console.log(`  仅登录态可见(前6): ${JSON.stringify(onlyAuthed.slice(0, 6).map((s) => s.slice(0, 60)))}`);
}
fs.writeFileSync(`${RUN}/evidence/12-anon-leak-diff.json`, JSON.stringify({ capturedAt: new Date().toISOString(), out }, null, 2), "utf8");
