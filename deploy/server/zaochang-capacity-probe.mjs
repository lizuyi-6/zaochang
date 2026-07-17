import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import https from "node:https";

function usage() {
  console.log("Usage: node zaochang-capacity-probe.mjs --auth none --path /assets/file.js --concurrency 128 [--expected-bytes 123]");
  console.log("Protected preview: credential_base64 | node zaochang-capacity-probe.mjs --auth basic --path /assets/file.js --concurrency 128");
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`invalid argument near ${key ?? "<end>"}`);
    values.set(key.slice(2), value);
  }
  const path = values.get("path");
  const concurrency = Number(values.get("concurrency"));
  const expectedStatus = Number(values.get("expected-status") ?? 200);
  const expectedBytes = values.has("expected-bytes") ? Number(values.get("expected-bytes")) : null;
  const timeoutMs = Number(values.get("timeout-ms") ?? 30_000);
  const label = values.get("label") ?? "capacity_probe";
  const auth = values.get("auth") ?? "basic";
  if (!path?.startsWith("/") || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 512) {
    throw new Error("--path and an integer --concurrency between 1 and 512 are required");
  }
  if (!Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599) throw new Error("invalid --expected-status");
  if (expectedBytes !== null && (!Number.isInteger(expectedBytes) || expectedBytes < 0)) throw new Error("invalid --expected-bytes");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 300_000) throw new Error("invalid --timeout-ms");
  if (!/^[a-z0-9_-]+$/i.test(label)) throw new Error("invalid --label");
  if (auth !== "basic" && auth !== "none") throw new Error("--auth must be basic or none");
  return { path, concurrency, expectedStatus, expectedBytes, timeoutMs, label, auth };
}

async function readCredential() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const encoded = Buffer.concat(chunks).toString("utf8").trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error("credential stdin must be one base64 value");
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  if (!decoded.includes(":")) throw new Error("credential must decode to username:password");
  return encoded;
}

function systemdNumber(unit, property) {
  if (process.platform !== "linux") return null;
  const result = spawnSync("systemctl", ["show", "-p", property, "--value", unit], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const value = Number(result.stdout.trim());
  return Number.isFinite(value) ? value : null;
}

function cgroupMemory(unit) {
  if (process.platform !== "linux") return null;
  try {
    const value = Number(readFileSync(`/sys/fs/cgroup/system.slice/${unit}/memory.current`, "utf8").trim());
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function percentile(sorted, ratio) {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))] ?? 0;
}

async function main() {
  if (process.argv.includes("--help")) {
    usage();
    return;
  }

  const options = parseArgs(process.argv.slice(2));
  const authorization = options.auth === "basic" ? await readCredential() : null;
  const agent = new https.Agent({ keepAlive: true, maxSockets: options.concurrency, maxFreeSockets: options.concurrency });
  const sockets = new Set();
  let active = 0;
  let maxActive = 0;
  let maxOpenSockets = 0;
  let maxAppBytes = cgroupMemory("zaochang.service") ?? 0;
  let maxNginxBytes = cgroupMemory("nginx.service") ?? 0;
  let sampleCount = 0;
  const appRestartsBefore = systemdNumber("zaochang.service", "NRestarts");
  const nginxRestartsBefore = systemdNumber("nginx.service", "NRestarts");

  const sample = () => {
    maxAppBytes = Math.max(maxAppBytes, cgroupMemory("zaochang.service") ?? 0);
    maxNginxBytes = Math.max(maxNginxBytes, cgroupMemory("nginx.service") ?? 0);
    sampleCount += 1;
  };
  const timer = setInterval(sample, 20);

  const requestOne = (index) => new Promise((resolve) => {
    const started = process.hrtime.bigint();
    active += 1;
    maxActive = Math.max(maxActive, active);
    const separator = options.path.includes("?") ? "&" : "?";
    const request = https.request({
      hostname: "127.0.0.1",
      port: 443,
      servername: "aetherstudio.top",
      path: `${options.path}${separator}${options.label}=${Date.now()}-${index}`,
      agent,
      rejectUnauthorized: true,
      headers: {
        host: "aetherstudio.top",
        ...(authorization ? { authorization: `Basic ${authorization}` } : {}),
        "cache-control": "no-cache",
        "user-agent": "zaochang-capacity-probe/1.0",
      },
      timeout: options.timeoutMs,
    }, (response) => {
      let bytes = 0;
      response.on("data", (chunk) => { bytes += chunk.length; });
      response.on("end", () => {
        active -= 1;
        resolve({ status: response.statusCode, bytes, ms: Number(process.hrtime.bigint() - started) / 1e6 });
      });
    });
    request.on("socket", (socket) => {
      sockets.add(socket);
      maxOpenSockets = Math.max(maxOpenSockets, sockets.size);
      socket.once("close", () => sockets.delete(socket));
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", (error) => {
      active -= 1;
      resolve({ error: error.code ?? error.message, bytes: 0, ms: Number(process.hrtime.bigint() - started) / 1e6 });
    });
    request.end();
  });

  const started = Date.now();
  const results = await Promise.all(Array.from({ length: options.concurrency }, (_, index) => requestOne(index)));
  clearInterval(timer);
  sample();
  agent.destroy();

  const latency = results.map((result) => result.ms).sort((left, right) => left - right);
  const statuses = {};
  const errors = {};
  for (const result of results) {
    if (result.status) statuses[result.status] = (statuses[result.status] ?? 0) + 1;
    if (result.error) errors[result.error] = (errors[result.error] ?? 0) + 1;
  }
  const fullBodyCount = options.expectedBytes === null ? null : results.filter((result) => result.bytes === options.expectedBytes).length;
  const appRestartsAfter = systemdNumber("zaochang.service", "NRestarts");
  const nginxRestartsAfter = systemdNumber("nginx.service", "NRestarts");
  const verdict = {
    allExpectedStatus: statuses[options.expectedStatus] === options.concurrency,
    noErrors: Object.keys(errors).length === 0,
    allExpectedBytes: options.expectedBytes === null || fullBodyCount === options.concurrency,
    restartsStable: appRestartsBefore === appRestartsAfter && nginxRestartsBefore === nginxRestartsAfter,
  };
  const output = {
    environment: "server-loopback-https-http1.1",
    target: options,
    client: { maxActive, maxOpenSockets },
    elapsedMs: Date.now() - started,
    statuses,
    errors,
    totalBytes: results.reduce((total, result) => total + result.bytes, 0),
    fullBodyCount,
    latencyMs: {
      min: Number(latency[0].toFixed(1)),
      p50: Number(percentile(latency, 0.5).toFixed(1)),
      p95: Number(percentile(latency, 0.95).toFixed(1)),
      p99: Number(percentile(latency, 0.99).toFixed(1)),
      max: Number(latency.at(-1).toFixed(1)),
    },
    service: { appRestartsBefore, appRestartsAfter, nginxRestartsBefore, nginxRestartsAfter, maxAppBytes, maxNginxBytes, sampleCount },
    verdict,
  };
  console.log(JSON.stringify(output));
  if (!Object.values(verdict).every(Boolean)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`${error.name}: ${error.message}`);
  process.exitCode = 1;
});
