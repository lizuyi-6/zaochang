// 临时 CDP 截图:打开章节页 → 点开「问 AI」面板 → 截图
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://localhost:3001/bookshelf/hello-computer/part-1/01-von-neumann";
const OUT = process.argv[2] || "reading-ai-panel.png";
const WIDTH = Number(process.argv[3] || 1400), HEIGHT = Number(process.argv[4] || 900);

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=9223`, `--window-size=${WIDTH},${HEIGHT}`,
  "--no-first-run", "--user-data-dir=" + process.env.TEMP + "/cdp-shot-profile", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9223/json");
      const tabs = await res.json();
      const page = tabs.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error("chrome CDP not ready");
}

let id = 0;
const pending = new Map();
let ws;
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

async function evaluate(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error("eval failed: " + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
  return r.result?.value;
}

try {
  ws = new WebSocket(await getWsUrl());
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  // 等 dock 水合出 rail 入口(最长 30s,覆盖 Vite 首次编译)
  let clicked = null;
  for (let i = 0; i < 30 && !clicked; i++) {
    await sleep(1000);
    clicked = await evaluate(`(() => {
      const btn = document.querySelector(".reading-ai-rail") || [...document.querySelectorAll("button")].find(b => b.textContent.includes("问 AI"));
      if (!btn) return null;
      btn.click();
      return btn.className;
    })()`).catch(() => null);
  }
  if (!clicked) throw new Error("未找到问 AI 入口按钮(dock 未水合?)");
  await sleep(1500);
  const info = await evaluate(`(() => {
    const panel = document.querySelector(".reading-ai-panel");
    const toolbar = document.querySelector(".reading-ai-toolbar");
    const quick = document.querySelector(".reading-ai-quick");
    const mode = document.querySelector(".reading-ai-mode");
    const attachBtn = document.querySelector(".reading-ai-attach-btn");
    const r = (el) => el ? el.getBoundingClientRect().toJSON() : null;
    return { panelOpen: panel?.className, toolbar: r(toolbar), quickLeft: r(quick)?.left, modeLeft: r(mode)?.left,
      attachText: attachBtn?.textContent?.trim(), attachInRow: !!attachBtn?.closest(".reading-ai-ask-row") };
  })()`);
  console.log("LAYOUT:", JSON.stringify(info, null, 2));
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log("saved:", OUT);
  chrome.kill();
  process.exit(0);
} catch (error) {
  console.error(error);
  chrome.kill();
  // 失败必须以非零退出:此前 finally{exit(0)} 把"没找到入口按钮/CDP 超时"全部
  // 伪装成成功,CI 与人工都会被骗过。
  process.exit(1);
}
