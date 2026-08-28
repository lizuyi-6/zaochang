// scripts/take-bookshelf-shot.mjs
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const ARTIFACT_DIR = "C:/Users/Abraham/.gemini/antigravity/brain/1c10363c-c001-4f92-9e4d-24e39a0f16ce";
mkdirSync(ARTIFACT_DIR, { recursive: true });

const WIDTH = 1440, HEIGHT = 900;

const chrome = spawn(CHROME, [
  "--headless=new",
  "--remote-debugging-port=9226",
  `--window-size=${WIDTH},${HEIGHT}`,
  "--no-first-run",
  "--user-data-dir=" + process.env.TEMP + "/cdp-shot-profile-shelf",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9226/json");
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

  await send("Page.navigate", { url: "http://localhost:3001/bookshelf" });
  await sleep(3000);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  const outPath = path.join(ARTIFACT_DIR, "shot_bookshelf_overview.png");
  writeFileSync(outPath, Buffer.from(shot.data, "base64"));
  console.log(`Saved screenshot: ${outPath}`);

  chrome.kill();
  process.exit(0);
} catch (error) {
  console.error("Screenshot error:", error);
  chrome.kill();
  process.exit(1);
}
