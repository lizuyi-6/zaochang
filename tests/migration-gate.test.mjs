import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "..");
const journal = JSON.parse(readFileSync(join(projectRoot, "drizzle/meta/_journal.json"), "utf8")).entries;
const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");

function localSql(tag) {
  return readFileSync(join(projectRoot, "drizzle", `${tag}.sql`), "utf8");
}

function contentHash(tag, eol) {
  const lf = localSql(tag).replace(/\r\n/g, "\n");
  return sha256(eol === "crlf" ? lf.replace(/\n/g, "\r\n") : lf);
}

function productionShape() {
  return journal.map((entry, index) => ({
    hash: index >= 13 && index <= 18 ? entry.tag : contentHash(entry.tag, index >= 6 && index <= 9 ? "crlf" : "lf"),
    created_at: Number(entry.when),
  }));
}

function runChecker(rows) {
  const dir = mkdtempSync(join(tmpdir(), "zaochang-migration-check-"));
  const stub = join(dir, "fetch-stub.mjs");
  writeFileSync(stub, `globalThis.fetch=async()=>({json:async()=>({success:true,result:[{results:${JSON.stringify(rows)}}]})});`, "utf8");
  const result = spawnSync(process.execPath, [
    "--import", pathToFileURL(stub).href,
    "scripts/check-migrations.mjs",
  ], {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, CLOUDFLARE_API_TOKEN: "fixture" },
    windowsHide: true,
  });
  return { status: result.status ?? 1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

test("migration gate accepts production CRLF, LF, and tag ledger calibers on every checkout OS", () => {
  const result = runChecker(productionShape());
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /limited verification:6 条账目为 tag 入帐/);
  assert.match(result.output, /0013_lovely_lord_hawal.*0018_stale_speed_demon/s);
});

test("migration gate accepts an all-LF content ledger", () => {
  const rows = journal.map((entry) => ({ hash: contentHash(entry.tag, "lf"), created_at: Number(entry.when) }));
  const result = runChecker(rows);
  assert.equal(result.status, 0, result.output);
  assert.doesNotMatch(result.output, /limited verification/);
});

test("migration gate rejects missing rows", () => {
  const result = runChecker(productionShape().slice(0, -1));
  assert.equal(result.status, 1);
  assert.match(result.output, /数量缺口/);
});

test("migration gate rejects a tag placed at the wrong ordered position", () => {
  const rows = productionShape();
  rows[14] = { ...rows[14], hash: journal[15].tag };
  const result = runChecker(rows);
  assert.equal(result.status, 1);
  assert.match(result.output, /hash 错位:第 15 条/);
});

test("migration gate rejects content hash drift", () => {
  const rows = productionShape();
  rows[6] = { ...rows[6], hash: `deadbeef${rows[6].hash.slice(8)}` };
  const result = runChecker(rows);
  assert.equal(result.status, 1);
  assert.match(result.output, /hash 错位:第 7 条/);
});

test("migration gate rejects created_at drift even for tag-caliber rows", () => {
  const rows = productionShape();
  rows[15] = { ...rows[15], created_at: rows[15].created_at + 1 };
  const result = runChecker(rows);
  assert.equal(result.status, 1);
  assert.match(result.output, /时间错位:第 16 条/);
});
