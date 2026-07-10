CREATE TABLE IF NOT EXISTS `daily_claims` (
	`user_email` text NOT NULL,
	`claim_date` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_email`, `claim_date`),
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `members` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`bio` text DEFAULT '正在把一个想法变成作品。' NOT NULL,
	`reputation` integer DEFAULT 0 NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`owner_name` text NOT NULL,
	`content` text NOT NULL,
	`product_id` integer,
	`likes_count` integer DEFAULT 0 NOT NULL,
	`comments_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `posts_created_at_idx` ON `posts` (`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `product_likes` (
	`product_id` integer NOT NULL,
	`user_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`product_id`, `user_email`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`owner_name` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`demo_type` text DEFAULT 'prototype' NOT NULL,
	`demo_url` text,
	`cover_theme` text DEFAULT 'coral' NOT NULL,
	`price` integer DEFAULT 0 NOT NULL,
	`likes_count` integer DEFAULT 0 NOT NULL,
	`plays_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "products_price_nonnegative" CHECK("products"."price" >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `products_created_at_idx` ON `products` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `products_owner_idx` ON `products` (`owner_email`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`delta` integer NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`reference_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transactions_user_idx` ON `transactions` (`user_email`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `transactions_once_idx` ON `transactions` (`user_email`,`type`,`reference_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `wallets` (
	`user_email` text PRIMARY KEY NOT NULL,
	`balance` integer DEFAULT 120 NOT NULL,
	`lifetime_earned` integer DEFAULT 120 NOT NULL,
	`lifetime_spent` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "wallet_balance_nonnegative" CHECK("wallets"."balance" >= 0)
);
