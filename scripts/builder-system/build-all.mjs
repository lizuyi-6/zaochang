// scripts/builder-system/build-all.mjs
// 《Hello System · 图解软件系统》全书编译总控脚本
//
// V1 Freeze 发布语义（自 V1 起冻结）：
// - 全书共 78 个生成节点（1 书根 + 序言 + 序章 + 6 部分容器 + 60 章 + 8 附录 + 后记），
//   不再设独立 Appendix 容器节点；所有 doc id / slug 视为稳定 API，禁止改动。
// - 发布使用 INSERT ... ON CONFLICT(id) DO UPDATE（UPSERT）：更新正文字段，
//   但绝不删除 docs 行，也绝不触碰 reading_progress 等以 doc id 关联的用户数据。
// - 仅在内容相关字段实际变化时才推进 updated_at；created_at 永远保留首刊时间。
// - 删除章节不属于正常发布路径；如未来确需删除，必须编写显式 migration。

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

// 质量自检 2: id / slug 唯一性，parent 引用完整性（防止断链与循环前置条件）
{
  const ids = new Set();
  const slugByParent = new Set();
  for (const doc of allDocs) {
    if (ids.has(doc.id)) throw new Error(`重复 doc id: ${doc.id}`);
    ids.add(doc.id);
    const parentKey = String(doc.parentId).replace(/^'|'$/g, "");
    const slugKey = `${parentKey}::${doc.slug}`;
    if (slugByParent.has(slugKey)) throw new Error(`同一父节点下重复 slug: ${slugKey}`);
    slugByParent.add(slugKey);
  }
  for (const doc of allDocs) {
    const parentKey = String(doc.parentId).replace(/^'|'$/g, "");
    if (parentKey !== "NULL" && !ids.has(parentKey)) {
      throw new Error(`文档 ${doc.id} 的 parentId 不存在: ${parentKey}`);
    }
  }
  console.log("质量自检通过: id/slug 唯一，parent 引用完整！");
}

let sql = `-- Hello System · 图解软件系统
-- 从一次点击开始，理解一个完整软件系统如何运行
-- V1 Freeze: 全书 78 个生成节点（书根 + 序言 + 序章 + 6 部分 + 60 章 + 8 附录 + 后记）。
-- 本文件采用 UPSERT 语义：按稳定 doc id 更新正文，绝不删除 docs 行，
-- 绝不清空 reading_progress 等用户阅读数据。created_at 保留首刊时间，
-- updated_at 仅在内容字段实际变化时推进。

BEGIN TRANSACTION;

`;

for (const doc of allDocs) {
  const parentSql = doc.parentId === "NULL"
    ? "NULL"
    : `'${esc(String(doc.parentId).replace(/^'|'$/g, ""))}'`;

  sql += `INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('${esc(doc.id)}', '${esc(doc.slug)}', ${parentSql}, '${esc(doc.title)}', '${esc(doc.bodyMd)}', '${esc(doc.visibility)}', '${esc(doc.authorEmail)}', ${doc.sortOrder}, ${doc.isBook}, ${doc.coverHue}, '${esc(doc.summary)}')
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  parent_id = excluded.parent_id,
  title = excluded.title,
  body_md = excluded.body_md,
  visibility = excluded.visibility,
  author_email = excluded.author_email,
  sort_order = excluded.sort_order,
  is_book = excluded.is_book,
  cover_hue = excluded.cover_hue,
  summary = excluded.summary,
  updated_at = CASE
    WHEN docs.slug IS NOT excluded.slug
      OR docs.parent_id IS NOT excluded.parent_id
      OR docs.title IS NOT excluded.title
      OR docs.body_md IS NOT excluded.body_md
      OR docs.visibility IS NOT excluded.visibility
      OR docs.sort_order IS NOT excluded.sort_order
      OR docs.is_book IS NOT excluded.is_book
      OR docs.cover_hue IS NOT excluded.cover_hue
      OR docs.summary IS NOT excluded.summary
    THEN CURRENT_TIMESTAMP
    ELSE docs.updated_at
  END;

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
