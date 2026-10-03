// 小批量验证深度驱动器:3 个代表页(窗口滚动页 / 内层滚动页 / 短页)
import { runBatch } from "./deep-driver.mjs";

const PAGES = [
  { key: "p-probe-discover", url: "https://aetherstudio.top/discover" },   // 长列表页
  { key: "p-probe-doc", url: "https://aetherstudio.top/developers/docs" }, // 文档长文
  { key: "p-probe-plans", url: "https://aetherstudio.top/lattice/#/plans" },// 见界(可能内层滚动)
];

await runBatch("40-probe", PAGES, { authed: true });
console.log("PROBE DONE");
