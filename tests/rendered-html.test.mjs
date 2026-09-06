// 造场社区集成流程 · 总入口(自原 4559 行单文件拆分)。
// 结构:harness/preview.mjs 持有预览服务器/迁移引导/假上游/共享夹具与 SSE 助手;
// suites/*.mjs 按域持有测试体(逐字未改,含 for 循环生成的动态测试);
// 本文件按原执行顺序注册,保证跨测试状态依赖不变。
import { describe } from "node:test";
import { register as register_01_render } from "./suites/01-render.tests.mjs";
import { register as register_02_docs_books } from "./suites/02-docs-books.tests.mjs";
import { register as register_03_auth_invite } from "./suites/03-auth-invite.tests.mjs";
import { register as register_04_galaxy_incubation } from "./suites/04-galaxy-incubation.tests.mjs";
import { register as register_05_products_review } from "./suites/05-products-review.tests.mjs";
import { register as register_06_fruit_checkout } from "./suites/06-fruit-checkout.tests.mjs";
import { register as register_07_oidc_external } from "./suites/07-oidc-external.tests.mjs";
import { register as register_08_community_uploads } from "./suites/08-community-uploads.tests.mjs";
import { register as register_09_agent_ai } from "./suites/09-agent-ai.tests.mjs";
import { register as register_10_ledger_misc } from "./suites/10-ledger-misc.tests.mjs";
import { register as register_11_hyperknow } from "./suites/11-hyperknow.tests.mjs";

describe("造场社区集成流程", { concurrency: false }, () => {
  register_01_render();
  register_02_docs_books();
  register_03_auth_invite();
  register_04_galaxy_incubation();
  register_05_products_review();
  register_06_fruit_checkout();
  register_07_oidc_external();
  register_08_community_uploads();
  register_09_agent_ai();
  register_10_ledger_misc();
  register_11_hyperknow();
});
