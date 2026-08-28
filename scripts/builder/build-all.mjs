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
import { part7Docs } from "./part7.mjs";
import { part8Docs } from "./part8.mjs";
import { part9Docs } from "./part9.mjs";
import { part10Docs } from "./part10.mjs";

const allDocs = [
  ...coreDocs,
  ...part1Docs,
  ...part2Docs,
  ...part3Docs,
  ...part4Docs,
  ...part5Docs,
  ...part6Docs,
  ...part7Docs,
  ...part8Docs,
  ...part9Docs,
  ...part10Docs
];

console.log(`正在编译《Hello Computer · 图解计算机组成原理》全书...`);
console.log(`总文档节点数: ${allDocs.length}`);

let sql = `-- Hello Computer · 考研 408 图解计算机组成原理
-- 全书 42 章完整正文、10 个顶层部分、序言与书根。禁止任何 AI Emoji，纯正严谨学术图解风格。
-- 先清 FK 子表: reading_progress 的 book_id/last_chapter_id 均外键引用 docs.id,
-- 已有阅读进度的库上直接 DELETE FROM docs 会触发 FOREIGN KEY 约束失败 (node:sqlite 与 D1 默认强制外键)。
-- 显式事务:中途失败整体回滚,不会留下"删了旧章节、只插入一半"的半本书状态。
BEGIN TRANSACTION;
DELETE FROM reading_progress WHERE book_id LIKE 'doc:hello-computer-%' OR book_id = 'doc:book-hello-computer' OR last_chapter_id LIKE 'doc:hello-computer-%' OR last_chapter_id = 'doc:book-hello-computer';
DELETE FROM docs WHERE id LIKE 'doc:hello-computer-%' OR id = 'doc:book-hello-computer';

`;

for (const doc of allDocs) {
  // 全字段经 esc():id/slug/visibility/authorEmail 虽然今天是静态字面量,但任何
  // 一个未来多出单引号都会静默产出损坏 SQL。parentId 的源数据约定是 NULL 或
  // 预加引号字面量('doc:xxx')——先剥掉外层引号、esc 内核、再统一加回,
  // 否则 esc 会把引号再次翻倍,产出损坏 SQL。
  const parentSql = doc.parentId === "NULL"
    ? "NULL"
    : `'${esc(String(doc.parentId).replace(/^'|'$/g, ""))}'`;
  sql += `INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('${esc(doc.id)}', '${esc(doc.slug)}', ${parentSql}, '${esc(doc.title)}', '${esc(doc.bodyMd)}', '${esc(doc.visibility)}', '${esc(doc.authorEmail)}', ${doc.sortOrder}, ${doc.isBook}, ${doc.coverHue}, '${esc(doc.summary)}');

`;
}

sql += `COMMIT;
`;

// 输出到 content/(入库的内容产物,无用户数据),路径相对本文件而非 cwd。
const targetPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "content", "import-hellocomputer.sql");
fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, sql, "utf8");
console.log(`编译完成！已成功输出到 ${targetPath} (文件大小: ${(Buffer.byteLength(sql, "utf8") / 1024).toFixed(1)} KB)`);
