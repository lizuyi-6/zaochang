// 运行时核对旧产品名泄漏:演示课策展人署名 / 界面文案
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Abraham/AppData/Roaming/npm/node_modules/playwright");
import { writeJson, storageStatePath, ORIGIN, settle } from "./common.mjs";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath() });
const page = await ctx.newPage();
const out = [];
try {
  for (const [key, url] of [
    ["lattice-course-preview", `${ORIGIN}/lattice/#/course/preview`],
    ["lattice-journey", `${ORIGIN}/lattice/#/course/journey`],
    ["lattice-marketplace", `${ORIGIN}/lattice/#/marketplace`],
  ]) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settle(page, { quiet: 3500, cap: 10000 });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const body = (document.body.innerText || "");
      const hits = [];
      const re = /Hyperknow/gi;
      let m;
      while ((m = re.exec(body)) !== null) {
        hits.push(body.slice(Math.max(0, m.index - 45), m.index + 45).replace(/\s+/g, " "));
        if (hits.length >= 4) break;
      }
      return { textLen: body.length, hyperknowHits: hits, hitCount: (body.match(/Hyperknow/g) || []).length };
    });
    out.push({ key, ...r });
    console.log(`=== ${key} ===  textLen=${r.textLen}  Hypernow 出现 ${r.hitCount} 次`);
    r.hyperknowHits.forEach((h) => console.log("   …" + h + "…"));
  }
} catch (e) {
  console.log("ERR", String(e).slice(0, 200));
} finally {
  await browser.close();
}
writeJson("24-hypernow-leak-runtime.json", out);
