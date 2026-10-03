// 自由讲座 · 第二段:越过「How would you like to talk」门禁,真正进入讲课,
// 关闭上一轮「白板授课播放零执行证据」的最大盲区。
import fs from "node:fs";
import {
  chromium, EVIDENCE, RUN, ORIGIN, storageStatePath,
  attachObservers, newSink, makeRecordingContext, settle, writeJson, findVideo,
} from "./common.mjs";

const TOPIC = process.env.QA_TOPIC || "为什么说并发问题的本质是可见性,而不是加锁";
const MAX_MS = Number(process.env.QA_MAX_MS || 420000);

const sink = newSink();
const dir = `${RUN}/.video/31-free-lecture-play`;
const steps = [];
const net = [];
const t0 = Date.now();

const browser = await chromium.launch();
const ctx = await makeRecordingContext(browser, { dir, storageState: storageStatePath() });
const page = await ctx.newPage();
attachObservers(page, sink);

page.on("response", (r) => {
  const u = r.url();
  if (/\/api\/hyperknow\/(whiteboard|tts|model-check)/.test(u)) {
    const rec = { atMs: Date.now() - t0, path: u.replace(ORIGIN, "").slice(0, 70), status: r.status(), ct: (r.headers()["content-type"] || "").slice(0, 30) };
    net.push(rec);
    console.log(`  [${(rec.atMs / 1000).toFixed(1)}s] ${rec.status} ${rec.ct} ${rec.path}`);
  }
});

const snap = async (label) => {
  const t = Date.now() - t0;
  const name = `31-play-${String(steps.length).padStart(2, "0")}-${label}`;
  await page.screenshot({ path: `${EVIDENCE}/${name}.png` }).catch(() => {});
  const txt = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  steps.push({ label, atMs: t, textLen: txt.length, tail: txt.slice(-400) });
  console.log(`[${(t / 1000).toFixed(1)}s] ${label}  textLen=${txt.length}`);
  return txt;
};
const dom = () => page.evaluate(() => ({
  katex: document.querySelectorAll(".katex, .katex-display").length,
  katexErr: document.querySelectorAll(".katex-error").length,
  mermaid: document.querySelectorAll(".mermaid svg, pre.mermaid svg").length,
  board: document.querySelectorAll("[class*=wb-board] *, [class*=board] *").length,
  captions: document.querySelectorAll("[class*=caption], [class*=subtitle], [class*=narration]").length,
  // 中文句中是否出现孤立「 或缺 」 —— 本轮重点
  body: (document.body.innerText || "").replace(/\s+/g, " "),
})).catch(() => ({}));

try {
  await page.goto(`${ORIGIN}/lattice/#/whiteboard?topic=${encodeURIComponent(TOPIC)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page, { quiet: 3000, cap: 9000 });

  // 等备课完成(按钮不再是 Preparing)
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(6000);
    const st = await dom();
    const preparing = /Preparing this lecture|正在准备本讲板书/.test(st.body || "");
    if (i % 3 === 0 || !preparing) console.log(`   [${((Date.now() - t0) / 1000).toFixed(0)}s] preparing=${preparing} katex=${st.katex} mermaid=${st.mermaid}`);
    if (!preparing && i >= 1) break;
  }
  await snap("ready");

  // 点开始
  const cta = page.locator(".wb-intro-cta, button:has-text('Start learning'), button:has-text('开始讲课')").first();
  if (await cta.count().catch(() => 0)) { await cta.click({ timeout: 5000 }).catch(() => {}); console.log("  已点 intro CTA"); }
  await page.waitForTimeout(2500);

  // 选交互模式
  const mode = page.locator("text=/Voice and typing|仅语音|语音和打字/").first();
  if (await mode.count().catch(() => 0)) { await mode.click({ timeout: 5000 }).catch(() => {}); console.log("  已选 Voice and typing"); }
  else console.log("  未找到模式选项(可能无门禁)");
  await page.waitForTimeout(800);
  await snap("mode-chosen");

  // Start learning(此刻应从 disabled 变可用)
  const start = page.locator("button:has-text('Start learning'), button:has-text('开始学习'), button:has-text('开始讲课')").first();
  const dis = await start.isDisabled().catch(() => null);
  console.log("  Start learning disabled?", dis);
  if (dis === false) { await start.click({ timeout: 5000 }).catch(() => {}); console.log("  已点击 Start learning"); }
  else console.log("  Start learning 仍不可点,尝试 Enter/找其他按钮");
  await page.waitForTimeout(4000);
  await snap("lecture-begin");

  // 观察讲课:每 8s 采样,重点看 公式/图/字幕/板书
  for (let i = 0; i < 10 && Date.now() - t0 < MAX_MS; i++) {
    await page.waitForTimeout(8000);
    const before = steps.length;
    await snap("play-" + i);
    const st = await dom();
    steps[before].dom = { katex: st.katex, katexErr: st.katexErr, mermaid: st.mermaid, board: st.board, captions: st.captions };
    console.log(`   katex=${st.katex}(err ${st.katexErr}) mermaid=${st.mermaid} board=${st.board} captions=${st.captions}`);
    if (st.board > 20) break;
  }
  const last = await dom();
  await snap("final");
  writeJson("22-lecture-play.json", {
    capturedAt: new Date().toISOString(), topic: TOPIC, elapsedMs: Date.now() - t0,
    finalDom: { katex: last.katex, katexErr: last.katexErr, mermaid: last.mermaid, board: last.board, captions: last.captions },
    finalBodyText: (last.body || "").slice(-1200),
    network: net, steps,
    console: sink.console.filter((c) => !/cloudflareinsights|WebGL|GL Driver/.test(c.text)).slice(0, 25),
    http4xx5xx: sink.http.slice(0, 20),
  });
} catch (e) {
  console.log("ERROR:", String(e).slice(0, 400));
  writeJson("22-lecture-play.json", { error: String(e).slice(0, 400), network: net, steps });
} finally {
  await ctx.close();
  const v = findVideo(dir);
  if (v) fs.copyFileSync(v, `${EVIDENCE}/31-free-lecture-play.webm`);
  await browser.close();
  console.log(`ELAPSED ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
