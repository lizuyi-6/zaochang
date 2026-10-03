// 判别实验:定位 #/course/journey 空白页的层级。
// 竞争解释:(a) 路由级渲染崩溃被吞 (b) 缺课程数据时组件主动什么都不渲染
//            (c) 采集装置假象 (d) 只是慢,再等就会出来
// 观察:DOM 是否有内容、#root 子节点数、实际计算背景色、veil 状态、延到 25s 是否自愈。
import {
  chromium, EVIDENCE, RUN, ORIGIN, storageStatePath,
  attachObservers, newSink, makeRecordingContext, writeJson,
} from "./common.mjs";

const CASES = [
  { key: "A-journey-nouuid", hash: "#/course/journey", waitMs: 25000 },
  { key: "B-journey-bogusuuid", hash: "#/course/journey?uuid=00000000-0000-0000-0000-000000000000", waitMs: 25000 },
  { key: "C-preview-nouuid", hash: "#/course/preview", waitMs: 12000 },
  { key: "D-home", hash: "#/home", waitMs: 12000 },
];

const out = [];
const browser = await chromium.launch();
for (const c of CASES) {
  const sink = newSink();
  const ctx = await makeRecordingContext(browser, { dir: `${RUN}/.video/probe-${c.key}`, storageState: storageStatePath() });
  const page = await ctx.newPage();
  attachObservers(page, sink);
  const rec = { key: c.key, hash: c.hash, waitMs: c.waitMs };
  try {
    await page.goto(`${ORIGIN}/lattice/${c.hash}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    // 早期快照 vs 长等待快照:区分"慢"与"永久空"
    await page.waitForTimeout(3000);
    rec.early = await probeDom(page);
    await page.waitForTimeout(c.waitMs);
    rec.late = await probeDom(page);
    rec.finalUrl = page.url().replace(ORIGIN, "");
    rec.console = sink.console;
    rec.http = sink.http;
    rec.failed = sink.failed;
    await page.screenshot({ path: `${EVIDENCE}/probe-${c.key}.png` });
  } catch (e) {
    rec.err = String(e).slice(0, 300);
  } finally {
    await ctx.close();
  }
  out.push(rec);
  const L = rec.late || {};
  console.log(
    `${c.key.padEnd(22)} rootKids=${L.rootChildren} htmlLen=${L.htmlLen} textLen=${L.innerTextLen} bg=${L.bodyBg} navPresent=${L.navPresent} veil=${L.veil} rootHTML=${L.rootHtmlLen}`
  );
}
await browser.close();
writeJson("03-journey-probe.json", out);

async function probeDom(page) {
  return await page.evaluate(() => {
    const root = document.getElementById("root") || document.body.firstElementChild;
    const cs = getComputedStyle(document.body);
    return {
      rootExists: !!root,
      rootChildren: root ? root.children.length : -1,
      rootHtmlLen: root ? root.innerHTML.length : -1,
      htmlLen: document.documentElement.innerHTML.length,
      innerTextLen: (document.body.innerText || "").length,
      bodyBg: cs.backgroundColor,
      bodyOpacity: cs.opacity,
      bodyVisibility: cs.visibility,
      navPresent: !!document.querySelector("nav, aside, [class*=sidebar], [class*=shell]"),
      veil: Array.from(document.querySelectorAll("div"))
        .filter((d) => /veil|cover|fade/i.test(d.className || ""))
        .slice(0, 3)
        .map((d) => ({ cls: d.className, opacity: getComputedStyle(d).opacity, vis: getComputedStyle(d).visibility, z: getComputedStyle(d).zIndex })),
    };
  }).catch((e) => ({ evalError: String(e).slice(0, 200) }));
}
