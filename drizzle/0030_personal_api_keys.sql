CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`member_email` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	FOREIGN KEY (`member_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_token_hash_idx` ON `api_keys` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `api_keys_member_active_idx` ON `api_keys` (`member_email`,`revoked_at`,`expires_at`);
