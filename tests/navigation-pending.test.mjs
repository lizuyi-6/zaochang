import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import {
  HARD_NAVIGATION_FALLBACK_MS,
  NAVIGATION_START_EVENT,
  hardNavigationMode,
  installNavigationStartBroadcast,
  navigationLocationKey,
  pendingNavigationTarget,
} from "../app/lib/navigation-pending.ts";

const here = "https://aetherstudio.top/feed?tab=all#top";

test("pendingNavigationTarget only tracks same-origin navigations that leave the current path+query", () => {
  assert.equal(pendingNavigationTarget("/discover", here), "https://aetherstudio.top/discover");
  assert.equal(pendingNavigationTarget("https://aetherstudio.top/profile", here), "https://aetherstudio.top/profile");
  assert.equal(pendingNavigationTarget("/feed?tab=following", here), "https://aetherstudio.top/feed?tab=following");
  // 不会离开出发页的情形必须返回 null,否则超时兜底会把用户整页重载到同一页。
  assert.equal(pendingNavigationTarget("/feed?tab=all", here), null, "same path+query");
  assert.equal(pendingNavigationTarget("/feed?tab=all#comments", here), null, "hash-only change");
  assert.equal(pendingNavigationTarget("#comments", here), null, "relative hash-only change");
  assert.equal(pendingNavigationTarget("https://github.com/login", here), null, "cross-origin");
  assert.equal(pendingNavigationTarget("https://www.aetherstudio.top/feed", here), null, "apex/www are different origins");
  assert.equal(pendingNavigationTarget("", here), null);
  assert.equal(pendingNavigationTarget(undefined, here), null);
  assert.equal(pendingNavigationTarget(42, here), null);
  assert.equal(pendingNavigationTarget("/x", "not a url"), null, "malformed current location");
});

test("navigationLocationKey ignores the hash and fails closed on malformed input", () => {
  assert.equal(navigationLocationKey(here), "/feed?tab=all");
  assert.equal(navigationLocationKey("/a?b=1#c", "https://aetherstudio.top/"), "/a?b=1");
  assert.equal(navigationLocationKey("::bad"), null);
});

test("hard fallback never rewrites history for back/forward traversal", () => {
  assert.equal(hardNavigationMode("push"), "assign");
  assert.equal(hardNavigationMode("replace"), "replace");
  assert.equal(hardNavigationMode("traverse"), null);
  assert.equal(hardNavigationMode(undefined), null);
  assert.equal(hardNavigationMode("PUSH"), null);
  assert.ok(HARD_NAVIGATION_FALLBACK_MS >= 5_000 && HARD_NAVIGATION_FALLBACK_MS <= 10_000, "fallback window stays in a sane range");
});

function fakeWindow() {
  const calls = [];
  const events = [];
  const win = {
    __VINEXT_RSC_NAVIGATE__: function (...args) { calls.push({ self: this, args }); return "nav-result"; },
    dispatchEvent(event) { events.push(event); return true; },
  };
  return { win, calls, events, original: win.__VINEXT_RSC_NAVIGATE__ };
}

test("navigation start broadcast wraps vinext's RSC navigate without changing its behavior", async () => {
  const { win, calls, events, original } = fakeWindow();
  const uninstall = installNavigationStartBroadcast(win, (detail) => ({ detail }));
  assert.equal(typeof uninstall, "function");
  assert.notEqual(win.__VINEXT_RSC_NAVIGATE__, original);
  assert.equal(installNavigationStartBroadcast(win, (detail) => ({ detail })), null, "idempotent: no double wrap");

  // <Link>/router.push 首跳:广播 + 原样透传参数、this 与返回值
  const self = { tag: "caller" };
  assert.equal(win.__VINEXT_RSC_NAVIGATE__.call(self, "https://aetherstudio.top/feed", 0, "navigate", "push", undefined, true), "nav-result");
  assert.deepEqual(calls[0].args, ["https://aetherstudio.top/feed", 0, "navigate", "push", undefined, true]);
  assert.equal(calls[0].self, self);
  // 同步派发会让监听方的 setState 并入 <Link> 的 startTransition,跳转卡住时进度条也不渲染。
  assert.equal(events.length, 0, "broadcast must not run synchronously inside the caller's transition scope");
  await Promise.resolve();
  assert.deepEqual(events.map((event) => event.detail), [{ href: "https://aetherstudio.top/feed", navigationType: "push" }]);

  win.__VINEXT_RSC_NAVIGATE__("/a", 0, "navigate", "replace");
  win.__VINEXT_RSC_NAVIGATE__("/b");
  await Promise.resolve();
  assert.deepEqual(events.slice(1).map((event) => event.detail), [{ href: "/a", navigationType: "replace" }, { href: "/b", navigationType: "push" }]);

  // 前进后退、refresh、重定向续跳不广播,但仍透传
  win.__VINEXT_RSC_NAVIGATE__("/c", 0, "traverse");
  win.__VINEXT_RSC_NAVIGATE__("/d", 0, "refresh");
  win.__VINEXT_RSC_NAVIGATE__("/e", 1, "navigate", "push");
  await Promise.resolve();
  assert.equal(events.length, 3, "no broadcast for traverse/refresh/redirect hops");
  assert.equal(calls.length, 6, "every call still reaches vinext");

  uninstall();
  assert.equal(win.__VINEXT_RSC_NAVIGATE__, original, "uninstall restores the original");
});

test("navigation start broadcast is inert when vinext's global is absent", () => {
  const win = { dispatchEvent() { throw new Error("must not dispatch"); } };
  assert.equal(installNavigationStartBroadcast(win, () => ({})), null);
  assert.equal("__VINEXT_RSC_NAVIGATE__" in win, false);
});

test("vinext 0.0.50 still routes App Router navigations through the wrapped global", async () => {
  // 包装依赖的两处 vinext 源码;vinext 升级改了签名或调用点,这里会先挂,而不是进度条静默失效。
  const entry = await readFile(new URL("../node_modules/vinext/dist/server/app-browser-entry.js", import.meta.url), "utf8");
  assert.match(entry, /window\.__VINEXT_RSC_NAVIGATE__ = async function navigateRsc\(href, redirectDepth = 0, navigationKind = "navigate", historyUpdateMode,/);
  const navigation = await readFile(new URL("../node_modules/vinext/dist/shims/navigation.js", import.meta.url), "utf8");
  assert.match(navigation, /if \(typeof window\.__VINEXT_RSC_NAVIGATE__ === "function"\) await window\.__VINEXT_RSC_NAVIGATE__\(fullHref, 0, "navigate", mode,/);
});

test("NavigationPending is mounted outside SiteShell and never intercepts touches", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const mount = layout.indexOf("<NavigationPending />");
  assert.ok(mount > 0 && mount < layout.indexOf("<SiteShell"), "must render before/outside SiteShell (signin and galaxy bypass the shell)");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const rule = css.match(/\.navigation-pending \{[^}]*\}/)?.[0] ?? "";
  assert.match(rule, /pointer-events: none/);
  assert.match(rule, /position: fixed/);
  const component = await readFile(new URL("../app/components/navigation-pending.tsx", import.meta.url), "utf8");
  assert.match(component, /window\.addEventListener\(NAVIGATION_START_EVENT, onStart\)/);
  assert.match(component, /installNavigationStartBroadcast\(/);
  assert.match(component, /hardNavigationMode\(pending\.mode\)/);
});

test("IntentLink does not issue a duplicate prefetch for touch or pointer-focus taps", async () => {
  const source = await readFile(new URL("../app/components/intent-link.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(event\.pointerType !== "touch"\) warm\(\);/);
  assert.match(source, /if \(isKeyboardFocus\(event\.currentTarget\)\) warm\(\);/);
  assert.match(source, /element\.matches\(":focus-visible"\)/);
});

test("the production client bundle ships the navigation broadcast", async () => {
  // npm test 先 build;单独运行本文件前需 npm run build。
  const dir = new URL("../dist/client/assets/", import.meta.url);
  const files = (await readdir(dir)).filter((name) => name.endsWith(".js"));
  let found = false;
  for (const name of files) {
    const text = await readFile(new URL(name, dir), "utf8");
    if (text.includes(NAVIGATION_START_EVENT) && text.includes("__zaochangNavigationBroadcast")) { found = true; break; }
  }
  assert.ok(found, "no client chunk contains the navigation-start broadcast wrapper");
});
