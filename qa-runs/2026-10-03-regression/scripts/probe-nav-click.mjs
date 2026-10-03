// 判别实验:在 /feed 上点击侧栏「圈子」到底发生了什么?
// 竞争解释:(a) 产品 bug —— 点了不跳转且留下遮罩挡住后续点击
//           (b) 我的定位器选错元素(点到了别的东西,比如打开了弹层)
// 手段:枚举所有含「圈子」的元素 → 精确点侧栏那条 → 观察 URL/正文/是否有遮罩 → 再点下一个导航项。
import { chromium, EVIDENCE, RUN, ORIGIN, storageStatePath, settle, writeJson } from "./common.mjs";

const out = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath() });
const page = await ctx.newPage();

const state = async (label) => {
  const s = await page.evaluate(() => ({
    url: location.pathname,
    txt: (document.body.innerText || "").length,
    backdrops: Array.from(document.querySelectorAll("div")).filter((d) => {
      const cs = getComputedStyle(d);
      return /fixed|absolute/.test(cs.position) && +cs.opacity > 0.05 &&
        d.getBoundingClientRect().width > 900 && d.getBoundingClientRect().height > 600;
    }).map((d) => ({ cls: (d.className || "").toString().slice(0, 46), z: getComputedStyle(d).zIndex, op: getComputedStyle(d).opacity })).slice(0, 5),
    // 命中测试:侧栏「圈子」中心点上到底是什么
    hitCircles: (() => {
      const nav = document.querySelector("nav.deep-nav");
      if (!nav) return "no nav";
      const a = Array.from(nav.querySelectorAll("a,button")).find((e) => (e.innerText || "").trim().includes("圈子"));
      if (!a) return "no 圈子 link in nav";
      const r = a.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { navRect: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`, hitTag: el ? el.tagName.toLowerCase() : null, hitCls: el ? (el.className || "").toString().slice(0, 46) : null, isSelfOrChild: el ? (a === el || a.contains(el) || el.contains(a)) : null };
    })(),
  }));
  out.push({ label, ...s });
  console.log(`${label.padEnd(22)} url=${s.url.padEnd(12)} txt=${String(s.txt).padStart(5)} 遮罩${s.backdrops.length} 命中=${JSON.stringify(s.hitCircles)}`);
  return s;
};

try {
  await page.goto(`${ORIGIN}/feed`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page, { quiet: 2500, cap: 8000 });
  await state("载入 /feed");

  // 枚举所有含「圈子」的元素
  const all = await page.evaluate(() =>
    Array.from(document.querySelectorAll("*"))
      .filter((e) => ((e.innerText || "") + "").trim() === "圈子" || ((e.getAttribute?.("aria-label") || "") + "").includes("圈子"))
      .slice(0, 10)
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { tag: e.tagName.toLowerCase(), cls: (e.className || "").toString().slice(0, 40), href: e.getAttribute("href"), rect: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`, text: ((e.innerText || "") + "").trim().slice(0, 12) };
      })
  );
  console.log("\n=== 含「圈子」的元素 ===");
  all.forEach((e) => console.log("  " + JSON.stringify(e)));

  // 精确点侧栏 nav 里的那条
  const navLink = page.locator('nav.deep-nav a[href="/circles"], nav.deep-nav button[href="/circles"]').first();
  const n = await navLink.count();
  console.log(`\n侧栏精确链接命中数: ${n}`);
  if (n) {
    await navLink.click({ timeout: 8000 }).catch((e) => console.log("  点击异常: " + String(e).slice(0, 80)));
    await page.waitForTimeout(1800);
    await state("点侧栏「圈子」后");
  }
  // 再点下一个导航项,看是否被遮罩挡住
  const next = page.locator('nav.deep-nav a[href="/challenges"]').first();
  try {
    await next.click({ timeout: 6000 });
    await page.waitForTimeout(1500);
    await state("再点「挑战」后");
  } catch (e) {
    console.log("  「挑战」点击失败: " + String(e).slice(0, 100));
    await page.screenshot({ path: `${EVIDENCE}/probe-nav-blocked.png` }).catch(() => {});
    await state("「挑战」失败时");
  }
  await page.screenshot({ path: `${EVIDENCE}/probe-nav-after.png` }).catch(() => {});
} catch (e) {
  console.log("ERROR", String(e).slice(0, 300));
} finally {
  await browser.close();
  writeJson("51-probe-nav-click.json", out);
}
