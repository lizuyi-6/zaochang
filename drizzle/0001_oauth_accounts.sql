CREATE TABLE IF NOT EXISTS `oauth_accounts` (
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`provider`, `provider_account_id`),
	FOREIGN KEY (`email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "oauth_provider_valid" CHECK("oauth_accounts"."provider" IN ('google', 'github'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `oauth_accounts_email_idx` ON `oauth_accounts` (`email`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`provider` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "session_provider_valid" CHECK("auth_sessions"."provider" IN ('google', 'github'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `auth_sessions_expiry_idx` ON `auth_sessions` (`expires_at`);
