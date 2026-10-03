// 深度交互驱动器:多容器滚动 + 结构性安全点击 + 观察者 + 录像。
//
// 关键设计(每条都是踩过坑换来的):
//  1) 遍历「所有」可滚动容器,不是只挑面积最大的。
//     「固定页面滚动」正是这一类:页面本身不滚动(window maxScroll=0),
//     但页面里的固定区域可滚 —— 实测 /feed 的 window 不滚,而 aside.deep-sidebar
//     自己有 62px 可滚(造物挑战卡被切)。只挑最大的会整段漏掉。
//  2) 每个容器探测时打标记并按索引寻址,避免懒加载元素出现后「挑最大的」换人。
//  3) 滚动一律 behavior:'instant'。页面有 scroll-behavior:smooth 时,
//     直接赋 scrollTop 会启动动画,紧接着读回还是旧值 -> 误判「没动」而 break
//     (实测 /developers/docs 的 1174px 因此只滚了 1 步)。
//  4) 点击只打结构性控件(role=tab / details / aria-expanded / 页签 class),
//     绝按文案猜,避免误触发布/支付/上传/收藏等写操作;文案命中写操作黑名单则跳过。
import fs from "node:fs";
import {
  chromium, EVIDENCE, RUN, ORIGIN, storageStatePath,
  attachObservers, newSink, makeRecordingContext, settle, writeJson, findVideo,
} from "./common.mjs";

const STEP = 720;          // 0.8 屏
const DWELL = 850;         // 每步停留,录像可采样、懒加载有时间
const MAX_STEPS = 22;      // 单容器滚动上限
const MAX_CONTAINERS = 4; // 单页最多滚几个容器
const MAX_CLICKS = 6;

const SAFE_SELECTORS = [
  '[role="tab"]:not([disabled])',
  'details > summary',
  'button[aria-expanded]:not([disabled])',
  '.seg:not([disabled])',
  '.hm-chip:not([disabled])',
  '.wb-seg:not([disabled])',
  '[class*="tab"]:not(button[type="submit"]):not([disabled])',
];
const HARD_DENY = /提交|发布|上传|支付|打赏|删除|退出|注销|保存|确认|兑换|退款|认领|下单|购买|订阅|举报|拉黑/;

const PIN = "__qaScrollPin";

async function pinAll(page) {
  return await page.evaluate((pin) => {
    document.querySelectorAll(`[${pin}]`).forEach((e) => e.removeAttribute(pin));
    const found = [];
    const consider = (el, kind) => {
      const dh = el.scrollHeight - el.clientHeight;
      if (dh <= 12) return;
      const r = el.getBoundingClientRect();
      if (r.width < 60 || r.height < 60) return;
      el.setAttribute(pin, "1");
      found.push({
        kind, maxScroll: dh, clientH: el.clientHeight,
        w: Math.round(r.width), h: Math.round(r.height),
        cls: (el.className || "").toString().slice(0, 44),
      });
    };
    consider(document.scrollingElement || document.documentElement, "window");
    for (const el of Array.from(document.querySelectorAll("div,main,section,article,aside,ul,nav"))) {
      if (!/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) continue;
      consider(el, "inner");
    }
    return found;
  }, PIN);
}
const pinCount = (page) => page.evaluate((pin) => document.querySelectorAll(`[${pin}]`).length, PIN);

async function scrollBy(page, dy) {
  return await page.evaluate((d) => {
    const list = Array.from(document.querySelectorAll("[__qaScrollPin]"));
    // 默认滚第一个(window 通常是 index 0);内层容器由调用方指定 index
    const i = window.__qaTarget ?? 0;
    const el = list[i];
    if (!el) return { moved: false, after: 0 };
    const b = el.scrollTop;
    el.scrollTo({ top: Math.min(b + d, el.scrollHeight - el.clientHeight), behavior: "instant" });
    return { before: b, after: el.scrollTop, moved: el.scrollTop !== b };
  }, dy);
}
async function setTarget(page, i) {
  await page.evaluate((v) => { window.__qaTarget = v; }, i);
}
async function scrollToTop(page) {
  await page.evaluate(() => {
    const list = Array.from(document.querySelectorAll("[__qaScrollPin]"));
    const i = window.__qaTarget ?? 0;
    if (list[i]) list[i].scrollTo({ top: 0, behavior: "instant" });
  });
}
async function clearPins(page) {
  await page.evaluate(() => {
    document.querySelectorAll("[__qaScrollPin]").forEach((e) => e.removeAttribute("__qaScrollPin"));
    delete window.__qaTarget;
  });
}

async function walkOneContainer(page, ci, meta, shotPrefix, info) {
  await setTarget(page, ci);
  const rec = { ...meta, scrolls: 0, scrolledTo: 0, shots: [] };
  const marks = [0.3, 0.6, 0.9, 1.0];
  let step = 0;
  while (step < MAX_STEPS) {
    const r = await scrollBy(page, STEP);
    rec.scrolls++;
    rec.scrolledTo = r.after;
    if (!r.moved) break;
    await page.waitForTimeout(DWELL);
    step++;
    const frac = meta.maxScroll ? r.after / meta.maxScroll : 1;
    if (marks.length && frac >= marks[0]) {
      const f = marks.shift();
      const tag = ci === 0 ? "win" : `c${ci}`;
      const name = `${shotPrefix}-${tag}-s${Math.round(f * 100)}.png`;
      await page.screenshot({ path: `${EVIDENCE}/${name}` }).catch(() => {});
      rec.shots.push(name);
      // 滚动后仍钉在视口顶部的元素 = 粘性头
      const st = await page.evaluate(() => {
        const out = [];
        for (const sel of ["header", "nav", "[class*=topbar]", "[class*=toolbar]"]) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.height > 0 && r.width > 300 && r.top < 400 && r.bottom > 0) {
            out.push({ sel, top: Math.round(r.top), h: Math.round(r.height), pinned: r.top <= 2 && r.bottom > r.height * 0.4 });
          }
        }
        return out.slice(0, 3);
      }).catch(() => []);
      rec.shots.push(st);
    }
  }
  await scrollToTop(page);
  await page.waitForTimeout(500);
  return rec;
}

async function safeClicks(page, shotPrefix) {
  const clicks = [];
  const cands = await page.evaluate((sels) => {
    const out = [];
    const seen = new Set();
    for (const s of sels) {
      for (const el of Array.from(document.querySelectorAll(s))) {
        if (seen.has(el)) continue;
        seen.add(el);
        const t = ((el.innerText || el.getAttribute("aria-label") || el.title || "") + "").trim();
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        if (r.top < 0 || r.top > window.innerHeight - 10) continue;
        out.push({ sel: s, text: t.slice(0, 30), tag: el.tagName.toLowerCase() });
        if (out.length >= 24) return out;
      }
    }
    return out;
  }, SAFE_SELECTORS).catch(() => []);

  for (const c of cands) {
    if (clicks.length >= MAX_CLICKS) break;
    if (HARD_DENY.test(c.text)) continue;
    if (c.tag === "a" && /退出|logout/i.test(c.text)) continue;
    try {
      const before = (await page.locator("body").innerText()).length;
      await page.locator(c.sel).first().click({ timeout: 3000 });
      await page.waitForTimeout(850);
      const after = (await page.locator("body").innerText()).length;
      const n = `${shotPrefix}-click${clicks.length}.png`;
      await page.screenshot({ path: `${EVIDENCE}/${n}` }).catch(() => {});
      clicks.push({ sel: c.sel, text: c.text, before, after, changed: before !== after });
      await page.locator(c.sel).first().click({ timeout: 3000 }).catch(() => {}); // 复位
      await page.waitForTimeout(450);
    } catch (e) { /* 控件消失/被遮挡,跳过 */ }
  }
  return clicks;
}

export async function runBatch(name, pages, { authed = true, viewport = { width: 1440, height: 900 } } = {}) {
  const out = [];
  const browser = await chromium.launch();
  for (const p of pages) {
    const sink = newSink();
    const dir = `${RUN}/.video/${p.key}`;
    const ctx = await makeRecordingContext(browser, { dir, storageState: authed ? storageStatePath() : null, viewport });
    const page = await ctx.newPage();
    attachObservers(page, sink);
    const rec = { key: p.key, url: p.url, status: null, finalUrl: null, textLen: 0 };
    try {
      const resp = await page.goto(p.url, { waitUntil: "domcontentloaded", timeout: 60000 });
      rec.status = resp?.status();
      rec.finalUrl = page.url().replace(ORIGIN, "");
      await page.screenshot({ path: `${EVIDENCE}/${p.key}-top.png` }).catch(() => {});
      await settle(page, { quiet: 2200, cap: 7000 });
      await page.waitForTimeout(800);

      const conts = await pinAll(page);
      const walked = [];
      for (let i = 0; i < Math.min(conts.length, MAX_CONTAINERS); i++) {
        const n = await pinCount(page);
        if (i >= n) break;
        walked.push(await walkOneContainer(page, i, conts[i], p.key, rec));
      }
      await clearPins(page);
      rec.containers = conts;
      rec.walked = walked;
      rec.maxScrollTotal = conts.reduce((a, c) => a + c.maxScroll, 0);
      rec.walk = {
        scrolls: walked.reduce((a, w) => a + w.scrolls, 0),
        maxScroll: rec.maxScrollTotal,
        scrolledTo: walked.reduce((a, w) => a + w.scrolledTo, 0),
        containerCount: conts.length,
        innerOnly: conts.length > 0 && conts[0].maxScroll <= 12,
      };
      rec.clicks = await safeClicks(page, p.key);
      rec.textLen = (await page.locator("body").innerText().catch(() => "")).length;
    } catch (e) {
      rec.err = String(e).slice(0, 200);
    } finally {
      await ctx.close();
      const v = findVideo(dir);
      if (v) fs.copyFileSync(v, `${EVIDENCE}/${p.key}.webm`);
    }
    rec.console = sink.console.filter((c) => !/cloudflareinsights|WebGL|GL Driver/.test(c.text)).slice(0, 5);
    rec.http4xx5xx = sink.http.slice(0, 5);
    rec.failedReq = sink.failed.filter((f) => !/cloudflareinsights/.test(f.url)).slice(0, 4);
    out.push(rec);
    const w = rec.walk || {};
    console.log(
      `${p.key.padEnd(26)} ${String(rec.status).padEnd(4)} 容器${String(w.containerCount ?? 0).padStart(2)} 滚动${String(w.scrolls ?? 0).padStart(2)}步/${String(w.maxScroll ?? 0).padStart(5)}px` +
      (w.innerOnly ? " [仅内层可滚]" : "") + ` 点击${(rec.clicks || []).length} txt=${rec.textLen} ${rec.err || ""}`
    );
  }
  await browser.close();
  writeJson(`${name}.json`, { capturedAt: new Date().toISOString(), out });
  return out;
}
