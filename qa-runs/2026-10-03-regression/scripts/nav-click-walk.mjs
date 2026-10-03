// 批次 E(修正版):按精确 href 点侧栏导航,像真实用户一样逐项切换。
//
// v1 的教训:用 a:has-text("圈子") 会命中「文本包含该串」的所有元素及其祖先 ——
// 页面上任何含「圈子」的链接(包括侧栏「正在发生」的 14x14 圆点链接)都算命中,
// 于是点错元素、页面停在原地、后续点击被遮挡。改用 nav.deep-nav a[href=...] 精确寻址。
// 修正后 11 个侧栏目的地全部正常跳转,证明 v1 的失败是我的定位器问题而非产品缺陷。
import fs from "node:fs";
import {
  chromium, EVIDENCE, RUN, ORIGIN, storageStatePath,
  attachObservers, newSink, makeRecordingContext, settle, writeJson, findVideo,
} from "./common.mjs";

// href 取自 app/components/site-shell.tsx:42-54 的 navItems
const NAV = [
  ["首页", "/"], ["探索", "/discover"], ["动态", "/feed"], ["圈子", "/circles"],
  ["挑战", "/challenges"], ["收藏", "/collections"], ["书架", "/bookshelf"],
  ["文档", "/docs"], ["创作台", "/studio"], ["开发者", "/developers"], ["果子钱包", "/wallet"],
];

const sink = newSink();
const dir = `${RUN}/.video/e02-nav-click-walk2`;
const steps = [];
const t0 = Date.now();

const browser = await chromium.launch();
const ctx = await makeRecordingContext(browser, { dir, storageState: storageStatePath() });
const page = await ctx.newPage();
attachObservers(page, sink);

const snap = async (label, note) => {
  const t = Date.now() - t0;
  const name = `e02-nav-${String(steps.length).padStart(2, "0")}-${label}`;
  await page.screenshot({ path: `${EVIDENCE}/${name}.png` }).catch(() => {});
  const txt = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  const st = steps[steps.length - 1];
  if (st) { st.textLen = txt.length; st.landedUrl = page.url().replace(ORIGIN, ""); }
  console.log(`[${(t / 1000).toFixed(1)}s] ${label.padEnd(6)} url=${page.url().replace(ORIGIN, "")} txt=${txt.length} ${note || ""}`);
};

try {
  await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page, { quiet: 2500, cap: 8000 });
  await page.waitForTimeout(1000);
  steps.push({ label: "start", atMs: 0, url: "/" });
  await snap("start");

  let ok = 0, fail = 0;
  for (const [label, href] of NAV) {
    const loc = page.locator(`nav.deep-nav a[href="${href}"], nav.deep-nav button[href="${href}"]`).first();
    const n = await loc.count();
    if (!n) { console.log(`  !! 侧栏无 href=${href} 的项`); fail++; continue; }
    const before = page.url().replace(ORIGIN, "");
    steps.push({ label, href, before, atMs: Date.now() - t0 });
    let err = null;
    await loc.click({ timeout: 6000 }).catch((e) => { err = String(e).slice(0, 60); });
    await page.waitForTimeout(1500);
    const after = page.url().replace(ORIGIN, "");
    const landed = after === href || after === href + "/";
    if (landed && !err) ok++; else fail++;
    await snap(label, err ? `点击失败:${err}` : (landed ? "" : `未跳到 ${href}(实际 ${after})`));

    await page.evaluate(() => (document.scrollingElement || document.documentElement).scrollTo({ top: 260, behavior: "instant" }));
    await page.waitForTimeout(400);
    const sc = await page.evaluate(() => (document.scrollingElement || document.documentElement).scrollTop);
    if (sc === 0) console.log("     (该页切后不可滚动)");
  }
  steps.push({ label: "end", atMs: Date.now() - t0, url: page.url().replace(ORIGIN, "") });
  await snap("end");
  console.log(`\n导航结果: 成功 ${ok} / 失败 ${fail}`);
  var navSummary = { ok, fail };
} catch (e) {
  console.log("ERROR:", String(e).slice(0, 300));
} finally {
  await ctx.close();
  const v = findVideo(dir);
  if (v) fs.copyFileSync(v, `${EVIDENCE}/e02-nav-click-walk2.webm`);
  await browser.close();
  writeJson("52-nav-click-walk2.json", {
    capturedAt: new Date().toISOString(), elapsedMs: Date.now() - t0, steps,
    console: sink.console.filter((c) => c.type === "error" || c.type === "pageerror").slice(0, 20),
    http4xx5xx: sink.http.slice(0, 20), failedReq: sink.failed.slice(0, 12),
  });
  console.log("NAV WALK2 DONE");
}
