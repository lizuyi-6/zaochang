CREATE TABLE `hk_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`message` text NOT NULL,
	`context_json` text DEFAULT '{}' NOT NULL,
	`notify_status` text DEFAULT 'failed' NOT NULL,
	`notify_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hk_feedback_notify_status_valid" CHECK("hk_feedback"."notify_status" in ('sent', 'failed', 'not_configured'))
);
--> statement-breakpoint
CREATE INDEX `hk_feedback_created_idx` ON `hk_feedback` (`created_at`,`id`);
