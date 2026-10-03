// 登出态录像:匿名身份下录关键页(登录页 + 个人面登出态)。
// 登录态录像里 /signin 被重定向到 /,登录页视觉没被覆盖,这里补上。
import fs from "node:fs";
import {
  chromium, EVIDENCE, RUN, ORIGIN,
  attachObservers, newSink, makeRecordingContext, settle, writeJson, findVideo,
} from "./common.mjs";

const ROUTES = [
  { key: "a01-signin-anon", path: "/signin" },
  { key: "a02-home-anon", path: "/" },
  { key: "a03-wallet-anon", path: "/wallet" },
  { key: "a04-profile-anon", path: "/profile" },
  { key: "a05-notifications-anon", path: "/notifications" },
  { key: "a06-studio-anon", path: "/studio" },
  { key: "a07-lattice-gate-anon", path: "/lattice/" },
  { key: "a08-profile-edit-anon", path: "/profile/edit" },
  { key: "a09-discover-anon", path: "/discover" },
  { key: "a10-bookshelf-anon", path: "/bookshelf" },
];

const results = [];
const browser = await chromium.launch();
for (const r of ROUTES) {
  const sink = newSink();
  const dir = `${RUN}/.video/${r.key}`;
  // 不传 storageState => 全新无 cookie 上下文 = 真登出
  const ctx = await makeRecordingContext(browser, { dir });
  const page = await ctx.newPage();
  attachObservers(page, sink);
  const rec = { key: r.key, path: r.path, status: null, finalUrl: null, title: null, textLen: 0, fp: "", err: null };
  try {
    const resp = await page.goto(`${ORIGIN}${r.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    rec.status = resp?.status();
    await settle(page, { quiet: 2600, cap: 7000 });
    await page.waitForTimeout(1000);
    rec.finalUrl = page.url().replace(ORIGIN, "");
    rec.title = await page.title();
    const txt = (await page.locator("body").innerText().catch(() => ""));
    rec.textLen = txt.length;
    rec.fp = txt.replace(/\s+/g, " ").slice(0, 200);
    // 顺带量写操作按钮的可用态(登出态不该能点)
    rec.actionState = await page.evaluate(() => {
      const out = [];
      for (const el of Array.from(document.querySelectorAll("button, a[href]"))) {
        const t = (el.innerText || "").trim();
        if (!t || t.length > 24) continue;
        if (!/(已读|发布|提交|保存|删除|支付|打赏|创建|确定|认领|兑换|标记)/.test(t)) continue;
        out.push({ text: t.slice(0, 16), tag: el.tagName.toLowerCase(), disabled: el.disabled === true, href: (el.getAttribute("href") || "").slice(0, 40) });
      }
      return out.slice(0, 12);
    });
    await page.screenshot({ path: `${EVIDENCE}/${r.key}.png` });
  } catch (e) {
    rec.err = String(e).slice(0, 200);
  } finally {
    await ctx.close();
    const v = findVideo(dir);
    if (v) fs.copyFileSync(v, `${EVIDENCE}/${r.key}.webm`);
  }
  rec.console = sink.console.filter((c) => !/cloudflareinsights/.test(c.text)).slice(0, 5);
  rec.http4xx5xx = sink.http.slice(0, 5);
  results.push(rec);
  console.log(`${r.key.padEnd(26)} http=${String(rec.status).padEnd(4)} text=${String(rec.textLen).padStart(5)} -> ${rec.finalUrl}`);
  if (rec.actionState?.length) console.log(`   actions: ${rec.actionState.map((a) => `${a.text}[${a.disabled ? "disabled" : "enabled"}${a.href ? " " + a.href : ""}]`).join(" ")}`);
}
writeJson("13-anon-recording.json", { capturedAt: new Date().toISOString(), results });
await browser.close();
console.log("DONE");
