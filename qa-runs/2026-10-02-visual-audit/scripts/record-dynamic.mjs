// 动态路由录像:书详情 / 章节阅读 / 文档正文 / 产品详情 / 产品应用 / 支付页错误态。
// 只读:导航 + 截图,不做任何写操作。
import fs from "node:fs";
import {
  chromium, EVIDENCE, RUN, ORIGIN, storageStatePath,
  attachObservers, newSink, makeRecordingContext, settle, writeJson, findVideo,
} from "./common.mjs";

const ROUTES = [
  { key: "d01-book-hello-system", path: "/bookshelf/hello-system" },
  { key: "d02-book-hello-computer", path: "/bookshelf/hello-computer" },
  { key: "d03-book-hello-llm", path: "/bookshelf/hello-llm" },
  { key: "d04-chapter-read", path: "/bookshelf/hello-system/part-1/01-why-architecture-matters" },
  { key: "d05-doc-trial", path: "/docs/trial-welcome" },
  { key: "d06-product-loops", path: "/product/loops" },
  { key: "d07-product-minute", path: "/product/minute" },
  { key: "d08-product-mori", path: "/product/mori" },
  { key: "d09-product-sprout", path: "/product/sprout" },
  { key: "d10-product-typewave", path: "/product/typewave" },
  { key: "d11-product-wander", path: "/product/wander" },
  { key: "d12-app-loops", path: "/product-apps/loops/" },
  { key: "d13-app-minute", path: "/product-apps/minute/" },
  { key: "d14-app-mori", path: "/product-apps/mori/" },
  { key: "d15-app-sprout", path: "/product-apps/sprout/" },
  { key: "d16-app-typewave", path: "/product-apps/typewave/" },
  { key: "d17-app-wander", path: "/product-apps/wander/" },
  { key: "d18-oauth-payment-bogus", path: "/oauth/payment/00000000-0000-0000-0000-000000000000" },
];

const results = [];
const browser = await chromium.launch();
for (const r of ROUTES) {
  const sink = newSink();
  const dir = `${RUN}/.video/${r.key}`;
  const ctx = await makeRecordingContext(browser, { dir, storageState: storageStatePath() });
  const page = await ctx.newPage();
  attachObservers(page, sink);
  const rec = { key: r.key, path: r.path, status: null, finalUrl: null, textLen: 0, fp: "", err: null };
  try {
    const resp = await page.goto(`${ORIGIN}${r.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    rec.status = resp?.status();
    await settle(page, { quiet: 3000, cap: 9000 });
    await page.waitForTimeout(1200);
    rec.finalUrl = page.url().replace(ORIGIN, "");
    const txt = (await page.locator("body").innerText().catch(() => ""));
    rec.textLen = txt.length;
    rec.fp = txt.replace(/\s+/g, " ").slice(0, 160);
    await page.screenshot({ path: `${EVIDENCE}/${r.key}.png` });
  } catch (e) {
    rec.err = String(e).slice(0, 200);
  } finally {
    await ctx.close();
    const v = findVideo(dir);
    if (v) fs.copyFileSync(v, `${EVIDENCE}/${r.key}.webm`);
  }
  rec.console = sink.console.filter((c) => !/cloudflareinsights|WebGL|GL Driver/.test(c.text)).slice(0, 5);
  rec.http4xx5xx = sink.http.slice(0, 5);
  results.push(rec);
  console.log(`${r.key.padEnd(26)} http=${String(rec.status).padEnd(4)} text=${String(rec.textLen).padStart(5)} -> ${rec.finalUrl} ${rec.err || ""}`);
  if (rec.http4xx5xx.length) console.log(`   http>=400: ${rec.http4xx5xx.map((x) => x.status + " " + x.url).join(" | ")}`);
}
writeJson("15-dynamic-routes.json", { capturedAt: new Date().toISOString(), results });
await browser.close();
console.log("DONE");
