// 判别实验:账户菜单(打开账户菜单 / deep-account)按 Esc 能否关闭?
// 竞争解释:(a) 产品缺陷 —— 与 f725678 修过的「白板面板 Esc」同类,但账户菜单漏了
//           (b) 我的装置问题 —— 焦点/事件目标不对、或 aria-expanded 读的不是同一个元素
// 手段:鼠标点开 → 截图 → Esc → 截图 → 再用键盘 Enter 复现一次 → 记录三次状态
import fs from "node:fs";
import { chromium, EVIDENCE, RUN, ORIGIN, storageStatePath, settle, writeJson } from "./common.mjs";

const out = { trials: [], notes: [] };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath(), locale: "zh-CN" });
const page = await ctx.newPage();

const menuState = () =>
  page.evaluate(() => {
    const btn = document.querySelector("button.deep-account, .deep-account");
    if (!btn) return { found: false };
    const panel = document.querySelector(".deep-account-menu, [class*=account][class*=menu], [class*=account][class*=panel], [class*=account][class*=pop]");
    return {
      found: true,
      ariaExpanded: btn.getAttribute("aria-expanded"),
      cls: (btn.className || "").toString(),
      panelCls: panel ? (panel.className || "").toString().slice(0, 46) : null,
      panelVisible: panel ? (() => { const r = panel.getBoundingClientRect(); return r.width > 0 && r.height > 0; })() : null,
      menuText: (document.body.innerText || "").includes("人工反馈") || (document.body.innerText || "").includes("开发者入口"),
    };
  });

const shot = (n) => page.screenshot({ path: `${EVIDENCE}/esc-${n}.png` }).catch(() => {});

try {
  await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page, { quiet: 2500, cap: 8000 });
  await page.waitForTimeout(1000);

  // 试验 1:鼠标点开 → Esc
  let t = { how: "mouse" };
  await page.locator("button.deep-account").first().click({ timeout: 6000 });
  await page.waitForTimeout(700);
  t.opened = await menuState();
  await shot("1-mouse-open");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  t.afterEsc = await menuState();
  await shot("2-mouse-after-esc");
  out.trials.push(t);
  console.log("试验1 鼠标: 打开 aria-expanded =", t.opened.ariaExpanded, " 菜单可见 =", t.opened.panelVisible);
  console.log("        Esc后 aria-expanded =", t.afterEsc.ariaExpanded, " 菜单可见 =", t.afterEsc.panelVisible);

  // 试验 2:若仍开着,先点别处关掉,再用键盘 Enter 打开 → Esc
  if (t.afterEsc.ariaExpanded === "true") {
    await page.mouse.click(700, 500).catch(() => {});
    await page.waitForTimeout(500);
  }
  const t2 = { how: "keyboard" };
  await page.locator("button.deep-account").first().focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  t2.opened = await menuState();
  await shot("3-kbd-open");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  t2.afterEsc = await menuState();
  await shot("4-kbd-after-esc");
  out.trials.push(t2);
  console.log("试验2 键盘: 打开 aria-expanded =", t2.opened.ariaExpanded, " Esc后 =", t2.afterEsc.ariaExpanded);

  // 对照:页面上是否有任何 Esc 处理器?(检查 window keydown 是否被 preventDefault)
  const t3 = { how: "probe-handler" };
  t3.escReachesDocument = await page.evaluate(() => {
    let seen = false;
    const h = (e) => { if (e.key === "Escape") seen = true; };
    document.addEventListener("keydown", h, true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    document.removeEventListener("keydown", h, true);
    return seen;
  });
  out.trials.push(t3);
  console.log("对照: 派发到 document 的 Escape 事件被收到 =", t3.escReachesDocument);

  // 点别处能否关闭(作为对照)
  const t4 = { how: "outside-click" };
  if (t4) { }
  const cur = await menuState();
  if (cur.ariaExpanded === "true") {
    await page.mouse.click(700, 600);
    await page.waitForTimeout(600);
  }
  t4.afterOutsideClick = await menuState();
  out.trials.push(t4);
  console.log("对照: 点空白处后 aria-expanded =", t4.afterOutsideClick.ariaExpanded);
} catch (e) {
  console.log("ERROR", String(e).slice(0, 250));
} finally {
  await browser.close();
  writeJson("59-esc-probe.json", out);
}
