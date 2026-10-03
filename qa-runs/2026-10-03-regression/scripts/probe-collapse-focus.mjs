// P-104 视觉确认:键盘 Tab 到 .hk-sidebar-collapse 时它是否真的看不见?
// 该按钮 CSS 是 opacity:0,只在 .hk-sidebar:hover 时 opacity:1,无 :focus-within。
// 竞争解释:也许聚焦时另有规则把它点亮 —— 本实验直接聚焦后截图,并读实际 opacity。
import { chromium, EVIDENCE, ORIGIN, storageStatePath, settle, writeJson } from "./common.mjs";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath(), locale: "zh-CN" });
const page = await ctx.newPage();
const out = {};

try {
  await page.goto(`${ORIGIN}/lattice/#/home`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page, { quiet: 3000, cap: 9000 });
  await page.waitForTimeout(1500);

  // 未聚焦时的状态
  out.before = await page.evaluate(() => {
    const el = document.querySelector(".hk-sidebar-collapse");
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { found: true, opacity: cs.opacity, visibility: cs.visibility, rect: `${Math.round(r.width)}x${Math.round(r.height)}`, display: cs.display, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, boxShadow: cs.boxShadow.slice(0, 40) };
  });
  await page.screenshot({ path: `${EVIDENCE}/kbd-collapse-unfocused.png` }).catch(() => {});

  // 用键盘聚焦到它(Tab 顺序第 2 个)
  await page.locator(".hk-sidebar-brand-btn").first().focus().catch(() => {});
  await page.keyboard.press("Tab");
  await page.waitForTimeout(600);

  out.afterFocus = await page.evaluate(() => {
    const el = document.querySelector(".hk-sidebar-collapse");
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const isActive = document.activeElement === el || el.contains(document.activeElement);
    return {
      found: true, isActiveElement: isActive,
      opacity: cs.opacity, visibility: cs.visibility,
      rect: `${Math.round(r.width)}x${Math.round(r.height)}`,
      outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
      boxShadow: cs.boxShadow.slice(0, 50),
      // 侧栏是否处于 hover(不可能,键盘无 hover)
      sidebarHovered: document.querySelector(".hk-sidebar")?.matches(":hover") ?? null,
    };
  });
  await page.screenshot({ path: `${EVIDENCE}/kbd-collapse-focused.png` }).catch(() => {});

  // 对照:鼠标 hover 侧栏后再看
  await page.locator(".hk-sidebar").first().hover().catch(() => {});
  await page.waitForTimeout(600);
  out.afterHover = await page.evaluate(() => {
    const el = document.querySelector(".hk-sidebar-collapse");
    const cs = el ? getComputedStyle(el) : null;
    return el ? { opacity: cs.opacity, rect: (() => { const r = el.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; })() } : { found: false };
  });
  await page.screenshot({ path: `${EVIDENCE}/kbd-collapse-hovered.png` }).catch(() => {});

  console.log("未聚焦 :", JSON.stringify(out.before));
  console.log("键盘聚焦:", JSON.stringify(out.afterFocus));
  console.log("鼠标 hover:", JSON.stringify(out.afterHover));
  console.log("\n结论: 键盘聚焦时 opacity =", out.afterFocus.opacity, "=> 按钮", out.afterFocus.opacity === "0" ? "完全不可见(焦点不可见缺陷)" : "可见");
} catch (e) {
  console.log("ERROR", String(e).slice(0, 250));
} finally {
  await browser.close();
  writeJson("60-collapse-focus.json", out);
}
