// 核实 P-105:手机(390x844)上书籍正文的宽表格是否被压扁、单元格文字是否压叠。
// 判据:表格实际宽度 vs 容器宽度;每个单元格的 scrollWidth vs clientWidth(文字是否溢出);
//     以及表格是否可横向滚动(user-select/overflow-x)。
import { chromium, EVIDENCE, RUN, ORIGIN, storageStatePath, settle, writeJson } from "./common.mjs";

const out = { tables: [], notes: [] };
const browser = await chromium.launch();

for (const [label, vp] of [["mobile-390", { width: 390, height: 844 }], ["desktop-1440", { width: 1440, height: 900 }]]) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: label.startsWith("mobile"), hasTouch: label.startsWith("mobile"), storageState: storageStatePath(), locale: "zh-CN" });
  const page = await ctx.newPage();
  try {
    await page.goto(`${ORIGIN}/bookshelf/hello-system`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await settle(page, { quiet: 3000, cap: 9000 });
    await page.waitForTimeout(2000);

    const info = await page.evaluate(() => {
      const res = [];
      for (const t of document.querySelectorAll("table")) {
        const tr = t.getBoundingClientRect();
        const parent = t.parentElement;
        const pcs = parent ? getComputedStyle(parent) : null;
        const cells = Array.from(t.querySelectorAll("th,td")).slice(0, 24).map((c) => {
          const cs = getComputedStyle(c);
          return { w: Math.round(c.getBoundingClientRect().width), sw: c.scrollWidth, cw: c.clientWidth, overflowX: cs.overflowX, ws: cs.whiteSpace, txt: (c.innerText || "").trim().slice(0, 18) };
        });
        res.push({
          tableW: Math.round(tr.width),
          parentW: parent ? Math.round(parent.getBoundingClientRect().width) : 0,
          parentOverflowX: pcs ? pcs.overflowX : null,
          tableScrollW: t.scrollWidth,
          tableClientW: t.clientWidth,
          cols: t.querySelectorAll("thead th").length,
          rows: t.querySelectorAll("tbody tr").length,
          cellsOverflowing: cells.filter((c) => c.sw > c.cw + 1).length,
          cells,
        });
      }
      return res;
    });
    out.notes.push(`--- ${label} ---`);
    console.log(`\n=== ${label} (${vp.width}px) 找到 ${info.length} 张表 ===`);
    info.forEach((t, i) => {
      console.log(`  表${i}: 宽${t.tableW}px 父容器${t.parentW}px (overflow-x=${t.parentOverflowX}) 列${t.cols} 行${t.rows} 自身可滚=${t.tableScrollW > t.tableClientW + 1} 单元格文字溢出=${t.cellsOverflowing}/${t.cells.length}`);
      const wide = t.cells.filter((c) => c.w < 60).slice(0, 5);
      if (wide.length) console.log(`    被压到 <60px 的单元格: ${wide.map((c) => `${c.w}px "${c.txt}"`).join(" | ")}`);
    });
    out.tables.push({ label, viewport: vp, info });

    // 滚到第一张表并全分辨率截图
    if (info.length) {
      await page.evaluate(() => {
        const t = document.querySelector("table");
        if (t) t.scrollIntoView({ block: "center", behavior: "instant" });
      });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${EVIDENCE}/table-${label}.png` }).catch(() => {});
    }
  } catch (e) {
    console.log(label, "ERR", String(e).slice(0, 150));
  } finally { await ctx.close(); }
}

await browser.close();
writeJson("61-book-table-mobile.json", out);
console.log("\nWROTE 61-book-table-mobile.json");
