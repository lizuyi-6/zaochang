// 对照实验:同一批图标控件在「粗指针触屏」下是否变大。
// 项目 2026-09-18 声称做了「主控件 44px + 粗指针触屏兜底」——桌面细指针量到的 28-40px
// 不能直接否定触屏声明,必须在 hasTouch 环境下复测。
import { chromium, RUN, ORIGIN, storageStatePath, writeJson } from "./common.mjs";

const MODES = [
  { key: "fine-1440x900", viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false },
  { key: "touch-390x844", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  { key: "touch-820x1180", viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true },
];
const ROUTES = [
  { hash: "#/whiteboard", label: "whiteboard" },
  { hash: "#/create", label: "create" },
  { hash: "#/home", label: "home" },
];

const out = [];
const browser = await chromium.launch();
for (const m of MODES) {
  for (const r of ROUTES) {
    const ctx = await browser.newContext({
      viewport: m.viewport, hasTouch: m.hasTouch, isMobile: m.isMobile,
      storageState: storageStatePath(), locale: "zh-CN",
    });
    const page = await ctx.newPage();
    try {
      await page.goto(`${ORIGIN}/lattice/${r.hash}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(8000);
      const rows = await page.evaluate(() => {
        const res = [];
        for (const el of Array.from(document.querySelectorAll("button, a[href], [role='button']"))) {
          const rc = el.getBoundingClientRect();
          if (rc.width === 0 || rc.height === 0) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
          if ((el.innerText || "").trim()) continue;
          res.push({
            cls: (el.className || "").toString().slice(0, 34),
            w: Math.round(rc.width), h: Math.round(rc.height),
            name: (el.getAttribute("aria-label") || el.title || "").slice(0, 26),
          });
        }
        return res.sort((a, b) => a.w * a.h - b.w * b.h);
      });
      const small = rows.filter((x) => x.w < 44 || x.h < 44);
      const tiny = rows.filter((x) => x.w < 24 || x.h < 24);
      out.push({ mode: m.key, route: r.label, viewport: m.viewport, total: rows.length, below44: small.length, below24: tiny.length, smallest: rows.slice(0, 4) });
      console.log(`${m.key.padEnd(16)} ${r.label.padEnd(11)} n=${String(rows.length).padStart(2)}  <44px=${small.length}  <24px(AA)=${tiny.length}  smallest=${rows[0] ? rows[0].w + "x" + rows[0].h + " " + rows[0].cls : "-"}`);
    } catch (e) {
      out.push({ mode: m.key, route: r.label, err: String(e).slice(0, 160) });
      console.log(`${m.key} ${r.label} FAILED: ${String(e).slice(0, 100)}`);
    } finally { await ctx.close(); }
  }
}
await browser.close();
writeJson("05-hit-targets-touch.json", out);
