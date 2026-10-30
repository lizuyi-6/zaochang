CREATE TABLE `account_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`intro` text NOT NULL,
	`link` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'public' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invitation_id` text,
	`mail_status` text DEFAULT 'none' NOT NULL,
	`mail_error` text,
	`mail_sent_at` text,
	`decided_by` text,
	`decided_at` text,
	`decision_note` text DEFAULT '' NOT NULL,
	`request_ip_hash` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitation_codes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "account_applications_status_valid" CHECK("account_applications"."status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "account_applications_source_valid" CHECK("account_applications"."source" in ('public', 'admin')),
	CONSTRAINT "account_applications_mail_status_valid" CHECK("account_applications"."mail_status" in ('none', 'sending', 'sent', 'failed')),
	CONSTRAINT "account_applications_approved_has_invitation" CHECK(("account_applications"."status" = 'approved') = ("account_applications"."invitation_id" IS NOT NULL)),
	CONSTRAINT "account_applications_mail_requires_approval" CHECK("account_applications"."status" = 'approved' OR "account_applications"."mail_status" = 'none')
);
--> statement-breakpoint
CREATE INDEX `account_applications_status_created_idx` ON `account_applications` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `account_applications_email_idx` ON `account_applications` (`email`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_applications_one_pending_idx` ON `account_applications` (`email`) WHERE "account_applications"."status" = 'pending';