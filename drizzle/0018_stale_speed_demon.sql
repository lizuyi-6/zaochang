CREATE TABLE `email_login_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`invitation_hash` text,
	`request_ip_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_login_codes_email_idx` ON `email_login_codes` (`email`,`created_at`);--> statement-breakpoint
-- 重建前置:oauth_registration_invitation_guard(0010)建在 oauth_accounts 上、
-- 文本引用 invitation_redemptions。SQLite 在 ALTER TABLE ... RENAME 时会重解析
-- 全部 schema——重建窗口内 invitation_redemptions 已 DROP 而该触发器仍在,
-- RENAME 直接报 "no such table: main.invitation_redemptions"(生产 D1 同样会炸,
-- 本地集成测试先抓到了)。必须先显式 DROP;文件末尾统一补建全部 5 个触发器。
DROP TRIGGER `oauth_registration_invitation_guard`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_auth_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`provider` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "session_provider_valid" CHECK("__new_auth_sessions"."provider" in ('google', 'github', 'email'))
);
--> statement-breakpoint
INSERT INTO `__new_auth_sessions`("token_hash", "user_email", "provider", "expires_at", "created_at") SELECT "token_hash", "user_email", "provider", "expires_at", "created_at" FROM `auth_sessions`;--> statement-breakpoint
DROP TABLE `auth_sessions`;--> statement-breakpoint
ALTER TABLE `__new_auth_sessions` RENAME TO `auth_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `auth_sessions_expiry_idx` ON `auth_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `__new_invitation_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`user_email` text NOT NULL,
	`redeemed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitation_codes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invitation_redemptions_provider_valid" CHECK("__new_invitation_redemptions"."provider" in ('google', 'github', 'email'))
);
--> statement-breakpoint
INSERT INTO `__new_invitation_redemptions`("id", "invitation_id", "provider", "provider_account_id", "user_email", "redeemed_at") SELECT "id", "invitation_id", "provider", "provider_account_id", "user_email", "redeemed_at" FROM `invitation_redemptions`;--> statement-breakpoint
DROP TABLE `invitation_redemptions`;--> statement-breakpoint
ALTER TABLE `__new_invitation_redemptions` RENAME TO `invitation_redemptions`;--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_redemptions_account_idx` ON `invitation_redemptions` (`provider`,`provider_account_id`);--> statement-breakpoint
CREATE INDEX `invitation_redemptions_invitation_idx` ON `invitation_redemptions` (`invitation_id`,`redeemed_at`);--> statement-breakpoint
CREATE TABLE `__new_oauth_accounts` (
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`provider`, `provider_account_id`),
	FOREIGN KEY (`email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "oauth_provider_valid" CHECK("__new_oauth_accounts"."provider" in ('google', 'github', 'email'))
);
--> statement-breakpoint
INSERT INTO `__new_oauth_accounts`("provider", "provider_account_id", "email", "display_name", "avatar_url", "created_at", "updated_at") SELECT "provider", "provider_account_id", "email", "display_name", "avatar_url", "created_at", "updated_at" FROM `oauth_accounts`;--> statement-breakpoint
DROP TABLE `oauth_accounts`;--> statement-breakpoint
ALTER TABLE `__new_oauth_accounts` RENAME TO `oauth_accounts`;--> statement-breakpoint
CREATE INDEX `oauth_accounts_email_idx` ON `oauth_accounts` (`email`);--> statement-breakpoint
-- 表重建(CHECK 加 'email')会连带 DROP 建在 invitation_redemptions / oauth_accounts
-- 上的触发器(SQLite 语义)。以下 5 个触发器与 0010 的定义逐字一致,必须在重建后
-- 补建,否则 DB 级邀请码门槛(oauth_registration_invitation_required /
-- invitation_not_available / 兑换不可变)在迁移后全部失效。
--> statement-breakpoint
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
BEGIN SELECT RAISE(ABORT, 'oauth_registration_invitation_required'); END;
