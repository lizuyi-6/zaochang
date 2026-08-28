// fail-closed 迁移检查:部署前确认本地所有迁移都已应用到生产 D1。
// 语义:journal 与生产 __drizzle_migrations 逐条对账——数量或最新时间不齐即 exit 1。
// 只比"最后一条"会漏掉中间未应用的迁移(1..n-1 缺失时 MAX(created_at) 仍可能更大);
// 数量比对补上这个洞(前提:迁移只增不删,这正是本仓库的迁移纪律)。
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
      // COUNT + MAX 一次拿齐:数量校验挡中间缺口,时间校验挡乱序/回填的时间漂移。
      sql: "SELECT COUNT(*) AS applied, COALESCE(MAX(created_at), 0) AS latest FROM __drizzle_migrations",
    }),
  },
);
const data = await res.json();
if (!data.success || !data.result?.[0]?.results?.length) {
  console.error("读取生产迁移状态失败:", JSON.stringify(data));
  console.error("可能原因:token 无 D1 读权限,或生产 __drizzle_migrations 表不存在");
  process.exit(1);
}
const prodCount = Number(data.result[0].results[0].applied);
const prodLatest = Number(data.result[0].results[0].latest);

console.log(`journal 迁移数: ${entries.length} (最新 ${last.tag}, when=${localLatest})`);
console.log(`生产已应用:     count=${prodCount}, latest created_at=${prodLatest}`);

const missingByCount = entries.length !== prodCount;
const missingByTime = localLatest > prodLatest;

if (missingByCount || missingByTime) {
  console.error("\n✘ FAIL:本地迁移与生产 __drizzle_migrations 不一致。");
  if (missingByCount) {
    console.error(`  数量缺口:本地 ${entries.length} 条 vs 生产 ${prodCount} 条——存在未记录的中间迁移`);
    console.error("  (注意:wranler d1 execute --file 应用 SQL 不会写入 __drizzle_migrations,");
    console.error("   必须按 backups/_backfill_drizzle_migrations.sql 的方式手工回填 hash/created_at 行)。");
  }
  if (missingByTime) {
    console.error(`  时间缺口:journal 最新(${last.tag}, when=${localLatest}) > 生产最新(${prodLatest})`);
  }
  console.error("  请先备份生产 D1,再应用缺失迁移并回填迁移账目:");
  console.error(`    npx wrangler d1 export zaochang-db --remote --config wrangler.prod.jsonc --output backups/pre-NNNN.sql`);
  console.error(`    npx wrangler d1 execute zaochang-db --remote --config wrangler.prod.jsonc --file drizzle/${last.tag}.sql`);
  console.error("  应用后重跑本工作流。(fail-closed:防止代码上线但 schema 缺失)");
  process.exit(1);
}
console.log("✓ 所有本地迁移均已应用到生产,可安全部署");
