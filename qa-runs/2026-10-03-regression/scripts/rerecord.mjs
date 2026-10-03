// 上线后重录:今天改动最重的几个面。每条路由一个短视频。
import fs from "node:fs";
import {
  chromium, EVIDENCE, RUN, ORIGIN, storageStatePath,
  attachObservers, newSink, makeRecordingContext, settle, writeJson, findVideo,
} from "./common.mjs";

const ROUTES = [
  { key: "r01-lattice-home", url: `${ORIGIN}/lattice/#/home` },
  { key: "r02-lattice-create", url: `${ORIGIN}/lattice/#/create` },
  { key: "r03-lattice-feed", url: `${ORIGIN}/lattice/#/feed` },
  { key: "r04-lattice-plans", url: `${ORIGIN}/lattice/#/plans` },
  { key: "r05-whiteboard-intro", url: `${ORIGIN}/lattice/#/whiteboard` },
  { key: "r06-main-home", url: `${ORIGIN}/` },
  { key: "r07-main-book", url: `${ORIGIN}/bookshelf/hello-system` },
  { key: "r08-main-chapter", url: `${ORIGIN}/bookshelf/hello-system/part-1/01-why-architecture-matters` },
  { key: "r09-main-devdocs", url: `${ORIGIN}/developers/docs` },
  { key: "r10-main-galaxy", url: `${ORIGIN}/galaxy` },
  { key: "r11-main-discover", url: `${ORIGIN}/discover` },
  { key: "r12-main-product", url: `${ORIGIN}/product/loops` },
];

const results = [];
const browser = await chromium.launch();
for (const r of ROUTES) {
  const sink = newSink();
  const dir = `${RUN}/.video/${r.key}`;
  const ctx = await makeRecordingContext(browser, { dir, storageState: storageStatePath() });
  const page = await ctx.newPage();
  attachObservers(page, sink);
  const rec = { key: r.key, url: r.url.replace(ORIGIN, ""), status: null, finalUrl: null, textLen: 0, err: null };
  try {
    const resp = await page.goto(r.url, { waitUntil: "domcontentloaded", timeout: 60000 });
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
  console.log(`${r.key.padEnd(24)} http=${String(rec.status).padEnd(4)} text=${String(rec.textLen).padStart(5)} -> ${rec.finalUrl} ${rec.err || ""}`);
  if (rec.http4xx5xx.length) console.log(`   >=400: ${rec.http4xx5xx.map((x) => x.status + " " + x.url).join(" | ")}`);
}
writeJson("23-rerecord.json", { capturedAt: new Date().toISOString(), results });
await browser.close();
console.log("DONE");
