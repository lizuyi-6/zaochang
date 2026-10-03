// 定向实验:量图标型控件的命中框(核 2026-09-18 HIG 声称的 44px 触达整改)。
// 只读:只读 DOM 几何,不点击。
import { chromium, EVIDENCE, RUN, ORIGIN, storageStatePath, writeJson } from "./common.mjs";

const TARGETS = [
  { hash: "#/whiteboard", label: "whiteboard" },
  { hash: "#/create", label: "create" },
  { hash: "#/home", label: "home" },
  { hash: "#/chat", label: "chat" },
  { hash: "#/marketplace", label: "marketplace" },
];

const MIN = 44;
const out = [];

const browser = await chromium.launch();
for (const t of TARGETS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath(), locale: "zh-CN" });
  const page = await ctx.newPage();
  try {
    await page.goto(`${ORIGIN}/lattice/${t.hash}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(9000);
    const measured = await page.evaluate((min) => {
      const rows = [];
      const sel = "button, a[href], [role='button'], input, textarea, select";
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
        // 只看"没有可见文字"的控件:有文字的按文本高度另行判断
        const text = (el.innerText || el.getAttribute("placeholder") || "").trim();
        const name = el.getAttribute("aria-label") || el.title || "";
        if (text) continue;
        rows.push({
          cls: (el.className || "").toString().slice(0, 48),
          tag: el.tagName.toLowerCase(),
          w: Math.round(r.width),
          h: Math.round(r.height),
          area: Math.round(r.width * r.height),
          name: (name || "").slice(0, 40),
          belowMin: r.width < min || r.height < min,
        });
      }
      return rows.sort((a, b) => a.area - b.area).slice(0, 14);
    }, MIN);
    const small = measured.filter((m) => m.belowMin);
    out.push({ ...t, total: measured.length, belowMin: small.length, smallest: measured.slice(0, 6), allSmall: small.slice(0, 12) });
    console.log(`${t.label.padEnd(12)} iconOnlyControls=${measured.length}  below${MIN}px=${small.length}`);
    small.slice(0, 5).forEach((m) => console.log(`    ${m.w}x${m.h}  ${m.tag}.${m.cls}  name="${m.name}"`));
  } catch (e) {
    out.push({ ...t, err: String(e).slice(0, 200) });
    console.log(`${t.label} FAILED: ${String(e).slice(0, 120)}`);
  } finally {
    await ctx.close();
  }
}
await browser.close();
writeJson("04-hit-targets.json", out);
