CREATE TABLE `webauthn_challenges` (
	`challenge_hash` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`user_handle` text,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "webauthn_challenges_purpose_valid" CHECK("webauthn_challenges"."purpose" in ('register', 'login'))
);
--> statement-breakpoint
CREATE INDEX `webauthn_challenges_expiry_idx` ON `webauthn_challenges` (`expires_at`);--> statement-breakpoint
CREATE TABLE `webauthn_credentials` (
	`credential_id` text PRIMARY KEY NOT NULL,
	`user_handle` text NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`aaguid` text DEFAULT '' NOT NULL,
	`device_type` text DEFAULT 'singleDevice' NOT NULL,
	`backed_up` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "webauthn_credentials_device_type_valid" CHECK("webauthn_credentials"."device_type" in ('singleDevice', 'multiDevice'))
);
--> statement-breakpoint
CREATE INDEX `webauthn_credentials_user_handle_idx` ON `webauthn_credentials` (`user_handle`);--> statement-breakpoint
CREATE INDEX `webauthn_credentials_email_idx` ON `webauthn_credentials` (`email`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`provider` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "session_provider_valid" CHECK("__new_auth_sessions"."provider" in ('google', 'github', 'email', 'passkey'))
);
--> statement-breakpoint
INSERT INTO `__new_auth_sessions`("token_hash", "user_email", "provider", "expires_at", "created_at") SELECT "token_hash", "user_email", "provider", "expires_at", "created_at" FROM `auth_sessions`;--> statement-breakpoint
DROP TABLE `auth_sessions`;--> statement-breakpoint
ALTER TABLE `__new_auth_sessions` RENAME TO `auth_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `auth_sessions_expiry_idx` ON `auth_sessions` (`expires_at`);