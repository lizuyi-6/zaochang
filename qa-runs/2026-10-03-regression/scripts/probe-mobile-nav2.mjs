// 手机导航缺口核查:7 个目的地(/feed /challenges /collections /docs /studio /developers /wallet)
// 在 390px 主屏不可见。它们是否仍可达?
// 手段:① 全页找「更多/菜单/hamburger」触发器 ② 逐个点开顶部横向条的 4 个条目
//      ③ 检查抽屉/面板里是否含缺失目的地 ④ 若有可滚动的导航容器,横向滚一遍
import { chromium, EVIDENCE, RUN, ORIGIN, storageStatePath, settle, writeJson } from "./common.mjs";

const MISSING = ["/feed", "/challenges", "/collections", "/docs", "/studio", "/developers", "/wallet"];
const out = { triggers: [], stripItems: [], found: {}, notes: [] };
const shot = (n) => page.screenshot({ path: `${EVIDENCE}/mnav-${n}.png` }).catch(() => {});

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  storageState: storageStatePath(), locale: "zh-CN",
});
const page = await ctx.newPage();
// 注意:page.evaluate 的返回值会经序列化,Set 会变成普通对象 —— 必须返回数组
const hrefsNow = () => page.evaluate(() => Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")));
const has = (arr, m) => arr.includes(m);

try {
  await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page, { quiet: 2500, cap: 8000 });
  await page.waitForTimeout(1200);
  await shot("01-home");
  let set = await hrefsNow();
  for (const m of MISSING) out.found[m] = has(set, m);

  // ① 找所有可能的「更多/菜单」触发器(按钮/含 aria 属性的元素)
  out.triggers = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button,[role=button],[aria-expanded],[aria-haspopup],summary"))
      .map((e) => { const r = e.getBoundingClientRect(); return {
        t: ((e.innerText || e.getAttribute("aria-label") || e.title || "") + "").trim().slice(0, 20),
        cls: (e.className || "").toString().slice(0, 40),
        exp: e.getAttribute("aria-expanded"), hsp: e.getAttribute("aria-haspopup"),
        rect: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`,
        vis: r.width > 0 && r.height > 0 && r.top < window.innerHeight,
      }; })
      .filter((x) => x.vis)
  );
  console.log("=== 可见的按钮/菜单类触发器 ===");
  out.triggers.forEach((t) => console.log("  " + JSON.stringify(t)));

  // ② 顶部横向条的 4 个条目(社区成员/账号与记录/公开社区作品/可用发布)
  const strip = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button, a, [role=button]"))
      .map((e) => { const r = e.getBoundingClientRect(); return { t: ((e.innerText || "") + "").trim().slice(0, 12), cls: (e.className || "").toString().slice(0, 30), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter((x) => x.w > 40 && x.h > 15 && x.top > 600 && x.top < 800)
  );
  console.log("\n=== 底部 tab 栏上方的横向条目 ===");
  strip.forEach((s) => console.log("  " + JSON.stringify(s)));
  out.stripItems = strip;

  for (const s of strip) {
    try {
      await page.locator(`text=${s.t}`).first().click({ timeout: 3000 });
      await page.waitForTimeout(1100);
      const now = await hrefsNow();
      const newly = MISSING.filter((m) => has(now, m) && !out.found[m]);
      newly.forEach((m) => (out.found[m] = true));
      const all = await page.evaluate(() => Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")));
      out.notes.push(`点「${s.t}」后 URL=${page.url().replace(ORIGIN, "")} 新增可达:${newly.join(",") || "无"} 链接数=${all.length}`);
      console.log(`  点「${s.t}」-> ${page.url().replace(ORIGIN, "")} 新增:${newly.join(",") || "无"}`);
      await shot("02-" + s.t.replace(/[^\w]/g, ""));
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(500);
    } catch (e) { out.notes.push(`点「${s.t}」失败`); }
  }

  // ③ 直接问页面:有没有任何横向可滚动的导航容器
  const hscroll = await page.evaluate(() =>
    Array.from(document.querySelectorAll("nav, [class*=nav], [class*=tab]"))
      .map((e) => ({ cls: (e.className || "").toString().slice(0, 40), sw: e.scrollWidth, cw: e.clientWidth, links: Array.from(e.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")) }))
      .filter((x) => x.sw > x.cw + 20)
  );
  out.hscroll = hscroll;
  console.log("\n=== 横向可滚动的导航容器 ===");
  hscroll.forEach((h) => { console.log(`  ${h.cls} scrollW=${h.sw} clientW=${h.cw}`); h.links.forEach((l) => { if (MISSING.includes(l)) out.found[l] = true; }); });

  console.log("\n=== 最终可达性结论 ===");
  MISSING.forEach((m) => console.log(`  ${out.found[m] ? "✓ 可达" : "✗ 仍不可达"}  ${m}`));
} catch (e) {
  console.log("ERROR", String(e).slice(0, 250));
} finally {
  await browser.close();
  writeJson("54-mobile-nav-probe.json", out);
}
