import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// 产物由 scripts/builder/build-all.mjs 生成(相对仓库根的 content/ 目录)。
const sqlFile = path.resolve("content/import-hellocomputer.sql");
const sqlContent = fs.readFileSync(sqlFile, "utf8");

// 查找所有可能的 local miniflare D1 sqlite 文件
// (LOCAL_D1_DIR 可覆盖目标目录,便于在沙箱里验证导入行为)
const d1Dir = path.resolve(
  process.env.LOCAL_D1_DIR ?? ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
);
if (!fs.existsSync(d1Dir)) {
  console.error(`未找到 D1 数据库目录: ${d1Dir}`);
  process.exit(1);
}

const files = fs.readdirSync(d1Dir).filter(f => f.endsWith(".sqlite") && f !== "metadata.sqlite");
if (files.length === 0) {
  console.error("未找到任何 D1 数据库文件 (.sqlite)！");
  process.exit(1);
}

// 只导入确有 docs/members 表的造场库,跳过 miniflare 目录下无关的 .sqlite
const candidates = [];
for (const f of files) {
  const dbPath = path.join(d1Dir, f);
  const probe = new DatabaseSync(dbPath);
  const n = probe
    .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('docs', 'members')")
    .get().n;
  probe.close();
  if (n === 2) {
    candidates.push(dbPath);
  } else {
    console.log(`跳过 ${dbPath}: 缺 docs/members 表, 不是造场库`);
  }
}
if (candidates.length === 0) {
  console.error("未找到任何含 docs/members 表的造场数据库, 未执行导入");
  process.exit(1);
}

let failures = 0;
for (const dbPath of candidates) {
  console.log(`正在将 《Hello Computer》 导入本地数据库: ${dbPath} ...`);
  let db;
  try {
    db = new DatabaseSync(dbPath);

    // 确保 author_email 对应的 member 存在
    const authorEmail = "2251213429@qq.com";
    const existing = db.prepare("SELECT email FROM members WHERE email = ?").get(authorEmail);
    if (!existing) {
      console.log(`在本地库中创建作者账号: ${authorEmail} ...`);
      db.prepare("INSERT INTO members (email, display_name, bio) VALUES (?, ?, ?)").run(
        authorEmail,
        "Lizuyi",
        "Hello Computer 作者",
      );
    }

    db.exec(sqlContent);

    // 验证导入
    const result = db
      .prepare("SELECT count(*) as cnt FROM docs WHERE id LIKE 'doc:hello-computer%' OR id = 'doc:book-hello-computer'")
      .get();
    console.log(`导入成功！当前数据库已挂载《Hello Computer》相关章节/目录数: ${result.cnt}`);
  } catch (err) {
    failures += 1;
    console.error(`导入 ${dbPath} 失败:`, err);
  } finally {
    db?.close();
  }
}

if (failures > 0) {
  console.error(`${failures}/${candidates.length} 个数据库导入失败`);
  process.exitCode = 1;
}
