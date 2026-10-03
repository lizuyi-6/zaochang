// 视觉审查共用装置:全局 Playwright + 证据目录 + 观察者。
// 只读:只导航与截图,不触发任何写操作。
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
export const { chromium } = require(
  "C:/Users/Abraham/AppData/Roaming/npm/node_modules/playwright"
);

export const RUN = "X:/zaochang/qa-runs/2026-10-02-visual-audit";
export const EVIDENCE = `${RUN}/evidence`;
export const VIDEO_ROOT = `${RUN}/.video`;
export const SECRET = `${RUN}/.secret`;
export const ORIGIN = "https://aetherstudio.top";

export const VIEWPORT = { width: 1440, height: 900 };

fs.mkdirSync(EVIDENCE, { recursive: true });
fs.mkdirSync(VIDEO_ROOT, { recursive: true });
fs.mkdirSync(SECRET, { recursive: true });

export function readEnterUrl() {
  return fs.readFileSync(`${SECRET}/enter.url`, "utf8").trim();
}

export function storageStatePath() {
  return `${SECRET}/storage.json`;
}

export function hasStorage() {
  return fs.existsSync(storageStatePath());
}

// 观察者:控制台错误 + 失败请求。只留元数据,不留 body/cookie/token。
export function attachObservers(page, sink) {
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      sink.console.push({ type: m.type(), text: m.text().slice(0, 300) });
    }
  });
  page.on("pageerror", (e) => {
    sink.console.push({ type: "pageerror", text: String(e).slice(0, 300) });
  });
  page.on("requestfailed", (r) => {
    sink.failed.push({
      method: r.method(),
      url: r.url().replace(ORIGIN, "").slice(0, 160),
      err: (r.failure()?.errorText || "").slice(0, 120),
    });
  });
  page.on("response", (r) => {
    if (r.status() >= 400) {
      sink.http.push({
        status: r.status(),
        url: r.url().replace(ORIGIN, "").slice(0, 160),
      });
    }
  });
}

export function newSink() {
  return { console: [], failed: [], http: [] };
}

// 视频:Playwright 每个 page 产一个 webm,ctx.close() 后才落盘。
export async function makeRecordingContext(browser, { dir, storageState, viewport = VIEWPORT }) {
  fs.mkdirSync(dir, { recursive: true });
  const opts = {
    viewport,
    recordVideo: { dir, size: viewport },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    colorScheme: "light",
  };
  if (storageState && fs.existsSync(storageState)) opts.storageState = storageState;
  return browser.newContext(opts);
}

// 收敛:等网络与渲染安静下来,但设上限,不无限等。
export async function settle(page, { quiet = 1200, cap = 8000 } = {}) {
  const deadline = Date.now() + cap;
  try {
    await page.waitForLoadState("networkidle", { timeout: quiet });
  } catch {
    /* networkidle 达不到是常态(轮询/SSE),不是缺陷信号 */
  }
  await page.waitForTimeout(quiet);
  if (Date.now() > deadline) return;
}

export function writeJson(name, obj) {
  const p = path.join(EVIDENCE, name);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
  return p;
}

export function findVideo(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".webm"))
    .map((f) => path.join(dir, f));
  if (!files.length) return null;
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0];
}
