// 全量深度录制:主站 + 动态路由 + 见界 + 登出态,顺序执行避免浏览器争抢。
import { runBatch } from "./deep-driver.mjs";

const O = "https://aetherstudio.top";
const L = (p) => `${O}/lattice/#${p}`;

const MAIN = [
  { key: "a01-home", url: `${O}/` },
  { key: "a02-discover", url: `${O}/discover` },
  { key: "a03-feed", url: `${O}/feed` },
  { key: "a04-circles", url: `${O}/circles` },
  { key: "a05-challenges", url: `${O}/challenges` },
  { key: "a06-collections", url: `${O}/collections` },
  { key: "a07-bookshelf", url: `${O}/bookshelf` },
  { key: "a08-docs", url: `${O}/docs` },
  { key: "a09-studio", url: `${O}/studio` },
  { key: "a10-studio-new", url: `${O}/studio/new` },
  { key: "a11-developers", url: `${O}/developers` },
  { key: "a12-developers-docs", url: `${O}/developers/docs` },
  { key: "a13-wallet", url: `${O}/wallet` },
  { key: "a14-profile", url: `${O}/profile` },
  { key: "a15-profile-edit", url: `${O}/profile/edit` },
  { key: "a16-notifications", url: `${O}/notifications` },
  { key: "a17-guide", url: `${O}/guide` },
  { key: "a18-app", url: `${O}/app` },
  { key: "a19-galaxy", url: `${O}/galaxy` },
  { key: "a20-galaxy-products", url: `${O}/galaxy/products` },
  { key: "a21-galaxy-company", url: `${O}/galaxy/company` },
  { key: "a22-galaxy-incubator", url: `${O}/galaxy/incubator` },
  { key: "a23-galaxy-apply", url: `${O}/galaxy/apply` },
  { key: "a24-signin-gate", url: `${O}/signin` },
];

const DYNAMIC = [
  { key: "b01-book-hello-system", url: `${O}/bookshelf/hello-system` },
  { key: "b02-book-hello-computer", url: `${O}/bookshelf/hello-computer` },
  { key: "b03-book-hello-llm", url: `${O}/bookshelf/hello-llm` },
  { key: "b04-chapter", url: `${O}/bookshelf/hello-system/part-1/01-why-architecture-matters` },
  { key: "b05-doc-trial", url: `${O}/docs/trial-welcome` },
  { key: "b06-product-loops", url: `${O}/product/loops` },
  { key: "b07-product-minute", url: `${O}/product/minute` },
  { key: "b08-product-mori", url: `${O}/product/mori` },
  { key: "b09-product-sprout", url: `${O}/product/sprout` },
  { key: "b10-product-typewave", url: `${O}/product/typewave` },
  { key: "b11-product-wander", url: `${O}/product/wander` },
  { key: "b12-app-loops", url: `${O}/product-apps/loops/` },
  { key: "b13-app-minute", url: `${O}/product-apps/minute/` },
  { key: "b14-app-mori", url: `${O}/product-apps/mori/` },
  { key: "b15-app-sprout", url: `${O}/product-apps/sprout/` },
  { key: "b16-app-typewave", url: `${O}/product-apps/typewave/` },
  { key: "b17-app-wander", url: `${O}/product-apps/wander/` },
];

const LATTICE = [
  { key: "c01-home", url: L("/home") },
  { key: "c02-courses", url: L("/courses") },
  { key: "c03-feed", url: L("/feed") },
  { key: "c04-history", url: L("/history") },
  { key: "c05-marketplace", url: L("/marketplace") },
  { key: "c06-chat", url: L("/chat") },
  { key: "c07-create", url: L("/create") },
  { key: "c08-plans", url: L("/plans") },
  { key: "c09-course-preview", url: L("/course/preview") },
  { key: "c10-course-journey", url: L("/course/journey") },
  { key: "c11-whiteboard", url: L("/whiteboard") },
  { key: "c12-whiteboard-practice", url: L("/whiteboard?practice=1") },
  { key: "c13-onboarding-1", url: L("/onboarding/1") },
  { key: "c14-onboarding-5", url: L("/onboarding/5") },
  { key: "c15-signin-deeplink", url: L("/signin") },
];

const ANON = [
  { key: "d01-signin", url: `${O}/signin` },
  { key: "d02-home", url: `${O}/` },
  { key: "d03-wallet", url: `${O}/wallet` },
  { key: "d04-profile", url: `${O}/profile` },
  { key: "d05-notifications", url: `${O}/notifications` },
  { key: "d06-studio", url: `${O}/studio` },
  { key: "d07-lattice-gate", url: `${O}/lattice/` },
  { key: "d08-discover", url: `${O}/discover` },
  { key: "d09-bookshelf", url: `${O}/bookshelf` },
  { key: "d10-profile-edit", url: `${O}/profile/edit` },
];

console.log("=== 批次 A:主站 24 页 ===");
await runBatch("41-batchA-main", MAIN, { authed: true });
console.log("=== 批次 B:动态路由 17 页 ===");
await runBatch("42-batchB-dynamic", DYNAMIC, { authed: true });
console.log("=== 批次 C:见界 15 页 ===");
await runBatch("43-batchC-lattice", LATTICE, { authed: true });
console.log("=== 批次 D:登出态 10 页 ===");
await runBatch("44-batchD-anon", ANON, { authed: false });
console.log("ALL BATCHES DONE");
