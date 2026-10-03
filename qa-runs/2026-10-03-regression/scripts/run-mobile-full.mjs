// 手机视口「全量」补录:把 A/B/C/D 四个批次的 66 页在 390x844 全部跑一遍。
// 上一轮手机只录了 15 页,不满足「全部重录」。这一轮补全,同时压力测试 P-101。
import { runBatch } from "./deep-driver.mjs";

const O = "https://aetherstudio.top";
const L = (p) => `${O}/lattice/#${p}`;

const ALL = [
  { key: "M01-home", url: `${O}/` },
  { key: "M02-discover", url: `${O}/discover` },
  { key: "M03-feed", url: `${O}/feed` },
  { key: "M04-circles", url: `${O}/circles` },
  { key: "M05-challenges", url: `${O}/challenges` },
  { key: "M06-collections", url: `${O}/collections` },
  { key: "M07-bookshelf", url: `${O}/bookshelf` },
  { key: "M08-docs", url: `${O}/docs` },
  { key: "M09-studio", url: `${O}/studio` },
  { key: "M10-studio-new", url: `${O}/studio/new` },
  { key: "M11-developers", url: `${O}/developers` },
  { key: "M12-developers-docs", url: `${O}/developers/docs` },
  { key: "M13-wallet", url: `${O}/wallet` },
  { key: "M14-profile", url: `${O}/profile` },
  { key: "M15-profile-edit", url: `${O}/profile/edit` },
  { key: "M16-notifications", url: `${O}/notifications` },
  { key: "M17-guide", url: `${O}/guide` },
  { key: "M18-app", url: `${O}/app` },
  { key: "M19-galaxy", url: `${O}/galaxy` },
  { key: "M20-galaxy-products", url: `${O}/galaxy/products` },
  { key: "M21-galaxy-company", url: `${O}/galaxy/company` },
  { key: "M22-galaxy-incubator", url: `${O}/galaxy/incubator` },
  { key: "M23-galaxy-apply", url: `${O}/galaxy/apply` },
  { key: "M24-book-hello-system", url: `${O}/bookshelf/hello-system` },
  { key: "M25-book-hello-computer", url: `${O}/bookshelf/hello-computer` },
  { key: "M26-book-hello-llm", url: `${O}/bookshelf/hello-llm` },
  { key: "M27-chapter", url: `${O}/bookshelf/hello-system/part-1/01-why-architecture-matters` },
  { key: "M28-doc-trial", url: `${O}/docs/trial-welcome` },
  { key: "M29-product-loops", url: `${O}/product/loops` },
  { key: "M30-product-minute", url: `${O}/product/minute` },
  { key: "M31-product-mori", url: `${O}/product/mori` },
  { key: "M32-product-sprout", url: `${O}/product/sprout` },
  { key: "M33-product-typewave", url: `${O}/product/typewave` },
  { key: "M34-product-wander", url: `${O}/product/wander` },
  { key: "M35-app-loops", url: `${O}/product-apps/loops/` },
  { key: "M36-app-minute", url: `${O}/product-apps/minute/` },
  { key: "M37-app-mori", url: `${O}/product-apps/mori/` },
  { key: "M38-app-sprout", url: `${O}/product-apps/sprout/` },
  { key: "M39-app-typewave", url: `${O}/product-apps/typewave/` },
  { key: "M40-app-wander", url: `${O}/product-apps/wander/` },
  { key: "M41-lattice-home", url: L("/home") },
  { key: "M42-lattice-courses", url: L("/courses") },
  { key: "M43-lattice-feed", url: L("/feed") },
  { key: "M44-lattice-history", url: L("/history") },
  { key: "M45-lattice-marketplace", url: L("/marketplace") },
  { key: "M46-lattice-chat", url: L("/chat") },
  { key: "M47-lattice-create", url: L("/create") },
  { key: "M48-lattice-plans", url: L("/plans") },
  { key: "M49-lattice-preview", url: L("/course/preview") },
  { key: "M50-lattice-journey", url: L("/course/journey") },
  { key: "M51-lattice-whiteboard", url: L("/whiteboard") },
  { key: "M52-lattice-onboarding", url: L("/onboarding/1") },
  { key: "M53-signin", url: `${O}/signin` },
  { key: "M54-lattice-gate", url: `${O}/lattice/` },
];

console.log(`=== 手机全量补录 ${ALL.length} 页 @390x844 ===`);
await runBatch("57-mobile-full", ALL, { authed: true, viewport: { width: 390, height: 844 } });
console.log("MOBILE FULL DONE");
