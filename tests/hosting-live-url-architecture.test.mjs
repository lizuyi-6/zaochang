import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const appRoot = fileURLToPath(new URL("../app/", import.meta.url));
const allowedFiles = new Set([
  "api/_lib/hosting.ts",
  "api/_lib/hosting-sql.ts",
]);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:[cm]?[jt]sx?)$/i.test(entry.name) ? [path] : [];
  });
}

test("hosted live URLs are read only through the approved view", () => {
  const violations = sourceFiles(appRoot)
    .filter((path) => !allowedFiles.has(relative(appRoot, path).replaceAll("\\", "/")))
    .filter((path) => /\blive_url\b/i.test(readFileSync(path, "utf8")))
    .map((path) => relative(appRoot, path).replaceAll("\\", "/"));
  assert.deepEqual(violations, []);
});
