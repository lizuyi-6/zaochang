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
  // retry:盒子(北京)到 Cloudflare 边缘的链路实测丢包严重(2026-10-12:12~14 次请求里 3~4 次 15~30s 超时、成功的也常要 2~14s),
  // 单次请求没有重试会让作业白白耗掉 attempts。仅对「网络错误/超时/5xx」重试;4xx(401/403/404/409/429…)是确定性答复,绝不重试。
  // 重试不会造成重复副作用:claim 丢响应只会留下一个 5 分钟后过期的租约;bundle 下载是 GET;report 按契约幂等(replay)。
  // 类默认不重试(单测可控),生产入口显式传入。
  constructor({ baseUrl, token, fetchImpl = fetch, retry = { tries: 1, baseMs: 1000 }, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
    this.baseUrl = new URL(baseUrl);
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.retry = { tries: Math.max(1, Math.floor(retry.tries)), baseMs: Math.max(0, retry.baseMs) };
    this.sleep = sleep;
  }

  async send(path, init, timeoutMs) {
    const url = this.url(path);
    for (let attempt = 1; ; attempt += 1) {
      const last = attempt >= this.retry.tries;
      try {
        const response = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
        if (response.status >= 500 && !last) {
          try { await response.body?.cancel(); } catch { /* 丢弃 5xx 响应体 */ }
        } else {
          return response;
        }
      } catch (error) {
        if (last) throw error;
      }
      await this.sleep(this.retry.baseMs * 2 ** (attempt - 1));
    }
  }

  async claim(worker) {
    const response = await this.send("/api/hosting-worker/claim", {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ worker }),
    }, 30_000);
    const body = await readJson(response);
    if (!response.ok) throw new WorkerApiError(response.status, safeCode(body));
    return body.job ?? null;
  }

  async downloadBundle(job, destination, maxBytes) {
    const response = await this.send(`/api/hosting-worker/jobs/${encodeURIComponent(job.id)}/bundle`, {
      method: "GET",
      headers: this.headers({ "x-hosting-lease": job.lease }),
    }, 90_000);
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
    const response = await this.send(`/api/hosting-worker/jobs/${encodeURIComponent(jobId)}/report`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json", "x-hosting-lease": lease }),
      body: JSON.stringify(reportBody),
    }, 45_000);
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
