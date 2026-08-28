// 用 CDP 驱动本机 Edge 无头浏览器,实测造场站内跳转的完整时间线。
// 用法: node scripts/builder/nav-timeline.mjs [起始页] [目标路径]
// 输出: 每跳转的 click→URL变化→fetch完成→DOMContentLoaded/绘制 耗时 + 关键资源瀑布。
import { spawn, execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9333;
const startUrl = process.argv[2] ?? "https://aetherstudio.top/";
const targetPath = process.argv[3] ?? "/bookshelf";
// profile 目录用本次进程 PID 命名: 既是并发防串, 也作为收尾时识别本运行 Edge 进程的标记
const PROFILE_MARKER = `edge-cdp-profile-${process.pid}`;

const browser = spawn(EDGE, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}/${PROFILE_MARKER}`,
  "--no-first-run", "--disable-gpu", "--window-size=1440,900",
  "about:blank",
], { stdio: "ignore" });

try {
  await delay(1500);

  // CDP 会话(RawWS,Node 24 自带 WebSocket)
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    else if (d.method) events.push(d);
  };
  await new Promise((r) => { ws.onopen = r; });
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
  });
  const evalPage = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
    return r.result?.result?.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");

  // 1) 打开起始页
  await send("Page.navigate", { url: startUrl });
  await delay(6000); // 等首屏资源

  // 2) 注入计时器:记录 fetch(document 型) 起止、URL 变化、下一次绘制
  await evalPage(`
    window.__nav = { fetches: [], clickAt: null, urlChangedAt: null, firstPaintAt: null, hardNav: false };
    const orig = window.fetch;
    window.fetch = function(input, init) {
      const url = typeof input === "string" ? input : input.url;
      const t0 = performance.now();
      const p = orig.apply(this, arguments);
      if (init && init.headers && (init.headers.Accept || "").includes("text/html")) {
        p.finally(() => window.__nav.fetches.push({ url, start: t0, end: performance.now() }));
      }
      return p;
    };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) { if (e.name === "first-contentful-paint") window.__nav.fcp = e.startTime; }
    }).observe({ type: "paint", buffered: true });
    const ps = history.pushState.bind(history), rs = history.replaceState.bind(history);
    history.pushState = function(...a) { window.__nav.urlChangedAt = performance.now(); return ps(...a); };
    history.replaceState = function(...a) { window.__nav.urlChangedAt = performance.now(); return rs(...a); };
    window.__nav.paintAt = null;
    (function paintProbe() { requestAnimationFrame(() => { if (window.__nav.urlChangedAt && !window.__nav.paintAt) window.__nav.paintAt = performance.now(); paintProbe(); }); })();
    "injected";
  `);

  // 3) 点击目标链接(轮询等待链接渲染,冷启动首次加载可能 >6s)
  const clicked = await evalPage(`
    (async function() {
      for (let i = 0; i < 60; i++) {
        const a = document.querySelector('a[href="${targetPath}"], a[href^="${targetPath}"]');
        if (a) { window.__nav.clickAt = performance.now(); a.click(); return "clicked:" + a.getAttribute("href"); }
        await new Promise(r => setTimeout(r, 500));
      }
      return "no-link:" + 'a[href="${targetPath}"]' + ":" + document.querySelectorAll('a[href="${targetPath}"]').length;
    })()
  `);
  console.log("click:", clicked);
  if (!clicked.startsWith("clicked")) {
    const dbg = await evalPage(`
      JSON.stringify({
        href: location.href,
        exact: document.querySelectorAll('a[href="/bookshelf"]').length,
        prefix: [...document.querySelectorAll('a')].map(a=>a.getAttribute("href")).filter(h=>h&&h.includes("bookshelf")),
        sample: [...document.querySelectorAll('a')].slice(0,5).map(a=>a.getAttribute("href")),
      })
    `);
    console.error("debug:", dbg);
    throw new Error("link not found");
  }

  // 4) 等 URL 变化 + 后续稳定
  const t0 = Date.now();
  let nav = null;
  for (let i = 0; i < 120; i++) {
    await delay(250);
    nav = await evalPage(`
      (function() {
        const n = window.__nav;
        return JSON.stringify({
          path: location.pathname,
          clickAt: n.clickAt, urlChangedAt: n.urlChangedAt, firstPaintAt: n.paintAt,
          fetches: n.fetches.length, readyState: document.readyState,
          els: document.querySelectorAll(".bookshelf-grid, .book-card, main, article").length,
        });
      })()
    `);
    const s = JSON.parse(nav);
    if (s.path === targetPath && s.urlChangedAt && s.firstPaintAt && Date.now() - t0 > 1500) break;
  }

  // 5) URL 变化时刻的采集(注入 history 补丁已晚,改用轮询差值 + fetch 记录还原)
  const detail = await evalPage(`
    (function() {
      const n = window.__nav;
      return JSON.stringify({ fetches: n.fetches, clickAt: n.clickAt }, null, 1);
    })()
  `);
  console.log("nav-detail:", detail);

  // 6) 资源瀑布:文档型 fetch + 字体 + 大 JS
  const res = await evalPage(`
    JSON.stringify(performance.getEntriesByType("resource")
      .filter(e => e.initiatorType === "fetch" || /woff2?$/.test(e.name) || /\\.js$/.test(e.name) || /\\.css$/.test(e.name))
      .map(e => ({ name: e.name.replace(location.origin, "").slice(0, 90), dur: Math.round(e.duration), size: e.transferSize, start: Math.round(e.startTime) }))
      .filter(e => /woff|^\\/$|bookshelf/.test(e.name) || e.size > 100000)
      .slice(-40))
  `);
  console.log("resources:", res);

  // 7) 页面级时间
  const timing = await evalPage(`JSON.stringify({navStart: performance.timeOrigin, domContentLoaded: (performance.getEntriesByType("navigation")[0]||{}).domContentLoadedEventEnd, fcp: window.__nav.fcp ?? null})`);
  console.log("page-timing:", timing);
} finally {
  // 任何路径(成功 / link not found / CDP 失败抛出)都必须清掉无头 Edge。
  // Windows 实测: spawn 出的 msedge.exe 只是启动器, 转眼即退(退出码 0), 真正的浏览器
  // 是它派生的独立进程 —— browser.kill() 与 taskkill /PID <spawn pid> 都杀不到, 孤儿
  // 会一直占住 9333 端口。因此按本运行独有的 PROFILE_MARKER 匹配命令行整批终止。
  try {
    execFileSync("powershell.exe", [
      "-NoProfile", "-Command",
      `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -match '${PROFILE_MARKER}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    ], { stdio: "ignore" });
  } catch { /* 清理尽力而为, 不掩盖主流程的返回码 */ }
  browser.kill();
}
// 只有主流程成功才走到这里(try 内抛错经 finally 清理后向上传播,进程以 1 退出)。
// 不在这里无条件 exit(0):Windows 管道下强制退出还会截断 stdout。
process.exit(0);
