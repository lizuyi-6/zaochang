ALTER TABLE `hk_credits` ADD `change_reason` text;
--> statement-breakpoint
ALTER TABLE `hk_credits` ADD `change_ref` text;
--> statement-breakpoint
CREATE TABLE `hk_credit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`delta` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`reason` text NOT NULL,
	`ref` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hk_credit_events_reason_valid" CHECK("hk_credit_events"."reason" in ('chat', 'translate', 'course', 'refund', 'daily_reset', 'plan_change'))
);
--> statement-breakpoint
CREATE INDEX `hk_credit_events_user_time_idx` ON `hk_credit_events` (`user_email`,`created_at`,`id`);
--> statement-breakpoint
CREATE TRIGGER hk_credits_balance_reason_required
BEFORE UPDATE OF balance ON hk_credits
FOR EACH ROW
WHEN (NEW.balance <> OLD.balance OR NEW.reset_date <> OLD.reset_date)
  AND (NEW.change_reason IS NULL
    OR NEW.change_reason IS OLD.change_reason
    OR NEW.change_reason NOT IN ('chat', 'translate', 'course', 'refund', 'daily_reset', 'plan_change')
    OR (NEW.reset_date <> OLD.reset_date AND NEW.change_reason <> 'daily_reset'))
BEGIN
  SELECT RAISE(ABORT, 'hk_credit_change_reason_required');
END;
--> statement-breakpoint
CREATE TRIGGER hk_credits_balance_event
AFTER UPDATE OF balance ON hk_credits
FOR EACH ROW
BEGIN
  INSERT INTO hk_credit_events (id, user_email, delta, balance_after, reason, ref, created_at)
  SELECT lower(hex(randomblob(16))), NEW.user_email, NEW.balance - OLD.balance,
         NEW.balance, NEW.change_reason, NEW.change_ref, CURRENT_TIMESTAMP
  WHERE NEW.balance <> OLD.balance
     OR (NEW.change_reason = 'daily_reset' AND NEW.reset_date <> OLD.reset_date);

  UPDATE hk_credits SET change_reason = NULL, change_ref = NULL
  WHERE user_email = NEW.user_email;
END;
--> statement-breakpoint
CREATE TRIGGER hk_credit_events_no_update
BEFORE UPDATE ON hk_credit_events
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'hk_credit_event_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER hk_credit_events_retention_guard
BEFORE DELETE ON hk_credit_events
FOR EACH ROW
WHEN OLD.created_at > datetime('now', '-90 days')
BEGIN
  SELECT RAISE(ABORT, 'hk_credit_event_not_expired');
END;
