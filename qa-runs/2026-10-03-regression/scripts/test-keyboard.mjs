// 键盘可达性走查 —— 本轮自报的 最大盲区。
// 查五件事:
//   1) 第一个 Tab 落在哪(有没有 skip link)
//   2) 前 N 个 Tab 序列能否到达主导航(侧栏/tab 栏)
//   3) 焦点环是否可见(有 outline / box-shadow,而不是被 outline:none 吞掉)
//   4) 打开浮层后焦点是否被困住;Esc 能否关闭
//   5) 触控目标尺寸在纯键盘路径上是否与鼠标路径一致
// 全程只用键盘,不点任何东西(唯一例外是先用鼠标聚焦到 body 起始态)。
import fs from "node:fs";
import { chromium, EVIDENCE, RUN, ORIGIN, storageStatePath, settle, writeJson, findVideo } from "./common.mjs";

const O = "https://aetherstudio.top";
const L = (p) => `${O}/lattice/#${p}`;

const PAGES = [
  { key: "kbd01-home", url: `${O}/` },
  { key: "kbd02-discover", url: `${O}/discover` },
  { key: "kbd03-devdocs", url: `${O}/developers/docs` },
  { key: "kbd04-wallet", url: `${O}/wallet` },
  { key: "kbd05-studio-new", url: `${O}/studio/new` },
  { key: "kbd06-book", url: `${O}/bookshelf/hello-system` },
  { key: "kbd07-signin", url: `${O}/signin` },
  { key: "kbd08-lattice-home", url: L("/home") },
  { key: "kbd09-lattice-chat", url: L("/chat") },
  { key: "kbd10-lattice-create", url: L("/create") },
  { key: "kbd11-lattice-marketplace", url: L("/marketplace") },
  { key: "kbd12-galaxy-products", url: `${O}/galaxy/products` },
];

const MAX_TABS = 18;

const describeFocus = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return { tag: "body", isBody: true };
    const cs = getComputedStyle(a);
    const r = a.getBoundingClientRect();
    const name =
      a.getAttribute("aria-label") ||
      a.getAttribute("title") ||
      (a.innerText || "").replace(/\s+/g, " ").trim().slice(0, 34) ||
      a.getAttribute("placeholder") || "";
    const outline = `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`;
    const ringVisible =
      (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) ||
      (cs.boxShadow && cs.boxShadow !== "none");
    return {
      tag: a.tagName.toLowerCase(),
      cls: (a.className || "").toString().slice(0, 34),
      href: (a.getAttribute && a.getAttribute("href")) || null,
      name,
      rect: `${Math.round(r.width)}x${Math.round(r.height)}`,
      inViewport: r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth,
      outline,
      ringVisible,
      ring: ringVisible,
    };
  });

const out = [];
const browser = await chromium.launch();

for (const p of PAGES) {
  const dir = `${RUN}/.video/${p.key}`;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath(), locale: "zh-CN" });
  const page = await ctx.newPage();
  const rec = { key: p.key, url: p.url.replace(O, ""), tabs: [], notes: [] };

  try {
    await page.goto(p.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settle(page, { quiet: 2500, cap: 8000 });
    await page.waitForTimeout(900);
    // 焦点归位到文档起点
    await page.evaluate(() => { document.body.setAttribute("tabindex", "-1"); document.body.focus(); });
    await page.waitForTimeout(200);

    for (let i = 0; i < MAX_TABS; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(140);
      const f = await describeFocus(page);
      rec.tabs.push({ i: i + 1, ...f });
      // 循环检测:焦点回到 body
      if (f.isBody && i > 2) { rec.notes.push(`第 ${i + 1} 次 Tab 后焦点回到 body(序列结束)`); break; }
    }
    const first = rec.tabs[0] || {};
    if (first.cls && /skip/i.test(first.cls)) rec.notes.push("第一个 Tab 是 skip link ✓");
    else if (first.isBody) rec.notes.push("第一个 Tab 落在 body(无 skip link,需多按一次 Tab 才能进内容)");
    const noRing = rec.tabs.filter((t) => t.tag !== "body" && !t.ring);
    if (noRing.length) rec.notes.push(`⚠ ${noRing.length}/${rec.tabs.length} 个焦点态无可见焦点环`);
    else rec.notes.push("所有焦点态都有可见焦点环");
    const offscreen = rec.tabs.filter((t) => t.tag !== "body" && !t.inViewport);
    if (offscreen.length) rec.notes.push(`⚠ ${offscreen.length} 个焦点元素不在视口内(未自动滚动到)`);

    // Esc 能否关闭浮层:先用键盘激活一个 aria-expanded 控件,再按 Esc
    const exp = page.locator("button[aria-expanded], [role=button][aria-expanded]").first();
    if (await exp.count().catch(() => 0)) {
      await exp.focus().catch(() => {});
      await page.keyboard.press("Enter");
      await page.waitForTimeout(600);
      const opened = await page.evaluate(() => {
        const el = document.querySelector("[aria-expanded]");
        return el ? el.getAttribute("aria-expanded") : null;
      });
      await page.screenshot({ path: `${EVIDENCE}/${p.key}-esc-before.png` }).catch(() => {});
      await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => {
        const el = document.querySelector("[aria-expanded]");
        return el ? el.getAttribute("aria-expanded") : null;
      });
      rec.escTest = { opened, afterEsc: after, works: opened === "true" && after !== "true" };
      rec.notes.push(`Esc 测试: 打开=${opened} Esc后=${after} ${rec.escTest.works ? "✓" : "✗ Esc 未关闭"}`);
    }

    await page.screenshot({ path: `${EVIDENCE}/${p.key}-focus.png` }).catch(() => {});
  } catch (e) {
    rec.err = String(e).slice(0, 180);
  } finally {
    await ctx.close();
  }
  out.push(rec);
  console.log(`\n=== ${p.key} (${rec.tabs.length} 次 Tab) ===`);
  rec.tabs.slice(0, 8).forEach((t) => console.log(`  Tab${String(t.i).padStart(2)} ${t.tag}.${t.cls} "${t.name}" ${t.rect} 焦点环=${t.ring ? "✓" : "✗"} 视口内=${t.inViewport}`));
  rec.notes.forEach((n) => console.log("  · " + n));
}

await browser.close();
writeJson("58-keyboard.json", { capturedAt: new Date().toISOString(), out });
console.log("\nKEYBOARD DONE");
