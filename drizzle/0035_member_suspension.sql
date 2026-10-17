ALTER TABLE `members` ADD `suspended_at` text;
--> statement-breakpoint
ALTER TABLE `members` ADD `suspended_reason` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `members` ADD `suspended_by` text;
--> statement-breakpoint
-- Direct D1 writes must not create new credentials for a suspended member.
CREATE TRIGGER `auth_sessions_suspended_member_insert_guard`
BEFORE INSERT ON `auth_sessions`
WHEN EXISTS (SELECT 1 FROM `members` WHERE `email` = NEW.`user_email` AND `suspended_at` IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'member_suspended'); END;
--> statement-breakpoint
CREATE TRIGGER `api_keys_suspended_member_insert_guard`
BEFORE INSERT ON `api_keys`
WHEN EXISTS (SELECT 1 FROM `members` WHERE `email` = NEW.`member_email` AND `suspended_at` IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'member_suspended'); END;
--> statement-breakpoint
CREATE TRIGGER `oauth_provider_access_tokens_suspended_member_insert_guard`
BEFORE INSERT ON `oauth_provider_access_tokens`
WHEN EXISTS (SELECT 1 FROM `members` WHERE `email` = NEW.`user_email` AND `suspended_at` IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'member_suspended'); END;
--> statement-breakpoint
CREATE TRIGGER `oauth_provider_refresh_tokens_suspended_member_insert_guard`
BEFORE INSERT ON `oauth_provider_refresh_tokens`
WHEN EXISTS (SELECT 1 FROM `members` WHERE `email` = NEW.`user_email` AND `suspended_at` IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'member_suspended'); END;
--> statement-breakpoint
CREATE TRIGGER `oauth_provider_authorization_codes_suspended_member_insert_guard`
BEFORE INSERT ON `oauth_provider_authorization_codes`
WHEN EXISTS (SELECT 1 FROM `members` WHERE `email` = NEW.`user_email` AND `suspended_at` IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'member_suspended'); END;
--> statement-breakpoint
-- An edited takedown returns to the ordinary pending-review state. It remains
-- private while pending because published reads and write triggers require approval.
CREATE TRIGGER `product_material_change_clears_moderation_takedown`
AFTER UPDATE OF `owner_email`, `owner_name`, `title`, `description`, `category`, `demo_type`,
  `demo_url`, `image_url`, `cover_theme`, `price`, `pricing_model` ON `products`
WHEN OLD.`owner_email` IS NOT NEW.`owner_email`
  OR OLD.`owner_name` IS NOT NEW.`owner_name`
  OR OLD.`title` IS NOT NEW.`title`
  OR OLD.`description` IS NOT NEW.`description`
  OR OLD.`category` IS NOT NEW.`category`
  OR OLD.`demo_type` IS NOT NEW.`demo_type`
  OR OLD.`demo_url` IS NOT NEW.`demo_url`
  OR OLD.`image_url` IS NOT NEW.`image_url`
  OR OLD.`cover_theme` IS NOT NEW.`cover_theme`
  OR OLD.`price` IS NOT NEW.`price`
  OR OLD.`pricing_model` IS NOT NEW.`pricing_model`
BEGIN
  UPDATE `products` SET `moderation_status` = 'visible' WHERE `id` = NEW.`id`;
END;
