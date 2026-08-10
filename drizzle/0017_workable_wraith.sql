CREATE TABLE `reading_progress` (
	`user_email` text NOT NULL,
	`book_id` text NOT NULL,
	`last_chapter_id` text NOT NULL,
	`last_paragraph` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_email`, `book_id`),
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`book_id`) REFERENCES `docs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`last_chapter_id`) REFERENCES `docs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reading_progress_user_updated_idx` ON `reading_progress` (`user_email`,`updated_at`);