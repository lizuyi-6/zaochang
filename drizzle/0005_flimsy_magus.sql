CREATE TABLE `external_fruit_entitlements` (
	`client_id` text NOT NULL,
	`payer_email` text NOT NULL,
	`external_reference` text NOT NULL,
	`payment_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`granted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`revoked_at` text,
	PRIMARY KEY(`client_id`, `payer_email`, `external_reference`),
	FOREIGN KEY (`client_id`) REFERENCES `oauth_provider_clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payer_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `external_fruit_payments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "external_fruit_entitlements_status_valid" CHECK("external_fruit_entitlements"."status" in ('active', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE `external_fruit_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`payer_email` text NOT NULL,
	`merchant_email` text NOT NULL,
	`external_reference` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`pricing_model` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`idempotency_key` text NOT NULL,
	`return_uri` text NOT NULL,
	`purchase_operation_id` text,
	`refund_operation_id` text,
	`approval_challenge_hash` text,
	`expires_at` text NOT NULL,
	`refundable_until` text,
	`available_at` text,
	`paid_at` text,
	`settled_at` text,
	`refunded_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_provider_clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payer_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merchant_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_operation_id`) REFERENCES `fruit_operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`refund_operation_id`) REFERENCES `fruit_operations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "external_fruit_payments_amount_valid" CHECK("external_fruit_payments"."amount" between 1 and 99),
	CONSTRAINT "external_fruit_payments_pricing_valid" CHECK("external_fruit_payments"."pricing_model" in ('one_time', 'per_use')),
	CONSTRAINT "external_fruit_payments_status_valid" CHECK("external_fruit_payments"."status" in ('pending', 'paid', 'settled', 'refunded', 'cancelled', 'expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_fruit_payments_idempotency_idx` ON `external_fruit_payments` (`client_id`,`payer_email`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `external_fruit_payments_client_idx` ON `external_fruit_payments` (`client_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `external_fruit_payments_merchant_idx` ON `external_fruit_payments` (`merchant_email`,`status`,`available_at`);--> statement-breakpoint
CREATE TABLE `oauth_provider_access_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_email` text NOT NULL,
	`scope` text NOT NULL,
	`authorization_code_hash` text,
	`refresh_parent_hash` text,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_provider_clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authorization_code_hash`) REFERENCES `oauth_provider_authorization_codes`(`code_hash`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_provider_access_code_once_idx` ON `oauth_provider_access_tokens` (`authorization_code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_provider_access_refresh_once_idx` ON `oauth_provider_access_tokens` (`refresh_parent_hash`);--> statement-breakpoint
CREATE INDEX `oauth_provider_access_lookup_idx` ON `oauth_provider_access_tokens` (`client_id`,`user_email`,`expires_at`);--> statement-breakpoint
CREATE TABLE `oauth_provider_authorization_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`request_hash` text NOT NULL,
	`client_id` text NOT NULL,
	`user_email` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`scope` text NOT NULL,
	`nonce` text,
	`code_challenge` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`request_hash`) REFERENCES `oauth_provider_authorization_requests`(`request_hash`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_provider_clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_provider_codes_request_idx` ON `oauth_provider_authorization_codes` (`request_hash`);--> statement-breakpoint
CREATE INDEX `oauth_provider_codes_expiry_idx` ON `oauth_provider_authorization_codes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `oauth_provider_authorization_requests` (
	`request_hash` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_email` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`scope` text NOT NULL,
	`state` text NOT NULL,
	`nonce` text,
	`code_challenge` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_provider_clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `oauth_provider_requests_expiry_idx` ON `oauth_provider_authorization_requests` (`expires_at`);--> statement-breakpoint
CREATE TABLE `oauth_provider_clients` (
	`client_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`website_url` text NOT NULL,
	`client_type` text NOT NULL,
	`client_secret_hash` text,
	`allowed_scopes` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "oauth_provider_clients_type_valid" CHECK("oauth_provider_clients"."client_type" in ('public', 'confidential')),
	CONSTRAINT "oauth_provider_clients_status_valid" CHECK("oauth_provider_clients"."status" in ('active', 'revoked'))
);
--> statement-breakpoint
CREATE INDEX `oauth_provider_clients_owner_idx` ON `oauth_provider_clients` (`owner_email`,`created_at`);--> statement-breakpoint
CREATE TABLE `oauth_provider_consents` (
	`client_id` text NOT NULL,
	`user_email` text NOT NULL,
	`scope` text NOT NULL,
	`granted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`revoked_at` text,
	PRIMARY KEY(`client_id`, `user_email`),
	FOREIGN KEY (`client_id`) REFERENCES `oauth_provider_clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `oauth_provider_redirect_uris` (
	`client_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`client_id`, `redirect_uri`),
	FOREIGN KEY (`client_id`) REFERENCES `oauth_provider_clients`(`client_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `oauth_provider_refresh_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_email` text NOT NULL,
	`scope` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`replaced_by_hash` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_provider_clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `oauth_provider_refresh_lookup_idx` ON `oauth_provider_refresh_tokens` (`client_id`,`user_email`,`expires_at`);--> statement-breakpoint
CREATE TABLE `oauth_provider_signing_keys` (
	`kid` text PRIMARY KEY NOT NULL,
	`algorithm` text DEFAULT 'ES256' NOT NULL,
	`private_jwk` text NOT NULL,
	`public_jwk` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "oauth_provider_key_status_valid" CHECK("oauth_provider_signing_keys"."status" in ('active', 'retired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_provider_one_active_key_idx` ON `oauth_provider_signing_keys` (`status`) WHERE "oauth_provider_signing_keys"."status" = 'active';--> statement-breakpoint
CREATE TABLE `oauth_provider_subjects` (
	`client_id` text NOT NULL,
	`user_email` text NOT NULL,
	`subject` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`client_id`, `user_email`),
	FOREIGN KEY (`client_id`) REFERENCES `oauth_provider_clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_provider_subject_unique_idx` ON `oauth_provider_subjects` (`subject`);--> statement-breakpoint
CREATE UNIQUE INDEX `fruit_operations_external_refund_once_idx` ON `fruit_operations` (`related_operation_id`) WHERE "fruit_operations"."kind" = 'external_refund';
--> statement-breakpoint
CREATE TRIGGER `fruit_external_payment_guard`
BEFORE INSERT ON `fruit_operations`
WHEN NEW.`kind` = 'external_purchase' AND NOT EXISTS (
	SELECT 1 FROM `external_fruit_payments` p
	WHERE p.`id` = NEW.`reference_id`
	  AND p.`status` = 'pending'
	  AND p.`expires_at` > CURRENT_TIMESTAMP
	  AND p.`payer_email` = NEW.`actor_email`
	  AND p.`merchant_email` = NEW.`target_email`
	  AND p.`amount` = NEW.`amount`
	  AND EXISTS (SELECT 1 FROM `members` m WHERE m.`email` = p.`payer_email` AND m.`joined_at` <= datetime('now', '-24 hours'))
	  AND EXISTS (SELECT 1 FROM `wallets` w WHERE w.`user_email` = p.`payer_email` AND w.`status` = 'active')
	  AND EXISTS (SELECT 1 FROM `wallets` w WHERE w.`user_email` = p.`merchant_email` AND w.`status` = 'active')
	  AND (
		p.`pricing_model` = 'per_use'
		OR NOT EXISTS (
			SELECT 1 FROM `external_fruit_entitlements` e
			WHERE e.`client_id` = p.`client_id`
			  AND e.`payer_email` = p.`payer_email`
			  AND e.`external_reference` = p.`external_reference`
			  AND e.`status` = 'active'
		)
	  )
)
BEGIN SELECT RAISE(ABORT, 'external_payment_not_payable'); END;
--> statement-breakpoint
CREATE TRIGGER `fruit_external_refund_guard`
BEFORE INSERT ON `fruit_operations`
WHEN NEW.`kind` = 'external_refund' AND NOT EXISTS (
	SELECT 1 FROM `external_fruit_payments`
	WHERE `id` = NEW.`reference_id`
	  AND `status` = 'paid'
	  AND `pricing_model` = 'one_time'
	  AND `refundable_until` > CURRENT_TIMESTAMP
	  AND `purchase_operation_id` = NEW.`related_operation_id`
	  AND `merchant_email` = NEW.`actor_email`
	  AND `payer_email` = NEW.`target_email`
	  AND `amount` = NEW.`amount`
	  AND EXISTS (SELECT 1 FROM `wallets` w WHERE w.`user_email` = `external_fruit_payments`.`payer_email` AND w.`status` = 'active')
	  AND EXISTS (SELECT 1 FROM `wallets` w WHERE w.`user_email` = `external_fruit_payments`.`merchant_email` AND w.`status` = 'active')
)
BEGIN SELECT RAISE(ABORT, 'external_refund_not_payable'); END;
--> statement-breakpoint
CREATE TRIGGER `fruit_external_settlement_guard`
BEFORE INSERT ON `fruit_operations`
WHEN NEW.`kind` = 'external_settlement' AND NOT EXISTS (
	SELECT 1 FROM `external_fruit_payments`
	WHERE `id` = NEW.`reference_id`
	  AND `status` = 'paid'
	  AND `available_at` <= CURRENT_TIMESTAMP
	  AND `merchant_email` = NEW.`target_email`
	  AND `amount` = NEW.`amount`
	  AND EXISTS (SELECT 1 FROM `wallets` w WHERE w.`user_email` = `external_fruit_payments`.`merchant_email` AND w.`status` = 'active')
)
BEGIN SELECT RAISE(ABORT, 'external_settlement_not_payable'); END;
--> statement-breakpoint
CREATE TRIGGER `external_fruit_entitlements_active_guard`
BEFORE UPDATE OF `payment_id`, `status` ON `external_fruit_entitlements`
WHEN OLD.`status` = 'active' AND NEW.`status` = 'active'
BEGIN SELECT RAISE(ABORT, 'external_entitlement_already_active'); END;
