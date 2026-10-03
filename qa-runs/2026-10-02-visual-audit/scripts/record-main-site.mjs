// 主站全量逐页录像:每条路由一个独立视频(短片 -> 视频解析能采到足够帧)。
// 只读:只导航 + 截图,不提交任何表单、不触发任何写操作。
import fs from "node:fs";
import {
  chromium, EVIDENCE, RUN, ORIGIN, storageStatePath,
  attachObservers, newSink, makeRecordingContext, settle, writeJson, findVideo,
} from "./common.mjs";

const ROUTES = [
  { key: "m01-home", path: "/" },
  { key: "m02-signin", path: "/signin" },
  { key: "m03-bookshelf", path: "/bookshelf" },
  { key: "m04-feed", path: "/feed" },
  { key: "m05-discover", path: "/discover" },
  { key: "m06-galaxy", path: "/galaxy" },
  { key: "m07-galaxy-products", path: "/galaxy/products" },
  { key: "m08-galaxy-company", path: "/galaxy/company" },
  { key: "m09-galaxy-incubator", path: "/galaxy/incubator" },
  { key: "m10-galaxy-apply", path: "/galaxy/apply" },
  { key: "m11-circles", path: "/circles" },
  { key: "m12-collections", path: "/collections" },
  { key: "m13-challenges", path: "/challenges" },
  { key: "m14-wallet", path: "/wallet" },
  { key: "m15-studio", path: "/studio" },
  { key: "m16-studio-new", path: "/studio/new" },
  { key: "m17-studio-docs", path: "/studio/docs" },
  { key: "m18-docs", path: "/docs" },
  { key: "m19-developers", path: "/developers" },
  { key: "m20-developers-docs", path: "/developers/docs" },
  { key: "m21-guide", path: "/guide" },
  { key: "m22-profile", path: "/profile" },
  { key: "m23-profile-edit", path: "/profile/edit" },
  { key: "m24-notifications", path: "/notifications" },
  { key: "m25-app", path: "/app" },
  { key: "m26-admin", path: "/admin" },
  { key: "m27-founder", path: "/founder" },
  { key: "m28-oauth-authorize", path: "/oauth/authorize" },
  { key: "m29-product-app-loops", path: "/product-apps/loops" },
];

const results = [];
const browser = await chromium.launch();

for (const r of ROUTES) {
  const sink = newSink();
  const dir = `${RUN}/.video/${r.key}`;
  const ctx = await makeRecordingContext(browser, { dir, storageState: storageStatePath() });
  const page = await ctx.newPage();
  attachObservers(page, sink);
  const rec = { key: r.key, path: r.path, status: null, finalUrl: null, title: null, textLen: 0, fp: "", err: null };
  try {
    const resp = await page.goto(`${ORIGIN}${r.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    rec.status = resp?.status();
    await settle(page, { quiet: 2600, cap: 7000 });
    await page.waitForTimeout(1000);
    rec.finalUrl = page.url().replace(ORIGIN, "");
    rec.title = await page.title();
    const txt = (await page.locator("body").innerText().catch(() => ""));
    rec.textLen = txt.length;
    rec.fp = txt.replace(/\s+/g, " ").slice(0, 200);
    await page.screenshot({ path: `${EVIDENCE}/${r.key}.png` });
  } catch (e) {
    rec.err = String(e).slice(0, 200);
  } finally {
    await ctx.close();
    const v = findVideo(dir);
    if (v) fs.copyFileSync(v, `${EVIDENCE}/${r.key}.webm`);
    else rec.err = rec.err || "no video";
  }
  rec.console = sink.console.filter((c) => !/cloudflareinsights/.test(c.text)).slice(0, 6);
  rec.http4xx5xx = sink.http.slice(0, 6);
  rec.failedReq = sink.failed.filter((f) => !/cloudflareinsights/.test(f.url)).slice(0, 4);
  results.push(rec);
  console.log(`${r.key.padEnd(24)} http=${String(rec.status).padEnd(4)} text=${String(rec.textLen).padStart(5)} -> ${rec.finalUrl}  ${rec.err || ""}`);
}

writeJson("11-main-site-recording.json", { capturedAt: new Date().toISOString(), viewport: "1440x900", results });
await browser.close();
console.log("DONE");
