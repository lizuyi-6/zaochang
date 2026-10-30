CREATE TABLE `hk_redeem_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`tier` text NOT NULL,
	`duration_days` integer,
	`max_uses` integer DEFAULT 1 NOT NULL,
	`uses_count` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_used_at` text,
	CONSTRAINT "hk_redeem_codes_tier_valid" CHECK("hk_redeem_codes"."tier" in ('PRO', 'MAX')),
	CONSTRAINT "hk_redeem_codes_max_uses_valid" CHECK("hk_redeem_codes"."max_uses" between 1 and 100),
	CONSTRAINT "hk_redeem_codes_uses_valid" CHECK("hk_redeem_codes"."uses_count" between 0 and "hk_redeem_codes"."max_uses")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hk_redeem_codes_code_hash_unique` ON `hk_redeem_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `hk_redeem_codes_status_idx` ON `hk_redeem_codes` (`revoked_at`,`expires_at`);--> statement-breakpoint
CREATE TABLE `hk_redeem_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`code_id` text NOT NULL,
	`tier` text NOT NULL,
	`expires_at` text,
	`redeemed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`code_id`) REFERENCES `hk_redeem_codes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hk_redeem_grants_tier_valid" CHECK("hk_redeem_grants"."tier" in ('PRO', 'MAX'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hk_redeem_grants_user_code_idx` ON `hk_redeem_grants` (`user_email`,`code_id`);--> statement-breakpoint
CREATE INDEX `hk_redeem_grants_user_active_idx` ON `hk_redeem_grants` (`user_email`,`expires_at`);