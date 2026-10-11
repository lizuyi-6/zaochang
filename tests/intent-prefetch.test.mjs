import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { INTENT_PREFETCH_PATHS, intentPrefetchPath } from "../app/lib/intent-prefetch.ts";

test("intent prefetch allowlist warms only public, member-independent static routes", () => {
  for (const href of ["/", "/discover", "/feed", "/circles", "/challenges", "/guide", "/galaxy"]) {
    assert.equal(intentPrefetchPath(href), href, href);
  }
  // hash is dropped (the navigation RSC request never carries it)
  assert.equal(intentPrefetchPath("/circles#ai-tools"), "/circles");
  assert.equal(intentPrefetchPath("/guide#covenant"), "/guide");
});

test("intent prefetch never warms per-user, privileged, or [param] routes", () => {
  const denied = [
    "/wallet", "/admin", "/founder", "/notifications", "/profile", "/profile/edit",
    "/collections", "/studio", "/studio/new", "/bookshelf", "/docs", "/developers",
    "/product/some-slug", "/product/abc#x", "/bookshelf/book/chapter", "/wallet#top",
    "/discover?q=x", "/discover/", "//evil.example/discover", "https://aetherstudio.top/discover",
    "/lattice/", "", undefined, null, { pathname: "/discover" },
  ];
  for (const href of denied) assert.equal(intentPrefetchPath(href), null, String(href));
  for (const path of INTENT_PREFETCH_PATHS) {
    assert.ok(!/\[|:|\?|#/.test(path), `allowlist entry must be a plain static path: ${path}`);
    assert.ok(!/^\/(wallet|admin|founder|notifications|profile|collections|studio|bookshelf|docs|developers|product)(\/|$)/.test(path), path);
  }
});

test("IntentLink routes every router.prefetch through the allowlist", async () => {
  const source = await readFile(new URL("../app/components/intent-link.tsx", import.meta.url), "utf8");
  assert.match(source, /const path = intentPrefetchPath\(props\.href\);/);
  assert.match(source, /if \(path !== null\) router\.prefetch\(path\);/);
  assert.equal((source.match(/router\.prefetch\(/g) ?? []).length, 1, "only the guarded prefetch call may exist");
  assert.match(source, /prefetch=\{false\}/, "vinext viewport/hover auto-prefetch must stay disabled");
});
