import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import test from "node:test";
import { BUNDLE_ERROR_CODES, inspectBundleZip, loadDefaultRules } from "../app/api/_lib/hosting-bundle.ts";
import { buildZip, entry } from "./helpers/zip-builder.mjs";

const MiB = 1024 * 1024;
const rules = loadDefaultRules();

function typicalEntries() {
  return [
    entry("index.html", { data: Buffer.from("<h1>ok</h1>") }),
    entry("assets/", { data: Buffer.alloc(0) }),
    entry("assets/site.css", { method: 8, data: Buffer.from("body{}") }),
    entry("数据/图标.svg", { method: 8, data: Buffer.from("<svg/>") }),
    entry("app.wasm", { data: Buffer.from([0, 97, 115, 109]) }),
    entry("page.config.json", { data: Buffer.from("{}") }),
    entry("app.js", { flags: 0x0808, localCompressedSize: 0, localUncompressedSize: 0, localCrc32: 0, method: 8, data: Buffer.from("console.log(1)") }),
    entry("x.php.txt", { data: Buffer.from("safe") }),
  ];
}

function makeValidSite() {
  return buildZip(typicalEntries(), { fakeEocdInComment: true });
}

function declaredEntry(name, uncompressedSize, compressedSize, overrides = {}) {
  return entry(name, {
    method: 8,
    data: Buffer.alloc(0),
    compressedData: Buffer.alloc(compressedSize, 0x5a),
    compressedSize,
    uncompressedSize,
    crc32: 0,
    ...overrides,
  });
}

function makeTotalLimitArchive(totalBytes) {
  const sizes = [10 * MiB, 10 * MiB, totalBytes - (20 * MiB)];
  return buildZip([
    declaredEntry("index.html", sizes[0], 1),
    declaredEntry("a.js", sizes[1], 1),
    declaredEntry("b.css", sizes[2], 1),
  ]);
}

function make500EntryArchive(count = 500) {
  const entries = [entry("index.html", { data: Buffer.alloc(0) })];
  for (let index = 1; index < count; index += 1) {
    entries.push(entry(`dir-${String(index).padStart(3, "0")}/`, { data: Buffer.alloc(0) }));
  }
  return buildZip(entries);
}

function makeExactZipLimitArchive() {
  const empty = buildZip([entry("index.html", { data: Buffer.alloc(0) })]);
  const payloadSize = rules.bundle.maxZipBytes - empty.length;
  return buildZip([entry("index.html", { data: Buffer.alloc(payloadSize, 0x61) })]);
}

function makeZipOneByteOverLimit() {
  const empty = buildZip([
    entry("index.html", { data: Buffer.alloc(0) }),
    entry("a.txt", { data: Buffer.alloc(0) }),
  ]);
  const payloadBytes = rules.bundle.maxZipBytes + 1 - empty.length;
  const firstBytes = Math.floor(payloadBytes / 2);
  return buildZip([
    entry("index.html", { data: Buffer.alloc(firstBytes, 0x61) }),
    entry("a.txt", { data: Buffer.alloc(payloadBytes - firstBytes, 0x62) }),
  ]);
}

function makeExactFileLimitArchive() {
  return buildZip([declaredEntry("index.html", rules.bundle.maxFileBytes, 104858)]);
}

function makeExactUncompressedLimitArchive() {
  const entries = [
    declaredEntry("index.html", 10 * MiB, 104858),
    declaredEntry("a.js", 10 * MiB, 104858),
    declaredEntry("b.css", 4 * MiB, 41944),
  ];
  return buildZip(entries);
}

function makeDescriptorArchive() {
  return buildZip([entry("index.html", {
    flags: 0x0808,
    localCompressedSize: 0,
    localUncompressedSize: 0,
    localCrc32: 0,
    data: Buffer.from("descriptor"),
    method: 8,
  })]);
}

function makeOverlapArchive() {
  const nestedZip = buildZip([entry("a.txt", { data: Buffer.from("12345") })]);
  const nestedLocalRecordLength = 30 + Buffer.byteLength("a.txt") + 5;
  const nestedLocalRecord = nestedZip.subarray(0, nestedLocalRecordLength);
  const firstData = Buffer.concat([nestedLocalRecord, Buffer.alloc(10, 0x41)]);
  return buildZip([
    entry("index.html", { data: firstData }),
    entry("a.txt", { data: Buffer.from("12345"), centralLocalOffset: 30 + Buffer.byteLength("index.html") }),
  ]);
}

function corruptLocalSignature() {
  const bytes = Uint8Array.from(buildZip([entry("index.html")]));
  bytes[0] = 0;
  return bytes;
}

const rejectionCases = [
  { name: "plain bytes are not a ZIP", code: "bundle_not_zip", make: () => new Uint8Array([1, 2, 3, 4]) },
  { name: "empty ZIP has no root page", code: "bundle_missing_index", make: () => buildZip([]) },
  { name: "truncated end record", code: "bundle_structure_corrupt", make: () => buildZip([entry("index.html")], { truncateBytes: 2 }) },
  { name: "garbage after end record", code: "bundle_structure_corrupt", make: () => buildZip([entry("index.html")], { appendGarbage: Buffer.from("tail") }) },
  { name: "fake EOCD in comment cannot repair a bad directory", code: "bundle_structure_corrupt", make: () => buildZip([entry("index.html")], { fakeEocdInComment: true, centralSize: 999 }) },
  { name: "central directory size contradicts EOCD", code: "bundle_structure_corrupt", make: () => buildZip([entry("index.html")], { centralSize: 999 }) },
  { name: "central directory offset contradicts EOCD", code: "bundle_structure_corrupt", make: () => buildZip([entry("index.html")], { centralOffset: 1 }) },
  { name: "declared count differs from parsed entries", code: "bundle_structure_corrupt", make: () => buildZip([entry("index.html")], { totalEntries: 2 }) },
  { name: "ZIP64 locator record", code: "bundle_zip64_unsupported", make: () => buildZip([entry("index.html")], { zip64: true }) },
  { name: "ZIP64 sentinel directory fields", code: "bundle_zip64_unsupported", make: () => buildZip([entry("index.html")], { zip64Fields: true }) },
  { name: "ZIP64 central extra field", code: "bundle_zip64_unsupported", make: () => buildZip([entry("index.html", { centralExtra: Buffer.from([1, 0, 0, 0]) })]) },
  { name: "ZIP64 local extra field", code: "bundle_zip64_unsupported", make: () => buildZip([entry("index.html", { localExtra: Buffer.from([1, 0, 0, 0]) })]) },
  { name: "nonzero disk number", code: "bundle_multidisk_unsupported", make: () => buildZip([entry("index.html")], { diskNumber: 1 }) },
  { name: "nonzero central disk number", code: "bundle_multidisk_unsupported", make: () => buildZip([entry("index.html")], { centralDiskNumber: 1 }) },
  { name: "entry assigned to another disk", code: "bundle_multidisk_unsupported", make: () => buildZip([entry("index.html", { diskStart: 1 })]) },
  { name: "encrypted member flag", code: "bundle_encrypted", make: () => buildZip([entry("index.html", { flags: 0x0801 })]) },
  { name: "unsupported compression method", code: "bundle_method_unsupported", make: () => buildZip([entry("index.html", { method: 12 })]) },
  { name: "501 entries exceed limit", code: "bundle_too_many_entries", make: () => make500EntryArchive(501) },
  { name: "invalid UTF-8 without UTF-8 flag", code: "bundle_path_invalid", make: () => buildZip([entry("index.html"), entry("bad.txt", { nameBytes: Buffer.from([0xff, 0xfe]), flags: 0 })]) },
  { name: "case-insensitive duplicate path", code: "bundle_path_duplicate", make: () => buildZip([entry("index.html"), entry("Index.html")]) },
  { name: "NFC and NFD paths collide", code: "bundle_path_duplicate", make: () => buildZip([entry("index.html"), entry("caf\u00e9.txt"), entry("cafe\u0301.txt")]) },
  { name: "symbolic-link attributes", code: "bundle_symlink", make: () => buildZip([entry("index.html", { externalAttributes: (0o120777 << 16) >>> 0 })]) },
  { name: "single file exceeds 10 MiB", code: "bundle_file_too_large", make: () => buildZip([declaredEntry("index.html", rules.bundle.maxFileBytes + 1, 1)]) },
  { name: "total uncompressed bytes exceed 24 MiB", code: "bundle_uncompressed_too_large", make: () => makeTotalLimitArchive(rules.bundle.maxUncompressedBytes + 1) },
  { name: "member compression ratio exceeds 100 to 1", code: "bundle_ratio_exceeded", make: () => buildZip([declaredEntry("index.html", 100001, 1000)]) },
  { name: "nonzero uncompressed size with zero compressed bytes", code: "bundle_ratio_exceeded", make: () => buildZip([declaredEntry("index.html", 1, 0)]) },
  { name: "overlapping local data intervals", code: "bundle_overlapping_entries", make: () => makeOverlapArchive() },
  { name: "local filename differs from central filename", code: "bundle_local_header_mismatch", make: () => buildZip([entry("index.html", { localName: "indox.html" })]) },
  { name: "local sizes differ from central sizes", code: "bundle_local_header_mismatch", make: () => buildZip([entry("index.html", { localCompressedSize: 99 })]) },
  { name: "local header signature is invalid", code: "bundle_local_header_mismatch", make: () => corruptLocalSignature() },
  { name: "nested index is not a root index", code: "bundle_missing_index", make: () => buildZip([entry("pages/index.html")]) },
  { name: "capitalized Index.html is not the required root file", code: "bundle_missing_index", make: () => buildZip([entry("Index.html")]) },
  { name: "parent directory traversal", code: "bundle_path_invalid", make: () => buildZip([entry("a/../../x.txt")]) },
  { name: "absolute slash path", code: "bundle_path_invalid", make: () => buildZip([entry("/abs.txt")]) },
  { name: "drive-letter path", code: "bundle_path_invalid", make: () => buildZip([entry("C:/x.txt")]) },
  { name: "backslash path", code: "bundle_path_invalid", make: () => buildZip([entry("a\\b.txt")]) },
  { name: "dot-prefixed env file", code: "bundle_path_invalid", make: () => buildZip([entry(".env")]) },
  { name: "dot-prefixed git directory", code: "bundle_path_invalid", make: () => buildZip([entry(".git/config")]) },
  { name: "node_modules directory", code: "bundle_path_invalid", make: () => buildZip([entry("node_modules/x.js")]) },
  { name: "Apple metadata directory", code: "bundle_path_invalid", make: () => buildZip([entry("__MACOSX/._a")]) },
  { name: "SSH private key filename", code: "bundle_path_invalid", make: () => buildZip([entry("id_rsa")]) },
  { name: "PEM key filename", code: "bundle_path_invalid", make: () => buildZip([entry("k.pem")]) },
  { name: "uppercase forbidden extension", code: "bundle_extension_forbidden", make: () => buildZip([entry("index.html"), entry("x.PHP")]) },
  { name: "forbidden extension at end of filename", code: "bundle_extension_forbidden", make: () => buildZip([entry("index.html"), entry("x.txt.php")]) },
  { name: "file without extension", code: "bundle_extension_unknown", make: () => buildZip([entry("index.html"), entry("LICENSE")]) },
  { name: "unknown extension", code: "bundle_extension_unknown", make: () => buildZip([entry("index.html"), entry("x.zzz")]) },
  { name: "path exceeds maximum depth", code: "bundle_path_invalid", make: () => buildZip([entry("a/b/c/d/e/f/g/h/i.txt")]) },
  { name: "path exceeds maximum length", code: "bundle_path_invalid", make: () => buildZip([entry(`${"a".repeat(201)}.txt`)]) },
  { name: "control character in path", code: "bundle_path_invalid", make: () => buildZip([entry("bad\u0001.txt")]) },
];

function assertRejected(name, code, bytes) {
  const before = Uint8Array.from(bytes);
  const result = inspectBundleZip(bytes);
  assert.equal(result.ok, false, `${name} should be rejected`);
  assert.equal(result.code, code, `${name} should return its precise error code`);
  assert.equal(typeof result.detail, "string");
  assert.ok(result.detail.length <= 200);
  if (result.path !== undefined) {
    assert.ok(result.path.length <= 200);
    assert.doesNotMatch(result.path, /[\u0000-\u001f\u007f-\u009f]/u);
  }
  assert.deepEqual(bytes, before, `${name} must not mutate the input archive`);
}

test("typical static site returns exact summary and accepts the permitted special cases", () => {
  const bytes = makeValidSite();
  const result = inspectBundleZip(bytes);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.summary, {
    fileCount: 7,
    uncompressedBytes: 47,
    zipBytes: bytes.length,
    entries: ["index.html", "assets/", "assets/site.css", "数据/图标.svg", "app.wasm", "page.config.json", "app.js", "x.php.txt"],
  });
});

for (const item of rejectionCases) {
  test(`rejects: ${item.name}`, () => assertRejected(item.name, item.code, item.make()));
}

test("500 entries are accepted and directory records count toward the entry ceiling", () => {
  const bytes = make500EntryArchive(500);
  const result = inspectBundleZip(bytes);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.summary.fileCount, 1);
  assert.equal(result.summary.entries.length, 500);
});

test("a local data-descriptor header may leave its size fields zero", () => {
  const bytes = makeDescriptorArchive();
  const result = inspectBundleZip(bytes);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.summary.uncompressedBytes, Buffer.byteLength("descriptor"));
});

test("exact 10 MiB ZIP byte limit is accepted", () => {
  const bytes = makeExactZipLimitArchive();
  assert.equal(bytes.length, rules.bundle.maxZipBytes);
  const result = inspectBundleZip(bytes);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.summary.zipBytes, rules.bundle.maxZipBytes);
});

test("10 MiB plus one ZIP byte is rejected", () => {
  const bytes = makeZipOneByteOverLimit();
  assert.equal(bytes.length, rules.bundle.maxZipBytes + 1);
  assertRejected("10 MiB plus one ZIP byte", "bundle_too_large", bytes);
});

test("exact 10 MiB single-file limit is accepted", () => {
  const bytes = makeExactFileLimitArchive();
  const result = inspectBundleZip(bytes);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.summary.uncompressedBytes, rules.bundle.maxFileBytes);
});

test("exact 24 MiB total uncompressed limit is accepted", () => {
  const bytes = makeExactUncompressedLimitArchive();
  const result = inspectBundleZip(bytes);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.summary.uncompressedBytes, rules.bundle.maxUncompressedBytes);
});

test("exact 100 to 1 member and overall compression ratio is accepted", () => {
  const bytes = buildZip([declaredEntry("index.html", 100000, 1000)]);
  const result = inspectBundleZip(bytes);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.summary.uncompressedBytes, 100000);
});

test("incomplete rejected-path rules fail closed", () => {
  const incompleteRules = structuredClone(rules);
  incompleteRules.rejectedPathRules = ["absolute paths rejected"];
  const result = inspectBundleZip(makeValidSite(), incompleteRules);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "bundle_structure_corrupt");
});

test("bounded shared vectors exactly match the current ZIP builder output", async () => {
  const vectorCases = [
    { name: "typical valid site", make: makeValidSite, expect: { ok: true } },
    { name: "500 entries at the configured ceiling", make: () => make500EntryArchive(500), expect: { ok: true } },
    { name: "single file at the 10 MiB uncompressed ceiling", make: makeExactFileLimitArchive, expect: { ok: true } },
    { name: "100 to 1 compression ratio boundary", make: () => buildZip([declaredEntry("index.html", 100000, 1000)]), expect: { ok: true } },
    { name: "data-descriptor local sizes may be zero", make: makeDescriptorArchive, expect: { ok: true } },
    ...rejectionCases.map((item) => ({ ...item, expect: { ok: false, code: item.code } })),
  ];
  const expected = vectorCases.map((item) => ({
    name: item.name,
    zipBase64: Buffer.from(item.make()).toString("base64"),
    expect: item.expect,
  }));
  for (const vector of expected) {
    const result = inspectBundleZip(Buffer.from(vector.zipBase64, "base64"));
    assert.equal(result.ok, vector.expect.ok, `${vector.name} fixture outcome`);
    if (!result.ok) assert.equal(result.code, vector.expect.code, `${vector.name} fixture code`);
  }
  const fixtureText = await readFile(new URL("./fixtures/hosting-bundle-vectors.json", import.meta.url), "utf8");
  assert.equal(fixtureText, `${JSON.stringify(expected, null, 2)}\n`);
});

test("200 fixed-seed byte mutations never throw and always return a result shape", () => {
  const original = makeValidSite();
  let seed = 0x6d2b79f5;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };

  for (let iteration = 0; iteration < 200; iteration += 1) {
    const bytes = Uint8Array.from(original);
    const mutationCount = 1 + (next() % 5);
    for (let mutation = 0; mutation < mutationCount; mutation += 1) {
      const offset = next() % bytes.length;
      bytes[offset] ^= 1 << (next() % 8);
    }
    if (iteration % 11 === 0) bytes.fill(0xff);
    const input = iteration % 13 === 0 ? bytes.subarray(0, next() % bytes.length) : bytes;
    const result = inspectBundleZip(input);
    assert.equal(typeof result.ok, "boolean");
    if (result.ok) {
      assert.ok(Number.isSafeInteger(result.summary.fileCount));
      assert.ok(Number.isSafeInteger(result.summary.uncompressedBytes));
      assert.ok(Number.isSafeInteger(result.summary.zipBytes));
      assert.ok(Array.isArray(result.summary.entries));
    } else {
      assert.ok(BUNDLE_ERROR_CODES.includes(result.code));
      assert.ok(result.detail.length <= 200);
    }
  }
});
