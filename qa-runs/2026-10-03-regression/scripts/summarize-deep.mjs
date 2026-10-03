// 深度录制汇总(字段对齐 deep-driver v2:clicks/containers 在顶层,walk 只含汇总字段)。
import fs from "node:fs";
const E = "X:/zaochang/qa-runs/2026-10-03-regression/evidence";
const FILES = [
  "41-batchA-main.json", "42-batchB-dynamic.json", "43-batchC-lattice.json", "44-batchD-anon.json",
  "48-mobile.json", "49-tablet.json",
];

const rows = [];
for (const f of FILES) {
  const p = `${E}/${f}`;
  if (!fs.existsSync(p)) continue;
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const r of d.out) rows.push({ batch: f.replace(/\.json$/, ""), ...r });
}

console.log("总页数:", rows.length);

const notBottom = [], noClick = [], errs = [], http4 = [], consoleErrs = [];
for (const r of rows) {
  const w = r.walk || {};
  if (r.err) errs.push(`${r.key}: ${r.err}`);
  if ((r.http4xx5xx || []).length) http4.push(`${r.key}: ${r.http4xx5xx.map((x) => x.status + " " + x.url).join(" | ")}`);
  const ce = (r.console || []).filter((c) => c.type === "error" || c.type === "pageerror");
  if (ce.length) consoleErrs.push(`${r.key}: ${ce.map((c) => c.text.slice(0, 80)).join(" | ")}`);

  const total = r.maxScrollTotal || 0;
  const got = w.scrolledTo || 0;
  if (total > 40 && total - got > 60) notBottom.push(`${r.key} 未滚到底 ${got}/${total}px (${w.scrolls} 步)`);
  if (!(r.clicks || []).length) noClick.push(r.key);
}

console.log("\n=== 滚动未到底 ===");
console.log(notBottom.length ? notBottom.join("\n") : "无(全部可滚页均已滚到底)");
console.log("\n=== 错误 ===");
console.log(errs.length ? errs.join("\n") : "无");
console.log("\n=== >=400 响应 ===");
console.log(http4.length ? http4.join("\n") : "无");
console.log("\n=== 控制台 error/pageerror ===");
console.log(consoleErrs.length ? consoleErrs.join("\n") : "无");

console.log(`\n=== 完全没有可点安全控件的页:${noClick.length} 页 ===`);
console.log(noClick.join(", "));

console.log("\n=== 滚动量 Top 14(懒加载/长内容风险最高) ===");
rows.filter((r) => (r.maxScrollTotal || 0) > 1000)
  .sort((a, b) => b.maxScrollTotal - a.maxScrollTotal).slice(0, 14)
  .forEach((r) => console.log(`  ${r.key.padEnd(26)} ${String(r.maxScrollTotal).padStart(6)}px ${String((r.walk || {}).scrolls || 0).padStart(2)}步 容器${(r.containers || []).length} 点击${(r.clicks || []).length}`));

console.log("\n=== 点击产生内容变化的页(交互确实生效) ===");
const acted = rows.filter((r) => (r.clicks || []).some((c) => c.changed));
console.log(`${acted.length} 页`);
acted.forEach((r) => {
  const ch = (r.clicks || []).filter((c) => c.changed).map((c) => `${c.sel}:"${c.text}" ${c.before}->${c.after}`);
  console.log(`  ${r.key.padEnd(26)} ${ch.join(" ; ")}`);
});

console.log("\n=== 仅内层容器可滚的页(固定页面滚动) ===");
const innerOnly = rows.filter((r) => (r.walk || {}).innerOnly);
console.log(`${innerOnly.length} 页: ` + innerOnly.map((r) => r.key).join(", "));

console.log("\n=== 容器数分布 ===");
const byN = {};
for (const r of rows) { const n = (r.containers || []).length; byN[n] = (byN[n] || 0) + 1; }
Object.entries(byN).sort((a, b) => a[0] - b[0]).forEach(([k, v]) => console.log(`  ${k} 个容器: ${v} 页`));

console.log("\n=== 录制产物统计 ===");
const c = (ext) => fs.readdirSync(E).filter((x) => x.endsWith(ext)).length;
console.log(`  webm ${c(".webm")} / mp4 ${c(".mp4")} / png ${c(".png")} / json ${c(".json")}`);

fs.writeFileSync(`${E}/45-deep-summary.json`, JSON.stringify({ total: rows.length, rows }, null, 2), "utf8");
console.log("\nWROTE 45-deep-summary.json");
