// 查:开发者文档页那 5 个页签的真实 DOM 结构(role / class / tag),
// 用来修 click-deep 的选择器(它们没被 [role=tab] / [class*=tab] / .seg 命中)。
import { chromium, storageStatePath, ORIGIN } from "./common.mjs";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath() });
const page = await ctx.newPage();
for (const [key, url] of [["devdocs", `${ORIGIN}/developers/docs`], ["wallet", `${ORIGIN}/wallet`], ["profile", `${ORIGIN}/profile`], ["studio-new", `${ORIGIN}/studio/new`]]) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);
    const r = await page.evaluate(() => {
      const words = /授权流程|端点|存储|错误|重试|余额|三条|路径|说明|余额 ·|新成员|规则|条款|作品名称|一句话介绍|作品类别|访问方式|果子价格/;
      const out = [];
      for (const el of document.querySelectorAll("button,a,div,span,li")) {
        const t = ((el.innerText || "") + "").trim();
        if (!t || t.length > 14 || !words.test(t)) continue;
        const rc = el.getBoundingClientRect();
        if (rc.width < 6 || rc.height < 6) continue;
        out.push({
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role") || "",
          cls: (el.className || "").toString().slice(0, 46),
          text: t.slice(0, 12),
          rect: `${Math.round(rc.width)}x${Math.round(rc.height)}`,
          parentCls: el.parentElement ? (el.parentElement.className || "").toString().slice(0, 40) : "",
        });
      }
      // 去重
      const seen = new Set();
      return out.filter((x) => { const k = x.tag + x.cls + x.text; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 16);
    });
    console.log(`\n=== ${key} ===`);
    r.forEach((x) => console.log(`  ${x.tag}${x.role ? "[role=" + x.role + "]" : ""} .${x.cls} "${x.text}" ${x.rect}  父.${x.parentCls}`));
    if (!r.length) console.log("  (无匹配)");
  } catch (e) { console.log(key, "ERR", String(e).slice(0, 100)); }
}
await browser.close();
