import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { findSecret } from "./secrets.mjs";
import { BundleValidationError, validateBundle } from "./validate.mjs";
import { WorkerApiError } from "./api.mjs";
import { SteppageError } from "./steppage.mjs";

const MAX_FAILURE_DELAY_MS = 60_000;

class ReportPendingError extends Error {
  constructor(cause) {
    super("Worker report remains in WAL", { cause });
    this.name = "ReportPendingError";
  }
}

export class HostingRunner {
  constructor({ api, steppage, wal, rules, workerId, idleMs = 10_000, now = Date.now, sleep = delay, logger = safeLogger }) {
    this.api = api;
    this.steppage = steppage;
    this.wal = wal;
    this.rules = rules;
    this.workerId = workerId;
    this.idleMs = idleMs;
    this.now = now;
    this.sleep = sleep;
    this.logger = logger;
    this.failureCount = 0;
    this.stopping = false;
    this.recovered = false;
    this.retryAfterRecovery = false;
  }

  stop() {
    this.stopping = true;
  }

  async run({ maxCycles = Number.POSITIVE_INFINITY } = {}) {
    await this.wal.initialize();
    let cycles = 0;
    while (!this.stopping && cycles < maxCycles) {
      cycles += 1;
      try {
        if (!this.recovered) {
          await this.recoverOutstanding();
          this.recovered = true;
          await this.wal.cleanExpiredWorkDirs(0, this.now());
          if (this.retryAfterRecovery) {
            this.retryAfterRecovery = false;
            await this.waitAfterFailure();
            continue;
          }
        }
        const job = await this.api.claim(this.workerId);
        if (!job) {
          this.failureCount = 0;
          await this.sleep(this.idleMs);
          continue;
        }
        await this.processJob(job);
        const record = await this.wal.read(job.id);
        if (record?.phase === "reported" && !record.abandoned && record.reportBody?.outcome === "failed" && record.reportBody.retryable === true) {
          await this.waitAfterFailure();
        } else {
          this.failureCount = 0;
        }
      } catch {
        this.recovered = false;
        await this.waitAfterFailure();
      }
    }
  }

  async waitAfterFailure() {
    this.failureCount += 1;
    const delayMs = Math.min(1000 * (2 ** (this.failureCount - 1)), MAX_FAILURE_DELAY_MS);
    this.logger("worker operation failed; retry scheduled");
    await this.sleep(delayMs);
  }

  async recoverOutstanding() {
    for (const record of await this.wal.all()) {
      if (record.phase === "reported") continue;
      if (record.phase === "result") {
        if (record.result?.step === "deployed_pending_expiry" || record.result?.step === "expiry_failed") {
          await this.resumeDeployFinalization(record, { recovering: true });
          continue;
        }
        if (record.reportBody) {
          await this.sendReport(record);
          if (record.reportBody.outcome === "failed" && record.reportBody.retryable === true && !record.abandoned) this.retryAfterRecovery = true;
        }
        continue;
      }
      if (record.phase !== "intent") continue;
      if (record.action === "deploy") {
        const found = await this.findInterruptedDeploy(record);
        if (found.kind === "absent") {
          const original = found.failure ?? failure("provider_error", true, "provider request failed");
          await this.storeAndReport(record, failure(original.code, original.retryable, original.detail));
          continue;
        }
        if (found.kind === "untrusted") {
          const cleanup = await this.cleanupSite(found.siteId, record.siteName).catch(() => ({ ok: false }));
          if (!cleanup.ok) {
            await this.storeAndReport(record, failure("ambiguous", false,
              `untrusted site cleanup failed (${found.reason}) for ${record.siteName}; siteId=${found.siteId}; files=${record.expectedFileCount}; bytes=${record.expectedUncompressedBytes}`));
            continue;
          }
          const original = record.deployFailure ?? failure("provider_error", true, "provider request failed");
          await this.storeAndReport(record, failure(original.code, true, original.detail));
          continue;
        }
        if (found.kind === "ambiguous") {
          await this.storeAndReport(record, failure("ambiguous", false, found.detail));
          continue;
        }
        record.siteId = found.siteId;
        record.versionId = found.versionId;
        record.result = { step: "deployed_pending_expiry", siteId: found.siteId, versionId: found.versionId, previewUrl: found.previewUrl };
        record.phase = "result";
        await this.wal.write(record);
        await this.resumeDeployFinalization(record);
      } else if (record.action === "promote") {
        const site = await this.steppage.get(record.siteId);
        if (isManagedSite(site, record.siteId) && String(site.liveVersionId) === String(record.versionId)) {
          const liveUrl = validLiveUrl(site.liveUrl, this.rules);
          if (liveUrl) await this.storeAndReport(record, { outcome: "live", liveUrl });
          else await this.storeAndReport(record, failure("ambiguous", false, `live version has invalid URL for site ${record.siteId}`));
        } else {
          await this.storeAndReport(record, failure("ambiguous", false, `promote outcome requires review for site ${record.siteId}`));
        }
      } else if (record.action === "remove") {
        await this.recoverRemove(record);
      } else {
        await this.storeAndReport(record, failure("internal", false, "unknown WAL action"));
      }
    }
  }

  async processJob(job) {
    validateJob(job, this.rules);
    if (job.action === "deploy") return this.processDeploy(job);
    if (job.action === "promote") return this.processPromote(job);
    if (job.action === "remove") return this.processRemove(job);
    throw new Error("unsupported hosting action");
  }

  async processDeploy(job) {
    const record = this.newRecord(job, managedSiteName(job, this.rules));
    const workDir = this.wal.workDir(job.id);
    const zipPath = join(workDir, "bundle.zip");
    let validation;
    try {
      await mkdir(workDir, { recursive: true, mode: 0o700 });
      const downloaded = await this.api.downloadBundle(job, zipPath, this.rules.bundle.maxZipBytes);
      if (!/^[a-f0-9]{64}$/u.test(job.bundleSha256) || downloaded.sha256 !== job.bundleSha256 || (downloaded.declaredHash && downloaded.declaredHash !== job.bundleSha256)) {
        return await this.storeAndReport(record, failure("validation_bundle", false, "bundle sha256 mismatch"));
      }
      if (Number(job.bundleZipBytes) !== downloaded.bytes) {
        return await this.storeAndReport(record, failure("validation_bundle", false, "bundle byte count mismatch"));
      }
      validation = await validateBundle(zipPath, job, this.rules);
      record.expectedUncompressedBytes = validation.totalUncompressedBytes;
      const secret = await findSecret(validation.archive, validation.archive.entries, this.rules);
      await validation.archive.close();
      validation = null;
      if (secret) {
        return await this.storeAndReport(record, failure("validation_secret", false, `pattern=${secret.patternId}; file=${secret.path}`));
      }

      record.phase = "intent";
      await this.wal.write(record);
      let deployed;
      try {
        deployed = await this.steppage.deploy(zipPath, record.siteName);
      } catch (error) {
        const classified = classifyCliFailure(error);
        await this.rememberDeployFailure(record, classified);
        throw error;
      }
      const siteId = stringId(deployed?.siteId);
      const versionId = stringId(deployed?.versionId);
      if (!siteId || !versionId) {
        const classified = { code: "provider_error", retryable: true, detail: "provider deploy response was invalid" };
        await this.rememberDeployFailure(record, classified);
        throw new Error("provider deploy response was invalid");
      }
      const normalizedSiteId = siteId;
      const normalizedVersionId = versionId;
      const previewUrl = validPreviewUrl(deployed.previewUrl, this.rules);
      if (!previewUrl) {
        record.siteId = normalizedSiteId;
        record.versionId = normalizedVersionId;
        record.result = { step: "expiry_failed", siteId: normalizedSiteId, versionId: normalizedVersionId, failure: failure("provider_error", true, "provider returned invalid preview URL") };
        record.phase = "result";
        await this.wal.write(record);
        return await this.resumeDeployFinalization(record);
      }
      record.siteId = normalizedSiteId;
      record.versionId = normalizedVersionId;
      record.result = { step: "deployed_pending_expiry", siteId: normalizedSiteId, versionId: normalizedVersionId, previewUrl };
      record.phase = "result";
      await this.wal.write(record);
      return await this.resumeDeployFinalization(record);
    } catch (error) {
      if (validation?.archive) await validation.archive.close().catch(() => undefined);
      if (error instanceof BundleValidationError || error?.code === "validation_bundle") {
        return await this.storeAndReport(record, failure("validation_bundle", false, error.message));
      }
      if (error instanceof WorkerApiError && error.code === "bundle_missing") {
        return await this.storeAndReport(record, failure("bundle_missing", false, "uploaded bundle is missing"));
      }
      throw error;
    } finally {
      await this.wal.cleanupWorkDir(job.id).catch(() => undefined);
    }
  }

  async resumeDeployFinalization(record, { recovering = false } = {}) {
    if (record.result?.step === "expiry_failed") return this.cleanupAndReportExpiryFailure(record);
    if (recovering && record.result?.step === "deployed_pending_expiry") {
      const versions = await this.steppage.versions(record.siteId);
      const version = (Array.isArray(versions?.versions) ? versions.versions : [])
        .find((candidate) => String(candidate.versionId) === String(record.versionId));
      const alreadyExpiresAt = expiryToIso(version?.expiresAt);
      if (alreadyExpiresAt && Date.parse(alreadyExpiresAt) > this.now()) {
        return this.storeStagedResult(record, alreadyExpiresAt);
      }
    }
    let previewExpiresAt;
    try {
      if (record.action !== "deploy" || record.jobPreviewTtl !== "7d") throw Object.assign(new Error("invalid preview TTL"), { code: "provider_error" });
      const expiry = await this.steppage.expirePreview(record.siteId, record.versionId, record.jobPreviewTtl);
      previewExpiresAt = expiryToIso(expiry?.expiresAt);
      if (!previewExpiresAt) throw Object.assign(new Error("invalid expiry response"), { code: "provider_error" });
    } catch (error) {
      const classified = error instanceof SteppageError ? classifyCliFailure(error) : { code: "provider_error", retryable: true, detail: "preview expiry failed" };
      record.result = { step: "expiry_failed", siteId: record.siteId, versionId: record.versionId, previewUrl: record.result?.previewUrl ?? "", failure: failure(classified.code, classified.retryable, classified.detail) };
      record.phase = "result";
      await this.wal.write(record);
      return await this.cleanupAndReportExpiryFailure(record);
    }
    return this.storeStagedResult(record, previewExpiresAt);
  }

  async storeStagedResult(record, previewExpiresAt) {
    record.result = { step: "staged", siteId: record.siteId, versionId: record.versionId, previewUrl: record.result.previewUrl, previewExpiresAt };
    record.reportBody = { outcome: "staged", siteId: record.siteId, versionId: record.versionId, previewUrl: record.result.previewUrl, previewExpiresAt };
    record.phase = "result";
    await this.wal.write(record);
    return this.sendReport(record);
  }

  async cleanupAndReportExpiryFailure(record) {
    const cleanup = await this.cleanupSite(record.siteId, record.siteName).catch(() => ({ ok: false }));
    if (!cleanup.ok) {
      return await this.storeAndReport(record, failure("ambiguous", false, `preview expiry failed; manual cleanup required for site ${record.siteId}`));
    }
    return await this.storeAndReport(record, record.result.failure ?? failure("provider_error", true, "preview expiry failed"));
  }

  async rememberDeployFailure(record, classified) {
    record.deployFailure = {
      code: classified.code,
      retryable: classified.retryable,
      detail: String(classified.detail).slice(0, 200),
    };
    record.updatedAt = new Date(this.now()).toISOString();
    await this.wal.write(record);
  }

  async cleanupSite(siteId, expectedName) {
    const site = await this.steppage.get(siteId).catch((error) => {
      if (isNotFound(error)) return null;
      throw error;
    });
    if (!site) return { ok: true };
    if (!isManagedSite(site, siteId, expectedName)) return { ok: false };
    await this.deleteSite(siteId);
    return { ok: true };
  }

  async deleteSite(siteId) {
    const result = await this.steppage.delete(siteId);
    if (result?.deleted !== true || String(result.siteId) !== String(siteId)) throw new Error("provider delete result was not confirmed");
  }

  async processPromote(job) {
    const record = this.newRecord(job, managedSiteName(job, this.rules));
    try {
      const before = await this.steppage.get(record.siteId);
      if (!isManagedSite(before, record.siteId)) return await this.storeAndReport(record, failure("internal", false, "site name is outside the managed prefix"));
      if (String(before.liveVersionId) === record.versionId) {
        const liveUrl = validLiveUrl(before.liveUrl, this.rules);
        if (!liveUrl) return await this.storeAndReport(record, failure("provider_error", true, "live site URL failed validation"));
        return await this.storeAndReport(record, { outcome: "live", liveUrl });
      }

      record.phase = "intent";
      await this.wal.write(record);
      try {
        await this.steppage.promote(record.siteId, record.versionId);
      } catch (error) {
        const afterError = await this.steppage.get(record.siteId).catch(() => null);
        if (isManagedSite(afterError, record.siteId) && String(afterError.liveVersionId) === record.versionId) {
          const liveUrl = validLiveUrl(afterError.liveUrl, this.rules);
          if (liveUrl) return await this.storeAndReport(record, { outcome: "live", liveUrl });
        }
        const classified = classifyCliFailure(error);
        return await this.storeAndReport(record, failure(classified.code, classified.retryable, classified.detail));
      }

      const after = await this.steppage.get(record.siteId);
      const liveUrl = isManagedSite(after, record.siteId) && String(after.liveVersionId) === record.versionId
        ? validLiveUrl(after.liveUrl, this.rules)
        : null;
      if (!liveUrl) return await this.storeAndReport(record, failure("provider_error", true, "provider did not confirm the promoted version"));
      try {
        await this.steppage.revokePreview(record.siteId, record.versionId);
      } catch {
        this.logger("preview revoke failed after promote; live result is retained");
      }
      return await this.storeAndReport(record, { outcome: "live", liveUrl });
    } catch (error) {
      if (error instanceof ReportPendingError) throw error;
      return await this.storeAndReport(record, failure("provider_error", true, "promote verification failed"));
    } finally {
      await this.wal.cleanupWorkDir(job.id).catch(() => undefined);
    }
  }

  async processRemove(job) {
    const record = this.newRecord(job, managedSiteName(job, this.rules));
    try {
      let site;
      try {
        site = await this.steppage.get(record.siteId);
      } catch (error) {
        if (isNotFound(error)) return await this.storeAndReport(record, { outcome: "removed" });
        throw error;
      }
      if (!isManagedSite(site, record.siteId, record.siteName)) {
        return await this.storeAndReport(record, failure("internal", false, "site name is outside the managed prefix"));
      }
      record.phase = "intent";
      await this.wal.write(record);
      try {
        await this.deleteSite(record.siteId);
      } catch (error) {
        if (isNotFound(error)) return await this.storeAndReport(record, { outcome: "removed" });
        const classified = classifyCliFailure(error);
        return await this.storeAndReport(record, failure(classified.code, classified.retryable, classified.detail));
      }
      return await this.storeAndReport(record, { outcome: "removed" });
    } catch (error) {
      if (error instanceof ReportPendingError) throw error;
      return await this.storeAndReport(record, failure("provider_error", true, "remove operation failed"));
    } finally {
      await this.wal.cleanupWorkDir(job.id).catch(() => undefined);
    }
  }

  async recoverRemove(record) {
    try {
      const site = await this.steppage.get(record.siteId);
      if (!isManagedSite(site, record.siteId, record.siteName)) {
        await this.storeAndReport(record, failure("internal", false, "site name is outside the managed prefix"));
        return;
      }
      await this.deleteSite(record.siteId);
      await this.storeAndReport(record, { outcome: "removed" });
    } catch (error) {
      if (isNotFound(error)) {
        await this.storeAndReport(record, { outcome: "removed" });
        return;
      }
      throw error;
    }
  }

  async findInterruptedDeploy(record) {
    const evidence = `site=${record.siteName}; files=${record.expectedFileCount}; bytes=${record.expectedUncompressedBytes}`;
    let listed;
    try {
      listed = await this.steppage.list();
    } catch {
      return { kind: "ambiguous", detail: `could not list during deploy recovery; ${evidence}` };
    }
    if (!Array.isArray(listed?.sites)) {
      return { kind: "ambiguous", detail: `site list was not parseable during deploy recovery; ${evidence}` };
    }
    const candidates = listed.sites.filter((site) => site?.name === record.siteName);
    if (candidates.length === 0) {
      return { kind: "absent", failure: record.deployFailure ?? failure("provider_error", true, "provider request failed") };
    }
    if (candidates.length !== 1) {
      return { kind: "ambiguous", detail: `multiple sites found during deploy recovery; ${evidence}` };
    }
    const siteId = stringId(candidates[0]?.siteId);
    if (!siteId) return { kind: "ambiguous", detail: `site id was invalid during deploy recovery; ${evidence}` };

    let versionResult;
    try {
      versionResult = await this.steppage.versions(siteId);
    } catch {
      return { kind: "ambiguous", detail: `could not inspect versions during deploy recovery; ${evidence}; siteId=${siteId}` };
    }
    if (!Array.isArray(versionResult?.versions)) {
      return { kind: "ambiguous", detail: `versions response was not parseable during deploy recovery; ${evidence}; siteId=${siteId}` };
    }
    const matching = versionResult.versions.filter((version) =>
      Number(version?.fileCount) === Number(record.expectedFileCount)
      && Number(version?.totalBytes) === Number(record.expectedUncompressedBytes));
    if (versionResult.versions.length === 0 || matching.length === 0) {
      const reason = versionResult.versions.length === 0 ? "site has no versions" : "version stats do not match";
      return { kind: "untrusted", siteId, reason };
    }
    if (matching.length > 1) {
      return { kind: "ambiguous", detail: `multiple versions match during deploy recovery; ${evidence}; siteId=${siteId}` };
    }
    const version = matching[0];
    const versionId = stringId(version.versionId);
    const previewUrl = validPreviewUrl(version.previewUrl, this.rules);
    if (!versionId || !previewUrl) {
      return { kind: "ambiguous", detail: `matching version could not be safely adopted; ${evidence}; siteId=${siteId}` };
    }
    return { kind: "matched", siteId, versionId, previewUrl };
  }

  newRecord(job, siteName) {
    return {
      hostingId: String(job.id),
      phase: "result",
      action: job.action,
      siteName,
      siteId: job.siteId == null ? null : String(job.siteId),
      versionId: job.versionId == null ? null : String(job.versionId),
      lease: job.lease,
      jobPreviewTtl: job.previewTtl ?? "7d",
      expectedFileCount: Number(job.bundleFileCount ?? 0),
      expectedZipBytes: Number(job.bundleZipBytes ?? 0),
      expectedUncompressedBytes: null,
      result: null,
      reportBody: null,
      updatedAt: new Date(this.now()).toISOString(),
    };
  }

  async storeAndReport(record, reportBody) {
    record.phase = "result";
    record.result = { step: "ready_to_report", outcome: reportBody.outcome };
    record.reportBody = reportBody;
    record.updatedAt = new Date(this.now()).toISOString();
    await this.wal.write(record);
    return this.sendReport(record);
  }

  async sendReport(record) {
    let apiResult;
    try {
      apiResult = await this.api.report(record.hostingId, record.lease, record.reportBody);
    } catch (error) {
      if (error instanceof WorkerApiError && error.status === 409 && error.code === "lease_mismatch") {
        record.phase = "reported";
        record.abandoned = true;
        record.lease = null;
        record.updatedAt = new Date(this.now()).toISOString();
        await this.wal.write(record);
        await this.wal.cleanupWorkDir(record.hostingId).catch(() => undefined);
        this.logger("job abandoned after lease mismatch");
        return { abandoned: true };
      }
      throw new ReportPendingError(error);
    }
    record.phase = "reported";
    record.lease = null;
    record.apiResult = { replayed: apiResult?.replayed === true };
    record.updatedAt = new Date(this.now()).toISOString();
    await this.wal.write(record);
    await this.wal.cleanupWorkDir(record.hostingId).catch(() => undefined);
    return apiResult;
  }
}

export function classifyCliFailure(error) {
  const text = `${error?.stderr ?? ""}\n${error?.message ?? ""}`.toLowerCase();
  if (text.includes("forbidden extension") || text.includes("bundle rejected")) return { code: "validation_bundle", retryable: false, detail: "provider rejected bundle" };
  if (text.includes("unauthenticated") || text.includes("api key")) return { code: "provider_auth", retryable: false, detail: "provider authentication rejected" };
  if (["quota", "limit", "exceed", "配额", "上限"].some((term) => text.includes(term))) return { code: "provider_quota", retryable: false, detail: "provider quota rejected request" };
  if (text.includes("audit") || text.includes("审核")) return { code: "provider_audit_rejected", retryable: false, detail: "provider audit rejected request" };
  return { code: "provider_error", retryable: true, detail: error?.timedOut ? "provider request timed out" : "provider request failed" };
}

function validLiveUrl(value, rules) {
  try {
    const url = new URL(value);
    const suffix = rules.provider.liveHostSuffix;
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || url.pathname !== "/" || url.hostname === suffix.slice(1) || !url.hostname.endsWith(suffix)) return null;
    return value;
  } catch {
    return null;
  }
}

function validPreviewUrl(value, rules) {
  try {
    const url = new URL(value);
    const suffix = rules.provider.previewHostSuffix;
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || url.pathname !== "/" || !url.hostname.startsWith("p-") || !url.hostname.endsWith(suffix)) return null;
    return value;
  } catch {
    return null;
  }
}

function expiryToIso(value) {
  const numeric = Number(value);
  const timestamp = Number.isFinite(numeric) && numeric > 0 ? numeric : Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function failure(code, retryable, detail) {
  return { outcome: "failed", code, retryable, detail: String(detail).slice(0, 200) };
}

function siteNameFor(job, maxLength = 64) {
  const name = `zc-p${job.productId}-h${job.id}`;
  if (name.length > maxLength) throw new Error("generated site name exceeds StepFun limit");
  return name;
}

function managedSiteName(job, rules) {
  const expected = siteNameFor(job, rules.provider.siteNameMaxLength);
  if (job.siteName != null && job.siteName !== expected) throw new Error("Worker site name does not match the hosting id");
  return job.siteName ?? expected;
}

function validateJob(job, rules) {
  if (!job || !/^\d{1,18}$/u.test(String(job.id)) || Number(job.id) < 1 || !/^[A-Za-z0-9_-]{43}$/u.test(job.lease ?? "") || !["deploy", "promote", "remove"].includes(job.action)) {
    throw new Error("Worker returned an invalid hosting job");
  }
  if (!/^\d{1,18}$/u.test(String(job.productId)) || Number(job.productId) < 1) throw new Error("Worker returned an invalid product id");
  managedSiteName(job, rules);
  if (job.provider !== "stepfun_page") throw new Error("Worker returned an unsupported provider");
  if ((job.action === "promote" || job.action === "remove") && (!/^\d{1,80}$/u.test(String(job.siteId ?? "")) || (job.action === "promote" && !/^\d{1,80}$/u.test(String(job.versionId ?? ""))))) {
    throw new Error("Worker job omitted remote ids");
  }
}

function stringId(value) {
  return typeof value === "string" && /^\d{1,80}$/u.test(value) ? value : null;
}

function isManagedSite(site, siteId, expectedName = null) {
  return Boolean(site
    && String(site.siteId) === String(siteId)
    && typeof site.name === "string"
    && site.name.startsWith("zc-p")
    && (expectedName === null || site.name === expectedName));
}

function isNotFound(error) {
  const text = `${error?.stderr ?? ""}\n${error?.stdout ?? ""}\n${error?.message ?? ""}`.toLowerCase();
  return /\bnot[ _-]?found\b|does not exist|no such site/u.test(text);
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function safeLogger(message) {
  process.stdout.write(`[hosting-deployer] ${message}\n`);
}
