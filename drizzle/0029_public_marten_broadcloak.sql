CREATE TABLE `qr_login_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`desktop_label` text DEFAULT '' NOT NULL,
	`return_to` text DEFAULT '/' NOT NULL,
	`request_ip_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`member_email` text,
	`pair_code_hash` text DEFAULT '' NOT NULL,
	`pair_attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL,
	`confirmed_at` text,
	`consumed_at` text,
	FOREIGN KEY (`member_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "qr_login_sessions_status_valid" CHECK("qr_login_sessions"."status" in ('pending', 'pair_requested', 'confirmed', 'consumed'))
);
--> statement-breakpoint
CREATE INDEX `qr_login_sessions_status_idx` ON `qr_login_sessions` (`status`,`expires_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`provider` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "session_provider_valid" CHECK("__new_auth_sessions"."provider" in ('google', 'github', 'email', 'passkey', 'qr'))
);
--> statement-breakpoint
INSERT INTO `__new_auth_sessions`("token_hash", "user_email", "provider", "expires_at", "created_at") SELECT "token_hash", "user_email", "provider", "expires_at", "created_at" FROM `auth_sessions`;--> statement-breakpoint
DROP TABLE `auth_sessions`;--> statement-breakpoint
ALTER TABLE `__new_auth_sessions` RENAME TO `auth_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `auth_sessions_expiry_idx` ON `auth_sessions` (`expires_at`);