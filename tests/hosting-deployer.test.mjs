import assert from "node:assert/strict";
import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import { WorkerApi } from "../deploy/hosting/lib/api.mjs";
import { loadConfig } from "../deploy/hosting/hosting-deployer.mjs";
import { classifyCliFailure, HostingRunner } from "../deploy/hosting/lib/runner.mjs";
import { Steppage, verifyPinnedScript } from "../deploy/hosting/lib/steppage.mjs";
import { WriteAheadLog } from "../deploy/hosting/lib/wal.mjs";
import { runFakeSteppage } from "./helpers/hosting-fake-steppage-core.mjs";
import { buildZip, entry as zipEntry } from "./helpers/zip-builder.mjs";
import {
  LEASE_TOKEN,
  STEP_KEY,
  WORKER_TOKEN,
  createSandbox,
  defaultBundle,
  fakeCliEnvironment,
  initSteppageFixture,
  makeJob,
  makeZip,
  readCliCalls,
  readSteppageState,
  sha256,
  startFakeWorker,
  zipMetadata,
} from "./helpers/hosting-deployer-fixtures.mjs";

const execFile = promisify(nodeExecFile);
const here = fileURLToPath(new URL(".", import.meta.url));
const fakeCliPath = join(here, "helpers", "hosting-fake-steppage.mjs");
const rules = JSON.parse(await readFile(new URL("../app/api/_lib/hosting-rules.json", import.meta.url), "utf8"));

test("deploy creates an expiring preview, reports ids, and omits live and site flags", async () => {
  const fixture = await createFixture();
  try {
    await fixture.run();
    const calls = await readCliCalls(fixture.sandbox.cliLogPath);
    assert.deepEqual(calls.map((call) => call.command), ["deploy", "preview expiry"]);
    assert.equal(calls[0].argv.includes("--go-live"), false);
    assert.equal(calls[0].argv.includes("--site"), false);
    assert.equal(calls[1].argv.at(-1), "7d");
    assert.deepEqual(fixture.worker.state.reports.at(-1).body, {
      outcome: "staged",
      siteId: "5001",
      versionId: "6001",
      previewUrl: `https://p-${"a".repeat(32)}.preview.stepcloud.com`,
      previewExpiresAt: fixture.worker.state.reports.at(-1).body.previewExpiresAt,
    });
    assert.equal(Number.isNaN(Date.parse(fixture.worker.state.reports.at(-1).body.previewExpiresAt)), false);
    assert.equal(fixture.worker.state.jobs[0].state, "staged");
    assert.equal(Object.keys((await readSteppageState(fixture.sandbox.statePath)).sites).length, 1);
  } finally {
    await fixture.cleanup();
  }
});

test("promote verifies live state and revoke; an already live version reports without repeating the action", async () => {
  const normal = await createFixture({ action: "promote", cliState: { sites: { "7100": site("7100", "zc-p5-h12", "0") } } });
  try {
    await normal.run();
    assert.deepEqual((await readCliCalls(normal.sandbox.cliLogPath)).map((call) => call.command), ["get", "promote", "get", "preview revoke"]);
    assert.deepEqual(normal.worker.state.reports.at(-1).body, { outcome: "live", liveUrl: "https://warm-cedar-df1c.page.stepcloud.com" });
    assert.equal(normal.worker.state.jobs[0].state, "live");
  } finally {
    await normal.cleanup();
  }

  const idempotent = await createFixture({ action: "promote", cliState: { sites: { "7100": site("7100", "zc-p5-h12", "7200") } } });
  try {
    await idempotent.run();
    assert.deepEqual((await readCliCalls(idempotent.sandbox.cliLogPath)).map((call) => call.command), ["get"]);
    assert.deepEqual(idempotent.worker.state.reports.at(-1).body, { outcome: "live", liveUrl: "https://warm-cedar-df1c.page.stepcloud.com" });
  } finally {
    await idempotent.cleanup();
  }

  const foreign = await createFixture({ action: "promote", cliState: { sites: { "7100": site("7100", "unmanaged-site", "0") } } });
  try {
    await foreign.run();
    assert.deepEqual((await readCliCalls(foreign.sandbox.cliLogPath)).map((call) => call.command), ["get"]);
    assert.deepEqual(foreign.worker.state.reports.at(-1).body, {
      outcome: "failed", code: "internal", retryable: false, detail: "site name is outside the managed prefix",
    });
    assert.equal(foreign.worker.state.jobs[0].state, "staged");
    assert.equal(Boolean((await readSteppageState(foreign.sandbox.statePath)).sites["7100"]), true);
  } finally {
    await foreign.cleanup();
  }
});

test("remove deletes only a zc-p site, refuses a foreign name, and treats not found as removed without list", async () => {
  const normal = await createFixture({ action: "remove", cliState: { sites: { "7100": site("7100", "zc-p5-h12", "7200") } } });
  try {
    await normal.run();
    assert.deepEqual((await readCliCalls(normal.sandbox.cliLogPath)).map((call) => call.command), ["get", "delete"]);
    assert.deepEqual(normal.worker.state.reports.at(-1).body, { outcome: "removed" });
    assert.equal(Object.keys((await readSteppageState(normal.sandbox.statePath)).sites).length, 0);
  } finally {
    await normal.cleanup();
  }

  const foreign = await createFixture({ action: "remove", cliState: { sites: { "7100": site("7100", "unmanaged-site", "7200") } } });
  try {
    await foreign.run();
    assert.deepEqual((await readCliCalls(foreign.sandbox.cliLogPath)).map((call) => call.command), ["get"]);
    assert.deepEqual(foreign.worker.state.reports.at(-1).body, {
      outcome: "failed", code: "internal", retryable: false, detail: "site name is outside the managed prefix",
    });
    assert.equal(Boolean((await readSteppageState(foreign.sandbox.statePath)).sites["7100"]), true);
    assert.equal(foreign.worker.state.jobs[0].state, "removing");
  } finally {
    await foreign.cleanup();
  }

  const missing = await createFixture({ action: "remove", cliState: { sites: {}, failures: { getNotFound: true } } });
  try {
    await missing.run();
    assert.deepEqual((await readCliCalls(missing.sandbox.cliLogPath)).map((call) => call.command), ["get"]);
    assert.deepEqual(missing.worker.state.reports.at(-1).body, { outcome: "removed" });
    assert.equal(missing.worker.state.jobs[0].state, "removed");
  } finally {
    await missing.cleanup();
  }
});

test("bundle hash, path traversal, compression ratio, and secret failures report before any CLI call", async () => {
  const cases = [
    { name: "hash mismatch", bundle: defaultBundle(), mutate: (job) => { job.bundleSha256 = sha256(Buffer.from("different")); }, code: "validation_bundle" },
    { name: "path traversal", bundle: makeZip([{ name: "index.html", content: "ok" }, { name: "../escape.js", content: "bad" }]), code: "validation_bundle" },
    { name: "compression ratio", bundle: makeZip([{ name: "index.html", content: "ok" }, { name: "assets/repeat.txt", content: "A".repeat(4096), method: "deflate" }]), code: "validation_bundle" },
    { name: "secret string", bundle: makeZip([{ name: "index.html", content: `hello ${"sk-"}${"z".repeat(40)}` }]), code: "validation_secret", secret: `sk-${"z".repeat(40)}` },
  ];
  for (const item of cases) {
    const fixture = await createFixture({ bundle: item.bundle });
    try {
      if (item.mutate) item.mutate(fixture.job);
      if (item.mutate) fixture.worker.state.jobs[0].bundleSha256 = fixture.job.bundleSha256;
      await fixture.run();
      const calls = await readCliCalls(fixture.sandbox.cliLogPath);
      assert.deepEqual(calls, [], item.name);
      const report = fixture.worker.state.reports.at(-1).body;
      assert.equal(report.outcome, "failed", item.name);
      assert.equal(report.code, item.code, item.name);
      assert.equal(report.retryable, false, item.name);
      assert.equal(fixture.worker.state.jobs[0].state, "failed", item.name);
      assert.deepEqual(await readSteppageState(fixture.sandbox.statePath).then((state) => Object.keys(state.sites)), [], item.name);
      const wal = JSON.parse(await readFile(fixture.wal.filePath(fixture.job.id), "utf8"));
      assert.equal(wal.phase, "reported", item.name);
      if (item.secret) assert.equal(report.detail.includes(item.secret), false);
    } finally {
      await fixture.cleanup();
    }
  }
});

test("CLI error classes are preserved when recovery proves the site name is absent", async () => {
  const cases = [
    { stderr: 'Error: bundle rejected: forbidden extension "evil.php"', code: "validation_bundle", retryable: false },
    { stderr: "Error: [unauthenticated] API Key invalid", code: "provider_auth", retryable: false },
    { stderr: "Error: quota limit exceeded", code: "provider_quota", retryable: false },
    { stderr: "Error: audit 审核 rejected", code: "provider_audit_rejected", retryable: false },
    { stderr: "Error: connection reset", code: "provider_error", retryable: true },
  ];
  for (const item of cases) {
    assert.deepEqual(classifyCliFailure({ stderr: item.stderr }), { code: item.code, retryable: item.retryable, detail:
      item.code === "provider_auth" ? "provider authentication rejected"
        : item.code === "provider_quota" ? "provider quota rejected request"
          : item.code === "provider_audit_rejected" ? "provider audit rejected request"
            : item.code === "validation_bundle" ? "provider rejected bundle"
              : "provider request failed",
    });
    const fixture = await createFixture({ attempts: 4, cliState: { failures: { deploy: { stderr: item.stderr } } } });
    try {
      await fixture.makeRunner({ sleep: async () => undefined }).run({ maxCycles: 1 });
      const pending = JSON.parse(await readFile(fixture.wal.filePath(fixture.job.id), "utf8"));
      assert.equal(pending.phase, "intent", item.code);
      assert.equal(pending.deployFailure.code, item.code, item.code);
      await fixture.makeRunner({ sleep: async () => undefined }).run({ maxCycles: 1 });
      assert.deepEqual((await readCliCalls(fixture.sandbox.cliLogPath)).map((call) => call.command), ["deploy", "list"]);
      assert.deepEqual(fixture.worker.state.reports.at(-1).body, {
        outcome: "failed", code: item.code, retryable: item.retryable,
        detail: item.code === "provider_auth" ? "provider authentication rejected"
            : item.code === "provider_quota" ? "provider quota rejected request"
              : item.code === "provider_audit_rejected" ? "provider audit rejected request"
                : item.code === "validation_bundle" ? "provider rejected bundle"
                  : "provider request failed",
      });
      assert.equal(fixture.worker.state.jobs[0].state, "failed");
      const wal = JSON.parse(await readFile(fixture.wal.filePath(fixture.job.id), "utf8"));
      assert.equal(wal.phase, "reported");
      assert.equal(wal.reportBody.code, item.code);
      assert.deepEqual(Object.keys((await readSteppageState(fixture.sandbox.statePath)).sites), []);
    } finally {
      await fixture.cleanup();
    }
  }
});

test("deploy may create a remote site before a timeout; recovery adopts it and sets expiry without redeploy", async () => {
  const fixture = await createFixture({
    cliState: { failures: { deploy: { stderr: "Error: connection reset", afterSideEffect: true } } },
  });
  try {
    await fixture.makeRunner({ sleep: async () => undefined }).run({ maxCycles: 2 });
    assert.deepEqual((await readCliCalls(fixture.sandbox.cliLogPath)).map((call) => call.command), ["deploy", "list", "versions", "preview expiry"]);
    const report = fixture.worker.state.reports.at(-1).body;
    assert.equal(report.outcome, "staged");
    assert.equal(report.siteId, "5001");
    assert.equal(report.versionId, "6001");
    assert.equal(fixture.worker.state.jobs[0].state, "staged");
    const sites = Object.values((await readSteppageState(fixture.sandbox.statePath)).sites);
    assert.equal(sites.length, 1);
    assert.equal(sites[0].name, fixture.job.siteName);
    assert.notEqual(sites[0].versions[0].expiresAt, "0");
    const wal = JSON.parse(await readFile(fixture.wal.filePath(fixture.job.id), "utf8"));
    assert.equal(wal.phase, "reported");
    assert.equal(wal.reportBody.outcome, "staged");
  } finally {
    await fixture.cleanup();
  }
});

test("deploy timeout with unavailable list reports ambiguous reconciliation data and does not retry", async () => {
  const fixture = await createFixture({
    cliState: { failures: {
      deploy: { stderr: "Error: connection reset", afterSideEffect: true },
      list: { stderr: "Error: connection reset" },
    } },
  });
  try {
    await fixture.makeRunner({ sleep: async () => undefined }).run({ maxCycles: 2 });
    assert.deepEqual((await readCliCalls(fixture.sandbox.cliLogPath)).map((call) => call.command), ["deploy", "list"]);
    assert.deepEqual(fixture.worker.state.reports.at(-1).body, {
      outcome: "failed", code: "ambiguous", retryable: false,
      detail: `could not list during deploy recovery; site=${fixture.job.siteName}; files=${fixture.job.bundleFileCount}; bytes=${zipMetadata(fixture.job.bundle).totalBytes}`,
    });
    assert.equal(fixture.worker.state.jobs[0].state, "failed");
    const sites = Object.values((await readSteppageState(fixture.sandbox.statePath)).sites);
    assert.equal(sites.length, 1);
    assert.equal(sites[0].name, fixture.job.siteName);
    assert.equal(sites[0].versions[0].expiresAt, "0");
    const wal = JSON.parse(await readFile(fixture.wal.filePath(fixture.job.id), "utf8"));
    assert.equal(wal.phase, "reported");
    assert.equal(wal.reportBody.code, "ambiguous");
  } finally {
    await fixture.cleanup();
  }
});

test("preview expiry failure deletes the newly created site; failed cleanup reports ambiguous with site id", async () => {
  const cleaned = await createFixture({ attempts: 4, cliState: { failures: { "preview expiry": { stderr: "Error: timeout" } } } });
  try {
    await cleaned.run();
    assert.deepEqual((await readCliCalls(cleaned.sandbox.cliLogPath)).map((call) => call.command), ["deploy", "preview expiry", "get", "delete"]);
    assert.deepEqual(cleaned.worker.state.reports.at(-1).body, {
      outcome: "failed", code: "provider_error", retryable: true, detail: "provider request failed",
    });
    assert.deepEqual(Object.keys((await readSteppageState(cleaned.sandbox.statePath)).sites), []);
  } finally {
    await cleaned.cleanup();
  }

  const cleanupFailed = await createFixture({ attempts: 4, cliState: { failures: {
    "preview expiry": { stderr: "Error: timeout" },
    delete: { stderr: "Error: provider delete failed" },
  } } });
  try {
    await cleanupFailed.run();
    assert.deepEqual((await readCliCalls(cleanupFailed.sandbox.cliLogPath)).map((call) => call.command), ["deploy", "preview expiry", "get", "delete"]);
    const report = cleanupFailed.worker.state.reports.at(-1).body;
    assert.equal(report.outcome, "failed");
    assert.equal(report.code, "ambiguous");
    assert.equal(report.detail.includes("5001"), true);
    assert.equal(Boolean((await readSteppageState(cleanupFailed.sandbox.statePath)).sites["5001"]), true);
  } finally {
    await cleanupFailed.cleanup();
  }
});

test("a result WAL is reported after restart without repeating deploy", async () => {
  const fixture = await createFixture({ workerOptions: { reportFailures: 1 } });
  try {
    await fixture.run({ maxCycles: 1 });
    const beforeRestart = await readCliCalls(fixture.sandbox.cliLogPath);
    assert.deepEqual(beforeRestart.map((call) => call.command), ["deploy", "preview expiry"]);
    const walBefore = JSON.parse(await readFile(fixture.wal.filePath(fixture.job.id), "utf8"));
    assert.equal(walBefore.phase, "result");
    const restarted = fixture.makeRunner();
    await restarted.run({ maxCycles: 1 });
    const afterRestart = await readCliCalls(fixture.sandbox.cliLogPath);
    assert.deepEqual(afterRestart.map((call) => call.command), ["deploy", "preview expiry"]);
    assert.equal(afterRestart.filter((call) => call.command === "deploy").length, 1);
    assert.equal(fixture.worker.state.reports.at(-1).body.outcome, "staged");
    assert.equal(JSON.parse(await readFile(fixture.wal.filePath(fixture.job.id), "utf8")).phase, "reported");
  } finally {
    await fixture.cleanup();
  }
});

test("a crash after preview expiry reads versions and reports without repeating that side effect", async () => {
  const fixture = await createFixture();
  try {
    const write = fixture.wal.write.bind(fixture.wal);
    let failedStageWrite = false;
    fixture.wal.write = async (record) => {
      if (!failedStageWrite && record.result?.step === "staged") {
        failedStageWrite = true;
        throw new Error("injected interruption before staged WAL result");
      }
      return write(record);
    };
    await fixture.makeRunner().run({ maxCycles: 1 });
    const pending = JSON.parse(await readFile(fixture.wal.filePath(fixture.job.id), "utf8"));
    assert.equal(pending.phase, "result");
    assert.equal(pending.result.step, "deployed_pending_expiry");
    fixture.wal.write = write;

    await fixture.makeRunner().run({ maxCycles: 1 });
    assert.deepEqual((await readCliCalls(fixture.sandbox.cliLogPath)).map((call) => call.command), ["deploy", "preview expiry", "versions"]);
    assert.equal(fixture.worker.state.reports.at(-1).body.outcome, "staged");
    assert.equal(fixture.worker.state.jobs[0].state, "staged");
  } finally {
    await fixture.cleanup();
  }
});

test("an intent-only deploy is adopted from list and versions when one exact match exists", async () => {
  const bundle = defaultBundle();
  const fixture = await createFixture({ bundle, workerOptions: {}, cliState: { sites: {
    "8100": {
      ...site("8100", "zc-p5-h12", "0"),
      versions: [{ siteId: "8100", versionId: "8200", fileCount: zipMetadata(bundle).fileCount, totalBytes: String(zipMetadata(bundle).totalBytes), previewUrl: `https://p-${"b".repeat(32)}.preview.stepcloud.com` }],
    },
  } } });
  try {
    const claimed = await fixture.api.claim("test-worker");
    await fixture.wal.initialize();
    await fixture.wal.write({
      hostingId: String(claimed.id), phase: "intent", action: "deploy", siteName: claimed.siteName,
      siteId: null, versionId: null, lease: claimed.lease, jobPreviewTtl: "7d",
      expectedFileCount: claimed.bundleFileCount, expectedZipBytes: claimed.bundleZipBytes,
      expectedUncompressedBytes: zipMetadata(bundle).totalBytes, result: null, reportBody: null,
    });
    await fixture.makeRunner().run({ maxCycles: 1 });
    assert.deepEqual((await readCliCalls(fixture.sandbox.cliLogPath)).map((call) => call.command), ["list", "versions", "preview expiry"]);
    assert.deepEqual(fixture.worker.state.reports.at(-1).body, {
      outcome: "staged", siteId: "8100", versionId: "8200",
      previewUrl: `https://p-${"b".repeat(32)}.preview.stepcloud.com`,
      previewExpiresAt: fixture.worker.state.reports.at(-1).body.previewExpiresAt,
    });
    assert.equal((await readCliCalls(fixture.sandbox.cliLogPath)).filter((call) => call.command === "deploy").length, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("an intent-only deploy with no same-name site reports retryable provider failure", async () => {
  const fixture = await createFixture({ attempts: 4, cliState: { sites: {} } });
  try {
    const claimed = await fixture.api.claim("test-worker");
    await fixture.wal.initialize();
    await fixture.wal.write({
      hostingId: String(claimed.id), phase: "intent", action: "deploy", siteName: claimed.siteName,
      siteId: null, versionId: null, lease: claimed.lease, jobPreviewTtl: "7d",
      expectedFileCount: claimed.bundleFileCount, expectedZipBytes: claimed.bundleZipBytes,
      expectedUncompressedBytes: zipMetadata(fixture.job.bundle).totalBytes, result: null, reportBody: null,
    });
    await fixture.makeRunner().run({ maxCycles: 1 });
    assert.deepEqual((await readCliCalls(fixture.sandbox.cliLogPath)).map((call) => call.command), ["list"]);
    assert.deepEqual(fixture.worker.state.reports.at(-1).body, {
      outcome: "failed", code: "provider_error", retryable: true, detail: "provider request failed",
    });
    assert.equal(fixture.worker.state.jobs[0].state, "failed");
    const wal = JSON.parse(await readFile(fixture.wal.filePath(fixture.job.id), "utf8"));
    assert.equal(wal.phase, "reported");
    assert.equal(wal.reportBody.outcome, "failed");
    assert.equal(wal.reportBody.code, "provider_error");
  } finally {
    await fixture.cleanup();
  }
});

test("an untrusted same-name site is deleted after a prefix check before retryable failure is reported", async () => {
  const cases = [
    { name: "no versions", versions: [] },
    { name: "statistics mismatch", versions: [{ siteId: "8100", versionId: "8200", fileCount: 1, totalBytes: "1", previewUrl: `https://p-${"d".repeat(32)}.preview.stepcloud.com` }] },
  ];
  for (const item of cases) {
    const fixture = await createFixture({ attempts: 4, cliState: { sites: {
      "8100": { ...site("8100", "zc-p5-h12", "0"), versions: item.versions },
    } } });
    try {
      await writeIntentOnlyDeploy(fixture);
      await fixture.makeRunner().run({ maxCycles: 1 });
      assert.deepEqual((await readCliCalls(fixture.sandbox.cliLogPath)).map((call) => call.command), ["list", "versions", "get", "delete"], item.name);
      const report = fixture.worker.state.reports.at(-1).body;
      assert.deepEqual(report, { outcome: "failed", code: "provider_error", retryable: true, detail: "provider request failed" }, item.name);
      assert.equal(fixture.worker.state.jobs[0].state, "failed", item.name);
      assert.deepEqual(Object.keys((await readSteppageState(fixture.sandbox.statePath)).sites), [], item.name);
      const wal = JSON.parse(await readFile(fixture.wal.filePath(fixture.job.id), "utf8"));
      assert.equal(wal.phase, "reported", item.name);
      assert.equal(wal.reportBody.retryable, true, item.name);
    } finally {
      await fixture.cleanup();
    }
  }
});

test("cleanup failure, duplicate names, and unusable recovery lists report ambiguous with evidence", async () => {
  const metadata = zipMetadata(defaultBundle());
  const duplicateSites = {
    "8100": site("8100", "zc-p5-h12", "0"),
    "8101": site("8101", "zc-p5-h12", "0"),
  };
  const cases = [
    { name: "cleanup failure", cliState: { sites: { "8100": { ...site("8100", "zc-p5-h12", "0"), versions: [] } }, failures: { delete: { stderr: "Error: delete failed" } } }, commands: ["list", "versions", "get", "delete"], detail: /siteId=8100/u },
    { name: "get prefix mismatch", cliState: { sites: { "8100": { ...site("8100", "zc-p5-h12", "0"), versions: [] } }, responses: { get: site("8100", "foreign-name", "0") } }, commands: ["list", "versions", "get"], detail: /siteId=8100/u },
    { name: "get different managed name", cliState: { sites: { "8100": { ...site("8100", "zc-p5-h12", "0"), versions: [] } }, responses: { get: site("8100", "zc-p5-h999", "0") } }, commands: ["list", "versions", "get"], detail: /siteId=8100/u },
    { name: "duplicate matching versions", cliState: { sites: { "8100": { ...site("8100", "zc-p5-h12", "0"), versions: [
      { siteId: "8100", versionId: "8200", fileCount: metadata.fileCount, totalBytes: String(metadata.totalBytes), previewUrl: `https://p-${"e".repeat(32)}.preview.stepcloud.com` },
      { siteId: "8100", versionId: "8201", fileCount: metadata.fileCount, totalBytes: String(metadata.totalBytes), previewUrl: `https://p-${"f".repeat(32)}.preview.stepcloud.com` },
    ] } } }, commands: ["list", "versions"], detail: /multiple versions match/u },
    { name: "duplicate same-name sites", cliState: { sites: duplicateSites }, commands: ["list"], detail: /multiple sites/u },
    { name: "non-array list response", cliState: { sites: {}, responses: { list: { sites: "invalid" } } }, commands: ["list"], detail: /not parseable/u },
    { name: "invalid list JSON", cliState: { sites: {}, rawStdout: { list: "not-json" } }, commands: ["list"], detail: /could not list/u },
  ];
  for (const item of cases) {
    const fixture = await createFixture({ cliState: item.cliState });
    try {
      await writeIntentOnlyDeploy(fixture);
      await fixture.makeRunner().run({ maxCycles: 1 });
      assert.deepEqual((await readCliCalls(fixture.sandbox.cliLogPath)).map((call) => call.command), item.commands, item.name);
      const report = fixture.worker.state.reports.at(-1).body;
      assert.equal(report.outcome, "failed", item.name);
      assert.equal(report.code, "ambiguous", item.name);
      assert.equal(report.retryable, false, item.name);
      assert.match(report.detail, item.detail, item.name);
      assert.equal(report.detail.includes(fixture.job.siteName), true, item.name);
      assert.equal(fixture.worker.state.jobs[0].state, "failed", item.name);
      const state = await readSteppageState(fixture.sandbox.statePath);
      if (item.name === "cleanup failure" || item.name === "get prefix mismatch" || item.name === "get different managed name" || item.name === "duplicate matching versions") {
        assert.equal(Boolean(state.sites["8100"]), true, item.name);
      }
    } finally {
      await fixture.cleanup();
    }
  }

  const timedOut = await createFixture();
  try {
    await writeIntentOnlyDeploy(timedOut);
    const runner = timedOut.makeRunner({ steppage: { list: async () => { throw Object.assign(new Error("list timeout"), { timedOut: true }); } } });
    await runner.run({ maxCycles: 1 });
    const report = timedOut.worker.state.reports.at(-1).body;
    assert.equal(report.code, "ambiguous");
    assert.equal(report.retryable, false);
    assert.equal(timedOut.worker.state.jobs[0].state, "failed");
  } finally {
    await timedOut.cleanup();
  }
});

test("malformed successful deploy output reconciles an empty list as provider_error", async () => {
  const fixture = await createFixture({ attempts: 4, cliState: { rawStdout: { deploy: "not-json" }, sites: {} } });
  try {
    await fixture.makeRunner({ sleep: async () => undefined }).run({ maxCycles: 2 });
    assert.deepEqual((await readCliCalls(fixture.sandbox.cliLogPath)).map((call) => call.command), ["deploy", "list"]);
    assert.deepEqual(fixture.worker.state.reports.at(-1).body, {
      outcome: "failed", code: "provider_error", retryable: true, detail: "provider request failed",
    });
    assert.equal(fixture.worker.state.jobs[0].state, "failed");
    assert.deepEqual(Object.keys((await readSteppageState(fixture.sandbox.statePath)).sites), []);
  } finally {
    await fixture.cleanup();
  }
});

test("actual ZIP expansion, CRC, encryption, links, ZIP64, headers, and overlap fail before CLI", async () => {
  const nestedZip = Buffer.from(buildZip([zipEntry("a.txt", { data: Buffer.from("12345") })]));
  const nestedLocalLength = 30 + Buffer.byteLength("a.txt") + 5;
  const overlappingBytes = Buffer.concat([nestedZip.subarray(0, nestedLocalLength), Buffer.alloc(10, 0x41)]);
  const cases = [
    { name: "declared 100 actual 200", bytes: buildZip([zipEntry("index.html", { method: 8, data: Buffer.from("A".repeat(200)), uncompressedSize: 100 })]), reason: "expansion_exceeded", content: "A".repeat(200) },
    { name: "declared zero actual one", bytes: buildZip([zipEntry("index.html", { method: 8, data: Buffer.from("Z"), uncompressedSize: 0 })]), reason: "expansion_exceeded", content: "Z" },
    { name: "declared 100 actual 50", bytes: buildZip([zipEntry("index.html", { method: 8, data: Buffer.from("B".repeat(50)), uncompressedSize: 100 })]), reason: "size_mismatch", content: "B".repeat(50) },
    { name: "CRC mismatch", bytes: buildZip([zipEntry("index.html", { data: Buffer.from("CRC_SECRET_CONTENT"), crc32: 0 })]), reason: "crc_mismatch", content: "CRC_SECRET_CONTENT" },
    { name: "encrypted flag", bytes: buildZip([zipEntry("index.html", { flags: 0x0801, data: Buffer.from("ENCRYPTED_SECRET_CONTENT") })]), content: "ENCRYPTED_SECRET_CONTENT" },
    { name: "symbolic link", bytes: buildZip([zipEntry("index.html", { externalAttributes: (0o120777 << 16) >>> 0, data: Buffer.from("SYMLINK_SECRET_CONTENT") })]), content: "SYMLINK_SECRET_CONTENT" },
    { name: "ZIP64 extra marker", bytes: buildZip([zipEntry("index.html", { centralExtra: Buffer.from([1, 0, 0, 0]), data: Buffer.from("ZIP64_SECRET_CONTENT") })]), content: "ZIP64_SECRET_CONTENT" },
    { name: "local name mismatch", bytes: buildZip([zipEntry("index.html", { localName: "other.html", data: Buffer.from("LOCAL_SECRET_CONTENT") })]), content: "LOCAL_SECRET_CONTENT" },
    { name: "conflicting data descriptor fields", bytes: buildZip([zipEntry("index.html", { method: 8, flags: 0x0808, data: Buffer.from("DESCRIPTOR_SECRET_CONTENT"), localCrc32: 1 })]), content: "DESCRIPTOR_SECRET_CONTENT" },
    { name: "C1 control character in path", bytes: buildZip([zipEntry("index.html"), zipEntry("bad\u0085.js", { data: Buffer.from("C1_SECRET_CONTENT") })]), content: "C1_SECRET_CONTENT" },
    { name: "overlapping entries", bytes: buildZip([
      zipEntry("index.html", { data: overlappingBytes }),
      zipEntry("a.txt", { data: Buffer.from("12345"), centralLocalOffset: 30 + Buffer.byteLength("index.html") }),
    ]) , content: "12345" },
  ];
  for (const item of cases) {
    const fixture = await createFixture({ bundle: Buffer.from(item.bytes) });
    try {
      await fixture.run();
      const report = fixture.worker.state.reports.at(-1).body;
      assert.equal(report.outcome, "failed", item.name);
      assert.equal(report.code, "validation_bundle", item.name);
      assert.equal(report.retryable, false, item.name);
      assert.deepEqual(await readCliCalls(fixture.sandbox.cliLogPath), [], item.name);
      assert.equal(fixture.worker.state.jobs[0].state, "failed", item.name);
      assert.deepEqual(Object.keys((await readSteppageState(fixture.sandbox.statePath)).sites), [], item.name);
      if (item.reason) assert.equal(report.detail, `path=index.html; reason=${item.reason}`, item.name);
      if (item.content) assert.equal(report.detail.includes(item.content), false, item.name);
    } finally {
      await fixture.cleanup();
    }
  }
});

test("every shared secret pattern is rejected with id and path but without the matched string", async () => {
  const secrets = {
    pem_private_key: "-----BEGIN PRIVATE KEY-----",
    aws_access_key_id: `AKIA${"A".repeat(16)}`,
    github_token: `ghp_${"A".repeat(36)}`,
    github_fine_grained_token: `github_pat_${"A".repeat(50)}`,
    openai_style_secret_key: `sk-${"A".repeat(32)}`,
    stripe_live_key: `sk_live_${"A".repeat(16)}`,
    slack_token: `xoxb-${"A".repeat(10)}`,
    google_api_key: `AIza${"A".repeat(35)}`,
  };
  for (const pattern of rules.secretPatterns) {
    const secret = secrets[pattern.id];
    assert.equal(typeof secret, "string", pattern.id);
    const bundle = buildZip([
      zipEntry("index.html", { data: Buffer.from("safe") }),
      zipEntry("leak.js", { data: Buffer.from(`const key = '${secret}';`) }),
    ]);
    const fixture = await createFixture({ bundle: Buffer.from(bundle) });
    try {
      await fixture.run();
      const report = fixture.worker.state.reports.at(-1).body;
      assert.equal(report.outcome, "failed", pattern.id);
      assert.equal(report.code, "validation_secret", pattern.id);
      assert.equal(report.retryable, false, pattern.id);
      assert.equal(report.detail, `pattern=${pattern.id}; file=leak.js`, pattern.id);
      assert.equal(report.detail.includes(secret), false, pattern.id);
      assert.deepEqual(await readCliCalls(fixture.sandbox.cliLogPath), [], pattern.id);
      assert.equal(fixture.worker.state.jobs[0].state, "failed", pattern.id);
    } finally {
      await fixture.cleanup();
    }
  }
});

test("lease mismatch abandons reporting without a second report or remote rollback", async () => {
  const fixture = await createFixture({ workerOptions: { forceLeaseMismatch: true } });
  try {
    await fixture.run();
    assert.equal(fixture.worker.state.reports.length, 1);
    assert.deepEqual((await readCliCalls(fixture.sandbox.cliLogPath)).map((call) => call.command), ["deploy", "preview expiry"]);
    const wal = JSON.parse(await readFile(fixture.wal.filePath(fixture.job.id), "utf8"));
    assert.equal(wal.phase, "reported");
    assert.equal(wal.abandoned, true);
    assert.equal(Object.keys((await readSteppageState(fixture.sandbox.statePath)).sites).length, 1);
  } finally {
    await fixture.cleanup();
  }
});

test("logs omit credentials and matched secret text; the StepFun key is environment-only", async () => {
  const previousToken = process.env.HOSTING_DEPLOYER_TOKEN;
  const fixture = await createFixture();
  let capturedOut = "";
  let capturedErr = "";
  const originalOut = process.stdout.write;
  const originalErr = process.stderr.write;
  process.env.HOSTING_DEPLOYER_TOKEN = fixture.worker.token;
  process.stdout.write = (chunk, ...args) => { capturedOut += String(chunk); const callback = args.find((part) => typeof part === "function"); if (callback) callback(); return true; };
  process.stderr.write = (chunk, ...args) => { capturedErr += String(chunk); const callback = args.find((part) => typeof part === "function"); if (callback) callback(); return true; };
  try {
    fixture.runner = fixture.makeRunner({ logger: (message) => process.stdout.write(`${message}\n`) });
    await fixture.runner.run();
    const calls = await readCliCalls(fixture.sandbox.cliLogPath);
    const lease = fixture.worker.state.jobs[0].lease;
    const exposed = `${capturedOut}\n${capturedErr}\n${JSON.stringify(calls)}`;
    for (const secret of [fixture.worker.token, STEP_KEY, lease, LEASE_TOKEN]) assert.equal(exposed.includes(secret), false);
    assert.equal(calls.every((call) => call.hasStepfunKey), true);
    assert.equal(calls.every((call) => call.hasWorkerToken === false), true);
    assert.equal(calls.every((call) => call.envKeys.includes("STEPFUN_API_KEY") && !call.envKeys.includes("HOSTING_DEPLOYER_TOKEN")), true);
    assert.equal(calls.some((call) => call.argv.join(" ").includes(STEP_KEY)), false);
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
    if (previousToken === undefined) delete process.env.HOSTING_DEPLOYER_TOKEN;
    else process.env.HOSTING_DEPLOYER_TOKEN = previousToken;
    await fixture.cleanup();
  }

  const secret = `sk-${"q".repeat(45)}`;
  const secretFixture = await createFixture({ bundle: makeZip([{ name: "index.html", content: secret }]) });
  try {
    await secretFixture.run();
    assert.equal(secretFixture.worker.state.reports.at(-1).body.detail.includes(secret), false);
    assert.deepEqual(await readCliCalls(secretFixture.sandbox.cliLogPath), []);
  } finally {
    await secretFixture.cleanup();
  }
});

test("claim failures back off exponentially and an empty claim uses the configured idle delay", async () => {
  const fixture = await createFixture({ workerOptions: { jobs: [], claimFailures: 3 }, idleMs: 37 });
  try {
    const delays = [];
    let runner;
    runner = fixture.makeRunner({ sleep: async (ms) => { delays.push(ms); if (ms === 37) runner.stop(); } });
    await runner.run();
    assert.deepEqual(delays, [1000, 2000, 4000, 37]);
    assert.equal(fixture.worker.state.reports.length, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("a stop request during the current CLI call waits for its report and claims no next job", async () => {
  const firstJob = makeJob({ id: 12, productId: 5 });
  const secondJob = makeJob({ id: 13, productId: 5 });
  const fixture = await createFixture({ job: firstJob, workerOptions: { jobs: [firstJob, secondJob] } });
  try {
    let runner;
    runner = fixture.makeRunner({ onCli: (args) => { if (args[2] === "deploy") runner.stop(); } });
    await runner.run();
    assert.deepEqual((await readCliCalls(fixture.sandbox.cliLogPath)).map((call) => call.command), ["deploy", "preview expiry"]);
    assert.equal(fixture.worker.state.reports.length, 1);
    assert.equal(fixture.worker.state.jobs[0].state, "staged");
    assert.equal(fixture.worker.state.jobs[1].state, "queued");
  } finally {
    await fixture.cleanup();
  }
});

test("the fake Worker enforces lease mismatch, replay, invalid transition, and bundle missing responses", async () => {
  const missingJob = makeJob({ bundle: null });
  const fixture = await createFixture({ job: missingJob });
  try {
    const health = await fixture.api.fetchImpl(`${fixture.worker.baseUrl}/api/hosting-worker/health`, { headers: { authorization: `Bearer ${fixture.worker.token}` } });
    assert.deepEqual(await health.json(), { ok: true });
    assert.equal(health.headers.get("cache-control"), "no-store");
    const unauthorized = await fixture.api.fetchImpl(`${fixture.worker.baseUrl}/api/hosting-worker/health`);
    assert.equal((await unauthorized.json()).error, "unauthorized");
    const forbidden = await fixture.api.fetchImpl(`${fixture.worker.baseUrl}/api/unscoped-write`, { headers: { authorization: `Bearer ${fixture.worker.token}` } });
    assert.equal((await forbidden.json()).error, "hosting_worker_scope_forbidden");

    const claimed = await fixture.api.claim("contract-test");
    await assert.rejects(() => fixture.api.downloadBundle(claimed, join(fixture.sandbox.dir, "missing.zip"), rules.bundle.maxZipBytes), (error) => error.code === "bundle_missing");
    const mismatch = await fixture.api.fetchImpl(`${fixture.worker.baseUrl}/api/hosting-worker/jobs/${claimed.id}/report`, {
      method: "POST", headers: { authorization: `Bearer ${fixture.worker.token}`, "x-hosting-lease": "wrong", "content-type": "application/json" }, body: JSON.stringify({ outcome: "removed" }),
    });
    assert.equal((await mismatch.json()).error, "lease_mismatch");
    const invalid = await fixture.api.fetchImpl(`${fixture.worker.baseUrl}/api/hosting-worker/jobs/${claimed.id}/report`, {
      method: "POST", headers: { authorization: `Bearer ${fixture.worker.token}`, "x-hosting-lease": claimed.lease, "content-type": "application/json" }, body: JSON.stringify({ outcome: "removed" }),
    });
    assert.equal((await invalid.json()).error, "hosting_invalid_transition");
    const valid = await fixture.api.report(claimed.id, claimed.lease, { outcome: "failed", code: "bundle_missing", retryable: false, detail: "missing" });
    assert.equal(valid.replayed, false);
    const replay = await fixture.api.report(claimed.id, claimed.lease, { outcome: "failed", code: "bundle_missing", retryable: false, detail: "missing" });
    assert.equal(replay.replayed, true);
    assert.equal(fixture.worker.state.jobs[0].state, "failed");
  } finally {
    await fixture.cleanup();
  }
});

test("a missing Worker bundle is reported as bundle_missing without starting the provider CLI", async () => {
  const fixture = await createFixture({ job: makeJob({ bundle: null }) });
  try {
    await fixture.run();
    assert.deepEqual(await readCliCalls(fixture.sandbox.cliLogPath), []);
    assert.deepEqual(fixture.worker.state.reports.at(-1).body, {
      outcome: "failed", code: "bundle_missing", retryable: false, detail: "uploaded bundle is missing",
    });
    assert.equal(fixture.worker.state.jobs[0].state, "failed");
    assert.deepEqual(Object.keys((await readSteppageState(fixture.sandbox.statePath)).sites), []);
  } finally {
    await fixture.cleanup();
  }
});

test("fake Worker claim order is remove, promote, deploy and expired leases can be reclaimed", async () => {
  const jobs = [
    makeJob({ id: 31, action: "deploy" }),
    makeJob({ id: 32, action: "promote" }),
    makeJob({ id: 33, action: "remove" }),
  ];
  const fixture = await createFixture({ workerOptions: { jobs } });
  try {
    const first = await fixture.api.claim("priority-test");
    const second = await fixture.api.claim("priority-test");
    const third = await fixture.api.claim("priority-test");
    assert.deepEqual([first.action, second.action, third.action], ["remove", "promote", "deploy"]);
    assert.deepEqual([first.id, second.id, third.id], [33, 32, 31]);

    const promoteJob = fixture.worker.state.jobs.find((job) => job.id === 32);
    promoteJob.leaseExpiresAtMs = Date.now() - 1;
    const reclaimed = await fixture.api.claim("priority-test");
    assert.equal(reclaimed.id, 32);
    assert.equal(promoteJob.attempts, 2);
    assert.notEqual(reclaimed.lease, second.lease);
  } finally {
    await fixture.cleanup();
  }

  const exhausted = await createFixture({ workerOptions: { jobs: [makeJob({ id: 44, attempts: 5 })] } });
  try {
    assert.equal(await exhausted.api.claim("attempt-limit-test"), null);
    assert.equal(exhausted.worker.state.jobs[0].attempts, 6);
    assert.equal(exhausted.worker.state.jobs[0].state, "failed");
    assert.equal(exhausted.worker.state.jobs[0].failureCode, "internal");
  } finally {
    await exhausted.cleanup();
  }
});

test("service configuration fails closed when either required credential is missing", async () => {
  await assert.rejects(() => loadConfig({}), /HOSTING_DEPLOYER_TOKEN and STEPFUN_API_KEY are required/u);
  await assert.rejects(() => loadConfig({ HOSTING_DEPLOYER_TOKEN: WORKER_TOKEN, STEPFUN_API_KEY: "" }), /HOSTING_DEPLOYER_TOKEN and STEPFUN_API_KEY are required/u);
  await assert.rejects(() => loadConfig({
    HOSTING_DEPLOYER_TOKEN: WORKER_TOKEN,
    STEPFUN_API_KEY: STEP_KEY,
    STEPPAGE_CMD: JSON.stringify(["steppage", "--go-live"]),
  }), /must not contain credentials or deploy-only flags/u);
  await assert.rejects(() => loadConfig({
    HOSTING_DEPLOYER_TOKEN: WORKER_TOKEN,
    STEPFUN_API_KEY: STEP_KEY,
    STEPPAGE_CMD: JSON.stringify(["steppage", STEP_KEY]),
  }), /must not contain credentials or deploy-only flags/u);
});

test("pinned CLI verification reads its expected SHA from the checksum file", async () => {
  const sandbox = await createSandbox();
  try {
    const scriptPath = join(sandbox.dir, "steppage.mjs");
    const checksumPath = join(sandbox.dir, "STEPPAGE_SHA256");
    const script = Buffer.from("export const version = 'fixture';\n");
    await writeFile(scriptPath, script);
    await writeFile(checksumPath, `${sha256(script)}\n`);
    const result = await verifyPinnedScript([process.execPath, scriptPath], checksumPath);
    assert.equal(result.expected, sha256(script));
    assert.equal(result.checked, true);
    await writeFile(checksumPath, `${"0".repeat(64)}\n`);
    await assert.rejects(() => verifyPinnedScript([process.execPath, scriptPath], checksumPath), /checksum does not match/u);
  } finally {
    await sandbox.cleanup();
  }
});

test("package registration, service hardening, runbook checksum reference, and checksum format are present", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts.test.includes("tests/hosting-deployer.test.mjs"), true);
  assert.equal(packageJson.scripts.test.includes("tests/hosting-deployer-conformance.test.mjs"), true);
  assert.equal(packageJson.scripts.test.endsWith("tests/hosting-deployer-process.test.mjs"), true);
  const service = await readFile(new URL("../deploy/hosting/zaochang-hosting-deployer.service", import.meta.url), "utf8");
  for (const directive of [
    "User=zaochang", "Group=zaochang", "NoNewPrivileges=true", "PrivateTmp=true", "PrivateDevices=true",
    "ProtectSystem=strict", "ProtectHome=true", "ReadWritePaths=/var/lib/zaochang/hosting",
    "EnvironmentFile=/etc/zaochang/hosting.env", "Environment=HOME=/var/lib/zaochang/hosting/home",
    "MemoryMax=300M", "CPUQuota=50%", "TasksMax=64", "Restart=on-failure",
    "ExecStart=/usr/bin/node /opt/zaochang/current/deploy/hosting/hosting-deployer.mjs",
  ]) assert.equal(service.includes(directive), true, directive);
  const readme = await readFile(new URL("../deploy/hosting/README.md", import.meta.url), "utf8");
  assert.equal(readme.includes("deploy/hosting/STEPPAGE_SHA256"), true);
  const checksum = await readFile(new URL("../deploy/hosting/STEPPAGE_SHA256", import.meta.url), "utf8");
  assert.match(checksum, /^[a-f0-9]{64}\r?\n?$/u);
});

async function createFixture({
  action = "deploy",
  bundle = defaultBundle(),
  job: suppliedJob,
  jobOverrides = {},
  attempts = 0,
  idleMs = 1,
  workerOptions = {},
  cliState = {},
} = {}) {
  const sandbox = await createSandbox();
  const bundleBytes = Buffer.isBuffer(bundle) ? bundle : bundle;
  const job = suppliedJob ?? makeJob({ action, bundle: bundleBytes, attempts, ...jobOverrides });
  if (job.bundle && !job.bundleSha256) job.bundleSha256 = sha256(job.bundle);
  if (job.bundle && !job.bundleZipBytes) job.bundleZipBytes = job.bundle.length;
  if (job.bundle && !job.bundleFileCount) job.bundleFileCount = zipMetadata(job.bundle).fileCount;
  await writeFile(sandbox.bundlePath, job.bundle ?? Buffer.alloc(0));
  const worker = await startFakeWorker({ jobs: [job], ...workerOptions });
  await initSteppageFixture(sandbox, {
    ...cliState,
    deployMetadata: { fileCount: job.bundleFileCount, totalBytes: job.bundle ? zipMetadata(job.bundle).totalBytes : 0, ...(cliState.deployMetadata ?? {}) },
  });
  const api = new WorkerApi({ baseUrl: worker.baseUrl, token: worker.token });
  const wal = new WriteAheadLog(join(sandbox.dir, "state"));
  function makeRunner(options = {}) {
    const steppage = options.steppage ?? new Steppage({
      command: [process.execPath, fakeCliPath],
      apiKey: STEP_KEY,
      baseDir: sandbox.dir,
      execFileImpl: async (file, args, opts) => {
        const execOptions = { ...opts, env: { ...opts.env, ...fakeCliEnvironment(sandbox, job.bundle) } };
        try {
          const result = await execFile(file, args, execOptions);
          options.onCli?.(args);
          return result;
        } catch (error) {
          if (error?.code !== "EPERM" || file !== process.execPath || args[0] !== fakeCliPath) throw error;
          const result = await runFakeSteppage({ argv: args.slice(1), env: execOptions.env });
          options.onCli?.(args);
          if (result.exitCode !== 0) {
            throw Object.assign(new Error("fake CLI returned a nonzero exit code"), { code: "FAKE_EXIT", stdout: result.stdout, stderr: result.stderr });
          }
          return { stdout: result.stdout, stderr: result.stderr };
        }
      },
    });
    const runner = new HostingRunner({
      api,
      steppage,
      wal,
      rules,
      workerId: "test-worker",
      idleMs,
      sleep: options.sleep ?? (async () => runner.stop()),
      logger: options.logger ?? (() => undefined),
    });
    return runner;
  }
  return {
    sandbox, job, worker, api, wal, makeRunner,
    async run(options = {}) {
      await makeRunner(options).run({ maxCycles: options.maxCycles ?? 10 });
    },
    async cleanup() {
      await worker.close();
      await sandbox.cleanup();
    },
  };
}

async function writeIntentOnlyDeploy(fixture) {
  const claimed = await fixture.api.claim("recovery-test");
  await fixture.wal.initialize();
  await fixture.wal.write({
    hostingId: String(claimed.id), phase: "intent", action: "deploy", siteName: claimed.siteName,
    siteId: null, versionId: null, lease: claimed.lease, jobPreviewTtl: "7d",
    expectedFileCount: claimed.bundleFileCount, expectedZipBytes: claimed.bundleZipBytes,
    expectedUncompressedBytes: zipMetadata(fixture.job.bundle).totalBytes, result: null, reportBody: null,
  });
  return claimed;
}

function site(siteId, name, liveVersionId) {
  return {
    siteId,
    name,
    slug: "warm-cedar-df1c",
    liveUrl: liveVersionId === "0" ? "" : "https://warm-cedar-df1c.page.stepcloud.com",
    liveVersionId,
    versions: [{ siteId, versionId: "7200", fileCount: 2, totalBytes: "52", previewUrl: `https://p-${"c".repeat(32)}.preview.stepcloud.com` }],
  };
}
