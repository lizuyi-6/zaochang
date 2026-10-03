// 「问 AI」功能测试:走真实用户路径(章节页 -> 点入口 -> 输入 -> 发送 -> 观察 SSE)。
// 这是全站唯一需要真实上游 AI 的读书功能,只问一个问题(有速率限制且成本真实)。
import fs from "node:fs";
import {
  chromium, EVIDENCE, RUN, ORIGIN, storageStatePath,
  attachObservers, newSink, makeRecordingContext, settle, writeJson, findVideo,
} from "./common.mjs";

const CHAPTER = "/bookshelf/hello-system/part-1/01-why-architecture-matters";
const QUESTION = "这一章为什么把「架构」放在可变性和数据之前？用两句话回答。";

const sink = newSink();
const dir = `${RUN}/.video/d19-reading-ai`;
const steps = [];
const t0 = Date.now();
const snap = async (label) => {
  const t = Date.now() - t0;
  const name = `d19-ai-${String(steps.length).padStart(2, "0")}-${label}`;
  await page.screenshot({ path: `${EVIDENCE}/${name}.png` }).catch(() => {});
  const txt = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  steps.push({ label, atMs: t, textLen: txt.length, aiPanelTail: txt.slice(-600) });
  console.log(`[${(t / 1000).toFixed(1)}s] ${label}  textLen=${txt.length}`);
  return txt;
};

const browser = await chromium.launch();
const ctx = await makeRecordingContext(browser, { dir, storageState: storageStatePath() });
const page = await ctx.newPage();
attachObservers(page, sink);

// 记录 /api/ai/reading 的响应细节
let aiResp = null;
page.on("response", async (r) => {
  if (r.url().includes("/api/ai/reading")) {
    aiResp = { status: r.status(), ct: r.headers()["content-type"] || "", atMs: Date.now() - t0 };
    console.log(`  >> /api/ai/reading -> ${aiResp.status} ${aiResp.ct} @${(aiResp.atMs / 1000).toFixed(1)}s`);
  }
});

try {
  await page.goto(`${ORIGIN}${CHAPTER}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle(page, { quiet: 3000, cap: 9000 });
  await snap("chapter-loaded");

  // 入口:1440px 视口下优先右栏按钮,回退竖排 rail,再回退胶囊
  const entries = [".book-aside-ai", ".reading-ai-rail", ".reading-ai-pill"];
  let opened = null;
  for (const sel of entries) {
    const loc = page.locator(sel).first();
    if (await loc.count().catch(() => 0)) {
      const vis = await loc.isVisible().catch(() => false);
      if (vis) { await loc.click({ timeout: 5000 }); opened = sel; break; }
    }
  }
  console.log("  入口:", opened || "未找到可见入口");
  await page.waitForTimeout(1200);
  await snap("panel-opened");

  if (opened) {
    const box = page.locator(".reading-ai-panel textarea, .reading-ai-panel input[type=text]").first();
    if (await box.count().catch(() => 0)) {
      await box.click();
      await box.type(QUESTION, { delay: 25 });
      await page.waitForTimeout(400);
      await snap("question-typed");
      // 发送:优先 form 提交,回退按钮
      let sent = false;
      const cands = [".reading-ai-panel button[type=submit]", ".reading-ai-send", ".reading-ai-panel form button"];
      for (const s of cands) {
        const b = page.locator(s).first();
        if (await b.count().catch(() => 0)) {
          try { if (!(await b.isDisabled())) { await b.click({ timeout: 4000 }); sent = true; console.log("  发送点击:", s); break; } } catch {}
        }
      }
      if (!sent) { await box.press("Enter"); sent = true; console.log("  发送: Enter"); }
      // 观察流式输出
      for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(4000);
        const before = steps.length;
        await snap("stream-" + i);
        if (steps[before] && steps[before].textLen === steps[before - 1]?.textLen && i >= 2) { console.log("  输出停止增长"); break; }
      }
      await snap("final");
    } else {
      console.log("  !! 面板内未找到输入框");
    }
  }
} catch (e) {
  console.log("READING AI ERROR:", String(e).slice(0, 400));
} finally {
  await ctx.close();
  const v = findVideo(dir);
  if (v) fs.copyFileSync(v, `${EVIDENCE}/d19-reading-ai.webm`);
  await browser.close();
  writeJson("16-reading-ai.json", {
    capturedAt: new Date().toISOString(), chapter: CHAPTER, question: QUESTION,
    aiResponse: aiResp, steps,
    console: sink.console.filter((c) => !/cloudflareinsights/.test(c.text)).slice(0, 20),
    http4xx5xx: sink.http.slice(0, 20), failedReq: sink.failed.slice(0, 10),
  });
  console.log("DONE");
}
