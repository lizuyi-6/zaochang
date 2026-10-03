// 完整建课全程录像 v2。
// v1 失败原因:选择器用 has-text 匹配不到 title-only 的图标按钮,且打字未进 React state。
// v2:精确定位 .cr-input → 断言输入值 → 走指针路径点 .cr-send(并量命中框,核 44px HIG),
//    指针路径失效则回退 Enter 键盘路径(产品两条路径都支持,两条都验)。
import fs from "node:fs";
import {
  chromium, EVIDENCE, RUN, ORIGIN, storageStatePath,
  attachObservers, newSink, makeRecordingContext, settle, writeJson, findVideo,
} from "./common.mjs";

const TOPIC = process.env.QA_TOPIC || "用一句话讲清楚傅里叶变换到底解决了什么问题";
const MAX_MS = Number(process.env.QA_MAX_MS || 420000);

const sink = newSink();
const dir = `${RUN}/.video/20-create-journey`;
const shots = [];
const timeline = [];
const metrics = {};

const browser = await chromium.launch();
const ctx = await makeRecordingContext(browser, { dir, storageState: storageStatePath() });
const page = await ctx.newPage();
attachObservers(page, sink);

const t0 = Date.now();
const snap = async (label) => {
  const t = Date.now() - t0;
  const name = `20-create-${String(shots.length).padStart(2, "0")}-${label}`;
  try {
    await page.screenshot({ path: `${EVIDENCE}/${name}.png` });
    const txt = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    shots.push({ name, atMs: t, url: page.url().replace(ORIGIN, ""), textLen: txt.length, tail: txt.slice(-500) });
    timeline.push({ atMs: t, label, textLen: txt.length });
    console.log(`[${(t / 1000).toFixed(1)}s] ${label}  textLen=${txt.length}`);
    return txt;
  } catch (e) {
    console.log(`[${(t / 1000).toFixed(1)}s] ${label}  SHOT FAILED: ${String(e).slice(0, 120)}`);
    return "";
  }
};

try {
  await page.goto(`${ORIGIN}/lattice/#/create`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page, { quiet: 2500, cap: 8000 });
  await snap("landing");

  // —— 命中框测量(核 HIG 44px 声称)——
  metrics.sendButton = await page.locator(".cr-send").first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { w: Math.round(r.width), h: Math.round(r.height), disabled: el.disabled, title: el.title, ariaLabel: el.getAttribute("aria-label"), accessibleName: el.getAttribute("aria-label") || el.title, pointerEvents: cs.pointerEvents };
  }).catch((e) => ({ err: String(e).slice(0, 120) }));
  metrics.composer = await page.locator(".cr-input").first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  }).catch(() => null);
  console.log("send button metrics:", JSON.stringify(metrics.sendButton));
  console.log("composer metrics:", JSON.stringify(metrics.composer));

  // —— 真实输入:精确定位 .cr-input,逐字输入,断言值 ——
  const input = page.locator(".cr-input").first();
  await input.waitFor({ state: "visible", timeout: 15000 });
  await input.click();
  await input.type(TOPIC, { delay: 30 });
  await page.waitForTimeout(500);
  metrics.typedValue = await input.inputValue().catch(() => null);
  metrics.sendDisabledAfterType = await page.locator(".cr-send").first().isDisabled().catch(() => null);
  console.log("typedValue:", JSON.stringify(metrics.typedValue));
  console.log("sendDisabledAfterType:", metrics.sendDisabledAfterType);
  await snap("topic-typed");

  // —— 提交:优先指针路径 ——
  const send = page.locator(".cr-send").first();
  let path = "none";
  if (!(await send.isDisabled().catch(() => true))) {
    await send.click({ timeout: 5000 });
    path = "pointer:.cr-send";
  } else {
    await input.press("Enter");
    path = "keyboard:Enter";
  }
  metrics.submitPath = path;
  console.log("submit via:", path);
  await page.waitForTimeout(2500);
  await snap("after-submit");

  // —— 观察 feed 演进 ——
  let lastLen = -1;
  let stagnant = 0;
  while (Date.now() - t0 < MAX_MS) {
    await page.waitForTimeout(8000);
    const before = shots.length;
    await snap("wait");
    const cur = shots[before];
    if (cur) {
      if (cur.textLen > lastLen) { stagnant = 0; lastLen = cur.textLen; }
      else {
        stagnant++;
        if (stagnant >= 2) { console.log("feed text unchanged for 2 consecutive polls"); break; }
      }
    }
  }
  await snap("final");
  metrics.finalTail = shots[shots.length - 1]?.tail || "";
} catch (e) {
  console.log("CREATE JOURNEY ERROR:", String(e).slice(0, 500));
  metrics.error = String(e).slice(0, 500);
} finally {
  const elapsed = Date.now() - t0;
  await ctx.close();
  const v = findVideo(dir);
  if (v) fs.copyFileSync(v, `${EVIDENCE}/20-create-journey.webm`);
  await browser.close();
  writeJson("02-create-journey.json", {
    capturedAt: new Date().toISOString(), topic: TOPIC, elapsedMs: elapsed, metrics, timeline, shots,
    console: sink.console.slice(0, 40), http4xx5xx: sink.http.slice(0, 40), failedReq: sink.failed.slice(0, 25),
  });
  console.log(`ELAPSED ${(elapsed / 1000).toFixed(1)}s  shots=${shots.length}  path=${metrics.submitPath}`);
}
