CREATE TABLE `admin_provisioned_accounts` (
	`email` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`mail_status` text DEFAULT 'sending' NOT NULL,
	`mail_error` text,
	`mail_sent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "admin_provisioned_accounts_mail_status_valid" CHECK("admin_provisioned_accounts"."mail_status" in ('sending', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `admin_provisioned_accounts_created_idx` ON `admin_provisioned_accounts` (`created_at`);--> statement-breakpoint
ALTER TABLE `members` ADD `username` text;--> statement-breakpoint
ALTER TABLE `members` ADD `onboarding_required` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `display_name_custom` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `members_username_idx` ON `members` (`username`);--> statement-breakpoint
-- 用户名格式:小写字母开头,小写字母/数字/下划线,3–20 位(应用层 member-identity-rules.ts 同口径,
-- 这里是直写 D1 也绕不过的底线)。NULL 合法:存量会员与未完成引导的新会员没有用户名。
CREATE TRIGGER `members_username_format_insert`
BEFORE INSERT ON `members`
WHEN NEW.`username` IS NOT NULL AND (
	length(NEW.`username`) < 3 OR length(NEW.`username`) > 20
	OR NEW.`username` GLOB '*[^a-z0-9_]*'
	OR substr(NEW.`username`, 1, 1) NOT GLOB '[a-z]'
)
BEGIN SELECT RAISE(ABORT, 'username_invalid'); END;--> statement-breakpoint
CREATE TRIGGER `members_username_format_update`
BEFORE UPDATE OF `username` ON `members`
WHEN NEW.`username` IS NOT NULL AND (
	length(NEW.`username`) < 3 OR length(NEW.`username`) > 20
	OR NEW.`username` GLOB '*[^a-z0-9_]*'
	OR substr(NEW.`username`, 1, 1) NOT GLOB '[a-z]'
)
BEGIN SELECT RAISE(ABORT, 'username_invalid'); END;--> statement-breakpoint
-- 用户名一经设定不可改、不可清空。
CREATE TRIGGER `members_username_immutable`
BEFORE UPDATE OF `username` ON `members`
WHEN OLD.`username` IS NOT NULL AND (NEW.`username` IS NULL OR NEW.`username` <> OLD.`username`)
BEGIN SELECT RAISE(ABORT, 'username_immutable'); END;--> statement-breakpoint
-- 引导只能在已有用户名时结束(1 → 0)。
CREATE TRIGGER `members_onboarding_requires_username`
BEFORE UPDATE OF `onboarding_required` ON `members`
WHEN OLD.`onboarding_required` = 1 AND NEW.`onboarding_required` = 0 AND NEW.`username` IS NULL
BEGIN SELECT RAISE(ABORT, 'onboarding_requires_username'); END;
