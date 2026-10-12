-- MCP OAuth requires ownerless public clients. Rebuild the referenced parent in
-- place while keeping its name stable so all nine existing child FK declarations
-- remain pointed at oauth_provider_clients. Those children are:
-- external_fruit_entitlements, external_fruit_payments, oauth_provider_access_tokens,
-- oauth_provider_authorization_codes, oauth_provider_authorization_requests,
-- oauth_provider_consents, oauth_provider_redirect_uris,
-- oauth_provider_refresh_tokens, and oauth_provider_subjects. The only index on
-- the parent is recreated below. No pre-existing trigger is attached to this table.
-- D1 always enforces foreign keys and ignores PRAGMA foreign_keys=OFF, so DROP TABLE on a
-- parent with child rows fails immediately (reproduced on a populated local D1). Deferring
-- the checks to commit (same pattern as 0008) lets the renamed table satisfy the children.
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_oauth_provider_clients` (
	`client_id` text PRIMARY KEY NOT NULL,
	`owner_email` text,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`website_url` text NOT NULL,
	`client_type` text NOT NULL,
	`client_secret_hash` text,
	`allowed_scopes` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`review_status` text DEFAULT 'unverified' NOT NULL,
	`write_access_approved` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`registration_source` text DEFAULT 'developer' NOT NULL,
	`allowed_grants` text DEFAULT 'authorization_code refresh_token' NOT NULL,
	FOREIGN KEY (`owner_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "oauth_provider_clients_type_valid" CHECK("client_type" in ('public', 'confidential')),
	CONSTRAINT "oauth_provider_clients_status_valid" CHECK("status" in ('active', 'revoked')),
	CONSTRAINT "oauth_provider_clients_review_valid" CHECK("review_status" in ('unverified', 'verified', 'rejected')),
	CONSTRAINT "oauth_provider_clients_write_approval_valid" CHECK("write_access_approved" in (0, 1)),
	CONSTRAINT "oauth_provider_clients_registration_source_valid" CHECK("registration_source" in ('developer', 'dynamic')),
	CONSTRAINT "oauth_provider_clients_grants_valid" CHECK("allowed_grants" in ('authorization_code', 'authorization_code refresh_token')),
	CONSTRAINT "oauth_provider_clients_registration_owner_guard" CHECK(
		("registration_source" = 'developer' AND "owner_email" IS NOT NULL)
		OR ("registration_source" = 'dynamic' AND "owner_email" IS NULL
			AND "client_type" = 'public' AND "write_access_approved" = 0
			AND "review_status" = 'unverified'
			AND "allowed_scopes" IN ('mcp:projects', 'openid mcp:projects'))
	)
);--> statement-breakpoint
INSERT INTO `__new_oauth_provider_clients`
	(`client_id`, `owner_email`, `name`, `description`, `website_url`, `client_type`, `client_secret_hash`, `allowed_scopes`, `status`, `review_status`, `write_access_approved`, `created_at`, `updated_at`, `registration_source`, `allowed_grants`)
SELECT `client_id`, `owner_email`, `name`, `description`, `website_url`, `client_type`, `client_secret_hash`, `allowed_scopes`, `status`, `review_status`, `write_access_approved`, `created_at`, `updated_at`, 'developer', 'authorization_code refresh_token'
FROM `oauth_provider_clients`;--> statement-breakpoint
DROP TABLE `oauth_provider_clients`;--> statement-breakpoint
ALTER TABLE `__new_oauth_provider_clients` RENAME TO `oauth_provider_clients`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;--> statement-breakpoint
CREATE INDEX `oauth_provider_clients_owner_idx` ON `oauth_provider_clients` (`owner_email`,`created_at`);--> statement-breakpoint
CREATE INDEX `oauth_provider_clients_source_created_idx` ON `oauth_provider_clients` (`registration_source`,`created_at`);--> statement-breakpoint

ALTER TABLE `oauth_provider_authorization_requests` ADD `resource` text;--> statement-breakpoint
ALTER TABLE `oauth_provider_authorization_codes` ADD `resource` text;--> statement-breakpoint
ALTER TABLE `oauth_provider_access_tokens` ADD `resource` text;--> statement-breakpoint
ALTER TABLE `oauth_provider_refresh_tokens` ADD `resource` text;--> statement-breakpoint

CREATE TABLE `mcp_write_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`member_email` text NOT NULL,
	`credential_kind` text NOT NULL,
	`credential_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`product_id` integer,
	`result` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`member_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "mcp_write_audit_credential_kind_valid" CHECK("credential_kind" in ('api_key', 'oauth')),
	CONSTRAINT "mcp_write_audit_tool_valid" CHECK("tool_name" in ('create_product', 'update_product', 'upload_cover'))
);--> statement-breakpoint
CREATE INDEX `mcp_write_audit_created_idx` ON `mcp_write_audit` (`created_at`);--> statement-breakpoint
CREATE INDEX `mcp_write_audit_member_created_idx` ON `mcp_write_audit` (`member_email`,`created_at`);--> statement-breakpoint

-- Database backstops for dynamic-client capacity and the 10-consent-per-member cap.
CREATE TRIGGER `oauth_provider_dynamic_client_capacity_guard`
BEFORE INSERT ON `oauth_provider_clients`
WHEN NEW.`registration_source` = 'dynamic' AND (
	SELECT COUNT(*) FROM `oauth_provider_clients` c
	WHERE c.`registration_source` = 'dynamic'
	  AND c.`created_at` >= datetime('now', '-7 days')
	  AND NOT EXISTS (SELECT 1 FROM `oauth_provider_consents` x WHERE x.`client_id` = c.`client_id`)
	  AND NOT EXISTS (SELECT 1 FROM `oauth_provider_access_tokens` x WHERE x.`client_id` = c.`client_id`)
	  AND NOT EXISTS (SELECT 1 FROM `oauth_provider_refresh_tokens` x WHERE x.`client_id` = c.`client_id`)
) >= 2000
BEGIN SELECT RAISE(ABORT, 'registration_capacity_exceeded'); END;--> statement-breakpoint

CREATE TRIGGER `oauth_provider_dynamic_consent_limit_guard`
BEFORE INSERT ON `oauth_provider_consents`
WHEN EXISTS (
	SELECT 1 FROM `oauth_provider_clients` c
	WHERE c.`client_id` = NEW.`client_id` AND c.`registration_source` = 'dynamic'
)
AND NOT EXISTS (
	SELECT 1 FROM `oauth_provider_consents` x
	WHERE x.`client_id` = NEW.`client_id` AND x.`user_email` = NEW.`user_email` AND x.`revoked_at` IS NULL
)
AND (
	SELECT COUNT(*) FROM `oauth_provider_consents` x
	JOIN `oauth_provider_clients` c ON c.`client_id` = x.`client_id`
	WHERE x.`user_email` = NEW.`user_email` AND x.`revoked_at` IS NULL
	  AND c.`registration_source` = 'dynamic' AND c.`status` = 'active'
) >= 10
BEGIN SELECT RAISE(ABORT, 'dynamic_authorization_limit'); END;--> statement-breakpoint

-- The retention registry issues one DELETE against oauth_provider_clients. This
-- trigger removes dynamic-only children in FK order in the same SQLite statement.
CREATE TRIGGER `oauth_provider_dynamic_client_purge_children`
BEFORE DELETE ON `oauth_provider_clients`
WHEN OLD.`registration_source` = 'dynamic'
 AND OLD.`created_at` <= datetime('now', '-7 days')
 AND NOT EXISTS (SELECT 1 FROM `oauth_provider_consents` x WHERE x.`client_id` = OLD.`client_id`)
 AND NOT EXISTS (SELECT 1 FROM `oauth_provider_access_tokens` x WHERE x.`client_id` = OLD.`client_id`)
 AND NOT EXISTS (SELECT 1 FROM `oauth_provider_refresh_tokens` x WHERE x.`client_id` = OLD.`client_id`)
BEGIN
	DELETE FROM `oauth_provider_access_tokens` WHERE `client_id` = OLD.`client_id`;
	DELETE FROM `oauth_provider_refresh_tokens` WHERE `client_id` = OLD.`client_id`;
	DELETE FROM `oauth_provider_authorization_codes` WHERE `client_id` = OLD.`client_id`;
	DELETE FROM `oauth_provider_authorization_requests` WHERE `client_id` = OLD.`client_id`;
	DELETE FROM `oauth_provider_redirect_uris` WHERE `client_id` = OLD.`client_id`;
	DELETE FROM `oauth_provider_subjects` WHERE `client_id` = OLD.`client_id`;
END;--> statement-breakpoint
