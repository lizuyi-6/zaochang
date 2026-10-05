// Focused rendering contracts; no browser, build output, snapshots, or extra dependencies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const spa = new URL("../hyperknow-spa/", import.meta.url);
const spaRequire = createRequire(new URL("package.json", spa));
const ts = spaRequire("typescript");
const React = spaRequire("react");
const { renderToStaticMarkup } = spaRequire("react-dom/server");
const sourceURL = new URL("src/lattice/illustrations.tsx", spa);
const source = readFileSync(sourceURL, "utf8");
const compiled = ts.transpileModule(source, {
  fileName: fileURLToPath(sourceURL),
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
  reportDiagnostics: true,
});
assert.deepEqual((compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
const fakeModule = { exports: {} };
new Function("require", "module", "exports", compiled.outputText)(
  createRequire(sourceURL), fakeModule, fakeModule.exports,
);
const art = fakeModule.exports;
const kinds = ["sociology", "bio", "ml", "ai", "history", "prompt", "psych", "sat", "philo", "stats"];
const sized = ["Logo", "Ufo", "UfoBadge", "RocketGirl", "Astronaut", "DeskWriter", "CatPerson",
  "WelcomeReader", "AwardPhone", "AwardPopper", "TrophyPerson", "SkaterKid", "Handshake",
  "PlanetDoodle", "GoogleG", "AvatarCat", "BoardPencil"];
const contracts = [
  ...sized.map(name => [name, {}]),
  ["Sparkle", { x: 10, y: 12 }],
  ["CourseCover", { kind: "bio" }],
  ["HighlightSwash", { children: "Readable label" }],
  ["MintMark", { children: "Readable label" }],
  ["BoardHighlight", { w: 120 }],
  ["BoardCircle", { w: 120, h: 50 }],
  ["BoardUnderline", { w: 120 }],
];
const render = (name, props = {}) => renderToStaticMarkup(React.createElement(art[name], props));
const svgTags = markup => [...markup.matchAll(/<svg\b[^>]*>/g)].map(m => m[0]);
function viewBoxes(markup) {
  return svgTags(markup).map(tag => {
    const match = tag.match(/\bviewBox="([^"]+)"/);
    assert.ok(match, `SVG needs a viewBox: ${tag}`);
    const box = match[1].trim().split(/[\s,]+/).map(Number);
    assert.equal(box.length, 4);
    assert.ok(box.every(Number.isFinite));
    assert.ok(box[2] > 0 && box[3] > 0);
    return box;
  });
}
function resourceIds(markup) {
  const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, "SVG resource IDs must not collide");
  for (const [, id] of markup.matchAll(/url\(#([^\s)]+)\)/g)) {
    assert.ok(ids.includes(id), `Unresolved SVG resource: ${id}`);
  }
}

// This is a structural smoke check, not a replacement for a full XML parser.
function svgBasics(xml) {
  const clean = xml.replace(/<\?xml[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "").trim();
  assert.match(clean, /^<svg\s/);
  assert.match(clean, /<\/svg>$/);
  assert.match(svgTags(clean)[0], /\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.doesNotMatch(clean, /<(?:script|foreignObject)\b|\s(?:className|strokeWidth)=|\b(?:NaN|Infinity|undefined)\b/);
  assert.doesNotMatch(clean, /&(?!#\d+;|#x[\da-f]+;|amp;|lt;|gt;|quot;|apos;)/i);
  const stack = [];
  for (const [, closing, name, attributes] of clean.matchAll(/<(\/?)([\w:-]+)\b([^<>]*)>/g)) {
    if (closing) assert.equal(stack.pop(), name, `Unbalanced XML element ${name}`);
    else if (!/\/\s*$/.test(attributes)) stack.push(name);
  }
  assert.deepEqual(stack, []);
  viewBoxes(clean);
  resourceIds(clean);
}

test("lattice-brand: illustration exports retain their public rendering contracts", () => {
  for (const [name, props] of contracts) {
    assert.equal(typeof art[name], "function", name);
    const markup = render(name, props);
    assert.ok(markup.length > 0, name);
    assert.doesNotMatch(markup, /\b(?:NaN|Infinity|undefined)\b/, name);
    viewBoxes(markup);
  }
  for (const name of ["HighlightSwash", "MintMark"]) {
    assert.match(render(name, { children: "Readable label" }), /Readable label/);
  }
  assert.notEqual(render("DeskWriter"), render("DeskWriter", { stars: false }));
  assert.notEqual(render("AvatarCat"), render("AvatarCat", { ring: true }));
  assert.match(render("Sparkle", { x: 10, y: 12, s: 4, color: "#123456" }), /fill="#123456"/);
});

test("lattice-brand: Logo renders the visible and accessible 见界 / LATTICE identity", () => {
  const markup = render("Logo");
  const visible = markup.replace(/<[^>]*>/g, "");
  assert.match(visible, /见界/);
  assert.match(visible, /LATTICE/i);
  assert.doesNotMatch(markup, /hyperknow/i);
  assert.equal(svgTags(markup).length, 1);
  assert.match(markup, /<(?:path|circle|rect|polygon)\b/);
  assert.match(markup, /(?:aria-label="[^"]*(?:见界|LATTICE)|<title>[^<]*(?:见界|LATTICE))/i);
  assert.match(svgTags(render("Logo", { size: 48 }))[0], /\bwidth="48"/);
});

for (const kind of kinds) {
  test(`lattice-brand: ${kind} cover renders vector art and honors flat/style`, () => {
    const normal = render("CourseCover", { kind });
    const flat = render("CourseCover", { kind, flat: true });
    const styled = render("CourseCover", { kind, flat: true, style: { width: 321, height: 123, borderRadius: 7 } });
    assert.equal(svgTags(normal).length, 1);
    assert.match(normal, /<(?:path|circle|rect|ellipse|polygon|line)\b/);
    assert.match(normal, /\bbackground:[^;"]+/);
    assert.match(flat, /border-radius:0(?:px)?(?:;|")/);
    assert.match(styled, /width:321px/);
    assert.match(styled, /height:123px/);
    assert.match(styled, /border-radius:7px/);
    assert.deepEqual(viewBoxes(flat), viewBoxes(normal));
    assert.deepEqual(viewBoxes(styled), viewBoxes(normal));
  });
}

test("lattice-brand: missing and unknown covers preserve the blank wrapper fallback", () => {
  for (const props of [{}, { kind: "not-a-course-kind" }]) {
    const markup = render("CourseCover", { ...props, style: { width: 88 } });
    assert.match(markup, /^<div\b/);
    assert.match(markup, /width:88px/);
    assert.equal(svgTags(markup).length, 0);
    assert.doesNotMatch(markup, /\b(?:undefined|NaN)\b/);
  }
});

test("lattice-brand: size changes preserve viewBoxes and repeated illustrations avoid SVG ID collisions", () => {
  for (const name of sized) {
    assert.deepEqual(viewBoxes(render(name, { size: 72 })), viewBoxes(render(name)), name);
  }
  const instances = [...contracts, ...kinds.map(kind => ["CourseCover", { kind }])];
  const markup = renderToStaticMarkup(React.createElement(React.Fragment, null,
    ...[0, 1].flatMap(copy => instances.map(([name, props], index) =>
      React.createElement(art[name], { ...props, key: `${copy}-${index}` }))),
  ));
  resourceIds(markup);
});

test("lattice-brand: public SVG assets retain basic standalone XML validity", () => {
  // 文件名 2026-10-05 已随旧品牌清除改名(hyperknow_* → lattice_*);内容同步受检。
  const paths = ["lattice_logo.svg", "lattice-logo-w-text.svg", "translate.svg", "avatar/1.svg",
    ...readdirSync(new URL("public/accountDropdown/", spa)).filter(name => name.endsWith(".svg")).map(name => `accountDropdown/${name}`)];
  for (const path of paths) {
    const xml = readFileSync(new URL(`public/${path}`, spa), "utf8");
    assert.doesNotThrow(() => svgBasics(xml), path);
    assert.doesNotMatch(xml.replace(/<[^>]*>/g, ""), /hyperknow/i, path);
  }
  const wordmark = readFileSync(new URL("public/lattice-logo-w-text.svg", spa), "utf8").replace(/<[^>]*>/g, "");
  assert.match(wordmark, /见界/);
  assert.match(wordmark, /LATTICE/i);
});

test("lattice-brand: document title and key localized auth branding contain no old visible brand", () => {
  const html = readFileSync(new URL("index.html", spa), "utf8");
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  assert.ok(title);
  assert.match(title, /见界/);
  assert.match(title, /LATTICE/i);
  assert.doesNotMatch(title, /hyperknow/i);
  /* 字典已按语言拆到 i18n/locales/<lang>.json(首包只载当前语言),品牌断言逐文件执行 */
  for (const localeFile of readdirSync(new URL("src/lattice/i18n/locales", spa))) {
    const strings = JSON.parse(readFileSync(new URL(`src/lattice/i18n/locales/${localeFile}`, spa), "utf8"));
    for (const key of ["welcome", "createAccountSubtitle", "termsAndPolicy"]) {
      assert.equal(typeof strings.auth?.[key], "string", `${localeFile}: ${key}`);
      assert.doesNotMatch(strings.auth[key], /hyperknow/i, `${localeFile}: ${key}`);
    }
  }
});

test("lattice-brand: no old brand token anywhere in SPA source (values, keys, literals, filenames)", () => {
  // 回归审计 R-001(2026-10-03):更名见界/LATTICE 时只改了字典值,漏了硬编码 L() 字面量
  // 与字典里的提示语文案(含指向旧域名的死邮箱)。本守卫把整类问题锁死:
  // SPA 源码任何文件不得再出现大小写敏感的 "Hyperknow"——内部标识符(hyperknow 包名、
  // /api/hyperknow/* 路径、注释)是小写,不受影响。
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = new URL(`${entry.name}`, dir.href.endsWith("/") ? dir : `${dir.href}/`);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|json|css|html)$/.test(entry.name)) {
        const text = readFileSync(full, "utf8");
        if (text.includes("Hyperknow")) offenders.push(decodeURIComponent(full.pathname));
      }
    }
  };
  walk(new URL("src/", spa));
  assert.deepEqual(offenders, [], "SPA 源码残留旧品牌字面量(用户可见文案/键名/文件名),必须改为 见界/LATTICE");
});

test("lattice-brand: seeded covers are unique per course and stable across renders", () => {
  // 唯一性:同一学科下,不同课程(种子)必须渲染出不同的封面;无种子的裸 kind 保持默认版画。
  const slug = markup => markup.replace(/\s+/g, " ");
  for (const kind of kinds) {
    const a = slug(render("CourseCover", { kind, seed: "61a8896e-a1a8-8b66-88b5-fb2c1736b9ae" }));
    const b = slug(render("CourseCover", { kind, seed: "c18a2301-3f42-4bfc-9d3b-c34b76d62ea1" }));
    const c = slug(render("CourseCover", { kind, seed: "vue-enterprise-fullstack" }));
    assert.notEqual(a, b, `${kind}: two uuid seeds must differ`);
    assert.notEqual(a, c, `${kind}: uuid vs slug seed must differ`);
    // 稳定可重放:同一种子两次渲染逐字节一致(同一课程处处同图)
    assert.equal(a, slug(render("CourseCover", { kind, seed: "61a8896e-a1a8-8b66-88b5-fb2c1736b9ae" })), `${kind}: seed render is deterministic`);
  }
  // 大样本不碰撞:40 个不同种子至少产出 12 种不同渲染(镜像×变体×点缀×星座的组合空间)
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    seen.add(slug(render("CourseCover", { kind: "prompt", seed: `course-uuid-${i}` })));
  }
  assert.ok(seen.size >= 12, `expected >=12 distinct covers, got ${seen.size}`);
});
