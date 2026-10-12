import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export class WorkerApiError extends Error {
  constructor(status, code) {
    super(`Worker API returned ${status}: ${code}`);
    this.name = "WorkerApiError";
    this.status = status;
    this.code = code;
  }
}

export class WorkerApi {
  constructor({ baseUrl, token, fetchImpl = fetch }) {
    this.baseUrl = new URL(baseUrl);
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  async claim(worker) {
    const response = await this.fetchImpl(this.url("/api/hosting-worker/claim"), {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ worker }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await readJson(response);
    if (!response.ok) throw new WorkerApiError(response.status, safeCode(body));
    return body.job ?? null;
  }

  async downloadBundle(job, destination, maxBytes) {
    const response = await this.fetchImpl(this.url(`/api/hosting-worker/jobs/${encodeURIComponent(job.id)}/bundle`), {
      method: "GET",
      headers: this.headers({ "x-hosting-lease": job.lease }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const body = await readJson(response);
      throw new WorkerApiError(response.status, safeCode(body));
    }
    if (!response.body) throw new WorkerApiError(502, "bundle_body_missing");
    const declaredHash = response.headers.get("x-bundle-sha256") ?? "";
    const hash = createHash("sha256");
    let bytes = 0;
    const limiter = new Transform({
      transform(chunk, encoding, callback) {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
        bytes += data.length;
        if (bytes > maxBytes) return callback(new Error("bundle exceeds configured size limit"));
        hash.update(data);
        callback(null, data);
      },
    });
    await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(destination, { flags: "wx", mode: 0o600 }));
    return { sha256: hash.digest("hex"), bytes, declaredHash };
  }

  async report(jobId, lease, reportBody) {
    const response = await this.fetchImpl(this.url(`/api/hosting-worker/jobs/${encodeURIComponent(jobId)}/report`), {
      method: "POST",
      headers: this.headers({ "content-type": "application/json", "x-hosting-lease": lease }),
      body: JSON.stringify(reportBody),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await readJson(response);
    if (!response.ok) throw new WorkerApiError(response.status, safeCode(body));
    return body;
  }

  url(path) {
    return new URL(path, this.baseUrl).toString();
  }

  headers(extra = {}) {
    return { authorization: `Bearer ${this.token}`, ...extra };
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function safeCode(body) {
  return typeof body?.error === "string" ? body.error.slice(0, 80) : "worker_api_error";
}
