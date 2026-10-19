CREATE TABLE `recruit_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`position` text NOT NULL,
	`stage` text DEFAULT 'applied' NOT NULL,
	`status_token` text,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "recruit_candidates_stage_valid" CHECK("recruit_candidates"."stage" in ('applied', 'homework', 'group', 'final', 'admitted', 'rejected'))
);
--> statement-breakpoint
CREATE INDEX `recruit_candidates_stage_idx` ON `recruit_candidates` (`stage`);--> statement-breakpoint
CREATE UNIQUE INDEX `recruit_candidates_email_unique` ON `recruit_candidates` (`email`);