CREATE TABLE `aetherguard_signups` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`reference` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`grade` text NOT NULL,
	`major` text NOT NULL,
	`student_id` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`submitted_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `aetherguard_signups_record_unique` ON `aetherguard_signups` (`record_id`);--> statement-breakpoint
CREATE INDEX `aetherguard_signups_reference_idx` ON `aetherguard_signups` (`reference`);--> statement-breakpoint
ALTER TABLE `recruit_written_tests` ADD `signup_reference` text DEFAULT '' NOT NULL;