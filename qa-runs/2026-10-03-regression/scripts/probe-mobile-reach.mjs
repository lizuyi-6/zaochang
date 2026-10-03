// 反证:那 6 个「手机首页够不着」的目的地,是否从别的页面可达?
// 逐页(手机视口)逐屏滚动,收集「当前视口内 + 有尺寸 + 命中测试通过」的 href,取并集。
// 只有当它们在所有手机页面都不可达时,才算真正的导航缺口。
import { chromium, EVIDENCE, RUN, ORIGIN, storageStatePath, settle, writeJson } from "./common.mjs";

const DEST = ["/", "/discover", "/feed", "/circles", "/challenges", "/collections", "/bookshelf",
  "/lattice/", "/docs", "/studio", "/developers", "/wallet"];
const SEEDS = ["/", "/discover", "/circles", "/bookshelf", "/collections", "/challenges", "/docs"];

const out = { perPage: {}, reachableFrom: {}, anyVisible: {} };

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  storageState: storageStatePath(), locale: "zh-CN",
});
const page = await ctx.newPage();

const visibleNow = () => page.evaluate(() => {
  const vh = window.innerHeight, vw = window.innerWidth;
  const res = [];
  for (const a of document.querySelectorAll("a[href]")) {
    const r = a.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
    const cs = getComputedStyle(a);
    if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!(hit && (hit === a || a.contains(hit) || hit.contains(a)))) continue;
    res.push(a.getAttribute("href"));
  }
  return res;
});

try {
  for (const seed of SEEDS) {
    await page.goto(`${ORIGIN}${seed}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settle(page, { quiet: 2200, cap: 7000 });
    await page.waitForTimeout(800);
    const max = await page.evaluate(() => {
      let best = 0, t = document.scrollingElement || document.documentElement;
      best = t.scrollHeight - t.clientHeight;
      for (const el of document.querySelectorAll("div,main,section,aside,ul")) {
        if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) best = Math.max(best, el.scrollHeight - el.clientHeight);
      }
      return Math.max(0, best);
    });
    const found = new Set();
    for (let y = 0; y <= Math.min(max, 4000); y += 500) {
      await page.evaluate((v) => {
        let best = null, a = 0;
        const c = (el) => { const dh = el.scrollHeight - el.clientHeight; if (dh <= 8) return; const r = el.getBoundingClientRect(); if (r.width * r.height > a) { a = r.width * r.height; best = el; } };
        c(document.scrollingElement || document.documentElement);
        for (const el of document.querySelectorAll("div,main,section,aside,ul")) if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) c(el);
        (best || document.scrollingElement).scrollTo({ top: v, behavior: "instant" });
      }, y);
      await page.waitForTimeout(420);
      (await visibleNow()).forEach((h) => found.add(h));
    }
    out.perPage[seed] = { maxScroll: max, hrefs: [...found] };
    console.log(`${seed.padEnd(16)} maxScroll=${String(max).padStart(5)}  可见可点目的地: ${DEST.filter((d) => found.has(d)).join(" ") || "(无)"}`);
  }

  const all = new Set();
  for (const k of Object.keys(out.perPage)) out.perPage[k].hrefs.forEach((h) => all.add(h));
  for (const d of DEST) {
    out.reachableFrom[d] = Object.keys(out.perPage).filter((p) => out.perPage[p].hrefs.includes(d));
    out.anyVisible[d] = all.has(d);
  }
  console.log("\n=== 手机端:每个目的地能从哪些页面点到 ===");
  DEST.forEach((d) => {
    const from = out.reachableFrom[d];
    console.log(`  ${from.length ? "✓" : "✗ 无入口"}  ${d.padEnd(14)} ${from.join(", ")}`);
  });
  out.deadOnMobile = DEST.filter((d) => !out.reachableFrom[d].length);
  console.log("\n手机端完全无入口的目的地:", out.deadOnMobile.length ? out.deadOnMobile.join(", ") : "无");
} catch (e) {
  console.log("ERROR", String(e).slice(0, 250));
} finally {
  await browser.close();
  writeJson("56-mobile-reachability.json", out);
}
