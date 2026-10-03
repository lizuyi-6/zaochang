// 手机导航可达性:底部 tab 只有 4 项 + FAB,7 个目的地(动态/挑战/收藏/文档/创作台/开发者/见界)
// 在主屏幕上没出现。打开 FAB 与所有「更多」类控件,核对是否都可达。
import { chromium, EVIDENCE, RUN, ORIGIN, storageStatePath, settle, writeJson } from "./common.mjs";

const DESTS = ["/", "/discover", "/feed", "/circles", "/challenges", "/collections", "/bookshelf",
  "/lattice/", "/docs", "/studio", "/developers", "/wallet"];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  storageState: storageStatePath(), locale: "zh-CN",
});
const page = await ctx.newPage();
const out = { visible: [], afterFab: [], dests: DESTS, reached: {}, shots: [] };
const shot = async (n) => { await page.screenshot({ path: `${EVIDENCE}/mprobe-${n}.png` }).catch(() => {}); out.shots.push(n); };

try {
  await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page, { quiet: 2500, cap: 8000 });
  await page.waitForTimeout(1200);

  // 主屏可见的导航链接
  out.visible = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]"))
      .map((a) => ({ href: a.getAttribute("href"), text: (a.innerText || "").trim().slice(0, 12), r: a.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.height > 0 && x.r.bottom > 0 && x.r.top < window.innerHeight + 200)
      .map((x) => `${x.href} "${x.text}" ${Math.round(x.r.width)}x${Math.round(x.r.height)}@${Math.round(x.r.top)}`)
  );
  console.log("=== 主屏可见导航链接 ===");
  out.visible.forEach((v) => console.log("  " + v));
  await shot("01-home");

  // 找并点开 FAB / 更多
  const fabs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button, a, [role=button]"))
      .map((e) => ({ e, r: e.getBoundingClientRect(), t: ((e.innerText || e.getAttribute("aria-label") || "") + "").trim().slice(0, 14), cls: (e.className || "").toString().slice(0, 34) }))
      .filter((x) => x.r.width > 0 && x.r.height > 0 && x.r.top > window.innerHeight - 200)
      .map((x) => ({ text: x.t, cls: x.cls, w: Math.round(x.r.width), h: Math.round(x.r.height), top: Math.round(x.r.top) }))
  );
  console.log("\n=== 屏幕底部区域的控件 ===");
  fabs.forEach((f) => console.log("  " + JSON.stringify(f)));

  for (const f of fabs.filter((x) => !x.text || /更多|more|\+/.test(x.text) || x.w < 60)) {
    try {
      await page.locator(`text=${f.text || "+"}`).first().click({ timeout: 3000 });
      await page.waitForTimeout(1200);
      const links = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a[href]"))
          .map((a) => ({ href: a.getAttribute("href"), text: (a.innerText || "").trim().slice(0, 12), r: a.getBoundingClientRect() }))
          .filter((x) => x.r.width > 0 && x.r.height > 0)
          .map((x) => `${x.href} "${x.text}"`)
      );
      out.afterFab.push({ opened: f.text || f.cls, links });
      console.log(`\n=== 点开「${f.text || f.cls}」后可见链接 ===`);
      links.forEach((l) => console.log("  " + l));
      await shot("02-fab-open");
      // 关闭
      await page.keyboard.press("Escape").catch(() => {});
      await page.mouse.click(195, 60).catch(() => {});
      await page.waitForTimeout(700);
    } catch (e) { /* 忽略 */ }
  }

  // 汇总:每个目的地在主屏或抽屉里出现过吗
  const all = new Set([...out.visible.map((v) => v.split(" ")[0]), ...out.afterFab.flatMap((f) => f.links.map((l) => l.split(" ")[0]))]);
  for (const d of DESTS) out.reached[d] = all.has(d);
  console.log("\n=== 目的地可达性 ===");
  DESTS.forEach((d) => console.log(`  ${out.reached[d] ? "✓" : "✗ 未找到"}  ${d}`));
} catch (e) {
  console.log("ERROR", String(e).slice(0, 250));
} finally {
  await browser.close();
  writeJson("53-mobile-nav.json", out);
}
