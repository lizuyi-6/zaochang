import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const host = "127.0.0.1";
const port = Number(process.env.SCANNER_PORT ?? 3311);
const token = process.env.SCANNER_TOKEN ?? "";
const tempRoot = process.env.SCANNER_TEMP_DIR ?? "/var/lib/zaochang/scanner";
const maxBytes = 10 * 1024 * 1024;
const clamscanPath = process.env.CLAMSCAN_PATH ?? "/usr/bin/clamscan";
const flockPath = process.env.FLOCK_PATH ?? "/usr/bin/flock";
const signatureLock = process.env.CLAMAV_LOCK_PATH ?? "/run/lock/zaochang-clamav.lock";

if (token.length < 32) throw new Error("SCANNER_TOKEN must contain at least 32 characters");
const version = spawnSync(clamscanPath, ["--version"], { encoding: "utf8" });
if (version.status !== 0) throw new Error(`clamscan unavailable: ${version.stderr || version.stdout}`);
const engine = version.stdout.trim().slice(0, 120);
await mkdir(tempRoot, { recursive: true, mode: 0o700 });

let busy = false;
const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    return sendJson(response, 200, { status: "ok", engine, busy });
  }
  if (request.method !== "POST" || request.url !== "/scan") {
    request.resume();
    return sendJson(response, 404, { error: "not_found" });
  }
  if (!authorized(request.headers.authorization)) {
    request.resume();
    return sendJson(response, 401, { error: "unauthorized" });
  }
  if (busy) {
    request.resume();
    return sendJson(response, 503, { error: "scanner_busy" });
  }
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (!Number.isFinite(contentLength) || contentLength < 1 || contentLength > maxBytes) {
    request.resume();
    return sendJson(response, 413, { error: "invalid_size" });
  }

  busy = true;
  let scanDirectory = "";
  try {
    const chunks = [];
    let received = 0;
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      received += bytes.length;
      if (received > maxBytes) throw Object.assign(new Error("body_too_large"), { status: 413 });
      chunks.push(bytes);
    }
    if (received !== contentLength) throw Object.assign(new Error("content_length_mismatch"), { status: 400 });
    const body = Buffer.concat(chunks);
    const sha256 = createHash("sha256").update(body).digest("hex");
    if (request.headers["x-content-sha256"] !== sha256) {
      return sendJson(response, 400, { error: "sha256_mismatch" });
    }
    scanDirectory = await mkdtemp(join(tempRoot, "scan-"));
    const filePath = join(scanDirectory, "payload.bin");
    await writeFile(filePath, body, { mode: 0o600 });
    const result = await runClamScan(filePath);
    return sendJson(response, 200, { ...result, engine, sha256 });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 503;
    return sendJson(response, Number.isInteger(status) ? status : 503, { error: status === 413 ? "body_too_large" : "scan_failed" });
  } finally {
    if (scanDirectory) await rm(scanDirectory, { recursive: true, force: true }).catch(() => undefined);
    busy = false;
  }
});

server.requestTimeout = 80_000;
server.headersTimeout = 10_000;
server.listen(port, host, () => {
  process.stdout.write(`zaochang upload scanner listening on ${host}:${port}; engine=${engine}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

function authorized(header) {
  if (!header?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function runClamScan(filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(flockPath, [
      "-n",
      "-E",
      "75",
      signatureLock,
      clamscanPath,
      "--stdout",
      "--no-summary",
      "--max-filesize=10M",
      "--max-scansize=24M",
      "--max-recursion=8",
      "--max-files=500",
      filePath,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(Object.assign(new Error("clamscan_timeout"), { status: 503 }));
    }, 105_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(Object.assign(error, { status: 503 }));
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) return resolve({ verdict: "clean", signature: null });
      if (code === 1) {
        const signature = output.match(/:\s+(.+?)\s+FOUND\s*$/m)?.[1]?.slice(0, 160) ?? "malware";
        return resolve({ verdict: "infected", signature });
      }
      if (code === 75) return reject(Object.assign(new Error("signature_update_in_progress"), { status: 503 }));
      return reject(Object.assign(new Error(`clamscan_error_${code}`), { status: 503 }));
    });
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}
