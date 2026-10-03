// 只读检查:产品详情页「喜欢/收藏」按钮的真实激活状态(计数为 0 却呈深色实心)。
// 不点击任何按钮,只读 DOM 属性与计算样式。
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Abraham/AppData/Roaming/npm/node_modules/playwright");

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  storageState: "X:/zaochang/qa-runs/2026-10-02-visual-audit/.secret/storage.json",
});
const page = await ctx.newPage();
try {
  for (const p of ["/product/loops", "/product/mori"]) {
    await page.goto("https://aetherstudio.top" + p, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(7000);
    const rows = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("button,a[href]")) {
        const t = (el.innerText || el.getAttribute("aria-label") || "").trim();
        if (!/喜欢|收藏|体验|分享|举报/.test(t)) continue;
        const cs = getComputedStyle(el);
        out.push({
          text: t.slice(0, 10),
          tag: el.tagName.toLowerCase(),
          ariaPressed: el.getAttribute("aria-pressed"),
          ariaLabel: el.getAttribute("aria-label"),
          cls: (el.className || "").toString().slice(0, 70),
          bg: cs.backgroundColor,
          color: cs.color,
        });
      }
      return out;
    });
    console.log("=== " + p + " ===");
    rows.forEach((r) => console.log("  " + JSON.stringify(r)));
  }
} catch (e) {
  console.log("ERR " + String(e).slice(0, 200));
} finally {
  await browser.close();
}
