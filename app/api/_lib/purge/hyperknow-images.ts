// Retries cleanup of generated lecture images that were uploaded before their cache row
// could be finalized. A pending row may still have an active uploader, so a successful
// sweep keeps its claim as a tombstone; the upload's final D1 transition is fenced by it,
// and later cron passes catch any R2 write that arrived after an earlier delete.
export const selectOrphanedImagesSql = `
  SELECT f.key, f.scan_status AS scanStatus
  FROM uploaded_files AS f
  WHERE f.hyperknow_image = 1
    AND f.scan_status IN ('pending', 'clean', 'error', 'infected')
    AND f.created_at <= datetime('now', '-15 minutes')
    AND (f.hyperknow_image_cleanup_token IS NULL
      OR f.hyperknow_image_cleanup_expires_at <= CURRENT_TIMESTAMP)
    AND NOT EXISTS (
      SELECT 1 FROM hk_lecture_images AS i
      WHERE i.url = '/api/uploads/' || f.key
    )
  ORDER BY f.created_at
  LIMIT 100
`;

export const claimOrphanedImageSql = `
  UPDATE uploaded_files
  SET hyperknow_image_cleanup_token = ?,
      hyperknow_image_cleanup_expires_at = datetime('now', '+15 minutes')
  WHERE key = ?
    AND hyperknow_image = 1
    AND scan_status IN ('pending', 'clean', 'error', 'infected')
    AND created_at <= datetime('now', '-15 minutes')
    AND (hyperknow_image_cleanup_token IS NULL
      OR hyperknow_image_cleanup_expires_at <= CURRENT_TIMESTAMP)
    AND NOT EXISTS (
      SELECT 1 FROM hk_lecture_images AS i
      WHERE i.url = '/api/uploads/' || uploaded_files.key
    )
`;

export const deleteOrphanedImageRowSql = `
  DELETE FROM uploaded_files
  WHERE key = ?
    AND hyperknow_image = 1
    AND scan_status IN ('clean', 'error', 'infected')
    AND hyperknow_image_cleanup_token = ?
    AND created_at <= datetime('now', '-15 minutes')
    AND NOT EXISTS (
      SELECT 1 FROM hk_lecture_images AS i
      WHERE i.url = '/api/uploads/' || uploaded_files.key
    )
`;

export const retainPendingImageTombstoneSql = `
  UPDATE uploaded_files
  SET hyperknow_image_cleanup_expires_at = datetime('now', '+15 minutes')
  WHERE key = ? AND hyperknow_image = 1
    AND scan_status IN ('pending', 'clean', 'error', 'infected')
    AND hyperknow_image_cleanup_token = ?
    AND NOT EXISTS (
      SELECT 1 FROM hk_lecture_images AS i
      WHERE i.url = '/api/uploads/' || uploaded_files.key
    )
`;

type CleanupLogger = {
  log(message: string): void;
  error(message: string): void;
};

export async function cleanupOrphanedHyperknowImages(
  db: D1Database,
  bucket: R2Bucket,
  logger: CleanupLogger = console,
): Promise<{ deleted: number; retained: number; failed: number }> {
  let candidates: Array<{ key: string; scanStatus: string }>;
  try {
    const result = await db.prepare(selectOrphanedImagesSql).all<{ key: string; scanStatus: string }>();
    candidates = result.results ?? [];
  } catch (error) {
    logger.error(`[cron-purge] failed hyperknow-images.select: ${error instanceof Error ? error.message : String(error)}`);
    return { deleted: 0, retained: 0, failed: 1 };
  }

  let deleted = 0;
  let retained = 0;
  let failed = 0;
  for (const { key, scanStatus } of candidates) {
    const token = crypto.randomUUID();
    try {
      // Linearize cache publication against deletion. The image finalizer requires this
      // token to remain NULL; if it committed the cache URL first, this UPDATE changes 0.
      const claim = await db.prepare(claimOrphanedImageSql).bind(token, key).run();
      if (Number(claim.meta?.changes ?? 0) !== 1) continue;

      // storeScannedUpload uses the UUID portion of the final key for its quarantine key.
      // Deleting both is idempotent. Keep the expiring D1 claim until both succeed and
      // metadata reaches a terminal state; pending rows remain tombstones for late writes.
      await bucket.delete(key);
      const extensionAt = key.lastIndexOf(".");
      if (extensionAt > 0) await bucket.delete(`quarantine/${key.slice(0, extensionAt)}`);
      if (scanStatus === "pending") {
        // Keep a row that was pending when this sweep selected it, even if the scanner
        // changed it to a terminal state during the R2 deletes. The active upload may
        // still issue a late put (and fail its compensating delete) in this same sweep.
        const tombstone = await db.prepare(retainPendingImageTombstoneSql).bind(key, token).run();
        if (Number(tombstone.meta?.changes ?? 0) === 1) retained += 1;
        else {
          failed += 1;
          logger.error("[cron-purge] failed hyperknow-images.delete: cleanup state changed before finalization");
        }
      } else {
        const result = await db.prepare(deleteOrphanedImageRowSql).bind(key, token).run();
        if (Number(result.meta?.changes ?? 0) === 1) deleted += 1;
        else {
          failed += 1;
          logger.error("[cron-purge] failed hyperknow-images.delete: cleanup state changed before finalization");
        }
      }
    } catch (error) {
      failed += 1;
      logger.error(`[cron-purge] failed hyperknow-images.delete: ${error instanceof Error ? error.message : String(error)}`);
      // Keep the expiring token after failure to block upload completion/finalization
      // until the next retry window. Clearing it could allow a late cache publication.
    }
  }
  logger.log(`[cron-purge] hyperknow-images deleted=${deleted} retained=${retained} failed=${failed}`);
  return { deleted, retained, failed };
}
