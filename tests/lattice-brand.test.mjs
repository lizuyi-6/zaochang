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
const sourceURL = new URL("src/replica/illustrations.tsx", spa);
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
  // Preserve compatibility filenames; only branding content is expected to change.
  const paths = ["hyperknow_logo.svg", "hyperknow-logo-w-text.svg", "translate.svg", "avatar/1.svg",
    ...readdirSync(new URL("public/accountDropdown/", spa)).filter(name => name.endsWith(".svg")).map(name => `accountDropdown/${name}`)];
  for (const path of paths) {
    const xml = readFileSync(new URL(`public/${path}`, spa), "utf8");
    assert.doesNotThrow(() => svgBasics(xml), path);
    assert.doesNotMatch(xml.replace(/<[^>]*>/g, ""), /hyperknow/i, path);
  }
  const wordmark = readFileSync(new URL("public/hyperknow-logo-w-text.svg", spa), "utf8").replace(/<[^>]*>/g, "");
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
  const locales = JSON.parse(readFileSync(new URL("src/replica/i18n/locales.json", spa), "utf8"));
  for (const [locale, strings] of Object.entries(locales)) {
    for (const key of ["welcomeToHyperknow", "createAccountSubtitle", "termsAndPolicy"]) {
      assert.equal(typeof strings.auth?.[key], "string", `${locale}: ${key}`);
      assert.doesNotMatch(strings.auth[key], /hyperknow/i, `${locale}: ${key}`);
    }
  }
});
