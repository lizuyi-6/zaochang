// 环境分离检查:staging 与生产的 D1 database_id 不得相同。
// 背景:两个 wrangler 配置曾指向同一个库——staging 只靠 APP_ENV 一个变量挡住
// dev-login 与旧 header 仿冒路径,配置漂移即可伪造生产身份。此检查进 CI
// (release-gates),让"再次共库"在合并前就失败。
import fs from "node:fs";

function databaseId(configPath) {
  const text = fs.readFileSync(configPath, "utf8");
  const match = text.match(/"database_id"\s*:\s*"([^"]+)"/);
  if (!match) {
    console.error(`✘ ${configPath} 中找不到 d1_databases.database_id`);
    process.exit(1);
  }
  return match[1];
}

const prod = databaseId("wrangler.prod.jsonc");
const staging = databaseId("wrangler.staging.jsonc");

console.log(`prod    database_id: ${prod}`);
console.log(`staging database_id: ${staging}`);

if (prod === staging) {
  console.error("\n✘ FAIL:staging 与生产共用同一个 D1 数据库。");
  console.error("  staging 的 APP_ENV/LOCAL_DEV_LOGIN 一旦漂移,即等于在生产库上开放");
  console.error("  dev-login 与旧身份头。请为 staging 单独建库并迁移 schema。");
  process.exit(1);
}
console.log("✓ staging 与生产数据库已分离");
