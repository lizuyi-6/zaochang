// 逐路由录像:每条路由一个独立视频(短片→我的视频解析能采到足够帧),
// 复用同一份 storageState 会话。深链(hash)导航 = 产品支持的路径,非伪造事件。
// 只读:只导航 + 截图,不点任何写操作。
import fs from "node:fs";
import {
  chromium, EVIDENCE, RUN, ORIGIN, storageStatePath,
  attachObservers, newSink, makeRecordingContext, settle, writeJson, findVideo,
} from "./common.mjs";

const browser = await chromium.launch();

// —— 先用会话只读发现真实 course uuid(白板/旅程页需要) ——
const probeCtx = await makeRecordingContext(browser, { dir: `${RUN}/.video/_probe` });
const probe = await probeCtx.newPage();
let courses = [];
try {
  const r = await probe.request.get(`${ORIGIN}/api/hyperknow/marketplace/courses`, { timeout: 30000 });
  const j = await r.json().catch(() => null);
  const list = Array.isArray(j) ? j : (j?.courses || j?.data || []);
  courses = list.map((c) => ({ uuid: c.uuid, title: c.title, owned: c.owned, lectures: c.lectureCount ?? c.lectures }));
  console.log("DISCOVERED COURSES:", JSON.stringify(courses, null, 1).slice(0, 1200));
} catch (e) {
  console.log("COURSE DISCOVERY FAILED:", String(e).slice(0, 200));
}
await probeCtx.close();

const mine = courses.find((c) => c.owned) || courses[0];
const uuid = mine?.uuid ? `?uuid=${encodeURIComponent(mine.uuid)}` : "";
console.log("using uuid param:", uuid || "(none)");

// —— 路由表(覆盖 12 条 + 关键 overlay 深链) ——
const ROUTES = [
  { key: "01-home", hash: "#/home" },
  { key: "02-courses", hash: "#/courses" },
  { key: "03-feed", hash: "#/feed" },
  { key: "04-history", hash: "#/history" },
  { key: "05-marketplace", hash: "#/marketplace" },
  { key: "06-chat", hash: "#/chat" },
  { key: "07-create", hash: "#/create" },
  { key: "08-plans", hash: "#/plans" },
  { key: "09-course-preview", hash: `#/course/preview${uuid}` },
  { key: "10-course-journey", hash: `#/course/journey${uuid}` },
  { key: "11-whiteboard", hash: "#/whiteboard" },
  { key: "12-whiteboard-practice", hash: "#/whiteboard?practice=1" },
  { key: "13-onboarding-1", hash: "#/onboarding/1" },
  { key: "14-onboarding-5", hash: "#/onboarding/5" },
  { key: "15-signin-deeplink", hash: "#/signin" },
];

const results = [];
for (const r of ROUTES) {
  const sink = newSink();
  const dir = `${RUN}/.video/${r.key}`;
  const ctx = await makeRecordingContext(browser, { dir, storageState: storageStatePath() });
  const page = await ctx.newPage();
  attachObservers(page, sink);
  const rec = { key: r.key, hash: r.hash, status: null, finalUrl: null, title: null, textLen: 0, preview: "", err: null };
  try {
    const resp = await page.goto(`${ORIGIN}/lattice/${r.hash}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    rec.status = resp?.status();
    // 停 4.5s:覆盖首屏渲染 + 懒加载 chunk + 进场动效,给视频解析足够采样帧
    await settle(page, { quiet: 3200, cap: 9000 });
    await page.waitForTimeout(1200);
    rec.finalUrl = page.url().replace(ORIGIN, "");
    rec.title = await page.title();
    const txt = (await page.locator("body").innerText().catch(() => ""));
    rec.textLen = txt.length;
    rec.preview = txt.replace(/\s+/g, " ").slice(0, 320);
    await page.screenshot({ path: `${EVIDENCE}/${r.key}.png` });
  } catch (e) {
    rec.err = String(e).slice(0, 240);
  } finally {
    await ctx.close();
    const v = findVideo(dir);
    if (v) fs.copyFileSync(v, `${EVIDENCE}/${r.key}.webm`);
    else rec.err = rec.err || "no video produced";
  }
  rec.console = sink.console.slice(0, 8);
  rec.http4xx5xx = sink.http.slice(0, 8);
  rec.failedReq = sink.failed.slice(0, 6);
  results.push(rec);
  console.log(`${r.key}  http=${rec.status}  text=${rec.textLen}  ${rec.err || ""}`);
}

writeJson("01-routes-recording.json", { capturedAt: new Date().toISOString(), courses, results });
await browser.close();
console.log("DONE");
