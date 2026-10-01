// A stale cleanup claim fences the upload pipeline from publishing `clean` after R2 may
// have been swept. Ordinary uploads have hyperknow_image=0 and never acquire that claim.
export const completeScannedUploadSql = `
  UPDATE uploaded_files
  SET scan_status = 'clean', scan_engine = ?, scan_signature = NULL, quarantine_key = NULL,
      scanned_at = CURRENT_TIMESTAMP
  WHERE key = ? AND scan_status = 'pending'
    AND (hyperknow_image = 0 OR hyperknow_image_cleanup_token IS NULL)
`;

export const failScannedUploadSql = `
  UPDATE uploaded_files
  SET scan_status = 'error', quarantine_key = NULL, scanned_at = CURRENT_TIMESTAMP
  WHERE key = ? AND scan_status = 'pending'
`;
