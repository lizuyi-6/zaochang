DROP TRIGGER IF EXISTS `product_likes_count_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `product_likes_count_delete`;--> statement-breakpoint
CREATE TABLE `product_review_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` integer NOT NULL,
	`review_version` integer NOT NULL,
	`reviewer_email` text NOT NULL,
	`decision` text NOT NULL,
	`note` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "product_review_decision_valid" CHECK("product_review_decisions"."decision" in ('approved', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_review_decisions_version_idx` ON `product_review_decisions` (`product_id`,`review_version`);--> statement-breakpoint
CREATE INDEX `product_review_decisions_reviewer_idx` ON `product_review_decisions` (`reviewer_email`,`created_at`);--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`owner_name` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`demo_type` text DEFAULT 'prototype' NOT NULL,
	`demo_url` text,
	`image_url` text,
	`cover_theme` text DEFAULT 'coral' NOT NULL,
	`price` integer DEFAULT 0 NOT NULL,
	`pricing_model` text DEFAULT 'free' NOT NULL,
	`likes_count` integer DEFAULT 0 NOT NULL,
	`plays_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`moderation_status` text DEFAULT 'visible' NOT NULL,
	`review_status` text DEFAULT 'pending_review' NOT NULL,
	`review_version` integer DEFAULT 1 NOT NULL,
	`approved_version` integer DEFAULT 0 NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`review_note` text DEFAULT '' NOT NULL,
	`submitted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "products_price_nonnegative" CHECK("__new_products"."price" >= 0),
	CONSTRAINT "products_pricing_model_valid" CHECK("__new_products"."pricing_model" in ('free', 'one_time', 'per_use')),
	CONSTRAINT "products_review_status_valid" CHECK("__new_products"."review_status" in ('pending_review', 'approved', 'rejected')),
	CONSTRAINT "products_review_versions_valid" CHECK("__new_products"."review_version" >= 1 and "__new_products"."approved_version" >= 0 and "__new_products"."approved_version" <= "__new_products"."review_version")
);
--> statement-breakpoint
INSERT INTO `__new_products`("id", "owner_email", "owner_name", "title", "description", "category", "demo_type", "demo_url", "image_url", "cover_theme", "price", "pricing_model", "likes_count", "plays_count", "status", "moderation_status", "review_status", "review_version", "approved_version", "reviewed_by", "reviewed_at", "review_note", "submitted_at", "created_at") SELECT "id", "owner_email", "owner_name", "title", "description", "category", "demo_type", "demo_url", "image_url", "cover_theme", "price", "pricing_model", "likes_count", "plays_count", 'pending_review', "moderation_status", 'pending_review', 1, 0, NULL, NULL, '', "created_at", "created_at" FROM `products`;--> statement-breakpoint
DROP TABLE `products`;--> statement-breakpoint
ALTER TABLE `__new_products` RENAME TO `products`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;--> statement-breakpoint
CREATE INDEX `products_created_at_idx` ON `products` (`created_at`);--> statement-breakpoint
CREATE INDEX `products_owner_idx` ON `products` (`owner_email`);--> statement-breakpoint
CREATE INDEX `products_review_queue_idx` ON `products` (`review_status`,`submitted_at`);--> statement-breakpoint
CREATE TRIGGER `products_review_state_insert_guard`
BEFORE INSERT ON `products`
WHEN (`NEW`.`status` = 'published' AND NOT (`NEW`.`review_status` = 'approved' AND `NEW`.`approved_version` = `NEW`.`review_version`))
  OR (`NEW`.`review_status` = 'approved' AND (`NEW`.`status` <> 'published' OR `NEW`.`approved_version` <> `NEW`.`review_version`))
  OR (`NEW`.`review_status` IN ('approved', 'rejected') AND NOT EXISTS (
    SELECT 1 FROM `product_review_decisions`
    WHERE `product_id` = `NEW`.`id`
      AND `review_version` = `NEW`.`review_version`
      AND `decision` = `NEW`.`review_status`
      AND `reviewer_email` = `NEW`.`reviewed_by`
      AND `note` = `NEW`.`review_note`
      AND `created_at` = `NEW`.`reviewed_at`
  ))
BEGIN SELECT RAISE(ABORT, 'product_review_state_invalid'); END;--> statement-breakpoint
CREATE TRIGGER `products_review_state_update_guard`
BEFORE UPDATE OF `status`, `review_status`, `review_version`, `approved_version`, `reviewed_by`, `reviewed_at`, `review_note` ON `products`
WHEN (`NEW`.`status` = 'published' AND NOT (`NEW`.`review_status` = 'approved' AND `NEW`.`approved_version` = `NEW`.`review_version`))
  OR (`NEW`.`review_status` = 'approved' AND (`NEW`.`status` <> 'published' OR `NEW`.`approved_version` <> `NEW`.`review_version`))
  OR (`NEW`.`review_status` IN ('approved', 'rejected') AND NOT EXISTS (
    SELECT 1 FROM `product_review_decisions`
    WHERE `product_id` = `NEW`.`id`
      AND `review_version` = `NEW`.`review_version`
      AND `decision` = `NEW`.`review_status`
      AND `reviewer_email` = `NEW`.`reviewed_by`
      AND `note` = `NEW`.`review_note`
      AND `created_at` = `NEW`.`reviewed_at`
  ))
BEGIN SELECT RAISE(ABORT, 'product_review_state_invalid'); END;--> statement-breakpoint
CREATE TRIGGER `product_review_decision_guard`
BEFORE INSERT ON `product_review_decisions`
WHEN length(trim(`NEW`.`note`)) < 4
  OR NOT EXISTS (
    SELECT 1 FROM `products`
    WHERE `id` = `NEW`.`product_id`
      AND `review_status` = 'pending_review'
      AND `status` = 'pending_review'
      AND `review_version` = `NEW`.`review_version`
  )
BEGIN SELECT RAISE(ABORT, 'product_review_not_pending'); END;--> statement-breakpoint
CREATE TRIGGER `product_review_decision_apply`
AFTER INSERT ON `product_review_decisions`
BEGIN
  UPDATE `products`
  SET `status` = CASE WHEN `NEW`.`decision` = 'approved' THEN 'published' ELSE 'rejected' END,
      `review_status` = `NEW`.`decision`,
      `approved_version` = CASE WHEN `NEW`.`decision` = 'approved' THEN `NEW`.`review_version` ELSE `approved_version` END,
      `reviewed_by` = `NEW`.`reviewer_email`,
      `reviewed_at` = `NEW`.`created_at`,
      `review_note` = `NEW`.`note`
  WHERE `id` = `NEW`.`product_id` AND `review_version` = `NEW`.`review_version`;
END;--> statement-breakpoint
CREATE TRIGGER `product_review_decisions_no_update`
BEFORE UPDATE ON `product_review_decisions`
BEGIN SELECT RAISE(ABORT, 'product_review_decision_immutable'); END;--> statement-breakpoint
CREATE TRIGGER `product_review_decisions_no_delete`
BEFORE DELETE ON `product_review_decisions`
BEGIN SELECT RAISE(ABORT, 'product_review_decision_immutable'); END;--> statement-breakpoint
CREATE TRIGGER `product_material_change_requires_review`
AFTER UPDATE OF `owner_email`, `owner_name`, `title`, `description`, `category`, `demo_type`, `demo_url`, `image_url`, `cover_theme`, `price`, `pricing_model` ON `products`
WHEN `OLD`.`owner_email` IS NOT `NEW`.`owner_email`
  OR `OLD`.`owner_name` IS NOT `NEW`.`owner_name`
  OR `OLD`.`title` IS NOT `NEW`.`title`
  OR `OLD`.`description` IS NOT `NEW`.`description`
  OR `OLD`.`category` IS NOT `NEW`.`category`
  OR `OLD`.`demo_type` IS NOT `NEW`.`demo_type`
  OR `OLD`.`demo_url` IS NOT `NEW`.`demo_url`
  OR `OLD`.`image_url` IS NOT `NEW`.`image_url`
  OR `OLD`.`cover_theme` IS NOT `NEW`.`cover_theme`
  OR `OLD`.`price` IS NOT `NEW`.`price`
  OR `OLD`.`pricing_model` IS NOT `NEW`.`pricing_model`
BEGIN
  UPDATE `products`
  SET `status` = 'pending_review',
      `review_status` = 'pending_review',
      `review_version` = `OLD`.`review_version` + 1,
      `reviewed_by` = NULL,
      `reviewed_at` = NULL,
      `review_note` = '',
      `submitted_at` = CURRENT_TIMESTAMP
  WHERE `id` = `NEW`.`id`;
END;--> statement-breakpoint
CREATE TRIGGER `product_orders_approved_product_guard`
BEFORE INSERT ON `product_orders`
WHEN NOT EXISTS (
  SELECT 1 FROM `products`
  WHERE `id` = `NEW`.`product_id`
    AND `owner_email` = `NEW`.`seller_email`
    AND `pricing_model` = `NEW`.`pricing_model`
    AND `price` = `NEW`.`amount`
    AND `status` = 'published'
    AND `moderation_status` = 'visible'
    AND `review_status` = 'approved'
    AND `approved_version` = `review_version`
)
BEGIN SELECT RAISE(ABORT, 'product_order_product_not_approved'); END;--> statement-breakpoint
CREATE TRIGGER `product_likes_approved_product_guard`
BEFORE INSERT ON `product_likes`
WHEN NOT EXISTS (
  SELECT 1 FROM `products`
  WHERE `id` = `NEW`.`product_id`
    AND `status` = 'published'
    AND `moderation_status` = 'visible'
    AND `review_status` = 'approved'
    AND `approved_version` = `review_version`
)
BEGIN SELECT RAISE(ABORT, 'product_like_product_not_approved'); END;--> statement-breakpoint
CREATE TRIGGER `product_comments_approved_product_guard`
BEFORE INSERT ON `comments`
WHEN `NEW`.`target_type` = 'product'
  AND `NEW`.`target_ref` GLOB '[0-9]*'
  AND NOT EXISTS (
    SELECT 1 FROM `products`
    WHERE CAST(`id` AS TEXT) = `NEW`.`target_ref`
      AND `status` = 'published'
      AND `moderation_status` = 'visible'
      AND `review_status` = 'approved'
      AND `approved_version` = `review_version`
  )
BEGIN SELECT RAISE(ABORT, 'product_comment_product_not_approved'); END;--> statement-breakpoint
CREATE TRIGGER `product_tip_approved_product_guard`
BEFORE INSERT ON `fruit_operations`
WHEN `NEW`.`kind` = 'tip' AND NOT EXISTS (
  SELECT 1 FROM `products`
  WHERE CAST(`id` AS TEXT) = `NEW`.`reference_id`
    AND `owner_email` = `NEW`.`target_email`
    AND `status` = 'published'
    AND `moderation_status` = 'visible'
    AND `review_status` = 'approved'
    AND `approved_version` = `review_version`
)
BEGIN SELECT RAISE(ABORT, 'product_tip_product_not_approved'); END;--> statement-breakpoint
CREATE TRIGGER `product_like_reward_approved_product_guard`
BEFORE INSERT ON `fruit_operations`
WHEN `NEW`.`kind` = 'like_reward_pending' AND NOT EXISTS (
  SELECT 1 FROM `products`
  WHERE CAST(`id` AS TEXT) = `NEW`.`reference_id`
    AND `owner_email` = `NEW`.`target_email`
    AND `status` = 'published'
    AND `moderation_status` = 'visible'
    AND `review_status` = 'approved'
    AND `approved_version` = `review_version`
)
BEGIN SELECT RAISE(ABORT, 'product_like_reward_product_not_approved'); END;--> statement-breakpoint
CREATE TRIGGER `product_likes_count_insert`
AFTER INSERT ON `product_likes`
BEGIN
  UPDATE `products`
  SET `likes_count` = `likes_count` + 1
  WHERE `id` = NEW.`product_id`;
END;--> statement-breakpoint
CREATE TRIGGER `product_likes_count_delete`
AFTER DELETE ON `product_likes`
BEGIN
  UPDATE `products`
  SET `likes_count` = MAX(0, `likes_count` - 1)
  WHERE `id` = OLD.`product_id`;
END;
