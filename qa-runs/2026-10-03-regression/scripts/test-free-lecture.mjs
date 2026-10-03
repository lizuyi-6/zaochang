// 自由讲座端到端(新功能):#/whiteboard?topic=<主题>
// 学员命题 -> AI 实时备课 -> 直进白板。
// 这是本轮最重要的实验:
//  (a) 首次真正进入白板,关闭上一轮最大盲区
//  (b) 运行时检验 P-001 修复:plan 实际耗时 vs 旧客户端 65s / 新常量 135s
//  (c) 检验白板观感五修复(公式 KaTeX 真排版 / 图下限 / 旁白净化 / 字幕分句)
import fs from "node:fs";
import {
  chromium, EVIDENCE, RUN, ORIGIN, storageStatePath,
  attachObservers, newSink, makeRecordingContext, settle, writeJson, findVideo,
} from "./common.mjs";

const TOPIC = process.env.QA_TOPIC || "为什么说并发问题的本质是可见性,而不是加锁";
const MAX_MS = Number(process.env.QA_MAX_MS || 300000);

const sink = newSink();
const dir = `${RUN}/.video/30-free-lecture`;
const steps = [];
const net = [];
const t0 = Date.now();

const browser = await chromium.launch();
const ctx = await makeRecordingContext(browser, { dir, storageState: storageStatePath() });
const page = await ctx.newPage();
attachObservers(page, sink);

// —— 关键网络观察:plan / tts / image 的状态与耗时 ——
page.on("response", (r) => {
  const u = r.url();
  if (/\/api\/hyperknow\/(whiteboard|tts|model-check)/.test(u)) {
    const rec = { atMs: Date.now() - t0, path: u.replace(ORIGIN, ""), status: r.status(), ct: (r.headers()["content-type"] || "").slice(0, 40) };
    net.push(rec);
    console.log(`  [${(rec.atMs / 1000).toFixed(1)}s] ${rec.status} ${rec.ct} ${rec.path}`);
  }
});

const snap = async (label) => {
  const t = Date.now() - t0;
  const name = `30-free-${String(steps.length).padStart(2, "0")}-${label}`;
  await page.screenshot({ path: `${EVIDENCE}/${name}.png` }).catch(() => {});
  const txt = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  steps.push({ label, atMs: t, textLen: txt.length, tail: txt.slice(-500) });
  console.log(`[${(t / 1000).toFixed(1)}s] ${label}  textLen=${txt.length}`);
  return txt;
};

try {
  console.log("主题:", TOPIC);
  await page.goto(`${ORIGIN}/lattice/#/whiteboard?topic=${encodeURIComponent(TOPIC)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page, { quiet: 3000, cap: 9000 });
  await snap("entered");

  // 备课阶段可能长达 130s:轮询等待板书出现
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(6000);
    const before = steps.length;
    await snap("prep-" + i);
    const st = await page.evaluate(() => {
      const body = document.body.innerText || "";
      return {
        mermaid: document.querySelectorAll(".mermaid svg, pre.mermaid svg, .mermaid").length,
        katex: document.querySelectorAll(".katex, .katex-display").length,
        katexFallback: document.querySelectorAll(".katex-error").length,
        boardNodes: document.querySelectorAll("[class*=board] *").length,
        hasStart: /开始讲课|Start|播放|继续/.test(body),
        hasPrep: /备课|准备|思考|生成/.test(body),
        tail: body.replace(/\s+/g, " ").slice(-300),
      };
    }).catch(() => ({}));
    console.log(`   katex=${st.katex} mermaid=${st.mermaid} katexError=${st.katexFallback} prep=${st.hasPrep} start=${st.hasStart}`);
    steps[before].dom = st;
    if (st.katex > 0 || st.mermaid > 0) { ready = true; console.log("   >> 板书/公式已出现"); }
    if (ready && i >= 2) break;
  }

  // 若出现开始讲课控件,点它,观察授课
  const startBtn = page.locator('button:has-text("开始讲课"), button:has-text("Start"), .wb-start').first();
  if (await startBtn.count().catch(() => 0)) {
    console.log("  发现开始讲课控件,点击");
    await startBtn.click({ timeout: 5000 }).catch(() => {});
    for (let i = 0; i < 5; i++) { await page.waitForTimeout(6000); await snap("lecture-" + i); }
  } else {
    console.log("  未发现显式开始控件(可能自动播放)");
    for (let i = 0; i < 4; i++) { await page.waitForTimeout(6000); await snap("auto-" + i); }
  }
  await snap("final");
} catch (e) {
  console.log("ERROR:", String(e).slice(0, 400));
} finally {
  const elapsed = Date.now() - t0;
  await ctx.close();
  const v = findVideo(dir);
  if (v) fs.copyFileSync(v, `${EVIDENCE}/30-free-lecture.webm`);
  await browser.close();
  const plan = net.find((n) => n.path.includes("whiteboard/plan"));
  writeJson("21-free-lecture.json", {
    capturedAt: new Date().toISOString(), topic: TOPIC, elapsedMs: elapsed,
    planResponse: plan || null,
    planObservedAtMs: plan ? plan.atMs : null,
    network: net, steps,
    console: sink.console.filter((c) => !/cloudflareinsights|WebGL|GL Driver/.test(c.text)).slice(0, 25),
    http4xx5xx: sink.http.slice(0, 20), failedReq: sink.failed.slice(0, 15),
  });
  console.log(`ELAPSED ${(elapsed / 1000).toFixed(1)}s  planObservedAt=${plan ? (plan.atMs / 1000).toFixed(1) + "s" : "N/A"}`);
}
