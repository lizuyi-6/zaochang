CREATE TABLE `hk_credits` (
	`user_email` text PRIMARY KEY NOT NULL,
	`balance` integer NOT NULL,
	`reset_date` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
