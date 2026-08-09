CREATE TABLE `docs` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`parent_id` text,
	`title` text NOT NULL,
	`body_md` text DEFAULT '' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`author_email` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`author_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "docs_visibility_valid" CHECK("docs"."visibility" in ('public', 'members', 'private'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `docs_parent_slug_idx` ON `docs` (`parent_id`,`slug`);--> statement-breakpoint
CREATE INDEX `docs_parent_sort_idx` ON `docs` (`parent_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `docs_author_idx` ON `docs` (`author_email`,`updated_at`);