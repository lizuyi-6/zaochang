// 银河·孵化·发布入口:自 tests/rendered-html.test.mjs 保序拆分(测试体逐字未改)。
// 执行顺序由 tests/rendered-html.test.mjs 的注册顺序保证。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GALAXIES, PLANETS, PLANETS_BY_GALAXY } from "../../app/galaxy/cosmic-atlas.ts";
import { GALAXY_BUSINESS, GALAXY_PRODUCTS, PRODUCT_BY_PLANET } from "../../app/galaxy/product-galaxy.ts";
import {
  baseUrl,
  runId,
  projectRoot,
  authHeaders,
} from "../harness/preview.mjs";

export function register() {
test("uses the galaxy palette only for official product pages", async () => {
  const [officialResponse, communityResponse] = await Promise.all([
    fetch(`${baseUrl}/product/typewave`, { headers: { accept: "text/html" } }),
    fetch(`${baseUrl}/product/mori`, { headers: { accept: "text/html" } }),
  ]);
  assert.equal(officialResponse.status, 200);
  assert.equal(communityResponse.status, 200);
  const officialHtml = await officialResponse.text();
  const communityHtml = await communityResponse.text();
  assert.match(officialHtml, /class="product-detail-page official-product-page"/);
  assert.match(officialHtml, /class="deep-shell official-product-shell"/);
  assert.match(officialHtml, /class="official-entry-transition"/);
  assert.match(officialHtml, /造场官方项目/);
  assert.match(officialHtml, /PRODUCT GALAXY \/ OFFICIAL/);
  assert.doesNotMatch(communityHtml, /official-product-page/);
  assert.doesNotMatch(communityHtml, /official-product-shell|official-entry-transition|造场官方项目|PRODUCT GALAXY \/ OFFICIAL/);
});

test("renders the singularity atlas and its original planetary archive", async () => {
  const response = await fetch(`${baseUrl}/galaxy`, {
    headers: { accept: "text/html" },
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /我们在奇点之外，为尚未诞生的世界命名/);
  assert.match(html, /BEYOND THE HORIZON/);
  assert.match(html, /所有光都曾独自出发/);
  assert.match(html, /第一位见证者没有名字/);
  assert.match(html, /源光/);
  assert.match(html, /忆潮/);
  assert.match(html, /镜梦/);
  assert.match(html, /未至/);
  assert.match(html, /12 颗可观测行星/);
});

test("cosmic atlas keeps four galaxies with three unique stories each", () => {
  assert.equal(GALAXIES.length, 4);
  assert.equal(PLANETS.length, 12);
  for (const galaxy of GALAXIES) assert.equal(PLANETS_BY_GALAXY[galaxy.id].length, 3);
  assert.equal(new Set(PLANETS.map((planet) => planet.id)).size, 12);
  assert.equal(new Set(PLANETS.map((planet) => planet.title)).size, 12);
  assert.equal(new Set(PLANETS.map((planet) => planet.archiveTitle)).size, 12);
  assert.equal(PLANETS.every((planet) => planet.archive.length === 2 && planet.archive.every((paragraph) => paragraph.length >= 45)), true);
});

test("product galaxy maps every planet to a real product and business sector", () => {
  assert.equal(Object.keys(GALAXY_BUSINESS).length, 4);
  assert.equal(GALAXY_PRODUCTS.length, 12);
  assert.equal(new Set(GALAXY_PRODUCTS.map((product) => product.name)).size, 12);
  assert.equal(GALAXY_PRODUCTS.every((product) => PRODUCT_BY_PLANET[product.planetId] === product), true);
  assert.equal(GALAXY_PRODUCTS.every((product) => product.status.length > 0 && product.capabilities.length === 3), true);
});

test("incubation console distinguishes signed-out access from an empty signed-in account", async () => {
  const anonymous = await fetch(`${baseUrl}/galaxy/incubator`, { headers: { accept: "text/html" } });
  assert.equal(anonymous.status, 200);
  const anonymousHtml = await anonymous.text();
  assert.match(anonymousHtml, /<h1>项目孵化控制台<\/h1>/);
  assert.match(anonymousHtml, /登录后查看项目孵化进度/);
  assert.doesNotMatch(anonymousHtml, /当前账号还没有孵化项目/);

  const member = await fetch(`${baseUrl}/galaxy/incubator`, {
    headers: { ...authHeaders("空轨道成员", `empty-incubator-${runId}@example.com`), accept: "text/html" },
  });
  assert.equal(member.status, 200);
  const memberHtml = await member.text();
  assert.match(memberHtml, /<h1>项目孵化控制台<\/h1>/);
  assert.match(memberHtml, /当前账号还没有孵化项目/);
  assert.doesNotMatch(memberHtml, /登录后查看项目孵化进度/);
});

test("product creation keeps navigation and submission as distinct controls", () => {
  const source = readFileSync(join(projectRoot, "app", "studio", "new", "create-product-flow.tsx"), "utf8");
  assert.match(source, /key="next-step" type="button"/);
  assert.match(source, /key="submit-product" type="submit"/);
});

test("rejects anonymous product publishing", async () => {
  const response = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "匿名作品" }),
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "auth_required" });
});
}
