CREATE TABLE `mail_status_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`state_json` text DEFAULT '{}' NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mail_status_tokens_updated_idx` ON `mail_status_tokens` (`updated_at`);