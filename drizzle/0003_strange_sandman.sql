ALTER TABLE `wallets` ADD `pending_balance` integer DEFAULT 0 NOT NULL CHECK (`pending_balance` >= 0);
--> statement-breakpoint
ALTER TABLE `wallets` ADD `status` text DEFAULT 'active' NOT NULL CHECK (`status` in ('active', 'review', 'frozen'));
--> statement-breakpoint
ALTER TABLE `products` ADD `pricing_model` text DEFAULT 'free' NOT NULL CHECK (`pricing_model` in ('free', 'one_time', 'per_use'));
--> statement-breakpoint
UPDATE `products` SET `pricing_model` = 'per_use' WHERE `price` > 0;
--> statement-breakpoint
CREATE TABLE `fruit_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`idempotency_key` text NOT NULL,
	`actor_email` text,
	`target_email` text,
	`amount` integer NOT NULL,
	`reference_type` text NOT NULL,
	`reference_id` text NOT NULL,
	`related_operation_id` text,
	`description` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`actor_email`) REFERENCES `members`(`email`),
	FOREIGN KEY (`target_email`) REFERENCES `members`(`email`),
	CHECK (`amount` > 0),
	CHECK (`status` in ('posted', 'reversed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fruit_operations_idempotency_idx` ON `fruit_operations` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `fruit_operations_actor_idx` ON `fruit_operations` (`actor_email`, `created_at`);
--> statement-breakpoint
CREATE INDEX `fruit_operations_target_idx` ON `fruit_operations` (`target_email`, `created_at`);
--> statement-breakpoint
CREATE TABLE `fruit_entries` (
	`operation_id` text NOT NULL,
	`user_email` text NOT NULL,
	`bucket` text NOT NULL,
	`delta` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (`operation_id`, `user_email`, `bucket`),
	FOREIGN KEY (`operation_id`) REFERENCES `fruit_operations`(`id`),
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`),
	CHECK (`bucket` in ('available', 'pending')),
	CHECK (`delta` <> 0)
);
--> statement-breakpoint
CREATE INDEX `fruit_entries_user_idx` ON `fruit_entries` (`user_email`, `created_at`);
--> statement-breakpoint
CREATE TABLE `product_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`buyer_email` text NOT NULL,
	`product_id` integer NOT NULL,
	`seller_email` text NOT NULL,
	`pricing_model` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'paid' NOT NULL,
	`idempotency_key` text NOT NULL,
	`purchase_operation_id` text NOT NULL,
	`refund_operation_id` text,
	`purchased_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`refundable_until` text,
	`available_at` text NOT NULL,
	`settled_at` text,
	`refunded_at` text,
	FOREIGN KEY (`buyer_email`) REFERENCES `members`(`email`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`),
	FOREIGN KEY (`seller_email`) REFERENCES `members`(`email`),
	FOREIGN KEY (`purchase_operation_id`) REFERENCES `fruit_operations`(`id`),
	FOREIGN KEY (`refund_operation_id`) REFERENCES `fruit_operations`(`id`),
	CHECK (`amount` > 0),
	CHECK (`pricing_model` in ('one_time', 'per_use')),
	CHECK (`status` in ('paid', 'settled', 'refunded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_orders_idempotency_idx` ON `product_orders` (`buyer_email`, `idempotency_key`);
--> statement-breakpoint
CREATE INDEX `product_orders_buyer_idx` ON `product_orders` (`buyer_email`, `purchased_at`);
--> statement-breakpoint
CREATE INDEX `product_orders_seller_idx` ON `product_orders` (`seller_email`, `status`, `available_at`);
--> statement-breakpoint
CREATE TABLE `product_entitlements` (
	`buyer_email` text NOT NULL,
	`product_id` integer NOT NULL,
	`order_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`granted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`revoked_at` text,
	PRIMARY KEY (`buyer_email`, `product_id`),
	FOREIGN KEY (`buyer_email`) REFERENCES `members`(`email`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`),
	FOREIGN KEY (`order_id`) REFERENCES `product_orders`(`id`),
	CHECK (`status` in ('active', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE `fruit_reward_events` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_email` text NOT NULL,
	`actor_email` text NOT NULL,
	`kind` text NOT NULL,
	`target_type` text NOT NULL,
	`target_ref` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`operation_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`recipient_email`) REFERENCES `members`(`email`),
	FOREIGN KEY (`actor_email`) REFERENCES `members`(`email`),
	FOREIGN KEY (`operation_id`) REFERENCES `fruit_operations`(`id`),
	CHECK (`amount` >= 0),
	CHECK (`status` in ('granted', 'suppressed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fruit_reward_once_idx` ON `fruit_reward_events` (`actor_email`, `kind`, `target_type`, `target_ref`);
--> statement-breakpoint
CREATE INDEX `fruit_reward_actor_day_idx` ON `fruit_reward_events` (`actor_email`, `created_at`);
--> statement-breakpoint
CREATE INDEX `fruit_reward_recipient_day_idx` ON `fruit_reward_events` (`recipient_email`, `created_at`);
--> statement-breakpoint
CREATE TABLE `fruit_risk_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`kind` text NOT NULL,
	`severity` text NOT NULL,
	`evidence` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`),
	CHECK (`severity` in ('low', 'medium', 'high')),
	CHECK (`status` in ('open', 'resolved', 'dismissed'))
);
--> statement-breakpoint
CREATE INDEX `fruit_risk_user_idx` ON `fruit_risk_events` (`user_email`, `status`, `created_at`);
--> statement-breakpoint
CREATE TRIGGER `fruit_settlement_order_guard`
BEFORE INSERT ON `fruit_operations`
WHEN NEW.`kind` = 'settlement' AND NOT EXISTS (
	SELECT 1 FROM `product_orders`
	WHERE `id` = NEW.`reference_id`
	  AND `status` = 'paid'
	  AND `available_at` <= CURRENT_TIMESTAMP
	  AND `seller_email` = NEW.`target_email`
	  AND `amount` = NEW.`amount`
)
BEGIN SELECT RAISE(ABORT, 'settlement_order_not_payable'); END;
--> statement-breakpoint
CREATE TRIGGER `fruit_refund_order_guard`
BEFORE INSERT ON `fruit_operations`
WHEN NEW.`kind` = 'refund' AND NOT EXISTS (
	SELECT 1 FROM `product_orders`
	WHERE `id` = NEW.`reference_id`
	  AND `status` = 'paid'
	  AND `pricing_model` = 'one_time'
	  AND `refundable_until` > CURRENT_TIMESTAMP
	  AND `purchase_operation_id` = NEW.`related_operation_id`
	  AND `seller_email` = NEW.`actor_email`
	  AND `buyer_email` = NEW.`target_email`
	  AND `amount` = NEW.`amount`
)
BEGIN SELECT RAISE(ABORT, 'refund_order_not_payable'); END;
--> statement-breakpoint
CREATE TRIGGER `product_entitlements_active_guard`
BEFORE UPDATE OF `order_id`, `status` ON `product_entitlements`
WHEN OLD.`status` = 'active' AND NEW.`status` = 'active'
BEGIN SELECT RAISE(ABORT, 'entitlement_already_active'); END;
--> statement-breakpoint
CREATE TRIGGER `fruit_reward_actor_guard`
BEFORE INSERT ON `fruit_reward_events`
WHEN NEW.`status` = 'granted' AND NOT EXISTS (
	SELECT 1 FROM `members` m JOIN `wallets` w ON w.`user_email` = m.`email`
	WHERE m.`email` = NEW.`actor_email`
	  AND w.`status` = 'active'
	  AND m.`joined_at` <= datetime('now', '-24 hours')
)
BEGIN SELECT RAISE(ABORT, 'like_actor_not_eligible'); END;
--> statement-breakpoint
CREATE TRIGGER `fruit_paid_transfer_actor_guard`
BEFORE INSERT ON `fruit_operations`
WHEN NEW.`kind` IN ('purchase', 'tip') AND NOT EXISTS (
	SELECT 1 FROM `members` m JOIN `wallets` w ON w.`user_email` = m.`email`
	WHERE m.`email` = NEW.`actor_email`
	  AND w.`status` = 'active'
	  AND m.`joined_at` <= datetime('now', '-24 hours')
)
BEGIN SELECT RAISE(ABORT, 'paid_transfer_actor_not_eligible'); END;
--> statement-breakpoint
CREATE TRIGGER `fruit_reward_velocity_guard`
BEFORE INSERT ON `fruit_reward_events`
WHEN NEW.`status` = 'granted' AND (
	SELECT COUNT(*) FROM `fruit_reward_events`
	WHERE `actor_email` = NEW.`actor_email`
	  AND `created_at` >= datetime('now', '-60 seconds')
) >= 6
BEGIN SELECT RAISE(ABORT, 'like_velocity_limit'); END;
--> statement-breakpoint
CREATE TRIGGER `fruit_reward_actor_daily_guard`
BEFORE INSERT ON `fruit_reward_events`
WHEN NEW.`status` = 'granted' AND (
	SELECT COUNT(*) FROM `fruit_reward_events`
	WHERE `actor_email` = NEW.`actor_email`
	  AND `status` = 'granted'
	  AND `created_at` >= date('now')
) >= 10
BEGIN SELECT RAISE(ABORT, 'like_actor_daily_limit'); END;
--> statement-breakpoint
CREATE TRIGGER `fruit_reward_recipient_daily_guard`
BEFORE INSERT ON `fruit_reward_events`
WHEN NEW.`status` = 'granted' AND COALESCE((
	SELECT SUM(`amount`) FROM `fruit_reward_events`
	WHERE `recipient_email` = NEW.`recipient_email`
	  AND `status` = 'granted'
	  AND `created_at` >= date('now')
), 0) + NEW.`amount` > 20
BEGIN SELECT RAISE(ABORT, 'like_recipient_daily_limit'); END;
--> statement-breakpoint
INSERT INTO `fruit_operations`
(`id`, `kind`, `status`, `idempotency_key`, `actor_email`, `target_email`, `amount`, `reference_type`, `reference_id`, `description`, `created_at`)
SELECT
	'legacy:transaction:' || `id`,
	'legacy_' || `type`,
	'posted',
	'legacy:transaction:' || `id`,
	CASE WHEN `delta` < 0 THEN `user_email` ELSE NULL END,
	CASE WHEN `delta` > 0 THEN `user_email` ELSE NULL END,
	ABS(`delta`),
	'legacy_transaction',
	CAST(`id` AS text),
	`description`,
	`created_at`
FROM `transactions`
WHERE `delta` <> 0;
--> statement-breakpoint
INSERT INTO `fruit_entries` (`operation_id`, `user_email`, `bucket`, `delta`, `created_at`)
SELECT 'legacy:transaction:' || `id`, `user_email`, 'available', `delta`, `created_at`
FROM `transactions`
WHERE `delta` <> 0;
--> statement-breakpoint
INSERT INTO `fruit_operations`
(`id`, `kind`, `status`, `idempotency_key`, `actor_email`, `target_email`, `amount`, `reference_type`, `reference_id`, `description`)
SELECT
	'legacy:reconcile:' || w.`user_email`,
	'reconciliation',
	'posted',
	'legacy:reconcile:' || w.`user_email`,
	CASE WHEN w.`balance` - COALESCE(SUM(e.`delta`), 0) < 0 THEN w.`user_email` ELSE NULL END,
	CASE WHEN w.`balance` - COALESCE(SUM(e.`delta`), 0) > 0 THEN w.`user_email` ELSE NULL END,
	ABS(w.`balance` - COALESCE(SUM(e.`delta`), 0)),
	'wallet',
	w.`user_email`,
	'迁移前余额对账'
FROM `wallets` w
LEFT JOIN `fruit_entries` e ON e.`user_email` = w.`user_email`
GROUP BY w.`user_email`, w.`balance`
HAVING w.`balance` <> COALESCE(SUM(e.`delta`), 0);
--> statement-breakpoint
INSERT INTO `fruit_entries` (`operation_id`, `user_email`, `bucket`, `delta`)
SELECT
	'legacy:reconcile:' || w.`user_email`,
	w.`user_email`,
	'available',
	w.`balance` - COALESCE(SUM(CASE WHEN e.`operation_id` LIKE 'legacy:transaction:%' THEN e.`delta` ELSE 0 END), 0)
FROM `wallets` w
LEFT JOIN `fruit_entries` e ON e.`user_email` = w.`user_email`
GROUP BY w.`user_email`, w.`balance`
HAVING w.`balance` <> COALESCE(SUM(CASE WHEN e.`operation_id` LIKE 'legacy:transaction:%' THEN e.`delta` ELSE 0 END), 0);
--> statement-breakpoint
CREATE TRIGGER `fruit_operations_no_update`
BEFORE UPDATE ON `fruit_operations`
BEGIN SELECT RAISE(ABORT, 'fruit_operations_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `fruit_operations_no_delete`
BEFORE DELETE ON `fruit_operations`
BEGIN SELECT RAISE(ABORT, 'fruit_operations_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `fruit_entries_no_update`
BEFORE UPDATE ON `fruit_entries`
BEGIN SELECT RAISE(ABORT, 'fruit_entries_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `fruit_entries_no_delete`
BEFORE DELETE ON `fruit_entries`
BEGIN SELECT RAISE(ABORT, 'fruit_entries_immutable'); END;
