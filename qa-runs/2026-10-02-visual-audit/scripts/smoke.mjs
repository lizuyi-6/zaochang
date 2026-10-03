// 烟测:铸票消费 → 正式会话 → 落地 /lattice/。验证整条视觉审查通道。
import fs from "node:fs";
import {
  chromium, EVIDENCE, RUN, readEnterUrl, storageStatePath,
  attachObservers, newSink, makeRecordingContext, settle, writeJson, findVideo,
} from "./common.mjs";

const enterUrl = readEnterUrl();
const sink = newSink();
const videoDir = `${RUN}/.video/00-smoke`;

const browser = await chromium.launch();
const ctx = await makeRecordingContext(browser, { dir: videoDir });
const page = await ctx.newPage();
attachObservers(page, sink);

let verdict = { ok: false, steps: [] };
try {
  const resp = await page.goto(enterUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  verdict.steps.push({ step: "consume_ticket", status: resp?.status(), landed: page.url().replace("https://aetherstudio.top", "") });
  await settle(page, { quiet: 2500, cap: 12000 });

  const finalUrl = page.url();
  const title = await page.title();
  const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 600);

  verdict.finalUrl = finalUrl;
  verdict.title = title;
  verdict.hasSessionCookie = (await ctx.cookies()).some((c) => c.name.includes("zaochang_session") || c.name.includes("session"));
  verdict.bodyPreview = bodyText;
  verdict.ok = verdict.hasSessionCookie && finalUrl.includes("/lattice");

  await page.screenshot({ path: `${EVIDENCE}/00-smoke-lattice-home.png`, fullPage: false });

  // 会话落盘,后续每条路由复用同一 storageState(不再重复铸票)
  await ctx.storageState({ path: storageStatePath() });
  console.log("SMOKE OK:", verdict.ok);
  console.log("finalUrl:", finalUrl);
  console.log("title:", title);
  console.log("sessionCookie:", verdict.hasSessionCookie);
  console.log("bodyPreview:\n" + bodyText);
} catch (e) {
  verdict.error = String(e).slice(0, 400);
  console.log("SMOKE FAILED:", verdict.error);
} finally {
  await ctx.close();
  await browser.close();
  const v = findVideo(videoDir);
  if (v) fs.copyFileSync(v, `${EVIDENCE}/00-smoke.webm`);
  writeJson("00-smoke-observers.json", { verdict, ...sink });
  console.log("console:", JSON.stringify(sink.console.slice(0, 10)));
  console.log("http>=400:", JSON.stringify(sink.http.slice(0, 10)));
}
