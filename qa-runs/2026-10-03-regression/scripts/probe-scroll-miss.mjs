// 排查:某页 maxScroll=0 —— 是真不滚动,还是容器探测漏了?
import { chromium, storageStatePath, ORIGIN } from "./common.mjs";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath() });
const page = await ctx.newPage();
for (const [key, url] of [["feed", `${ORIGIN}/feed`], ["discover", `${ORIGIN}/discover`], ["collections", `${ORIGIN}/collections`]]) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(4000);
    const r = await page.evaluate(() => {
      const out = { win: { sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight, st: document.scrollingElement?.scrollTop }, scrollables: [], bodyOverflow: getComputedStyle(document.body).overflowY, htmlOverflow: getComputedStyle(document.documentElement).overflowY };
      for (const el of Array.from(document.querySelectorAll("*"))) {
        const cs = getComputedStyle(el);
        if (!/(auto|scroll|overlay)/.test(cs.overflowY)) continue;
        const dh = el.scrollHeight - el.clientHeight;
        if (dh > 8) out.scrollables.push({ tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0, 46), dh, ch: el.clientHeight });
      }
      out.scrollables.sort((a, b) => b.dh - a.dh);
      out.scrollables = out.scrollables.slice(0, 5);
      return out;
    });
    console.log(`\n=== ${key} ===`);
    console.log(`  window: scrollH=${r.win.sh} clientH=${r.win.ch} -> maxScroll=${Math.max(0, r.win.sh - r.win.ch)}`);
    console.log(`  body overflowY=${r.bodyOverflow}  html overflowY=${r.htmlOverflow}`);
    console.log(`  可滚动内层容器: ${r.scrollables.length}`);
    r.scrollables.forEach((s) => console.log(`    ${s.tag}.${s.cls} 可滚 ${s.dh}px (clientH ${s.ch})`));
  } catch (e) { console.log(key, "ERR", String(e).slice(0, 120)); }
}
await browser.close();
