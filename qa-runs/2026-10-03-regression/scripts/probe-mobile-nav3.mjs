// 定论:手机(390x844)上那 7 个目的地滚到底后是否变得可见可点。
// 前两轮结论冲突的原因:一轮只数「可见」链接(找到 9 个,缺 7 个),
// 另一轮数「DOM 里存在的 href」(全部命中)—— 后者把隐藏元素也算进去了。
// 本轮:逐屏滚动,每一屏都只统计「当前视口内、有尺寸、可点」的链接。
import { chromium, EVIDENCE, RUN, ORIGIN, storageStatePath, settle, writeJson } from "./common.mjs";

const MISSING = ["/feed", "/challenges", "/collections", "/docs", "/studio", "/developers", "/wallet"];
const out = { steps: [], reached: {}, note: "" };

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  storageState: storageStatePath(), locale: "zh-CN",
});
const page = await ctx.newPage();

const visibleNow = () => page.evaluate(() => {
  const vh = window.innerHeight, vw = window.innerWidth;
  const out = [];
  for (const a of document.querySelectorAll("a[href]")) {
    const r = a.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;            // 无尺寸 = 隐藏
    if (r.bottom < 0 || r.top > vh) continue;              // 不在当前视口
    if (r.right < 0 || r.left > vw) continue;              // 横向不在视口
    const cs = getComputedStyle(a);
    if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
    // 命中测试:中心点是否真的能点到它
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    out.push({
      href: a.getAttribute("href"),
      text: (a.innerText || "").trim().slice(0, 12),
      rect: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`,
      hittable: hit ? (hit === a || a.contains(hit) || hit.contains(a)) : false,
    });
  }
  return out;
});

try {
  await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page, { quiet: 2500, cap: 8000 });
  await page.waitForTimeout(1200);

  const maxScroll = await page.evaluate(() => {
    const t = document.scrollingElement || document.documentElement;
    return Math.max(0, t.scrollHeight - t.clientHeight);
  });
  out.note = `window maxScroll=${maxScroll}px`;

  const STEP = 500;
  for (let y = 0; y <= maxScroll; y += STEP) {
    await page.evaluate((v) => (document.scrollingElement || document.documentElement).scrollTo({ top: v, behavior: "instant" }), y);
    await page.waitForTimeout(500);
    const vis = await visibleNow();
    const hits = vis.filter((v) => MISSING.includes(v.href));
    out.steps.push({ y, visibleCount: vis.length, missing: hits.map((h) => `${h.href}"${h.text}" ${h.rect} 可点=${h.hittable}`) });
    hits.forEach((h) => { out.reached[h.href] = out.reached[h.href] || []; out.reached[h.href].push({ y, text: h.text, rect: h.rect, hittable: h.hittable }); });
    await page.screenshot({ path: `${EVIDENCE}/mnav3-y${y}.png` }).catch(() => {});
    console.log(`y=${String(y).padStart(5)}  可见链接 ${String(vis.length).padStart(2)}  其中缺失目的地: ${hits.map((h) => `${h.href}${h.hittable ? "" : "(不可点)"}`).join(",") || "无"}`);
  }

  console.log("\n=== 结论:滚动全站后仍不可达的目的地 ===");
  const never = MISSING.filter((m) => !out.reached[m]);
  MISSING.forEach((m) => {
    const r = out.reached[m];
    console.log(`  ${r ? `✓ 在 y=${r.map((x) => x.y).join("/")} 处可见且${r.every((x) => x.hittable) ? "可点" : "部分不可点"}` : "✗ 全程从未在视口内出现"}  ${m}`);
  });
  out.neverReachable = never;
} catch (e) {
  console.log("ERROR", String(e).slice(0, 250));
} finally {
  await browser.close();
  writeJson("55-mobile-nav-scroll.json", out);
}
