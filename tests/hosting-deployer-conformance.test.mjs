import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateBundle } from "../deploy/hosting/lib/validate.mjs";

const rules = JSON.parse(await readFile(new URL("../app/api/_lib/hosting-rules.json", import.meta.url), "utf8"));
const vectors = JSON.parse(await readFile(new URL("./fixtures/hosting-bundle-vectors.json", import.meta.url), "utf8"));

test("deployer ZIP results are no more permissive than all shared Worker vectors", async () => {
  assert.equal(vectors.length, 54, "the shared conformance set must include every bounded Worker vector");
  const directory = await mkdtemp(join(tmpdir(), "hosting-deployer-vectors-"));
  const zipPath = join(directory, "vector.zip");
  const stricterBecauseActualDeflateIsInvalid = new Map([
    ["single file at the 10 MiB uncompressed ceiling", "decompression_failed"],
    ["100 to 1 compression ratio boundary", "decompression_failed"],
  ]);
  const mismatches = [];
  try {
    for (const vector of vectors) {
      const bytes = Buffer.from(vector.zipBase64, "base64");
      await writeFile(zipPath, bytes);
      let result = null;
      let failure = null;
      try {
        result = await validateBundle(zipPath, { bundleFileCount: fileCountFromCentralDirectory(bytes) }, rules);
      } catch (error) {
        failure = error;
      }

      if (vector.expect.ok) {
        if (result) {
          await result.archive.close();
          continue;
        }
        const expectedReason = stricterBecauseActualDeflateIsInvalid.get(vector.name);
        assert.equal(expectedReason, "decompression_failed", `${vector.name} must be a recorded stricter-worker mismatch`);
        assert.equal(failure?.reasonCode, expectedReason, `${vector.name} failure reason`);
        mismatches.push({ name: vector.name, worker: "accept", deployer: "reject", reason: failure.reasonCode });
      } else {
        if (result) await result.archive.close();
        assert.equal(result, null, `${vector.name} is rejected by the Worker and must be rejected by deployer`);
      }
    }
    assert.deepEqual(mismatches, [
      { name: "single file at the 10 MiB uncompressed ceiling", worker: "accept", deployer: "reject", reason: "decompression_failed" },
      { name: "100 to 1 compression ratio boundary", worker: "accept", deployer: "reject", reason: "decompression_failed" },
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function fileCountFromCentralDirectory(bytes) {
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 22 - 0xffff); offset -= 1) {
    if (bytes.readUInt32LE(offset) !== 0x06054b50) continue;
    if (offset + 22 + bytes.readUInt16LE(offset + 20) !== bytes.length) continue;
    if (bytes.readUInt32LE(offset + 16) + bytes.readUInt32LE(offset + 12) !== offset) continue;
    endOffset = offset;
    break;
  }
  if (endOffset < 0) return 0;
  const count = bytes.readUInt16LE(endOffset + 10);
  let cursor = bytes.readUInt32LE(endOffset + 16);
  let files = 0;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50) return 0;
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    if (cursor + 46 + nameLength + extraLength + commentLength > bytes.length) return 0;
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (!name.endsWith("/")) files += 1;
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}
