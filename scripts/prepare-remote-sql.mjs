// scripts/prepare-remote-sql.mjs
// 围栏感知剥离最外层 BEGIN TRANSACTION / COMMIT; 保留正文代码块内的所有 SQL 语句

import fs from "node:fs";
import path from "node:path";

const sqlPath = path.resolve("content/import-hellosystem.sql");
const rawSql = fs.readFileSync(sqlPath, "utf8");

const lines = rawSql.split("\n");
const out = [];
let inFence = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();
  
  if (trimmed.startsWith("```")) {
    inFence = !inFence;
    out.push(line);
    continue;
  }
  
  if (!inFence) {
    if (trimmed === "BEGIN TRANSACTION;" || trimmed === "BEGIN;" || (trimmed === "COMMIT;" && i > lines.length - 10)) {
      console.log(`[Fence-Aware] 剥离文件级外层事务语句 (第 ${i + 1} 行): ${trimmed}`);
      continue;
    }
  }
  out.push(line);
}

fs.mkdirSync(".tmp", { recursive: true });
const targetPath = path.resolve(".tmp/import-hellosystem-remote.sql");
fs.writeFileSync(targetPath, out.join("\n"), "utf8");
console.log(`生成完成: ${targetPath} (大小: ${(Buffer.byteLength(out.join("\n"), "utf8") / 1024).toFixed(1)} KB)`);
