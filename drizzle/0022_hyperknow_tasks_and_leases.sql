CREATE TABLE IF NOT EXISTS `hk_credit_charges` (
	`key` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`cost` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`lease_token` text,
	`lease_expires_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hk_credit_charges_user_status_idx` ON `hk_credit_charges` (`user_email`, `status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hk_course_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`query` text NOT NULL,
	`brief_json` text,
	`research_hits_json` text,
	`blueprint_json` text,
	`selected_units_json` text,
	`units_json` text DEFAULT '[]' NOT NULL,
	`current_unit_index` integer DEFAULT 0 NOT NULL,
	`total_units` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`lease_token` text,
	`lease_expires_at` text,
	`error_message` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hk_course_tasks_user_status_idx` ON `hk_course_tasks` (`user_email`, `status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hk_lecture_images` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`user_email` text NOT NULL,
	`model` text NOT NULL,
	`params` text NOT NULL,
	`version` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`caption` text,
	`prompt` text,
	`status` text DEFAULT 'completed' NOT NULL,
	`lease_token` text,
	`lease_expires_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hk_lecture_images_session_idx` ON `hk_lecture_images` (`session_id`, `user_email`);
