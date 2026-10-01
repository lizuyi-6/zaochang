export const finalizeHyperknowImageCacheSql = `
  UPDATE hk_lecture_images
  SET status = 'completed', url = ?, caption = ?, lease_token = NULL,
      lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
  WHERE cache_key = ? AND user_email = ? AND status = 'pending'
    AND lease_token = ? AND lease_expires_at > ?
    AND EXISTS (
      SELECT 1 FROM uploaded_files AS f
      WHERE f.key = ? AND f.hyperknow_image = 1
        AND f.hyperknow_image_cleanup_token IS NULL
    )
`;

export async function finalizeHyperknowImageCache(
  db: D1Database,
  args: {
    url: string;
    caption: string;
    cacheKey: string;
    userEmail: string;
    leaseToken: string;
    now: string;
    uploadedKey: string;
  },
) {
  return db.prepare(finalizeHyperknowImageCacheSql).bind(
    args.url,
    args.caption,
    args.cacheKey,
    args.userEmail,
    args.leaseToken,
    args.now,
    args.uploadedKey,
  ).run();
}
