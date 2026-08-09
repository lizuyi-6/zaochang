// fail-closed 迁移检查:部署前确认本地所有迁移都已应用到生产 D1。
// 语义:若 journal 有更新的迁移但生产 __drizzle_migrations 没记录,exit 1 阻塞部署。
// 这避免"Worker 代码引用了新表/列,但生产 schema 没跟上"导致的运行时错误。
// 调用 Cloudflare D1 REST API(只读 SELECT),需 CLOUDFLARE_API_TOKEN 环境变量。
import fs from "node:fs";

const ACCOUNT_ID = "65ebf2011c45b578d745221c646434fc";
const DB_ID = "d250a527-1e1e-4b7f-ac27-266c723581e3";

const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
const entries = journal.entries;
if (!entries.length) {
  console.error("journal 无条目,无法校验");
  process.exit(1);
}
const last = entries[entries.length - 1];
const localLatest = last.when;

const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  console.error("CLOUDFLARE_API_TOKEN 未设置");
  process.exit(1);
}

const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}/query`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      sql: "SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1",
    }),
  },
);
const data = await res.json();
if (!data.success || !data.result?.[0]?.results?.length) {
  console.error("读取生产迁移状态失败:", JSON.stringify(data));
  console.error("可能原因:token 无 D1 读权限,或生产 __drizzle_migrations 表不存在");
  process.exit(1);
}
const prodLatest = Number(data.result[0].results[0].created_at);

console.log(`journal 最新迁移: ${last.tag} (when=${localLatest})`);
console.log(`生产已应用最新:    created_at=${prodLatest}`);

if (localLatest > prodLatest) {
  console.error("\n✘ FAIL:本地有未应用到生产的迁移。");
  console.error(`  缺口:journal 最新(${last.tag}, when=${localLatest}) > 生产最新(${prodLatest})`);
  console.error("  请先备份生产 D1,再手动应用迁移:");
  console.error(`    npx wrangler d1 export zaochang-db --remote --config wrangler.prod.jsonc --output backups/pre-NNNN.sql`);
  console.error(`    npx wrangler d1 execute zaochang-db --remote --config wrangler.prod.jsonc --file drizzle/${last.tag}.sql`);
  console.error("  应用后重跑本工作流。(fail-closed:防止代码上线但 schema 缺失)");
  process.exit(1);
}
console.log("✓ 所有本地迁移均已应用到生产,可安全部署");
