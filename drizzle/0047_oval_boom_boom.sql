CREATE TABLE `mail_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`to_email` text NOT NULL,
	`mailbox` text NOT NULL,
	`status` text NOT NULL,
	`error_code` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "mail_deliveries_status_valid" CHECK("mail_deliveries"."status" in ('sent','failed'))
);
--> statement-breakpoint
CREATE INDEX `mail_deliveries_created_idx` ON `mail_deliveries` (`created_at`);--> statement-breakpoint
CREATE INDEX `mail_deliveries_mailbox_idx` ON `mail_deliveries` (`mailbox`,`created_at`);--> statement-breakpoint
CREATE INDEX `mail_deliveries_reference_idx` ON `mail_deliveries` (`reference`);