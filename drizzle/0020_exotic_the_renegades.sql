CREATE TABLE `hk_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`title` text NOT NULL,
	`starred` integer DEFAULT 0 NOT NULL,
	`history_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `hk_conversations_user_updated_idx` ON `hk_conversations` (`user_email`,`updated_at`);--> statement-breakpoint
CREATE TABLE `hk_courses` (
	`uuid` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`course_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `hk_courses_user_created_idx` ON `hk_courses` (`user_email`,`created_at`);--> statement-breakpoint
CREATE TABLE `hk_whiteboard_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`topic` text NOT NULL,
	`plan_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
