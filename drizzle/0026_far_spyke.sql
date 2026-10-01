CREATE INDEX `hk_lecture_images_url_idx` ON `hk_lecture_images` (`url`);--> statement-breakpoint
CREATE INDEX `uploaded_files_hyperknow_cleanup_idx` ON `uploaded_files` (`hyperknow_image`,`scan_status`,`created_at`);--> statement-breakpoint
DROP TRIGGER `uploaded_files_scan_transition_guard`;--> statement-breakpoint
CREATE TRIGGER `uploaded_files_scan_transition_guard`
BEFORE UPDATE ON `uploaded_files`
WHEN OLD.`key` <> NEW.`key`
  OR OLD.`owner_email` <> NEW.`owner_email`
  OR OLD.`original_name` <> NEW.`original_name`
  OR OLD.`media_type` <> NEW.`media_type`
  OR OLD.`byte_size` <> NEW.`byte_size`
  OR OLD.`visibility` <> NEW.`visibility`
  OR OLD.`purpose` <> NEW.`purpose`
  OR OLD.`sha256` <> NEW.`sha256`
  OR OLD.`created_at` <> NEW.`created_at`
  OR OLD.`hyperknow_image` <> NEW.`hyperknow_image`
  OR NOT (
    (OLD.`scan_status` = 'pending'
      AND NEW.`scan_status` IN ('clean', 'infected', 'error')
      AND OLD.`hyperknow_image_cleanup_token` IS NEW.`hyperknow_image_cleanup_token`
      AND OLD.`hyperknow_image_cleanup_expires_at` IS NEW.`hyperknow_image_cleanup_expires_at`)
    OR (OLD.`scan_status` IS NEW.`scan_status`
      AND OLD.`scan_engine` IS NEW.`scan_engine`
      AND OLD.`scan_signature` IS NEW.`scan_signature`
      AND OLD.`quarantine_key` IS NEW.`quarantine_key`
      AND OLD.`scanned_at` IS NEW.`scanned_at`)
  )
BEGIN SELECT RAISE(ABORT, 'uploaded_file_scan_state_immutable'); END;
