import { env } from "cloudflare:workers";
import { adminAuditStatement } from "./admin";
import { inspectBundleZip, loadDefaultRules } from "./hosting-bundle";
import { constantTimeEquals, toBase64Url } from "./crypto-utils";
import { accessError, errorMessageIncludes } from "./errors";
import { database } from "./community";
import { hostedUrlSelect } from "./hosting-sql";
import { enforceRateLimit, rateLimitKey } from "./rate-limit";
import { MAX_UPLOAD_BYTES, sha256Hex, inspectUpload } from "./upload-security";
import { storeScannedUpload } from "./upload-core";
import type { MemberIdentity } from "./access-control";

const LEASE_SECONDS = 5 * 60;
const MAX_ATTEMPTS = 5;
const UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;
const rules = loadDefaultRules();

type HostingProduct = {
  ownerEmail: string;
  demoUrl: string | null;
  reviewVersion: number;
  hostingRevision: number;
};

type HostingRow = {
  id: number;
  product_id: number;
  owner_email: string;
  bundle_key: string;
  bundle_sha256: string;
  bundle_zip_bytes: number;
  bundle_file_count: number;
  bundle_uncompressed_bytes: number;
  review_version: number;
  hosting_revision: number;
  approved_version: number;
  state: string;
  desired: string;
  site_id: string | null;
  version_id: string | null;
  preview_url: string | null;
  preview_expires_at: string | null;
  live_url: string | null;
  failure_code: string | null;
  failure_detail: string | null;
  lease_token_hash: string | null;
  lease_expires_at: string | null;
  attempts: number;
};

function fail(code: string, status: number): never {
  throw accessError(code, status);
}

function mapHostingDatabaseError(error: unknown): never {
  const mappings: Array<[string, string, number]> = [
    ["hosting_not_granted", "hosting_not_granted", 403],
    ["hosting_quota_exceeded", "hosting_quota_exceeded", 409],
    ["hosting_demo_url_conflict", "hosting_demo_url_conflict", 409],
    ["hosting_owner_mismatch", "hosting_owner_mismatch", 403],
    ["hosting_not_staged", "hosting_not_staged", 409],
    ["hosting_revision_mismatch", "hosting_revision_mismatch", 409],
    ["hosting_review_version_mismatch", "hosting_review_version_mismatch", 409],
    ["hosting_product_not_pending", "hosting_product_not_pending", 409],
    ["hosting_bundle_invalid", "hosting_bundle_invalid", 400],
    ["hosting_invalid_transition", "hosting_invalid_transition", 409],
    ["hosting_live_requires_approval", "hosting_live_requires_approval", 409],
    ["hosting_token_limit", "hosting_token_limit", 409],
    ["hosting_token_immutable", "invalid_upload_token", 401],
  ];
  for (const [marker, code, status] of mappings) {
    if (errorMessageIncludes(error, marker)) fail(code, status);
  }
  if (errorMessageIncludes(error, "NOT NULL constraint failed: product_hostings.review_version")
    || errorMessageIncludes(error, "NOT NULL constraint failed: product_hostings.hosting_revision")) {
    fail("hosting_owner_mismatch", 403);
  }
  throw error;
}

async function assertGrant(memberEmail: string): Promise<void> {
  const grant = await database().prepare(
    `SELECT 1 AS found FROM hosting_grants
     WHERE member_email = ? AND revoked_at IS NULL`,
  ).bind(memberEmail).first<{ found: number }>();
  if (!grant) fail("hosting_not_granted", 403);
}

async function assertMemberProduct(member: Pick<MemberIdentity, "email">, productId: number): Promise<HostingProduct> {
  if (!Number.isSafeInteger(productId) || productId < 1) fail("product_not_found", 404);
  await assertGrant(member.email);
  const product = await database().prepare(
    `SELECT owner_email AS ownerEmail, demo_url AS demoUrl,
            review_version AS reviewVersion, hosting_revision AS hostingRevision
     FROM products WHERE id = ?`,
  ).bind(productId).first<HostingProduct>();
  if (!product) fail("product_not_found", 404);
  if (product.ownerEmail !== member.email) fail("hosting_owner_mismatch", 403);
  if (product.demoUrl?.trim()) fail("hosting_demo_url_conflict", 409);
  return product;
}

export async function submitHostingBundle(args: {
  member: Pick<MemberIdentity, "email">;
  productId: number;
  file: File;
}): Promise<{ id: number; state: string; desired: string }> {
  await assertMemberProduct(args.member, args.productId);

  const inspected = await inspectUpload(args.file, { allowArchive: true, purpose: "hosting_bundle" });
  const bundle = inspectBundleZip(inspected.bytes);
  if (!bundle.ok) fail(bundle.code, 400);

  await enforceRateLimit(
    await rateLimitKey("hosting-submit", args.member.email),
    5,
    60 * 60,
  );

  const stored = await storeScannedUpload({
    file: args.file,
    ownerEmail: args.member.email,
    visibility: "private",
    purpose: "hosting_bundle",
    allowArchive: true,
  });

  const db = database();
  try {
    // 上传扫描完成后才进入这个单一原子 batch。R2 clean 对象在 batch 失败时保留，
    // 由孤儿对象清理流程回收；batch 自身不能留下 revision bump 或半条 hosting 行。
    const results = await db.batch([
      db.prepare(
        `UPDATE products SET hosting_revision = hosting_revision + 1
         WHERE id = ? AND owner_email = ? AND (demo_url IS NULL OR length(trim(demo_url)) = 0)`,
      ).bind(args.productId, args.member.email),
      db.prepare(
        `UPDATE product_hostings SET desired = 'removed', updated_at = CURRENT_TIMESTAMP
         WHERE product_id = ? AND desired <> 'removed'`,
      ).bind(args.productId),
      db.prepare(
        `INSERT INTO product_hostings
         (product_id, owner_email, bundle_key, bundle_sha256,
          bundle_zip_bytes, bundle_file_count, bundle_uncompressed_bytes,
          review_version, hosting_revision, approved_version, state, desired, provider)
         VALUES (
           ?, ?, ?, ?, ?, ?, ?,
           (SELECT review_version FROM products WHERE id = ? AND owner_email = ?),
           (SELECT hosting_revision FROM products WHERE id = ? AND owner_email = ?),
           0, 'queued', 'staged', 'stepfun_page'
         )`,
      ).bind(
        args.productId,
        args.member.email,
        stored.key,
        inspected.sha256,
        bundle.summary.zipBytes,
        bundle.summary.fileCount,
        bundle.summary.uncompressedBytes,
        args.productId,
        args.member.email,
        args.productId,
        args.member.email,
      ),
    ]);
    // D1 的 meta.changes 把触发器引起的行变更也算进去(UPDATE products 会触发
    // product_material_change_requires_review 再 UPDATE 一次 → changes=2),所以这里不能断言恰好为 1。
    // 所有权并发变化时 INSERT 的 NOT NULL 标量子查询会让整批回滚(见 catch),此处只做兜底:
    // 产品更新至少命中一行、INSERT 恰好落一行。
    if (Number(results[0]?.meta?.changes ?? 0) < 1 || Number(results[2]?.meta?.changes ?? 0) !== 1) {
      throw accessError("product_not_found", 404);
    }
  } catch (error) {
    mapHostingDatabaseError(error);
  }

  const inserted = (await db.prepare(
    `SELECT id, state, desired FROM product_hostings
     WHERE product_id = ? AND bundle_key = ? ORDER BY id DESC LIMIT 1`,
  ).bind(args.productId, stored.key).first<{ id: number; state: string; desired: string }>()) ?? null;
  if (!inserted) fail("hosting_submission_failed", 500);
  return inserted;
}

export async function createHostingUploadToken(member: Pick<MemberIdentity, "email">, productId: number) {
  await assertMemberProduct(member, productId);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = toBase64Url(bytes);
  const expiresAt = new Date(Date.now() + UPLOAD_TOKEN_TTL_MS).toISOString();
  try {
    await database().prepare(
      `INSERT INTO hosting_upload_tokens (token_hash, member_email, product_id, expires_at)
       VALUES (?, ?, ?, ?)`,
    ).bind(await sha256Hex(new TextEncoder().encode(token)), member.email, productId, expiresAt).run();
  } catch (error) {
    mapHostingDatabaseError(error);
  }
  return { token, url: `/api/hosting/bundles/${token}`, expiresAt, maxBytes: MAX_UPLOAD_BYTES };
}

export async function consumeHostingUploadToken(token: string): Promise<{ memberEmail: string; productId: number }> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) fail("invalid_upload_token", 401);
  const hash = await sha256Hex(new TextEncoder().encode(token));
  const db = database();
  const consumed = await db.prepare(
    `UPDATE hosting_upload_tokens SET used_at = CURRENT_TIMESTAMP
     WHERE token_hash = ? AND used_at IS NULL AND julianday(expires_at) > julianday('now')`,
  ).bind(hash).run();
  if (Number(consumed.meta.changes ?? 0) !== 1) fail("invalid_upload_token", 401);
  const row = await db.prepare(
    `SELECT member_email AS memberEmail, product_id AS productId
     FROM hosting_upload_tokens WHERE token_hash = ?`,
  ).bind(hash).first<{ memberEmail: string; productId: number }>();
  if (!row) fail("invalid_upload_token", 401);
  return row;
}

export async function getHostingGrant(member: Pick<MemberIdentity, "email">): Promise<{ granted: boolean; maxSites: number; usedSites: number }> {
  const grant = await database().prepare(
    `SELECT max_sites AS maxSites FROM hosting_grants
     WHERE member_email = ? AND revoked_at IS NULL`,
  ).bind(member.email).first<{ maxSites: number }>();
  if (!grant) return { granted: false, maxSites: 0, usedSites: 0 };
  const count = await database().prepare(
    `SELECT COUNT(*) AS usedSites FROM product_hostings
     WHERE owner_email = ? AND desired <> 'removed'`,
  ).bind(member.email).first<{ usedSites: number }>();
  return { granted: true, maxSites: Number(grant.maxSites), usedSites: Number(count?.usedSites ?? 0) };
}

export async function getHostingStatus(member: Pick<MemberIdentity, "email">, productId: number) {
  if (!Number.isSafeInteger(productId) || productId < 1) fail("product_not_found", 404);
  const row = await database().prepare(
    `SELECT p.review_version AS reviewVersion, p.approved_version AS approvedVersion,
            ${hostedUrlSelect("p")},
            h.id AS hostingId, h.state AS hostingState, h.desired AS hostingDesired,
            h.review_version AS hostingReviewVersion, h.approved_version AS hostingApprovedVersion,
            h.failure_code AS failureCode, h.failure_detail AS failureDetail,
            h.preview_url AS previewUrl, h.preview_expires_at AS previewExpiresAt,
            h.bundle_file_count AS bundleFileCount,
            h.bundle_uncompressed_bytes AS bundleUncompressedBytes,
            h.bundle_sha256 AS bundleSha256, h.created_at AS createdAt, h.updated_at AS updatedAt
     FROM products p
     LEFT JOIN product_hostings h ON h.id = (
       SELECT latest.id FROM product_hostings latest
       WHERE latest.product_id = p.id AND NOT (latest.desired = 'removed' AND latest.state = 'removed')
       ORDER BY latest.id DESC LIMIT 1
     )
     WHERE p.id = ? AND p.owner_email = ?`,
  ).bind(productId, member.email).first<Record<string, unknown>>();
  if (!row) fail("product_not_found", 404);
  const hasHosting = row.hostingId !== null && row.hostingId !== undefined;
  return {
    reviewVersion: Number(row.reviewVersion),
    approvedVersion: Number(row.approvedVersion),
    hosting: hasHosting ? {
      id: Number(row.hostingId),
      state: row.hostingState,
      desired: row.hostingDesired,
      failureCode: row.failureCode,
      failureDetail: row.failureDetail,
      previewUrl: row.previewUrl,
      previewExpiresAt: row.previewExpiresAt,
      bundleFileCount: Number(row.bundleFileCount),
      bundleUncompressedBytes: Number(row.bundleUncompressedBytes),
      bundleSha256: row.bundleSha256,
      hostedUrl: row.hostedUrl ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } : null,
  };
}

async function removeRowsForProduct(productId: number): Promise<void> {
  await database().prepare(
    `UPDATE product_hostings SET desired = 'removed',
       state = CASE
         WHEN state = 'queued' AND site_id IS NULL THEN 'removed'
         WHEN state IN ('staged', 'live', 'failed') AND site_id IS NOT NULL THEN 'removing'
         WHEN state = 'failed' AND site_id IS NULL THEN 'removed'
         WHEN state = 'queued' AND site_id IS NOT NULL THEN 'failed'
         ELSE state END,
       failure_code = CASE WHEN state = 'queued' AND site_id IS NOT NULL THEN 'ambiguous' ELSE failure_code END,
       failure_detail = CASE WHEN state = 'queued' AND site_id IS NOT NULL
         THEN 'queued row unexpectedly has a site id; manual reconciliation required' ELSE failure_detail END,
       lease_expires_at = CASE WHEN state IN ('staged', 'live', 'failed') THEN NULL ELSE lease_expires_at END,
       updated_at = CURRENT_TIMESTAMP
     WHERE product_id = ? AND desired <> 'removed'`,
  ).bind(productId).run();
}

export async function requestHostingRemoval(member: Pick<MemberIdentity, "email">, productId: number): Promise<void> {
  if (!Number.isSafeInteger(productId) || productId < 1) fail("product_not_found", 404);
  const product = await database().prepare(
    `SELECT 1 AS found FROM products WHERE id = ? AND owner_email = ?`,
  ).bind(productId, member.email).first<{ found: number }>();
  if (!product) fail("product_not_found", 404);
  await removeRowsForProduct(productId);
}

export async function adminRemoveHosting(admin: MemberIdentity, productId: number, note: string): Promise<void> {
  if (!Number.isSafeInteger(productId) || productId < 1 || note.trim().length < 4) fail("invalid_hosting_removal", 400);
  const db = database();
  const product = await db.prepare(`SELECT 1 AS found FROM products WHERE id = ?`).bind(productId).first();
  if (!product) fail("product_not_found", 404);
  const hosting = await db.prepare(
    `SELECT 1 AS found FROM product_hostings WHERE product_id = ? AND desired <> 'removed' LIMIT 1`,
  ).bind(productId).first();
  if (!hosting) fail("hosting_not_found", 404);
  try {
    await db.batch([
      db.prepare(
        `UPDATE product_hostings SET desired = 'removed',
           state = CASE
             WHEN state = 'queued' AND site_id IS NULL THEN 'removed'
             WHEN state IN ('staged', 'live', 'failed') AND site_id IS NOT NULL THEN 'removing'
             WHEN state = 'failed' AND site_id IS NULL THEN 'removed'
             WHEN state = 'queued' AND site_id IS NOT NULL THEN 'failed'
             ELSE state END,
           failure_code = CASE WHEN state = 'queued' AND site_id IS NOT NULL THEN 'ambiguous' ELSE failure_code END,
           failure_detail = CASE WHEN state = 'queued' AND site_id IS NOT NULL
             THEN 'queued row unexpectedly has a site id; manual reconciliation required' ELSE failure_detail END,
           lease_expires_at = CASE WHEN state IN ('staged', 'live', 'failed') THEN NULL ELSE lease_expires_at END,
           updated_at = CURRENT_TIMESTAMP
         WHERE product_id = ? AND desired <> 'removed'`,
      ).bind(productId),
      adminAuditStatement(admin.email, "remove_hosting", "product", String(productId), `note=${note.trim().slice(0, 500)}`),
    ]);
  } catch (error) {
    mapHostingDatabaseError(error);
  }
}

export async function listHostingGrants() {
  const result = await database().prepare(
    `SELECT g.member_email AS memberEmail, g.max_sites AS maxSites, g.note,
            g.granted_by AS grantedBy, g.created_at AS createdAt, g.revoked_at AS revokedAt,
            (SELECT COUNT(*) FROM product_hostings h
             WHERE h.owner_email = g.member_email AND h.desired <> 'removed') AS usedSites
     FROM hosting_grants g ORDER BY g.member_email ASC`,
  ).all();
  return result.results ?? [];
}

export async function upsertHostingGrant(admin: MemberIdentity, email: string, maxSites: number, note: string) {
  const memberEmail = email.trim().toLowerCase();
  const cleanNote = note.trim().slice(0, 500);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberEmail)
    || memberEmail.length > 254
    || !Number.isInteger(maxSites)
    || maxSites < 1
    || maxSites > 20) {
    fail("invalid_hosting_grant", 400);
  }
  const member = await database().prepare(`SELECT 1 AS found FROM members WHERE email = ?`).bind(memberEmail).first();
  if (!member) fail("member_not_found", 404);
  const db = database();
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO hosting_grants (member_email, max_sites, granted_by, note, created_at, revoked_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)
         ON CONFLICT(member_email) DO UPDATE SET
           max_sites = excluded.max_sites, granted_by = excluded.granted_by,
           note = excluded.note, created_at = CURRENT_TIMESTAMP, revoked_at = NULL`,
      ).bind(memberEmail, maxSites, admin.email, cleanNote),
      adminAuditStatement(admin.email, "upsert_hosting_grant", "hosting_grant", memberEmail, JSON.stringify({ maxSites, note: cleanNote })),
    ]);
  } catch (error) {
    mapHostingDatabaseError(error);
  }
  return (await db.prepare(
    `SELECT g.member_email AS memberEmail, g.max_sites AS maxSites, g.note,
            g.granted_by AS grantedBy, g.created_at AS createdAt, g.revoked_at AS revokedAt,
            (SELECT COUNT(*) FROM product_hostings h
             WHERE h.owner_email = g.member_email AND h.desired <> 'removed') AS usedSites
     FROM hosting_grants g WHERE g.member_email = ?`,
  ).bind(memberEmail).first()) ?? null;
}

export async function revokeHostingGrant(admin: MemberIdentity, email: string): Promise<{ removedHostings: number }> {
  const memberEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberEmail) || memberEmail.length > 254) fail("invalid_hosting_grant", 400);
  const db = database();
  let removedHostings: number;
  try {
    const results = await db.batch([
      db.prepare(
        `UPDATE hosting_grants SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
         WHERE member_email = ?`,
      ).bind(memberEmail),
      db.prepare(
        `UPDATE product_hostings SET desired = 'removed',
           state = CASE
             WHEN state = 'queued' AND site_id IS NULL THEN 'removed'
             WHEN state IN ('staged', 'live', 'failed') AND site_id IS NOT NULL THEN 'removing'
             WHEN state = 'failed' AND site_id IS NULL THEN 'removed'
             WHEN state = 'queued' AND site_id IS NOT NULL THEN 'failed'
             ELSE state END,
           failure_code = CASE WHEN state = 'queued' AND site_id IS NOT NULL THEN 'ambiguous' ELSE failure_code END,
           failure_detail = CASE WHEN state = 'queued' AND site_id IS NOT NULL
             THEN 'queued row unexpectedly has a site id; manual reconciliation required' ELSE failure_detail END,
           lease_expires_at = CASE WHEN state IN ('staged', 'live', 'failed') THEN NULL ELSE lease_expires_at END,
           updated_at = CURRENT_TIMESTAMP
         WHERE owner_email = ? AND desired <> 'removed'`,
      ).bind(memberEmail),
      adminAuditStatement(admin.email, "revoke_hosting_grant", "hosting_grant", memberEmail),
    ]);
    removedHostings = Number(results[1]?.meta?.changes ?? 0);
  } catch (error) {
    mapHostingDatabaseError(error);
  }
  return { removedHostings };
}

function leaseToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function clearExpiredLeases(db: D1Database): Promise<unknown[]> {
  const expiration = `(lease_expires_at IS NULL OR julianday(lease_expires_at) <= julianday('now'))`;
  return db.batch([
    db.prepare(
      `UPDATE product_hostings SET state = 'removed', lease_token_hash = NULL, lease_expires_at = NULL,
         updated_at = CURRENT_TIMESTAMP
       WHERE state = 'queued' AND desired = 'removed' AND site_id IS NULL`,
    ),
    db.prepare(
      `UPDATE product_hostings SET state = 'failed', failure_code = 'ambiguous',
         failure_detail = 'deploy lease expired after removal; manual reconciliation required',
         lease_token_hash = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE state = 'deploying' AND desired = 'removed' AND ${expiration}`,
    ),
    db.prepare(
      `UPDATE product_hostings SET state = 'staged', failure_code = 'internal',
         failure_detail = 'promote lease expired after removal; remove reconciliation required',
         lease_token_hash = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE state = 'promoting' AND desired = 'removed' AND ${expiration}`,
    ),
    db.prepare(
      `UPDATE product_hostings SET state = 'staged', failure_code = 'internal',
         failure_detail = 'promotion lease expired without current approval; awaiting review',
         lease_token_hash = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE state = 'promoting' AND desired = 'live' AND ${expiration}
         AND NOT EXISTS (
           SELECT 1 FROM products p WHERE p.id = product_hostings.product_id
             AND p.status = 'published' AND p.review_status = 'approved'
             AND p.approved_version = p.review_version
             AND p.approved_version = product_hostings.approved_version
             AND p.hosting_revision = product_hostings.hosting_revision
         )`,
    ),
    db.prepare(
      `UPDATE product_hostings SET state = 'failed', failure_code = 'internal',
         failure_detail = 'attempt limit reached; manual reconciliation required',
         lease_token_hash = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE attempts >= ? AND state IN ('queued', 'deploying') AND ${expiration}
         AND NOT (state = 'queued' AND desired = 'removed' AND site_id IS NULL)
         AND desired <> 'removed'`,
    ).bind(MAX_ATTEMPTS),
    // promoting→failed 不在 0032 的合法状态迁移图中；留在 staged 并锁住重领，保留失败原因。
    db.prepare(
      `UPDATE product_hostings SET state = 'staged', failure_code = 'internal',
         failure_detail = 'attempt limit reached; promote state requires manual reconciliation',
         lease_token_hash = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE attempts >= ? AND state = 'promoting' AND ${expiration}`,
    ).bind(MAX_ATTEMPTS),
    db.prepare(
      `UPDATE product_hostings SET failure_code = 'internal',
         failure_detail = 'attempt limit reached; manual reconciliation required',
         lease_token_hash = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE attempts >= ? AND state IN ('staged', 'removing') AND ${expiration}`,
    ).bind(MAX_ATTEMPTS),
  ]);
}

function actionFor(row: HostingRow): "deploy" | "promote" | "remove" {
  if (row.desired === "removed") return "remove";
  if (row.state === "staged" || row.state === "promoting") return "promote";
  return "deploy";
}

export async function claimHostingJob(worker: string) {
  if (typeof worker !== "string" || worker.trim().length < 1 || worker.length > 64) fail("invalid_worker", 400);
  const db = database();
  await clearExpiredLeases(db);
  const expiration = `(h.lease_expires_at IS NULL OR julianday(h.lease_expires_at) <= julianday('now'))`;
  const approvedForPromotion = `EXISTS (
    SELECT 1 FROM products p WHERE p.id = h.product_id
      AND p.status = 'published' AND p.review_status = 'approved'
      AND p.approved_version = p.review_version
      AND p.approved_version = h.approved_version
      AND p.hosting_revision = h.hosting_revision
  )`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const row = await db.prepare(
      `SELECT h.* FROM product_hostings h
       WHERE h.attempts < ? AND (
         (h.desired = 'removed' AND h.state IN ('staged', 'live', 'failed', 'removing') AND h.site_id IS NOT NULL AND ${expiration})
         OR (h.state = 'staged' AND h.desired = 'live' AND ${approvedForPromotion})
         OR (h.state = 'queued' AND h.desired = 'staged')
         OR (h.state = 'deploying' AND h.desired = 'staged' AND ${expiration})
         OR (h.state = 'promoting' AND h.desired = 'live' AND ${expiration} AND ${approvedForPromotion})
       )
       ORDER BY CASE
         WHEN h.desired = 'removed' AND h.state IN ('staged', 'live', 'failed', 'removing') AND h.site_id IS NOT NULL THEN 0
         WHEN h.desired = 'live' AND h.state IN ('staged', 'promoting') THEN 1
         ELSE 2 END,
         h.id ASC LIMIT 1`,
    ).bind(MAX_ATTEMPTS).first<HostingRow>();
    if (!row) return { job: null };

    const action = actionFor(row);
    const token = leaseToken();
    const tokenHash = await sha256Hex(new TextEncoder().encode(token));
    const leaseExpiresAt = new Date(Date.now() + LEASE_SECONDS * 1000).toISOString();
    const nextState = action === "remove" ? "removing" : action === "promote" ? "promoting" : "deploying";
    const where = action === "remove"
      ? `desired = 'removed' AND state IN ('staged', 'live', 'failed', 'removing') AND site_id IS NOT NULL
         AND (lease_expires_at IS NULL OR julianday(lease_expires_at) <= julianday('now'))`
      : action === "promote"
        ? `desired = 'live' AND state IN ('staged', 'promoting')
           AND (state <> 'promoting' OR lease_expires_at IS NULL OR julianday(lease_expires_at) <= julianday('now'))
           AND ${approvedForPromotion.replaceAll("h.", "product_hostings.")}`
        : `desired = 'staged' AND state IN ('queued', 'deploying')
           AND (state <> 'deploying' OR lease_expires_at IS NULL OR julianday(lease_expires_at) <= julianday('now'))`;
    const claimed = await db.prepare(
      `UPDATE product_hostings SET state = ?, lease_token_hash = ?, lease_expires_at = ?,
         attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND attempts < ? AND ${where}`,
    ).bind(nextState, tokenHash, leaseExpiresAt, row.id, MAX_ATTEMPTS).run();
    if (Number(claimed.meta.changes ?? 0) !== 1) continue;
    const job: Record<string, unknown> = {
      id: row.id,
      action,
      lease: token,
      leaseExpiresAt,
      productId: row.product_id,
      provider: "stepfun_page",
      siteName: `zc-p${row.product_id}-h${row.id}`,
      previewTtl: "7d",
      bundleSha256: row.bundle_sha256,
      bundleZipBytes: row.bundle_zip_bytes,
      bundleFileCount: row.bundle_file_count,
      siteId: action === "deploy" ? null : row.site_id,
      versionId: action === "deploy" ? null : row.version_id,
    };
    return { job };
  }
  return { job: null };
}

function validProviderUrl(value: unknown, suffix: string, label: string): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port
      || url.pathname !== "/" && url.pathname !== ""
      || url.search || url.hash || !url.hostname.endsWith(suffix)) return false;
    const hostLabel = url.hostname.slice(0, -suffix.length);
    return hostLabel.length > 0 && hostLabel.length <= 63
      && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(hostLabel)
      && (label !== "preview" || hostLabel.startsWith("p-"));
  } catch {
    return false;
  }
}

function validPreviewExpiry(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  const expiry = Date.parse(value);
  return Number.isFinite(expiry) && expiry > Date.now() && expiry <= Date.now() + 7 * 24 * 60 * 60 * 1000;
}

function constantTimeHashMatches(expected: string | null, actual: string): boolean {
  return expected !== null && constantTimeEquals(expected, actual);
}

function replayResult(row: HostingRow, body: Record<string, unknown>, hash: string) {
  if (!constantTimeHashMatches(row.lease_token_hash, hash)) return null;
  if (body.outcome === "staged" && row.state === "staged"
    && row.site_id === body.siteId && row.version_id === body.versionId
    && row.preview_url === body.previewUrl && row.preview_expires_at === body.previewExpiresAt) {
    return { ok: true, replayed: true };
  }
  if (body.outcome === "live" && row.state === "live" && row.live_url === body.liveUrl) {
    return { ok: true, replayed: true };
  }
  if (body.outcome === "live" && row.state === "staged" && row.desired === "removed"
    && row.failure_code === "internal" && row.failure_detail === "promote superseded") {
    return { ok: true, applied: "staged", replayed: true };
  }
  if (body.outcome === "removed" && row.state === "removed") return { ok: true, replayed: true };
  if (body.outcome === "failed" && row.failure_code === body.code && row.failure_detail === body.detail
    && ((row.state === "deploying" && body.retryable === true && row.attempts < MAX_ATTEMPTS)
      || (row.state === "failed" && body.retryable === false)
      || (row.state === "staged" && row.desired === "live")
      || row.state === "removing")) {
    return { ok: true, replayed: true };
  }
  return null;
}

export async function reportHostingJob(id: number, lease: string, body: Record<string, unknown>) {
  if (!Number.isSafeInteger(id) || id < 1 || typeof lease !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(lease)) {
    fail("lease_mismatch", 409);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("invalid_report", 400);
  const hash = await sha256Hex(new TextEncoder().encode(lease));
  const db = database();
  const row = await db.prepare(`SELECT * FROM product_hostings WHERE id = ?`).bind(id).first<HostingRow>();
  if (!row) fail("hosting_job_not_found", 404);
  const replay = replayResult(row, body, hash);
  if (replay) return replay;
  if (!constantTimeHashMatches(row.lease_token_hash, hash)
    || !row.lease_expires_at
    || !(await db.prepare(`SELECT julianday(?) > julianday('now') AS valid`).bind(row.lease_expires_at).first<{ valid: number }>())?.valid) {
    fail("lease_mismatch", 409);
  }

  const outcome = body.outcome;
  if (outcome === "staged") {
    if (row.state !== "deploying"
      || typeof body.siteId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(body.siteId)
      || typeof body.versionId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(body.versionId)
      || !validProviderUrl(body.previewUrl, rules.provider.previewHostSuffix, "preview")
      || !validPreviewExpiry(body.previewExpiresAt)) fail("invalid_report", 400);
    const result = await db.prepare(
      `UPDATE product_hostings SET state = 'staged', site_id = ?, version_id = ?, preview_url = ?,
         preview_expires_at = ?, failure_code = NULL, failure_detail = NULL,
         lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND state = 'deploying' AND lease_token_hash = ? AND julianday(lease_expires_at) > julianday('now')`,
    ).bind(body.siteId, body.versionId, body.previewUrl, body.previewExpiresAt, id, hash).run();
    if (Number(result.meta.changes ?? 0) !== 1) fail("lease_mismatch", 409);
    return { ok: true };
  }

  if (outcome === "live") {
    if (row.state !== "promoting" || !validProviderUrl(body.liveUrl, rules.provider.liveHostSuffix, "live")) fail("invalid_report", 400);
    if (row.desired !== "live") {
      const superseded = await db.prepare(
        `UPDATE product_hostings SET state = 'staged', failure_code = 'internal',
           failure_detail = 'promote superseded', lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND state = 'promoting' AND desired <> 'live'
           AND lease_token_hash = ? AND julianday(lease_expires_at) > julianday('now')`,
      ).bind(id, hash).run();
      if (Number(superseded.meta.changes ?? 0) !== 1) fail("lease_mismatch", 409);
      return { ok: true, applied: "staged" };
    }
    try {
      const result = await db.prepare(
        `UPDATE product_hostings SET state = 'live', live_url = ?, failure_code = NULL,
           failure_detail = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND state = 'promoting' AND desired = 'live'
           AND lease_token_hash = ? AND julianday(lease_expires_at) > julianday('now')`,
      ).bind(body.liveUrl, id, hash).run();
      if (Number(result.meta.changes ?? 0) !== 1) fail("lease_mismatch", 409);
      return { ok: true };
    } catch (error) {
      if (errorMessageIncludes(error, "hosting_live_requires_approval")) {
        const restored = await db.prepare(
          `UPDATE product_hostings SET state = 'staged', failure_code = 'internal',
             failure_detail = 'live report rejected without current approval; awaiting review',
             lease_token_hash = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND state = 'promoting' AND desired = 'live' AND lease_token_hash = ?`,
        ).bind(id, hash).run().catch(() => null);
        if (Number(restored?.meta?.changes ?? 0) !== 1) mapHostingDatabaseError(error);
      }
      mapHostingDatabaseError(error);
    }
  }

  if (outcome === "removed") {
    if (row.state !== "removing") fail("invalid_report", 400);
    const result = await db.prepare(
      `UPDATE product_hostings SET state = 'removed', live_url = NULL,
         lease_expires_at = NULL, failure_code = NULL, failure_detail = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND state = 'removing' AND lease_token_hash = ?
         AND julianday(lease_expires_at) > julianday('now')`,
    ).bind(id, hash).run();
    if (Number(result.meta.changes ?? 0) !== 1) fail("lease_mismatch", 409);
    return { ok: true };
  }

  if (outcome === "failed") {
    const code = body.code;
    const detail = body.detail;
    const retryable = body.retryable;
    if (typeof code !== "string" || !(rules.failureCodes as readonly string[]).includes(code)
      || typeof detail !== "string" || detail.length > 200 || /[\u0000-\u001f\u007f-\u009f]/.test(detail)
      || typeof retryable !== "boolean") fail("invalid_report", 400);

    let sql: string;
    if (row.state === "deploying") {
      const canRetry = retryable && row.attempts < MAX_ATTEMPTS;
      sql = `UPDATE product_hostings SET state = ?, failure_code = ?, failure_detail = ?,
               lease_expires_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
               updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND state = 'deploying' AND lease_token_hash = ?
               AND julianday(lease_expires_at) > julianday('now')`;
      const result = await db.prepare(sql).bind(canRetry ? "deploying" : "failed", code, detail, canRetry ? 1 : 0, id, hash).run();
      if (Number(result.meta.changes ?? 0) !== 1) fail("lease_mismatch", 409);
      return { ok: true };
    }
    if (row.state === "promoting") {
      sql = `UPDATE product_hostings SET state = 'staged', failure_code = ?, failure_detail = ?,
               lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND state = 'promoting' AND lease_token_hash = ?
               AND julianday(lease_expires_at) > julianday('now')`;
    } else if (row.state === "removing") {
      sql = `UPDATE product_hostings SET failure_code = ?, failure_detail = ?,
               lease_expires_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND state = 'removing' AND lease_token_hash = ?
               AND julianday(lease_expires_at) > julianday('now')`;
    } else {
      fail("invalid_report", 400);
    }
    const result = await db.prepare(sql).bind(code, detail, id, hash).run();
    if (Number(result.meta.changes ?? 0) !== 1) fail("lease_mismatch", 409);
    return { ok: true };
  }

  fail("invalid_report", 400);
}

export async function openHostingBundle(id: number, lease: string): Promise<{ body: ReadableStream; sha256: string }> {
  if (!Number.isSafeInteger(id) || id < 1 || typeof lease !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(lease)) {
    fail("lease_mismatch", 409);
  }
  const hash = await sha256Hex(new TextEncoder().encode(lease));
  const row = await database().prepare(
    `SELECT h.bundle_key AS bundleKey, h.bundle_sha256 AS bundleSha256,
            f.owner_email AS ownerEmail, f.visibility, f.purpose,
            f.scan_status AS scanStatus, f.sha256 AS fileSha256
     FROM product_hostings h JOIN uploaded_files f ON f.key = h.bundle_key
     WHERE h.id = ? AND h.state = 'deploying' AND h.lease_token_hash = ?
       AND h.lease_expires_at IS NOT NULL AND julianday(h.lease_expires_at) > julianday('now')`,
  ).bind(id, hash).first<{
    bundleKey: string;
    bundleSha256: string;
    ownerEmail: string;
    visibility: string;
    purpose: string;
    scanStatus: string;
    fileSha256: string;
  }>();
  if (!row) fail("lease_mismatch", 409);
  const bucket = (env as unknown as { UPLOADS?: R2Bucket }).UPLOADS;
  if (!bucket) fail("storage_unavailable", 503);
  const object = await bucket.get(row.bundleKey);
  if (!object) fail("bundle_missing", 404);
  if (row.scanStatus !== "clean" || row.visibility !== "private" || row.purpose !== "hosting_bundle"
    || row.fileSha256 !== row.bundleSha256
    || object.customMetadata?.scanStatus !== "clean"
    || object.customMetadata?.sha256 !== row.bundleSha256) fail("bundle_missing", 404);
  return { body: object.body, sha256: row.bundleSha256 };
}
