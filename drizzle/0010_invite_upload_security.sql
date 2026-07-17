CREATE TABLE `invitation_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`max_uses` integer DEFAULT 1 NOT NULL,
	`uses_count` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_used_at` text,
	CONSTRAINT "invitation_codes_max_uses_valid" CHECK("invitation_codes"."max_uses" between 1 and 25),
	CONSTRAINT "invitation_codes_uses_valid" CHECK("invitation_codes"."uses_count" between 0 and "invitation_codes"."max_uses")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_codes_code_hash_unique` ON `invitation_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `invitation_codes_status_idx` ON `invitation_codes` (`revoked_at`,`expires_at`);--> statement-breakpoint
CREATE TABLE `invitation_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`user_email` text NOT NULL,
	`redeemed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitation_codes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invitation_redemptions_provider_valid" CHECK("invitation_redemptions"."provider" in ('google', 'github'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_redemptions_account_idx` ON `invitation_redemptions` (`provider`,`provider_account_id`);--> statement-breakpoint
CREATE INDEX `invitation_redemptions_invitation_idx` ON `invitation_redemptions` (`invitation_id`,`redeemed_at`);--> statement-breakpoint
CREATE TABLE `uploaded_files` (
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
	CONSTRAINT "uploaded_files_size_valid" CHECK("uploaded_files"."byte_size" between 1 and 10485760),
	CONSTRAINT "uploaded_files_visibility_valid" CHECK("uploaded_files"."visibility" in ('public', 'private')),
	CONSTRAINT "uploaded_files_purpose_valid" CHECK("uploaded_files"."purpose" in ('general', 'product_cover', 'incubation_material')),
	CONSTRAINT "uploaded_files_scan_status_valid" CHECK("uploaded_files"."scan_status" in ('pending', 'clean', 'infected', 'error'))
);
--> statement-breakpoint
CREATE INDEX `uploaded_files_owner_idx` ON `uploaded_files` (`owner_email`,`created_at`);--> statement-breakpoint
CREATE INDEX `uploaded_files_scan_status_idx` ON `uploaded_files` (`scan_status`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `invitation_redemption_active_guard`
BEFORE INSERT ON `invitation_redemptions`
WHEN NOT EXISTS (
	SELECT 1 FROM `invitation_codes`
	WHERE `id` = NEW.`invitation_id`
	  AND `revoked_at` IS NULL
	  AND `expires_at` > CURRENT_TIMESTAMP
	  AND `uses_count` < `max_uses`
)
BEGIN SELECT RAISE(ABORT, 'invitation_not_available'); END;--> statement-breakpoint
CREATE TRIGGER `invitation_redemption_consume`
AFTER INSERT ON `invitation_redemptions`
BEGIN
	UPDATE `invitation_codes`
	SET `uses_count` = `uses_count` + 1,
	    `last_used_at` = CURRENT_TIMESTAMP
	WHERE `id` = NEW.`invitation_id`;
END;--> statement-breakpoint
CREATE TRIGGER `invitation_redemptions_no_update`
BEFORE UPDATE ON `invitation_redemptions`
BEGIN SELECT RAISE(ABORT, 'invitation_redemption_immutable'); END;--> statement-breakpoint
CREATE TRIGGER `invitation_redemptions_no_delete`
BEFORE DELETE ON `invitation_redemptions`
BEGIN SELECT RAISE(ABORT, 'invitation_redemption_immutable'); END;--> statement-breakpoint
CREATE TRIGGER `oauth_registration_invitation_guard`
BEFORE INSERT ON `oauth_accounts`
WHEN NOT EXISTS (
	SELECT 1 FROM `invitation_redemptions`
	WHERE `provider` = NEW.`provider`
	  AND `provider_account_id` = NEW.`provider_account_id`
	  AND `user_email` = NEW.`email`
)
BEGIN SELECT RAISE(ABORT, 'oauth_registration_invitation_required'); END;--> statement-breakpoint
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
