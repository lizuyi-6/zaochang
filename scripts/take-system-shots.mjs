// scripts/take-system-shots.mjs
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const ARTIFACT_DIR = "C:/Users/Abraham/.gemini/antigravity/brain/1c10363c-c001-4f92-9e4d-24e39a0f16ce";
mkdirSync(ARTIFACT_DIR, { recursive: true });

const WIDTH = 1440, HEIGHT = 900;

const chrome = spawn(CHROME, [
  "--headless=new",
  "--remote-debugging-port=9225",
  `--window-size=${WIDTH},${HEIGHT}`,
  "--no-first-run",
  "--user-data-dir=" + process.env.TEMP + "/cdp-shot-profile-system",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9225/json");
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

async function capturePage(url, outPath, delay = 2500) {
  console.log(`Navigating to ${url}...`);
  await send("Page.navigate", { url });
  await sleep(delay);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(outPath, Buffer.from(shot.data, "base64"));
  console.log(`Saved screenshot: ${outPath}`);
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

  // 1. 书籍主页
  await capturePage("http://localhost:3001/bookshelf/hello-system", path.join(ARTIFACT_DIR, "shot_book_home.png"), 3000);

  // 2. 第 01 章
  await capturePage("http://localhost:3001/bookshelf/hello-system/part-1/01-why-architecture", path.join(ARTIFACT_DIR, "shot_chapter_01.png"), 3000);

  // 3. 第 56 章 全链路请求
  await capturePage("http://localhost:3001/bookshelf/hello-system/part-6/56-full-request-journey", path.join(ARTIFACT_DIR, "shot_chapter_56.png"), 3500);

  console.log("All screenshots captured successfully!");
  chrome.kill();
  process.exit(0);
} catch (error) {
  console.error("Screenshot error:", error);
  chrome.kill();
  process.exit(1);
}
