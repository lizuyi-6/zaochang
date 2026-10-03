// 回归 DOM 抽查:P-006(白板关闭键粗指针 44px)、P-011(收藏/喜欢 aria-pressed)。
// 只读:不点击任何控件。
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Abraham/AppData/Roaming/npm/node_modules/playwright");
import { writeJson } from "./common.mjs";
import { RUN } from "./common.mjs";

const out = [];
const browser = await chromium.launch();

// P-011:产品页 toggle 的 aria-pressed
const ctx1 = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  storageState: "X:/zaochang/qa-runs/2026-10-02-visual-audit/.secret/storage.json",
});
const p1 = await ctx1.newPage();
for (const path of ["/product/loops", "/product/mori"]) {
  await p1.goto("https://aetherstudio.top" + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p1.waitForTimeout(6500);
  const rows = await p1.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => /喜欢|收藏/.test(b.innerText || ""))
      .map((b) => ({ text: b.innerText.trim().slice(0, 8), ariaPressed: b.getAttribute("aria-pressed"), cls: (b.className || "").toString().slice(0, 50) }))
  );
  out.push({ check: "P-011 aria-pressed", path, rows });
  console.log("=== " + path + " ===");
  rows.forEach((r) => console.log("  " + JSON.stringify(r)));
}
await ctx1.close();

// P-006:白板引入卡关闭键,粗指针 44px
for (const mode of [
  { key: "fine-1440x900", w: 1440, h: 900, touch: false },
  { key: "touch-390x844", w: 390, h: 844, touch: true },
]) {
  const ctx = await browser.newContext({
    viewport: { width: mode.w, height: mode.h },
    hasTouch: mode.touch, isMobile: mode.touch,
    storageState: "X:/zaochang/qa-runs/2026-10-02-visual-audit/.secret/storage.json",
  });
  const page = await ctx.newPage();
  try {
    await page.goto("https://aetherstudio.top/lattice/#/whiteboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(9000);
    const rows = await page.evaluate(() => {
      const res = [];
      for (const el of document.querySelectorAll("button, a[href], [role='button']")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
        if ((el.innerText || "").trim()) continue;
        res.push({ cls: (el.className || "").toString().slice(0, 32), w: Math.round(r.width), h: Math.round(r.height), name: (el.getAttribute("aria-label") || el.title || "").slice(0, 20) });
      }
      return res.sort((a, b) => a.w * a.h - b.w * b.h);
    });
    const below44 = rows.filter((r) => r.w < 44 || r.h < 44);
    const below24 = rows.filter((r) => r.w < 24 || r.h < 24);
    out.push({ check: "P-006 hit targets", mode: mode.key, total: rows.length, below44: below44.length, below24: below24.length, rows });
    console.log(`=== ${mode.key} ===  n=${rows.length}  <44px=${below44.length}  <24px=${below24.length}`);
    rows.slice(0, 5).forEach((r) => console.log(`  ${r.w}x${r.h}  ${r.cls}  "${r.name}"`));
  } finally { await ctx.close(); }
}
await browser.close();
writeJson("20-regression-dom.json", out);
console.log("DONE");
