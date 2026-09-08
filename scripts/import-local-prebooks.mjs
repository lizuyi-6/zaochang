import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
const sql = fs.readFileSync(path.resolve("content/import-prebooks.sql"), "utf8");
const dir = path.resolve(process.env.LOCAL_D1_DIR ?? ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
let failures = 0;
for (const file of files) {
  const db = new DatabaseSync(path.join(dir, file));
  try {
    const author = db.prepare("SELECT email FROM members WHERE email = ?").get("2251213429@qq.com");
    if (!author) db.prepare("INSERT INTO members (email, display_name, bio) VALUES (?, ?, ?)").run("2251213429@qq.com", "造场作者", "见界研学预置书籍作者");
    db.exec(sql);
    const result = db.prepare("SELECT slug, title, (SELECT count(*) FROM docs c WHERE c.parent_id = b.id) AS chapters FROM docs b WHERE b.id IN ('doc:book-hello-computer','doc:book-hello-ai','doc:book-product-shape') ORDER BY sort_order").all();
    console.log(file, JSON.stringify(result));
  } catch (error) { failures += 1; console.error(file, error); }
  db.close();
}
if (failures) process.exitCode = 1;



