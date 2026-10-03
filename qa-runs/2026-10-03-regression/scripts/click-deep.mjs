// 点击深化 pass:跳过「每页都一样」的头像/账户菜单(它会吃掉点击预算),
// 专打页面自身的页签/手风琴/分段控件,每个控件开→截图→复位,并记录状态变化。
import fs from "node:fs";
import {
  chromium, EVIDENCE, RUN, ORIGIN, storageStatePath,
  attachObservers, newSink, makeRecordingContext, settle, writeJson,
} from "./common.mjs";

const O = "https://aetherstudio.top";
const L = (p) => `${O}/lattice/#${p}`;

// 优先级从高到低:页面自身的结构性控件
const PRIORITY = [
  { sel: '[role="tab"]:not([disabled])', tag: "tab" },
  { sel: 'details > summary', tag: "accordion" },
  { sel: '.seg:not([disabled])', tag: "seg" },
  { sel: '.hm-chip:not([disabled])', tag: "chip" },
  { sel: '.wb-seg:not([disabled])', tag: "wbseg" },
  { sel: '[class*="tab"]:not(button[type="submit"]):not([disabled])', tag: "tabclass" },
  { sel: 'button[aria-expanded]:not([disabled])', tag: "expanded" },
];
// 每页都一样、且与页面内容无关的头像/账户菜单 —— 不打
const SKIP_TEXT = /^(造|登录|登出)$/;
const HARD_DENY = /提交|发布|上传|支付|打赏|删除|退出|注销|保存|确认|兑换|退款|认领|下单|购买|订阅|举报|拉黑|退出登录/;

const PAGES = [
  { key: "k01-devdocs", url: `${O}/developers/docs` },
  { key: "k02-doc-trial", url: `${O}/docs/trial-welcome` },
  { key: "k03-wallet", url: `${O}/wallet` },
  { key: "k04-home", url: `${O}/` },
  { key: "k05-discover", url: `${O}/discover` },
  { key: "k06-circles", url: `${O}/circles` },
  { key: "k07-challenges", url: `${O}/challenges` },
  { key: "k08-studio-new", url: `${O}/studio/new` },
  { key: "k09-profile", url: `${O}/profile` },
  { key: "k10-guide", url: `${O}/guide` },
  { key: "k11-book", url: `${O}/bookshelf/hello-system` },
  { key: "k12-product", url: `${O}/product/loops` },
  { key: "k13-lattice-marketplace", url: L("/marketplace") },
  { key: "k14-lattice-courses", url: L("/courses") },
  { key: "k15-lattice-history", url: L("/history") },
  { key: "k16-lattice-preview", url: L("/course/preview") },
  { key: "k17-lattice-journey", url: L("/course/journey") },
  { key: "k18-lattice-plans", url: L("/plans") },
  { key: "k19-lattice-whiteboard", url: L("/whiteboard") },
  { key: "k20-lattice-create", url: L("/create") },
];

const out = [];
const browser = await chromium.launch();
for (const p of PAGES) {
  const sink = newSink();
  const dir = `${RUN}/.video/${p.key}`;
  const ctx = await makeRecordingContext(browser, { dir, storageState: storageStatePath() });
  const page = await ctx.newPage();
  attachObservers(page, sink);
  const rec = { key: p.key, url: p.url.replace(O, ""), clicks: [], cands: 0, err: null };
  try {
    await page.goto(p.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settle(page, { quiet: 2600, cap: 8000 });
    await page.waitForTimeout(1000);

    // 按优先级收集,去重,跳过账户菜单与写操作
    const seen = new Set();
    const cands = [];
    for (const pr of PRIORITY) {
      const list = await page.evaluate(({ sel }) => {
        const out = [];
        for (const el of Array.from(document.querySelectorAll(sel))) {
          const r = el.getBoundingClientRect();
          if (r.width < 8 || r.height < 8) continue;
          const t = ((el.innerText || el.getAttribute("aria-label") || el.title || "") + "").trim();
          out.push({ text: t.slice(0, 34), tag: el.tagName.toLowerCase(), sel, top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), expanded: el.getAttribute("aria-expanded") });
        }
        return out;
      }, { sel: pr.sel }).catch(() => []);
      for (const c of list) {
        const k = `${c.tag}|${c.text}|${c.w}x${c.h}`;
        if (seen.has(k)) continue;
        if (SKIP_TEXT.test(c.text)) continue;
        if (HARD_DENY.test(c.text)) continue;
        if (c.tag === "a" && /logout|退出/i.test(c.text)) continue;
        seen.add(k);
        cands.push({ ...c, kind: pr.tag });
        if (cands.length >= 12) break;
      }
      if (cands.length >= 12) break;
    }
    rec.cands = cands.length;
    rec.candList = cands.map((c) => `${c.kind}:"${c.text}"`);

    for (const c of cands.slice(0, 8)) {
      try {
        // 若控件不在视口内,先滚到它
        await page.evaluate((top) => {
          if (top < 60 || top > window.innerHeight - 60) window.scrollTo({ top: Math.max(0, top - 300), behavior: "instant" });
        }, c.top);
        await page.waitForTimeout(250);
        const before = (await page.locator("body").innerText()).length;
        await page.locator(c.sel).filter({ hasText: c.text || undefined }).first().click({ timeout: 2500 })
          .catch(() => page.locator(c.sel).first().click({ timeout: 2500 }));
        await page.waitForTimeout(750);
        const after = (await page.locator("body").innerText()).length;
        const shot = `${p.key}-clk${rec.clicks.length}.png`;
        await page.screenshot({ path: `${EVIDENCE}/${shot}` }).catch(() => {});
        rec.clicks.push({ kind: c.kind, text: c.text, before, after, changed: before !== after, shot });
        // 复位:同一个控件再点一次(tab/seg/accordion 都是切换)
        await page.locator(c.sel).first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(400);
      } catch (e) { /* 跳过 */ }
    }
  } catch (e) {
    rec.err = String(e).slice(0, 180);
  } finally {
    await ctx.close();
  }
  rec.console = sink.console.filter((c) => c.type === "error" || c.type === "pageerror").slice(0, 4);
  rec.http4xx5xx = sink.http.slice(0, 4);
  out.push(rec);
  const ch = rec.clicks.filter((x) => x.changed).length;
  console.log(`${p.key.padEnd(24)} 候选${String(rec.cands).padStart(2)} 点击${String(rec.clicks.length).padStart(2)}(有效${ch}) ${rec.err || ""}`);
}
await browser.close();
writeJson("50-click-deep.json", { capturedAt: new Date().toISOString(), out });
console.log("CLICK DEEP DONE");
