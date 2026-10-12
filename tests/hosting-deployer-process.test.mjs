import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import {
  WORKER_TOKEN,
  STEP_KEY,
  createSandbox,
  defaultBundle,
  initSteppageFixture,
  makeJob,
  readCliCalls,
  startFakeWorker,
} from "./helpers/hosting-deployer-fixtures.mjs";

const testsDir = fileURLToPath(new URL(".", import.meta.url));
const repoDir = resolve(testsDir, "..");
const deployerPath = resolve(repoDir, "deploy/hosting/hosting-deployer.mjs");
const pinPath = resolve(repoDir, "deploy/hosting/STEPPAGE_SHA256");
const PROCESS_TOKEN = "process-worker-token-test-value";
const PROCESS_KEY = "process-stepfun-key-test-value";

test("the real entry rejects each missing credential without echoing supplied values", async () => {
  const sandbox = await createSandbox();
  try {
    const missingToken = await runEntry(sandbox, {
      STEPFUN_API_KEY: PROCESS_KEY,
    });
    assert.equal(missingToken.error, undefined);
    assert.notEqual(missingToken.code, 0);
    assert.doesNotMatch(`${missingToken.stdout}\n${missingToken.stderr}`, /process-stepfun-key-test-value/u);

    const missingKey = await runEntry(sandbox, {
      HOSTING_DEPLOYER_TOKEN: PROCESS_TOKEN,
    });
    assert.equal(missingKey.error, undefined);
    assert.notEqual(missingKey.code, 0);
    assert.doesNotMatch(`${missingKey.stdout}\n${missingKey.stderr}`, /process-worker-token-test-value/u);
  } finally {
    await sandbox.cleanup();
  }
});

test("the real entry rejects a CLI script whose digest differs from STEPPAGE_SHA256", async () => {
  const sandbox = await createSandbox();
  const badScript = join(sandbox.dir, "steppage-mismatch.mjs");
  const bytes = Buffer.from("process.stdout.write('not a pinned CLI');\n");
  try {
    await writeFile(badScript, bytes);
    const expected = (await readFile(pinPath, "utf8")).trim();
    const actual = createHash("sha256").update(bytes).digest("hex");
    assert.notEqual(actual, expected);
    const result = await runEntry(sandbox, {
      HOSTING_DEPLOYER_TOKEN: PROCESS_TOKEN,
      STEPFUN_API_KEY: PROCESS_KEY,
      STEPPAGE_CMD: JSON.stringify([process.execPath, badScript]),
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.code, 0);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(output.includes(PROCESS_TOKEN), false);
    assert.equal(output.includes(PROCESS_KEY), false);
  } finally {
    await sandbox.cleanup();
  }
});

test("a real child claims and reports staged, then exits on stop with an intact WAL", async () => {
  const sandbox = await createSandbox();
  const bundle = defaultBundle();
  const job = makeJob({ bundle });
  const worker = await startFakeWorker({ jobs: [job] });
  const stateDir = join(sandbox.dir, "state");
  const cliPath = join(sandbox.dir, "fake-steppage.cjs");
  const coreUrl = pathToFileURL(join(testsDir, "helpers", "hosting-fake-steppage-core.mjs")).href;
  const cliSource = [
    `import(${JSON.stringify(coreUrl)}).then(async ({ runFakeSteppage }) => {`,
    "  const result = await runFakeSteppage({ argv: process.argv.slice(2), env: process.env });",
    "  if (result.stdout) process.stdout.write(result.stdout);",
    "  if (result.stderr) process.stderr.write(result.stderr);",
    "  process.exitCode = result.exitCode;",
    "}).catch(() => { process.stderr.write('fake CLI failed\\n'); process.exitCode = 1; });",
    "",
  ].join("\n");
  let child;
  let output;
  try {
    await initSteppageFixture(sandbox, {
      deployMetadata: { fileCount: job.bundleFileCount, totalBytes: job.bundle.metadata.totalBytes },
    });
    await writeFile(cliPath, cliSource);
    const env = safeEnvironment({
      HOSTING_DEPLOYER_TOKEN: WORKER_TOKEN,
      STEPFUN_API_KEY: STEP_KEY,
      HOSTING_API_BASE: worker.baseUrl,
      HOSTING_STATE_DIR: stateDir,
      HOSTING_WORKER_ID: "process-test-worker",
      HOSTING_POLL_IDLE_MS: "40",
      STEPPAGE_CMD: JSON.stringify([process.execPath, cliPath]),
      FAKE_STEP_PAGE_STATE: sandbox.statePath,
      FAKE_STEP_PAGE_LOG: sandbox.cliLogPath,
    });
    const running = startCaptured(process.execPath, [deployerPath], { cwd: repoDir, env });
    child = running.child;
    await waitUntil(() => worker.state.reports.length === 1, 8_000, running);
    assert.equal(worker.state.reports[0].body.outcome, "staged");
    assert.deepEqual(worker.state.reports[0].body, {
      outcome: "staged",
      siteId: "5001",
      versionId: "6001",
      previewUrl: `https://p-${"a".repeat(32)}.preview.stepcloud.com`,
      previewExpiresAt: worker.state.reports[0].body.previewExpiresAt,
    });
    assert.equal(Number.isNaN(Date.parse(worker.state.reports[0].body.previewExpiresAt)), false);
    assert.equal(worker.state.jobs[0].state, "staged");
    assert.deepEqual((await readCliCalls(sandbox.cliLogPath)).map((call) => call.command), ["deploy", "preview expiry"]);

    if (process.platform === "win32") process.kill(child.pid);
    else child.kill("SIGTERM");
    const exit = await waitForExit(running, 8_000);
    assert.equal(exit.error, undefined);
    if (process.platform !== "win32") assert.equal(exit.code, 0);
    output = `${running.stdout()}\n${running.stderr()}`;
    const lease = worker.state.jobs[0].lease;
    for (const secret of [WORKER_TOKEN, STEP_KEY, lease]) assert.equal(output.includes(secret), false);

    const jobFiles = await readdir(join(stateDir, "jobs"));
    assert.equal(jobFiles.some((name) => name.endsWith(".tmp")), false);
    const walText = await readFile(join(stateDir, "jobs", `${job.id}.json`), "utf8");
    const wal = JSON.parse(walText);
    assert.equal(wal.phase, "reported");
    assert.equal(wal.reportBody.outcome, "staged");
  } finally {
    if (child?.exitCode === null && child?.signalCode === null) child.kill();
    await worker.close();
    await sandbox.cleanup();
  }
});

async function runEntry(sandbox, overrides) {
  const env = safeEnvironment({
    HOSTING_STATE_DIR: join(sandbox.dir, "state"),
    HOSTING_API_BASE: "http://127.0.0.1:9",
    ...overrides,
  });
  const running = startCaptured(process.execPath, [deployerPath], { cwd: repoDir, env });
  return waitForExit(running, 5_000);
}

function safeEnvironment(values) {
  const env = {};
  for (const key of ["PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP"]) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return { ...env, ...values };
}

function startCaptured(command, args, options) {
  const child = spawn(command, args, { ...options, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const stdoutChunks = [];
  const stderrChunks = [];
  child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
  const result = { child, spawnError: null, stdout: () => Buffer.concat(stdoutChunks).toString("utf8"), stderr: () => Buffer.concat(stderrChunks).toString("utf8") };
  result.exit = new Promise((resolveExit) => {
    child.once("error", (error) => {
      result.spawnError = error;
      resolveExit({ error, code: null, signal: null });
    });
    child.once("close", (code, signal) => resolveExit({ code, signal, error: undefined }));
  });
  return result;
}

async function waitForExit(running, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      running.exit,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("child process did not exit before the deadline")), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitUntil(predicate, timeoutMs, running) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (running.spawnError) throw running.spawnError;
    if (predicate()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  throw new Error("child process did not report staged before the deadline");
}
