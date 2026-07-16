ALTER TABLE `oauth_provider_clients` ADD `review_status` text DEFAULT 'unverified' NOT NULL;
--> statement-breakpoint
ALTER TABLE `oauth_provider_clients` ADD `write_access_approved` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `oauth_provider_refresh_tokens` ADD `family_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `oauth_provider_refresh_tokens` SET `family_id` = `token_hash` WHERE `family_id` = '';
--> statement-breakpoint
CREATE INDEX `oauth_provider_refresh_family_idx` ON `oauth_provider_refresh_tokens` (`family_id`);
--> statement-breakpoint
UPDATE `auth_sessions`
SET `expires_at` = replace(substr(`expires_at`, 1, 19), 'T', ' ')
WHERE instr(`expires_at`, 'T') > 0;
--> statement-breakpoint
CREATE TRIGGER `wallet_default_zero`
AFTER INSERT ON `wallets`
WHEN NEW.`balance` = 20 AND NEW.`lifetime_earned` = 20
  AND NOT EXISTS (SELECT 1 FROM `fruit_entries` WHERE `user_email` = NEW.`user_email`)
BEGIN
  UPDATE `wallets` SET `balance` = 0, `lifetime_earned` = 0 WHERE `user_email` = NEW.`user_email`;
END;
--> statement-breakpoint
ALTER TABLE `products` ADD `moderation_status` text DEFAULT 'visible' NOT NULL;
--> statement-breakpoint
ALTER TABLE `posts` ADD `moderation_status` text DEFAULT 'visible' NOT NULL;
--> statement-breakpoint
ALTER TABLE `comments` ADD `moderation_status` text DEFAULT 'visible' NOT NULL;
--> statement-breakpoint
ALTER TABLE `incubation_projects` ADD `assigned_owner` text;
--> statement-breakpoint
ALTER TABLE `incubation_projects` ADD `next_action` text DEFAULT '等待造场完成资料审核' NOT NULL;
--> statement-breakpoint
ALTER TABLE `incubation_projects` ADD `waiting_reason` text DEFAULT '申请已进入资料审核队列' NOT NULL;
--> statement-breakpoint
ALTER TABLE `incubation_projects` ADD `progress_percent` integer DEFAULT 12 NOT NULL;
--> statement-breakpoint
CREATE TABLE `incubation_feedback` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `project_id` integer NOT NULL,
  `author_email` text NOT NULL,
  `kind` text DEFAULT 'note' NOT NULL,
  `content` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`project_id`) REFERENCES `incubation_projects`(`id`)
);
--> statement-breakpoint
CREATE INDEX `incubation_feedback_project_idx` ON `incubation_feedback` (`project_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `api_rate_limits` (
  `bucket` text NOT NULL,
  `window_start` integer NOT NULL,
  `request_count` integer DEFAULT 0 NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (`bucket`, `window_start`)
);
--> statement-breakpoint
CREATE TABLE `content_reports` (
  `id` text PRIMARY KEY NOT NULL,
  `reporter_email` text NOT NULL,
  `target_type` text NOT NULL,
  `target_ref` text NOT NULL,
  `reason` text NOT NULL,
  `details` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `resolution` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `resolved_at` text,
  FOREIGN KEY (`reporter_email`) REFERENCES `members`(`email`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_reports_reporter_target_idx` ON `content_reports` (`reporter_email`, `target_type`, `target_ref`);
--> statement-breakpoint
CREATE INDEX `content_reports_status_idx` ON `content_reports` (`status`, `created_at`);
--> statement-breakpoint
CREATE TABLE `admin_audit_events` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_email` text NOT NULL,
  `action` text NOT NULL,
  `target_type` text NOT NULL,
  `target_ref` text NOT NULL,
  `detail` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_audit_created_idx` ON `admin_audit_events` (`created_at`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `fruit_external_refund_guard`;
--> statement-breakpoint
CREATE TRIGGER `fruit_external_refund_guard`
BEFORE INSERT ON `fruit_operations`
WHEN NEW.`kind` = 'external_refund' AND NOT EXISTS (
  SELECT 1 FROM `external_fruit_payments`
  WHERE `id` = NEW.`reference_id`
    AND `status` = 'paid'
    AND `pricing_model` = 'one_time'
    AND `refundable_until` > CURRENT_TIMESTAMP
    AND `purchase_operation_id` = NEW.`related_operation_id`
    AND `merchant_email` = NEW.`actor_email`
    AND `payer_email` = NEW.`target_email`
    AND `amount` = NEW.`amount`
    AND EXISTS (SELECT 1 FROM `wallets` w WHERE w.`user_email` = `external_fruit_payments`.`payer_email`)
    AND EXISTS (SELECT 1 FROM `wallets` w WHERE w.`user_email` = `external_fruit_payments`.`merchant_email`)
)
BEGIN SELECT RAISE(ABORT, 'external_refund_not_payable'); END;
--> statement-breakpoint
CREATE TRIGGER `like_reward_settlement_guard`
BEFORE INSERT ON `fruit_operations`
WHEN NEW.`kind` = 'like_reward_settlement' AND NOT EXISTS (
  SELECT 1 FROM `fruit_reward_events` r
  WHERE r.`id` = NEW.`reference_id`
    AND r.`recipient_email` = NEW.`target_email`
    AND r.`amount` = NEW.`amount`
    AND r.`status` = 'granted'
    AND r.`created_at` <= datetime('now', '-24 hours')
    AND NOT EXISTS (
      SELECT 1 FROM `fruit_operations` o
      WHERE o.`reference_type` = 'reward_event' AND o.`reference_id` = r.`id`
    )
)
BEGIN SELECT RAISE(ABORT, 'like_reward_not_settleable'); END;
--> statement-breakpoint
CREATE TRIGGER `like_reward_reversal_guard`
BEFORE INSERT ON `fruit_operations`
WHEN NEW.`kind` = 'like_reward_reversal' AND NOT EXISTS (
  SELECT 1 FROM `fruit_reward_events` r
  WHERE r.`id` = NEW.`reference_id`
    AND r.`recipient_email` = NEW.`target_email`
    AND r.`actor_email` = NEW.`actor_email`
    AND r.`amount` = NEW.`amount`
    AND r.`operation_id` = NEW.`related_operation_id`
    AND r.`status` = 'granted'
    AND NOT EXISTS (
      SELECT 1 FROM `fruit_operations` o
      WHERE o.`reference_type` = 'reward_event' AND o.`reference_id` = r.`id`
    )
)
BEGIN SELECT RAISE(ABORT, 'like_reward_not_reversible'); END;
