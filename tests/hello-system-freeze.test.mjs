// tests/hello-system-freeze.test.mjs
// 《Hello System · 图解软件系统》V1 Freeze 回归测试套件。
// 目标：冻结 78 节点结构、稳定 doc id/slug、UPSERT 发布语义与阅读进度保护，
// 并拦截已修复的技术表述回潮（伪精确数字、绝对化断言、混层实现论等）。
// 任何 doc id / slug 变更都会使本套件失败，除非显式执行 content migration
// 并同步更新 scripts/builder-system/v1-snapshot.json。

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { docs as coreDocs } from "../scripts/builder-system/core.mjs";
import { part1Docs } from "../scripts/builder-system/part1.mjs";
import { part2Docs } from "../scripts/builder-system/part2.mjs";
import { part3Docs } from "../scripts/builder-system/part3.mjs";
import { part4Docs } from "../scripts/builder-system/part4.mjs";
import { part5Docs } from "../scripts/builder-system/part5.mjs";
import { part6Docs } from "../scripts/builder-system/part6.mjs";
import { appendixDocs } from "../scripts/builder-system/appendix.mjs";

// build-all.mjs 在导入时执行编译并重新生成 content/import-hellosystem.sql,
// 保证本套件校验的 SQL 产物与生成器严格同步（干净 checkout 上同样成立）。
await import("../scripts/builder-system/build-all.mjs");

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const allDocs = [
  ...coreDocs,
  ...part1Docs,
  ...part2Docs,
  ...part3Docs,
  ...part4Docs,
  ...part5Docs,
  ...part6Docs,
  ...appendixDocs,
];

const chapterDocs = allDocs.filter((d) => /^doc:hello-system-\d{2}-/.test(d.id));
const generatedSql = readFileSync(join(projectRoot, "content", "import-hellosystem.sql"), "utf8");
const snapshot = JSON.parse(
  readFileSync(join(projectRoot, "scripts", "builder-system", "v1-snapshot.json"), "utf8"),
);

describe("Hello System V1 Freeze: 结构冻结", () => {
  test("生成节点总数冻结为 78（书根+序言+序章+6部分+60章+8附录+后记）", () => {
    assert.equal(allDocs.length, 78, `实际生成 ${allDocs.length} 个节点`);
    assert.equal(snapshot.nodeCount, 78, "v1-snapshot.json 必须同步记录 78 节点");
  });

  test("60 章完整且编号连续", () => {
    assert.equal(chapterDocs.length, 60, `实际章节数 ${chapterDocs.length}`);
    const numbers = chapterDocs
      .map((d) => Number(d.id.match(/^doc:hello-system-(\d{2})-/)[1]))
      .sort((a, b) => a - b);
    numbers.forEach((n, i) => assert.equal(n, i + 1, `章节编号缺失: 第 ${i + 1} 章`));
  });

  test("每个 parentId 均存在且无循环", () => {
    const ids = new Set(allDocs.map((d) => d.id));
    for (const doc of allDocs) {
      const parent = doc.parentId === "NULL" ? null : String(doc.parentId).replace(/^'|'$/g, "");
      if (parent === null) {
        assert.equal(doc.id, "doc:book-hello-system", "只有书根允许无 parent");
        continue;
      }
      assert.ok(ids.has(parent), `${doc.id} 的 parent 不存在: ${parent}`);
    }
    // 循环检测: 从任一节点沿 parent 链向上, 必须在有限步内到达书根
    const parentById = new Map(
      allDocs.map((d) => [d.id, d.parentId === "NULL" ? null : String(d.parentId).replace(/^'|'$/g, "")]),
    );
    for (const doc of allDocs) {
      const seen = new Set();
      let cur = doc.id;
      while (cur !== null) {
        assert.ok(!seen.has(cur), `检测到 parent 循环: ${doc.id}`);
        seen.add(cur);
        cur = parentById.get(cur) ?? null;
      }
    }
  });

  test("附录 A~H 与后记全部直属书根（含附录F parent 修复）", () => {
    const appendixNodes = appendixDocs.filter((d) => d.id.includes("-appx-"));
    assert.equal(appendixNodes.length, 8, "附录数量应为 A~H 共 8 个");
    for (const doc of appendixDocs) {
      const parent = String(doc.parentId).replace(/^'|'$/g, "");
      assert.equal(parent, "doc:book-hello-system", `${doc.id} 必须直属书根, 实际 parent=${parent}`);
    }
  });

  test("稳定 doc id / slug 与 V1 快照完全一致", () => {
    const current = new Map(allDocs.map((d) => [d.id, d.slug]));
    assert.equal(current.size, snapshot.nodes.length, "节点数量与快照不一致");
    for (const node of snapshot.nodes) {
      assert.ok(current.has(node.id), `快照中的 doc id 被删除或改名: ${node.id}`);
      assert.equal(current.get(node.id), node.slug, `doc ${node.id} 的 slug 发生变化`);
    }
  });

  test("同一父节点下 sort_order 不冲突", () => {
    const key = (d) =>
      `${d.parentId === "NULL" ? "NULL" : String(d.parentId).replace(/^'|'$/g, "")}::${d.sortOrder}`;
    const seen = new Set();
    for (const doc of allDocs) {
      const k = key(doc);
      assert.ok(!seen.has(k), `sort_order 冲突: ${k} (${doc.id})`);
      seen.add(k);
    }
  });

  test("页面标题无重复", () => {
    const titles = new Set();
    for (const doc of allDocs) {
      assert.ok(!titles.has(doc.title), `重复标题: ${doc.title}`);
      titles.add(doc.title);
    }
  });
});

describe("Hello System V1 Freeze: 发布 SQL 语义（阅读进度保护）", () => {
  test("生成的 SQL 不含 DELETE FROM reading_progress / DELETE FROM docs", () => {
    assert.ok(!/DELETE\s+FROM\s+reading_progress/i.test(generatedSql), "禁止删除阅读进度");
    assert.ok(!/DELETE\s+FROM\s+docs/i.test(generatedSql), "禁止删除 docs 重建");
  });

  test("生成的 SQL 使用 UPSERT (ON CONFLICT(id) DO UPDATE)", () => {
    const upsertCount = (generatedSql.match(/ON CONFLICT\(id\) DO UPDATE/g) || []).length;
    assert.equal(upsertCount, 78, "每个节点都应使用 UPSERT");
  });

  test("UPSERT 保留 created_at 并按内容变化条件推进 updated_at", () => {
    assert.ok(!/ON CONFLICT[\s\S]*?created_at\s*=\s*excluded/.test(generatedSql), "created_at 不允许被覆盖");
    assert.ok(generatedSql.includes("ELSE docs.updated_at"), "内容未变时必须保留 updated_at");
  });

  test("阅读进度在正文重发后存活（progress preservation）", () => {
    const dir = mkdtempSync(join(tmpdir(), "hello-system-freeze-"));
    const dbPath = join(dir, "test.sqlite");
    const db = new DatabaseSync(dbPath);
    try {
      // 1. 应用全部真实 drizzle 迁移, 获得与生产一致的 schema
      const migrationFiles = readdirSync(join(projectRoot, "drizzle"))
        .filter((f) => /^\d{4}_.*\.sql$/.test(f))
        .sort();
      for (const f of migrationFiles) {
        db.exec(readFileSync(join(projectRoot, "drizzle", f), "utf8"));
      }

      // 2. 首次发布全书（docs.author_email 有外键, 先确保作者存在, 与本地导入脚本一致）
      db.prepare("INSERT INTO members (email, display_name) VALUES (?, ?)").run(
        "2251213429@qq.com",
        "Lizuyi",
      );
      db.exec(generatedSql);
      const docCount = db.prepare(
        "SELECT count(*) AS n FROM docs WHERE id LIKE 'doc:hello-system-%' OR id = 'doc:book-hello-system'",
      ).get().n;
      assert.equal(docCount, 78, "首次导入后应为 78 节点");

      // 3. 模拟真实用户产生阅读进度
      db.prepare("INSERT INTO members (email, display_name) VALUES (?, ?)").run(
        "freeze-reader@example.com",
        "冻结测试读者",
      );
      db.prepare(
        "INSERT INTO reading_progress (user_email, book_id, last_chapter_id, last_paragraph) VALUES (?, ?, ?, ?)",
      ).run("freeze-reader@example.com", "doc:book-hello-system", "doc:hello-system-56-full-request-journey", 7);

      // 4. 再次执行同一发布 SQL（模拟正文更新重发）
      db.exec(generatedSql);

      // 5. 断言阅读进度完整存活且引用目标仍然存在
      const progress = db.prepare(
        "SELECT * FROM reading_progress WHERE user_email = 'freeze-reader@example.com' AND book_id = 'doc:book-hello-system'",
      ).get();
      assert.ok(progress, "正文更新后 reading_progress 被删除 —— 发布门禁失败");
      assert.equal(progress.last_chapter_id, "doc:hello-system-56-full-request-journey");
      assert.equal(progress.last_paragraph, 7);
      const chapter = db.prepare(
        "SELECT id FROM docs WHERE id = 'doc:hello-system-56-full-request-journey'",
      ).get();
      assert.ok(chapter, "last_chapter_id 指向的章节必须仍然存在");
      const docCountAfter = db.prepare(
        "SELECT count(*) AS n FROM docs WHERE id LIKE 'doc:hello-system-%' OR id = 'doc:book-hello-system'",
      ).get().n;
      assert.equal(docCountAfter, 78, "UPSERT 重放不得产生重复节点");
    } finally {
      db.close();
    }
  });
});

describe("Hello System V1 Freeze: 技术表述回潮拦截", () => {
  const bodies = allDocs.map((d) => ({ id: d.id, title: d.title, body: d.bodyMd }));
  const allText = bodies.map((b) => `${b.title}\n${b.body}`).join("\n");

  const forbiddenPhrases = [
    ["320 毫秒", "旧版伪精确耗时"],
    ["320ms", "旧版伪精确耗时"],
    ["前端防君子", "旧版口号"],
    ["十二大永恒", "伪定律表述"],
    ["永恒支柱", "伪定律表述"],
    ["永恒规律", "伪定律表述"],
    ["软件工程第一定律", "伪定律表述"],
    ["内存栈帧局部变量表", "伪 JVM 栈帧布局"],
    ["五元组唯一定义", "Socket 五元组过度概括"],
    ["截断为 0", "JS 大整数错误描述"],
    ["截断成 0", "JS 大整数错误描述"],
    ["100% 行为一致", "Testcontainers 伪一致性"],
    ["RFC 7807 错误响应结构", "过期 RFC 引用"],
    ["鼠标微动开关", "伪底层装饰"],
    ["LSN: 1048500", "伪精确 LSN"],
    ["工业界标准", "伪标准表述"],
    ["X: 610", "伪精确坐标"],
    ["X: 520", "伪精确坐标"],
  ];
  for (const [phrase, label] of forbiddenPhrases) {
    test(`禁止回潮: ${label} (“${phrase}”)`, () => {
      assert.ok(!allText.includes(phrase), `发现已清除表述回潮: ${phrase}`);
    });
  }

  test("Java 对象头讨论必须带 HotSpot 实现限定与 JLS 免责声明", () => {
    const offenders = bodies.filter(
      (b) => b.body.includes("Mark Word") && !(b.body.includes("HotSpot") && b.body.includes("并非 Java 语言规范")),
    );
    assert.deepEqual(offenders.map((o) => o.id), [], "对象头布局必须标注为 HotSpot 实现细节");
  });

  test("Canonical Model: courses/enrollments 不出现 status/version/semester/deleted/active 列", () => {
    const ddlDoc = bodies.find((b) => b.id === "doc:hello-system-appx-b-er-and-ddl");
    assert.ok(ddlDoc, "附录B 必须存在");
    const coursesDdl = ddlDoc.body.match(/CREATE TABLE courses \(([\s\S]*?)\) ENGINE/);
    const enrollmentsDdl = ddlDoc.body.match(/CREATE TABLE enrollments \(([\s\S]*?)\) ENGINE/);
    assert.ok(coursesDdl && enrollmentsDdl, "附录B 必须包含 courses/enrollments DDL");
    for (const badColumn of ["status", "version", "semester", "deleted", "active"]) {
      assert.ok(!new RegExp(`\\b${badColumn}\\b`, "i").test(coursesDdl[1]), `courses 不允许出现 ${badColumn} 列`);
      assert.ok(!new RegExp(`\\b${badColumn}\\b`, "i").test(enrollmentsDdl[1]), `enrollments 不允许出现 ${badColumn} 列`);
    }
    assert.ok(/UNIQUE\s*\(student_id, course_id\)/.test(enrollmentsDdl[1]), "enrollments 必须保留复合唯一键");
    assert.ok(/\benrolled\b/.test(coursesDdl[1]), "courses 必须保留反规范化 enrolled 计数");
  });

  test("选课请求契约不接受客户端 studentId", () => {
    const apiDoc = bodies.find((b) => b.id === "doc:hello-system-41-first-api-design");
    assert.ok(apiDoc, "第41章必须存在");
    assert.ok(apiDoc.body.includes("严禁包含 \\`studentId\\`") || apiDoc.body.includes("严禁包含 `studentId`"),
      "第41章必须保留 studentId 安全警示");
    // EnrollRequest record 定义位于第47章 (Bean Validation 示例)
    const recordDoc = bodies.find((b) => /record EnrollRequest\(/.test(b.body));
    assert.ok(recordDoc, "必须存在 EnrollRequest record 定义");
    const record = recordDoc.body.match(/record EnrollRequest\(([\s\S]*?)\)/);
    assert.ok(!/studentId/.test(record[1]), "EnrollRequest 不允许包含 studentId");
  });

  test("POST 幂等性表述保持限定（非绝对化）", () => {
    const faqDoc = bodies.find((b) => b.id === "doc:hello-system-appx-f-myths-faq");
    assert.ok(faqDoc.body.includes("HTTP 规范没有将 POST 定义为默认幂等"), "必须保留限定版 POST 幂等表述");
  });

  test("SQL 围栏内事务语句完整（第37章 COMMIT 不被剥离）", () => {
    const ch37 = bodies.find((b) => b.id === "doc:hello-system-37-concurrency-and-locking");
    assert.ok(ch37.body.includes("START TRANSACTION;"), "第37章必须保留 START TRANSACTION");
    assert.ok(ch37.body.includes("COMMIT;"), "第37章必须保留 COMMIT");
  });

  test("Durability 统一口径（第36/52章一致）", () => {
    const ch36 = bodies.find((b) => b.id === "doc:hello-system-36-acid-transactions");
    const ch52 = bodies.find((b) => b.id === "doc:hello-system-52-wal-and-crash-recovery");
    for (const doc of [ch36, ch52]) {
      assert.ok(doc.body.includes("故障模型") && doc.body.includes("持久化配置"),
        `${doc.id} 必须使用“故障模型与持久化配置”限定口径`);
      assert.ok(!doc.body.includes("永久保存"), `${doc.id} 禁止“永久保存”绝对化表述`);
    }
  });
});

describe("Hello System V1 Freeze: Final Patch 定点修复回归", () => {
  const bodies = allDocs.map((d) => ({ id: d.id, title: d.title, body: d.bodyMd }));
  const ch34 = bodies.find((b) => b.id === "doc:hello-system-34-normalization-1nf-2nf-3nf-bcnf");
  const ch35 = bodies.find((b) => b.id === "doc:hello-system-35-bplus-tree-indexes");
  const ch56 = bodies.find((b) => b.id === "doc:hello-system-56-full-request-journey");

  test("第34章: 旧 BCNF 错误表述与绝对化断言不得回潮", () => {
    assert.ok(ch34, "第34章必须存在");
    assert.ok(!ch34.body.includes("BCNF 进一步消除了主属性对其他非键属性的依赖"),
      "BCNF 错误核心定义回潮");
    assert.ok(!ch34.body.includes("彻底消除了插入、更新与删除异常"), "绝对化异常消除断言回潮");
    assert.ok(!ch34.body.includes("即可保证极高的数据严密性与健壮性"), "绝对化严密性断言回潮");
  });

  test("第34章: BCNF 核心定义完整（非平凡函数依赖 X→Y ⇒ X 必须为超键）", () => {
    assert.ok(ch34.body.includes("BCNF"), "缺少 BCNF");
    assert.ok(ch34.body.includes("非平凡函数依赖"), "缺少非平凡函数依赖");
    assert.ok(ch34.body.includes("超键"), "缺少超键");
    assert.ok(/\$X \\to Y\$/.test(ch34.body), "缺少 X → Y 函数依赖表达");
    assert.ok(/必须是[^。\n]{0,12}超键/.test(ch34.body), "缺少“X 必须为超键”的核心约束表达");
  });

  test("第56章: 禁止“端到端统一原子事务”错误心智模型回潮", () => {
    assert.ok(ch56, "第56章必须存在");
    for (const phrase of ["原子性跃迁", "端到端原子性", "全链路原子事务"]) {
      assert.ok(!ch56.body.includes(phrase), `第56章发现错误抽象回潮: ${phrase}`);
    }
  });

  test("第56章: 原子性边界说明在位并与第50章形成跨章呼应", () => {
    assert.ok(ch56.body.includes("数据库事务边界"), "缺少数据库事务边界说明");
    assert.ok(ch56.body.includes("响应丢失"), "缺少 COMMIT 后响应丢失反例");
    assert.ok(ch56.body.includes("幂等性"), "缺少幂等性呼应");
    assert.ok(ch56.body.includes("第50章"), "缺少与第50章(重试与幂等)的跨章呼应");
    // 三视角结构必须保留,只修正“原子性”抽象
    assert.ok(ch56.body.includes("全景控制流"), "控制流视角必须保留");
    assert.ok(ch56.body.includes("数据形态"), "数据形态视角必须保留");
    assert.ok(ch56.body.includes("状态机生命周期"), "状态机视角必须保留");
  });

  test("第35章: EXPLAIN 示例标注为教学示例,rows 口径为优化器估计", () => {
    assert.ok(ch35, "第35章必须存在");
    const explainIdx = ch35.body.indexOf("EXPLAIN");
    assert.ok(explainIdx >= 0, "第35章必须包含 EXPLAIN 示例");
    const section = ch35.body.slice(explainIdx);
    assert.ok(section.includes("教学示例"), "EXPLAIN 示例必须标注为教学示例");
    assert.ok(section.includes("估计"), "rows 必须标注为优化器估计口径");
    for (const phrase of ["真实扫描100万行", "真实扫描 100 万行", "实际只扫描1行", "实际只扫描 1 行"]) {
      assert.ok(!section.includes(phrase), `禁止把教学 rows 写成真实固定扫描行数: ${phrase}`);
    }
  });

  test("附录F 重定向: 源码/verify-live/账本注释统一为 307,无“永久301”错误注释", () => {
    const pageSrc = readFileSync(join(projectRoot, "app", "bookshelf", "[...slug]", "page.tsx"), "utf8");
    assert.ok(pageSrc.includes('redirect("/bookshelf/hello-system/appx-f-myths-faq")'),
      "旧层级 URL 必须保持 redirect() 到新稳定 URL");
    assert.ok(!/永久\s*301/.test(pageSrc), "源码注释不得再声称永久 301");
    assert.ok(pageSrc.includes("307"), "源码注释必须如实标注 307 临时重定向");
    const verifyLive = readFileSync(join(projectRoot, "scripts", "verify-live.mjs"), "utf8");
    assert.ok(!/永久\s*301/.test(verifyLive), "verify-live 不得声称永久 301");
    const ledger = readFileSync(join(projectRoot, "PROJECT_STATUS.md"), "utf8");
    assert.ok(!/永久\s*301/.test(ledger), "PROJECT_STATUS 不得声称永久 301");
  });
});

describe("Hello System V1 Freeze: Markdown / Mermaid QA", () => {
  test("代码围栏全部成对闭合", () => {
    for (const doc of allDocs) {
      const fenceCount = (doc.bodyMd.match(/```/g) || []).length;
      assert.equal(fenceCount % 2, 0, `${doc.id} 存在未闭合代码围栏`);
    }
  });

  test("Mermaid 代码块均以合法图类型开头且非空", () => {
    const mermaidBlock = /```mermaid\n([\s\S]*?)```/g;
    const knownTypes = /^(flowchart|sequenceDiagram|erDiagram|stateDiagram|classDiagram|gantt|pie|graph)\b/;
    for (const doc of allDocs) {
      const blocks = doc.bodyMd.matchAll(mermaidBlock);
      for (const block of blocks) {
        const firstLine = block[1].trim().split("\n")[0].trim();
        assert.ok(knownTypes.test(firstLine), `${doc.id} 的 Mermaid 块首行非法: ${firstLine}`);
      }
    }
  });

  test("无指向旧层级 URL 的内部链接（附录F 旧路径）", () => {
    for (const doc of allDocs) {
      assert.ok(
        !doc.bodyMd.includes("part-5/appx-f-myths-faq"),
        `${doc.id} 含附录F 旧层级链接`,
      );
    }
  });

  test("零装饰性 Emoji", () => {
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    for (const doc of allDocs) {
      assert.ok(!emojiRegex.test(doc.title) && !emojiRegex.test(doc.bodyMd), `${doc.id} 含装饰 Emoji`);
    }
  });
});
