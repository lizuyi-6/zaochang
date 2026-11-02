CREATE TABLE `hk_check_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`member_email` text NOT NULL,
	`session_id` text,
	`course_uuid` text,
	`unit_id` text,
	`lecture_id` text,
	`step_id` text NOT NULL,
	`kind` text NOT NULL,
	`correct` integer NOT NULL,
	`verdict` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`member_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hk_check_attempts_kind_valid" CHECK("hk_check_attempts"."kind" in ('choice', 'recall')),
	CONSTRAINT "hk_check_attempts_correct_valid" CHECK("hk_check_attempts"."correct" in (0, 1)),
	CONSTRAINT "hk_check_attempts_verdict_valid" CHECK("hk_check_attempts"."verdict" is null or "hk_check_attempts"."verdict" in ('correct', 'partial', 'incorrect'))
);
--> statement-breakpoint
CREATE INDEX `hk_check_attempts_member_course_lecture_idx` ON `hk_check_attempts` (`member_email`,`course_uuid`,`unit_id`,`lecture_id`);
--> statement-breakpoint
CREATE INDEX `hk_check_attempts_session_step_idx` ON `hk_check_attempts` (`session_id`,`step_id`,`kind`);
--> statement-breakpoint
CREATE TABLE `hk_lecture_progress` (
	`member_email` text NOT NULL,
	`course_uuid` text NOT NULL,
	`unit_id` text NOT NULL,
	`lecture_id` text NOT NULL,
	`session_id` text,
	`status` text DEFAULT 'started' NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`member_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hk_lecture_progress_status_valid" CHECK("hk_lecture_progress"."status" in ('started', 'completed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hk_lecture_progress_member_course_unit_lecture_idx` ON `hk_lecture_progress` (`member_email`,`course_uuid`,`unit_id`,`lecture_id`);
--> statement-breakpoint
CREATE INDEX `hk_lecture_progress_member_course_idx` ON `hk_lecture_progress` (`member_email`,`course_uuid`);
--> statement-breakpoint
ALTER TABLE `hk_whiteboard_sessions` ADD `course_uuid` text;
--> statement-breakpoint
ALTER TABLE `hk_whiteboard_sessions` ADD `unit_id` text;
--> statement-breakpoint
ALTER TABLE `hk_whiteboard_sessions` ADD `lecture_id` text;
