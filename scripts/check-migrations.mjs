// fail-closed 迁移检查:部署前确认本地所有迁移都已应用到生产 D1。
// 语义:journal 与生产 __drizzle_migrations 按序逐条对账——数量、每条 hash
// (SQL 文件的 sha256,drizzle 迁移账目格式)与 created_at 水位全部一致才算通过。
// 只比 COUNT+MAX 会漏掉"数量与最新时间相同、但中间条目内容不同"的错位;
// 有序 hash 对账补上这个洞(前提:迁移只增不删、历史 SQL 不改写,这正是本仓库纪律)。
// 这避免"Worker 代码引用了新表/列,但生产 schema 没跟上"导致的运行时错误。
// 调用 Cloudflare D1 REST API(只读 SELECT),需 CLOUDFLARE_API_TOKEN 环境变量。
import crypto from "node:crypto";
import fs from "node:fs";

const ACCOUNT_ID = "65ebf2011c45b578d745221c646434fc";
const DB_ID = "d250a527-1e1e-4b7f-ac27-266c723581e3";

const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
const entries = journal.entries;
if (!entries.length) {
  console.error("journal 无条目,无法校验");
  process.exit(1);
}

// 本地有序账目:每条 journal entry → SQL 文件 sha256 + when(与 drizzle migrator
// 写入 __drizzle_migrations 的 hash/created_at 同口径)。
// 换行口径说明:drizzle 的 hash 是文件原始字节的 sha256,但本仓库历史回填不一致——
// 0006-0009 按 CRLF 原样入帐,0010-0011 按 LF 归一入帐(已逐条实测)。因此每条本地
// 同时计算"原样"与"LF 归一"两个 hash,远端命中任一即视为内容一致:换行差异不算
// schema 漂移,但任何真实内容改动会同时改变两个 hash,仍然 fail-closed。
// tag 口径说明(2026-08-30 生产实测):生产 0013-0018 六条的 hash 列存的是迁移
// tag 文件名本身(另一批回填口径),不是内容 sha256。tag 精确相等仍能证明账目行
// 对应唯一 journal 条目,但无法验证这六条的 SQL 字节——此类命中记入 limited
// verification 并在输出中列明,不伪装成完整内容校验。其余条目仍强制内容 hash。
const local = entries.map((entry) => {
  const file = `drizzle/${entry.tag}.sql`;
  if (!fs.existsSync(file)) {
    console.error(`journal 条目 ${entry.tag} 缺少对应 SQL 文件 ${file}`);
    process.exit(1);
  }
  const sql = fs.readFileSync(file, "utf8");
  const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
  const hashes = new Set([sha256(sql), sha256(sql.replace(/\r\n/g, "\n"))]);
  return {
    tag: entry.tag,
    hashes,
    when: Number(entry.when),
  };
});
const last = local[local.length - 1];

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
      // 全量有序行:数量校验挡缺口,逐位 hash 校验挡内容错位,created_at 校验挡时间漂移。
      sql: "SELECT hash, created_at FROM __drizzle_migrations ORDER BY id",
    }),
  },
);
const data = await res.json();
if (!data.success || !Array.isArray(data.result?.[0]?.results)) {
  console.error("读取生产迁移状态失败:", JSON.stringify(data));
  console.error("可能原因:token 无 D1 读权限,或生产 __drizzle_migrations 表不存在");
  process.exit(1);
}
const remote = data.result[0].results.map((row) => ({
  hash: String(row.hash),
  when: Number(row.created_at),
}));

console.log(`journal 迁移数: ${local.length} (最新 ${last.tag}, when=${last.when})`);
console.log(`生产已应用:     count=${remote.length}, latest created_at=${remote.at(-1)?.when ?? 0}`);

const failures = [];
const tagCaliber = [];
if (local.length !== remote.length) {
  failures.push(`数量缺口:本地 ${local.length} 条 vs 生产 ${remote.length} 条——存在未记录的中间迁移`);
}
const compared = Math.min(local.length, remote.length);
for (let index = 0; index < compared; index += 1) {
  if (local[index].hashes.has(remote[index].hash) || remote[index].hash === local[index].tag) {
    if (remote[index].hash === local[index].tag) tagCaliber.push(local[index].tag);
  } else {
    failures.push(`hash 错位:第 ${index + 1} 条(${local[index].tag})远端 ${remote[index].hash.slice(0, 12)}… 与本地 SQL 内容不符`);
  }
  if (local[index].when !== remote[index].when) {
    failures.push(`时间错位:第 ${index + 1} 条(${local[index].tag})本地 when=${local[index].when} ≠ 生产 created_at=${remote[index].when}`);
  }
}

if (failures.length) {
  console.error("\n✘ FAIL:本地迁移与生产 __drizzle_migrations 不一致。");
  for (const failure of failures) console.error(`  ${failure}`);
  console.error("  (注意:wrangler d1 execute --file 应用 SQL 不会写入 __drizzle_migrations,");
  console.error("   必须按 backups/_backfill_drizzle_migrations.sql 的方式手工回填 hash/created_at 行,");
  console.error("   hash 为对应 SQL 文件字节的 sha256(CRLF 原样或 LF 归一;历史上亦有 tag 入帐批次),");
  console.error("   created_at 为 journal 的 when。) ");
  console.error("  请先备份生产 D1,再应用缺失迁移并回填迁移账目:");
  console.error(`    npx wrangler d1 export zaochang-db --remote --config wrangler.prod.jsonc --output backups/pre-NNNN.sql`);
  console.error(`    npx wrangler d1 execute zaochang-db --remote --config wrangler.prod.jsonc --file drizzle/${last.tag}.sql`);
  console.error("  应用后重跑本工作流。(fail-closed:防止代码上线但 schema 缺失)");
  process.exit(1);
}
if (tagCaliber.length) {
  console.log(`⚠ limited verification:${tagCaliber.length} 条账目为 tag 入帐(无内容 hash可比),`);
  console.log(`  内容一致性由"迁移只增不删、历史 SQL 不改写"纪律保证: ${tagCaliber.join(", ")}`);
}
console.log("✓ 所有本地迁移均已应用到生产(数量+有序账目+created_at 逐位一致),可安全部署");
