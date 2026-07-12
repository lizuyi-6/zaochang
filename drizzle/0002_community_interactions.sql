ALTER TABLE `members` ADD `location` text DEFAULT '杭州' NOT NULL;
--> statement-breakpoint
ALTER TABLE `members` ADD `website` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `products` ADD `image_url` text;
--> statement-breakpoint
ALTER TABLE `posts` ADD `linked_product_ref` text;
--> statement-breakpoint
ALTER TABLE `posts` ADD `image_url` text;
--> statement-breakpoint
ALTER TABLE `posts` ADD `post_type` text DEFAULT '记录' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `community_actions` (
	`user_email` text NOT NULL,
	`kind` text NOT NULL,
	`target_ref` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_email`, `kind`, `target_ref`),
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `collections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT 'coral' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `collections_user_idx` ON `collections` (`user_email`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `collection_items` (
	`collection_id` integer NOT NULL,
	`product_ref` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`collection_id`, `product_ref`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`owner_name` text NOT NULL,
	`target_type` text NOT NULL,
	`target_ref` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `comments_target_idx` ON `comments` (`target_type`,`target_ref`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `incubation_projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`name` text NOT NULL,
	`project_type` text NOT NULL,
	`one_liner` text NOT NULL,
	`problem` text NOT NULL,
	`progress` text NOT NULL,
	`team` text NOT NULL,
	`need` text NOT NULL,
	`contact` text NOT NULL,
	`status` text DEFAULT '资料审核' NOT NULL,
	`current_task` text DEFAULT '补充目标用户画像' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `incubation_projects_user_idx` ON `incubation_projects` (`user_email`,`updated_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_materials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`user_email` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`kind` text DEFAULT 'FILE' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `incubation_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `project_materials_project_idx` ON `project_materials` (`project_id`,`created_at`);
