// 批次 F:移动/平板视口深度录制(与桌面同驱动器,换视口 + hasTouch)。
import { runBatch } from "./deep-driver.mjs";

const O = "https://aetherstudio.top";
const L = (p) => `${O}/lattice/#${p}`;

const MOBILE = [
  { key: "m01-home", url: `${O}/` },
  { key: "m02-discover", url: `${O}/discover` },
  { key: "m03-bookshelf", url: `${O}/bookshelf` },
  { key: "m04-chapter", url: `${O}/bookshelf/hello-system/part-1/01-why-architecture-matters` },
  { key: "m05-doc", url: `${O}/developers/docs` },
  { key: "m06-studio-new", url: `${O}/studio/new` },
  { key: "m07-wallet", url: `${O}/wallet` },
  { key: "m08-profile", url: `${O}/profile` },
  { key: "m09-signin", url: `${O}/signin` },
  { key: "m10-product", url: `${O}/product/loops` },
  { key: "m11-lattice-home", url: L("/home") },
  { key: "m12-lattice-chat", url: L("/chat") },
  { key: "m13-lattice-create", url: L("/create") },
  { key: "m14-lattice-feed", url: L("/feed") },
  { key: "m15-lattice-whiteboard", url: L("/whiteboard") },
];

console.log("=== 手机 390x844 ===");
await runBatch("48-mobile", MOBILE, { authed: true, viewport: { width: 390, height: 844 } });

console.log("=== 平板 820x1180 ===");
await runBatch("49-tablet", MOBILE.slice(0, 10), { authed: true, viewport: { width: 820, height: 1180 } });
console.log("VIEWPORT BATCHES DONE");
