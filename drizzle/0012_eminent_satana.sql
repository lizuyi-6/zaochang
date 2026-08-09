ALTER TABLE `docs` ADD `is_book` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `docs` ADD `cover_hue` integer DEFAULT 210 NOT NULL;--> statement-breakpoint
ALTER TABLE `docs` ADD `summary` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `docs_book_idx` ON `docs` (`is_book`,`sort_order`);