PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_uploaded_files` (
	`key` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`original_name` text NOT NULL,
	`media_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`visibility` text NOT NULL,
	`purpose` text NOT NULL,
	`sha256` text NOT NULL,
	`scan_status` text DEFAULT 'pending' NOT NULL,
	`scan_engine` text,
	`scan_signature` text,
	`quarantine_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`scanned_at` text,
	FOREIGN KEY (`owner_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "uploaded_files_size_valid" CHECK("__new_uploaded_files"."byte_size" between 1 and 10485760),
	CONSTRAINT "uploaded_files_visibility_valid" CHECK("__new_uploaded_files"."visibility" in ('public', 'private')),
	CONSTRAINT "uploaded_files_purpose_valid" CHECK("__new_uploaded_files"."purpose" in ('general', 'product_cover', 'incubation_material', 'book_cover')),
	CONSTRAINT "uploaded_files_scan_status_valid" CHECK("__new_uploaded_files"."scan_status" in ('pending', 'clean', 'infected', 'error'))
);
--> statement-breakpoint
INSERT INTO `__new_uploaded_files`("key", "owner_email", "original_name", "media_type", "byte_size", "visibility", "purpose", "sha256", "scan_status", "scan_engine", "scan_signature", "quarantine_key", "created_at", "scanned_at") SELECT "key", "owner_email", "original_name", "media_type", "byte_size", "visibility", "purpose", "sha256", "scan_status", "scan_engine", "scan_signature", "quarantine_key", "created_at", "scanned_at" FROM `uploaded_files`;--> statement-breakpoint
DROP TABLE `uploaded_files`;--> statement-breakpoint
ALTER TABLE `__new_uploaded_files` RENAME TO `uploaded_files`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `uploaded_files_owner_idx` ON `uploaded_files` (`owner_email`,`created_at`);--> statement-breakpoint
CREATE INDEX `uploaded_files_scan_status_idx` ON `uploaded_files` (`scan_status`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `uploaded_files_pending_insert_guard`
BEFORE INSERT ON `uploaded_files`
WHEN NEW.`scan_status` <> 'pending'
BEGIN SELECT RAISE(ABORT, 'uploaded_file_must_start_pending'); END;--> statement-breakpoint
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
  OR OLD.`scan_status` <> 'pending'
  OR NEW.`scan_status` NOT IN ('clean', 'infected', 'error')
BEGIN SELECT RAISE(ABORT, 'uploaded_file_scan_state_immutable'); END;