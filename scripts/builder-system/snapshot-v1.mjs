// scripts/builder-system/snapshot-v1.mjs
// 生成《Hello System》V1 冻结快照：全部 78 个节点的稳定 id / slug / parentId / sortOrder。
// 自 V1 Freeze 起，doc id 与 slug 视为稳定 API；任何改动都会导致 freeze 回归测试失败，
// 除非显式执行带迁移计划的 content migration 并同步更新本快照。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { docs as coreDocs } from "./core.mjs";
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

const snapshot = {
  book: "hello-system",
  freezeVersion: "v1",
  nodeCount: allDocs.length,
  nodes: allDocs.map((d) => ({
    id: d.id,
    slug: d.slug,
    parentId: d.parentId === "NULL" ? null : String(d.parentId).replace(/^'|'$/g, ""),
    sortOrder: d.sortOrder,
    title: d.title
  }))
};

const outPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "v1-snapshot.json");
fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
console.log(`V1 冻结快照已生成: ${outPath} (${snapshot.nodeCount} 节点)`);
