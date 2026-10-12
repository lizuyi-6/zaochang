import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

const WORKER_TOKEN = "worker-test-token-never-log";
const STEP_KEY = "stepfun-test-key-never-log";
const LEASE_TOKEN = "lease-test-token-never-log";

export { LEASE_TOKEN, STEP_KEY, WORKER_TOKEN };

export function makeZip(entries, { method = "store" } = {}) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const input of entries) {
    const name = Buffer.from(input.name, "utf8");
    const content = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content ?? "", "utf8");
    const chosenMethod = input.method === "deflate" ? 8 : input.method === "store" ? 0 : (input.method ?? (method === "deflate" ? 8 : 0));
    const compressed = chosenMethod === 8 ? deflateRawSync(content, { level: 9 }) : content;
    const crc = crc32(content);
    const flags = input.flags ?? 0x0800;
    const external = input.externalAttributes ?? (input.name.endsWith("/") ? (0o40755 << 16) | 0x10 : 0o100644 << 16);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(chosenMethod, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(chosenMethod, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(input.diskStart ?? 0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(external >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function defaultBundle() {
  return makeZip([
    { name: "index.html", content: "<!doctype html><title>demo</title>" },
    { name: "assets/app.js", content: "console.log('demo')" },
  ]);
}

export async function createSandbox() {
  const dir = await mkdtemp(join(tmpdir(), "hosting-deployer-test-"));
  return {
    dir,
    bundlePath: join(dir, "bundle.zip"),
    statePath: join(dir, "steppage-state.json"),
    cliLogPath: join(dir, "steppage-calls.jsonl"),
    workerStatePath: join(dir, "worker-state.json"),
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function startFakeWorker({ jobs = [], reportFailures = 0, claimFailures = 0, forceLeaseMismatch = false } = {}) {
  const token = WORKER_TOKEN;
  const state = {
    jobs: jobs.map((job) => ({
      state: defaultState(job.action),
      desired: job.action === "promote" ? "live" : job.action === "remove" ? "removed" : "staged",
      attempts: 0,
      lease: null,
      leaseExpiresAtMs: 0,
      lastReport: null,
      ...job,
    })),
    reports: [],
    claimFailures,
    reportFailures,
    forceLeaseMismatch,
    bundles: new Map(jobs.map((job) => [String(job.id), job.bundle])),
  };
  const server = createServer(async (request, response) => {
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    const url = new URL(request.url, "http://127.0.0.1");
    if (!authorized(request.headers.authorization, token)) {
      request.resume();
      return json(response, 401, { error: "unauthorized" });
    }
    if (request.method === "GET" && url.pathname === "/api/hosting-worker/health") {
      return json(response, 200, { ok: true });
    }
    if (request.method === "POST" && url.pathname === "/api/hosting-worker/claim") {
      const body = await readBody(request);
      if (typeof body.worker !== "string" || body.worker.length > 64) return json(response, 400, { error: "invalid_worker" });
      if (state.claimFailures > 0) {
        state.claimFailures -= 1;
        return json(response, 503, { error: "temporary_worker_error" });
      }
      const job = claimableJob(state.jobs);
      if (!job) return json(response, 200, { job: null });
      if (job.attempts + 1 > 5) {
        job.attempts += 1;
        job.state = "failed";
        job.failureCode = "internal";
        return json(response, 200, { job: null });
      }
      job.lease = randomBytes(32).toString("base64url");
      job.leaseExpiresAtMs = Date.now() + 5 * 60 * 1000;
      job.attempts += 1;
      job.state = job.action === "deploy" ? "deploying" : job.action === "promote" ? "promoting" : "removing";
      return json(response, 200, { job: wireJob(job) });
    }
    const bundleMatch = request.method === "GET" && url.pathname.match(/^\/api\/hosting-worker\/jobs\/(\d+)\/bundle$/u);
    if (bundleMatch) {
      const job = getJob(state.jobs, bundleMatch[1]);
      if (!validLease(job, request.headers["x-hosting-lease"])) return json(response, 409, { error: "lease_mismatch" });
      if (job.action !== "deploy" || job.state !== "deploying") return json(response, 409, { error: "hosting_invalid_transition" });
      if (!job.bundle) return json(response, 404, { error: "bundle_missing" });
      response.writeHead(200, { "content-type": "application/zip", "x-bundle-sha256": job.bundleSha256 });
      response.end(job.bundle);
      return;
    }
    const reportMatch = request.method === "POST" && url.pathname.match(/^\/api\/hosting-worker\/jobs\/(\d+)\/report$/u);
    if (reportMatch) {
      const job = getJob(state.jobs, reportMatch[1]);
      const body = await readBody(request);
      state.reports.push({ id: String(job.id), body });
      if (forceLeaseMismatch || !validLease(job, request.headers["x-hosting-lease"])) return json(response, 409, { error: "lease_mismatch" });
      if (job.lastReport && JSON.stringify(job.lastReport) === JSON.stringify(body)) return json(response, 200, { ok: true, replayed: true });
      if (state.reportFailures > 0) {
        state.reportFailures -= 1;
        return json(response, 503, { error: "temporary_worker_error" });
      }
      const transitionError = applyReport(job, body);
      if (transitionError) return json(response, 409, { error: transitionError });
      job.lastReport = body;
      return json(response, 200, { ok: true, replayed: false });
    }
    request.resume();
    return json(response, 403, { error: "hosting_worker_scope_forbidden" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    token,
    state,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

export async function initSteppageFixture(sandbox, { sites = {}, failures = {}, responses = {}, rawStdout = {}, nextSiteId = 5000, nextVersionId = 6000, deployMetadata = {} } = {}) {
  await writeFile(sandbox.statePath, JSON.stringify({ sites, failures, responses, rawStdout, nextSiteId, nextVersionId, deployMetadata }), { mode: 0o600 });
  await writeFile(sandbox.cliLogPath, "", { mode: 0o600 });
}

export async function readCliCalls(path) {
  const text = await readFile(path, "utf8");
  return text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

export async function readSteppageState(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export function fakeCliEnvironment(sandbox, bundle) {
  const fileCount = bundle?.metadata?.fileCount ?? 2;
  const totalBytes = bundle?.metadata?.totalBytes ?? 0;
  return {
    FAKE_STEP_PAGE_STATE: sandbox.statePath,
    FAKE_STEP_PAGE_LOG: sandbox.cliLogPath,
    FAKE_STEP_PAGE_FILES: String(fileCount),
    FAKE_STEP_PAGE_BYTES: String(totalBytes),
  };
}

export function makeJob({ id = 12, action = "deploy", bundle = defaultBundle(), productId = 5, attempts = 0, ...extra } = {}) {
  const metadata = bundle ? zipMetadata(bundle) : { fileCount: 0, totalBytes: 0 };
  return {
    id,
    action,
    productId,
    siteName: `zc-p${productId}-h${id}`,
    provider: "stepfun_page",
    previewTtl: "7d",
    bundle,
    bundleSha256: bundle ? sha256(bundle) : "",
    bundleZipBytes: bundle?.length ?? 0,
    bundleFileCount: metadata.fileCount,
    siteId: action === "deploy" ? null : "7100",
    versionId: action === "promote" ? "7200" : null,
    attempts,
    ...extra,
  };
}

export function zipMetadata(buffer) {
  // The fixture knows the caller's simple file inputs through a tiny central-directory walk.
  let eocd = buffer.length - 22;
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error("fixture zip missing end record");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  let fileCount = 0;
  let totalBytes = 0;
  for (let index = 0; index < count; index += 1) {
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const size = buffer.readUInt32LE(offset + 24);
    if (!name.endsWith("/")) {
      fileCount += 1;
      totalBytes += size;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  buffer.metadata = { fileCount, totalBytes };
  return buffer.metadata;
}

export function jobBundle(job) {
  return job.bundle;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function authorized(header, expected) {
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const actual = Buffer.from(header.slice(7));
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

function validLease(job, candidate) {
  if (!job || !candidate || Date.now() >= job.leaseExpiresAtMs || typeof job.lease !== "string") return false;
  const actual = Buffer.from(candidate);
  const target = Buffer.from(job.lease);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

function claimableJob(jobs) {
  const priority = { remove: 0, promote: 1, deploy: 2 };
  return jobs.filter((job) => {
    if (job.lease && Date.now() < job.leaseExpiresAtMs) return false;
    if (job.action === "deploy") return job.desired === "staged" && (job.state === "queued" || job.state === "deploying");
    if (job.action === "promote") return job.desired === "live" && (job.state === "staged" || job.state === "promoting");
    return job.desired === "removed" && ["staged", "live", "failed", "removing"].includes(job.state) && job.siteId;
  }).sort((a, b) => priority[a.action] - priority[b.action])[0] ?? null;
}

function wireJob(job) {
  return {
    id: job.id,
    action: job.action,
    lease: job.lease,
    leaseExpiresAt: new Date(job.leaseExpiresAtMs).toISOString(),
    productId: job.productId,
    provider: job.provider,
    siteName: job.siteName,
    previewTtl: job.previewTtl,
    bundleSha256: job.bundleSha256,
    bundleZipBytes: job.bundleZipBytes,
    bundleFileCount: job.bundleFileCount,
    siteId: job.siteId,
    versionId: job.versionId,
  };
}

function applyReport(job, body) {
  if (!body || !["staged", "live", "removed", "failed"].includes(body.outcome)) return "hosting_invalid_transition";
  if (body.outcome === "staged" && job.action === "deploy" && job.state === "deploying" && body.siteId && body.versionId && body.previewUrl) {
    job.state = "staged";
    job.siteId = String(body.siteId);
    job.versionId = String(body.versionId);
    job.previewUrl = body.previewUrl;
    job.previewExpiresAt = body.previewExpiresAt;
    return null;
  }
  if (body.outcome === "live" && job.action === "promote" && job.state === "promoting" && body.liveUrl) {
    job.state = "live";
    job.liveUrl = body.liveUrl;
    return null;
  }
  if (body.outcome === "removed" && job.action === "remove" && job.state === "removing") {
    job.state = "removed";
    return null;
  }
  if (body.outcome === "failed" && ["validation_bundle", "validation_secret", "provider_quota", "provider_audit_rejected", "provider_error", "provider_auth", "ambiguous", "bundle_missing", "internal"].includes(body.code) && typeof body.retryable === "boolean" && typeof body.detail === "string" && body.detail.length <= 200) {
    job.failureCode = body.code;
    job.failureDetail = body.detail;
    if (job.action === "deploy") job.state = body.retryable && job.attempts < 5 ? "queued" : "failed";
    else if (job.action === "promote") job.state = "staged";
    else job.state = "removing";
    return null;
  }
  return "hosting_invalid_transition";
}

function getJob(jobs, id) {
  const job = jobs.find((item) => String(item.id) === String(id));
  if (!job) throw new Error("fake Worker route references unknown hosting id");
  return job;
}

function defaultState(action) {
  return action === "deploy" ? "queued" : action === "promote" ? "staged" : "removing";
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? ((value >>> 1) ^ 0xedb88320) : (value >>> 1);
  }
  return (value ^ 0xffffffff) >>> 0;
}
