// scripts/builder-system/build-all.mjs
// 《Hello System · 图解软件系统》全书编译总控脚本

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { docs as coreDocs, esc } from "./core.mjs";
import { part1Docs } from "./part1.mjs";
import { part2Docs } from "./part2.mjs";
import { part3Docs } from "./part3.mjs";
import { part4Docs } from "./part4.mjs";
import { part5Docs } from "./part5.mjs";
import { part6Docs } from "./part6.mjs";
import { appendixDocs } from "./appendix.mjs";

const allDocs = [
  ...coreDocs,
  ...part1Docs,
  ...part2Docs,
  ...part3Docs,
  ...part4Docs,
  ...part5Docs,
  ...part6Docs,
  ...appendixDocs
];

console.log("==================================================");
console.log("正在编译《Hello System · 图解软件系统》全书...");
console.log(`总文档节点数: ${allDocs.length}`);

// 质量自检 1: 正则扫描是否残留 AI 装饰 Emoji
const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
let emojiViolations = 0;
for (const doc of allDocs) {
  if (emojiRegex.test(doc.title) || emojiRegex.test(doc.bodyMd)) {
    console.warn(`[Emoji 告警] 文档 ${doc.id} (${doc.title}) 包含装饰性 Emoji!`);
    emojiViolations++;
  }
}

if (emojiViolations === 0) {
  console.log("质量自检通过: 零装饰性 AI Emoji！");
} else {
  console.warn(`发现 ${emojiViolations} 处 Emoji 违规，建议清理。`);
}

let sql = `-- Hello System · 图解软件系统
-- 从一次点击开始，理解一个完整软件系统如何运行
-- 全书 60 章、6 个顶层部分、序言、序章、附录与后记完整节点。

BEGIN TRANSACTION;
DELETE FROM reading_progress WHERE book_id LIKE 'doc:hello-system-%' OR book_id = 'doc:book-hello-system' OR last_chapter_id LIKE 'doc:hello-system-%' OR last_chapter_id = 'doc:book-hello-system';
DELETE FROM docs WHERE id LIKE 'doc:hello-system-%' OR id = 'doc:book-hello-system';

`;

for (const doc of allDocs) {
  const parentSql = doc.parentId === "NULL"
    ? "NULL"
    : `'${esc(String(doc.parentId).replace(/^'|'$/g, ""))}'`;
  
  sql += `INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('${esc(doc.id)}', '${esc(doc.slug)}', ${parentSql}, '${esc(doc.title)}', '${esc(doc.bodyMd)}', '${esc(doc.visibility)}', '${esc(doc.authorEmail)}', ${doc.sortOrder}, ${doc.isBook}, ${doc.coverHue}, '${esc(doc.summary)}');

`;
}

sql += `COMMIT;
`;

// 输出到 content/import-hellosystem.sql 与 backups/import-hellosystem.sql
const contentPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "content", "import-hellosystem.sql");
const backupPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "backups", "import-hellosystem.sql");

fs.mkdirSync(path.dirname(contentPath), { recursive: true });
fs.writeFileSync(contentPath, sql, "utf8");

fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.writeFileSync(backupPath, sql, "utf8");

const sizeKB = (Buffer.byteLength(sql, "utf8") / 1024).toFixed(1);
console.log(`编译成功！已输出至:`);
console.log(`- ${contentPath}`);
console.log(`- ${backupPath}`);
console.log(`文件大小: ${sizeKB} KB`);
console.log("==================================================");
