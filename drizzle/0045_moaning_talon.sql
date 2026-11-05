CREATE TABLE `recruit_written_test_items` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`item_key` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`section` text DEFAULT '' NOT NULL,
	`max_score` integer DEFAULT 0 NOT NULL,
	`ai_reasons_json` text DEFAULT '[]' NOT NULL,
	`ai_evidence_json` text DEFAULT '[]' NOT NULL,
	`ai_uncertain` integer DEFAULT 0 NOT NULL,
	`ai_score` real,
	`ai_status` text DEFAULT 'pending' NOT NULL,
	`manual_score` real,
	`manual_note` text DEFAULT '' NOT NULL,
	`graded_by` text DEFAULT '' NOT NULL,
	`graded_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `recruit_written_tests`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recruit_written_test_items_ai_status_valid" CHECK("recruit_written_test_items"."ai_status" in ('pending','graded','ungraded','manual'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recruit_written_test_items_unique` ON `recruit_written_test_items` (`submission_id`,`item_key`);--> statement-breakpoint
CREATE INDEX `recruit_written_test_items_submission_idx` ON `recruit_written_test_items` (`submission_id`);--> statement-breakpoint
CREATE TABLE `recruit_written_tests` (
	`id` text PRIMARY KEY NOT NULL,
	`source_record_id` text NOT NULL,
	`name` text NOT NULL,
	`school` text DEFAULT '' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`positions` text DEFAULT '[]' NOT NULL,
	`competition` text DEFAULT '' NOT NULL,
	`answers_json` text DEFAULT '{}' NOT NULL,
	`attachments_json` text DEFAULT '{}' NOT NULL,
	`timings_json` text DEFAULT '{}' NOT NULL,
	`integrity_confirmed` integer DEFAULT 0 NOT NULL,
	`hard_score` integer DEFAULT 0 NOT NULL,
	`hard_score_json` text DEFAULT '{}' NOT NULL,
	`flags_json` text DEFAULT '[]' NOT NULL,
	`ai_score` real,
	`ai_graded_at` text,
	`manual_score` real,
	`status` text DEFAULT 'pending' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`graded_by` text DEFAULT '' NOT NULL,
	`submitted_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "recruit_written_tests_status_valid" CHECK("recruit_written_tests"."status" in ('pending','reviewing','done','flagged'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recruit_written_tests_source_unique` ON `recruit_written_tests` (`source_record_id`);--> statement-breakpoint
CREATE INDEX `recruit_written_tests_status_idx` ON `recruit_written_tests` (`status`);