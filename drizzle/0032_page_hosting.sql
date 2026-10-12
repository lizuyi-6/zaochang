-- ===== DDL (将由 drizzle-kit 生成物替换) =====
ALTER TABLE `products` ADD `hosting_revision` integer DEFAULT 0 NOT NULL CHECK (`hosting_revision` >= 0);--> statement-breakpoint

CREATE TABLE `hosting_grants` (
	`member_email` text PRIMARY KEY NOT NULL,
	`max_sites` integer DEFAULT 3 NOT NULL,
	`granted_by` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`member_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`granted_by`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hosting_grants_max_sites_valid" CHECK (`max_sites` between 1 and 20)
);--> statement-breakpoint

-- SQLite cannot alter a CHECK constraint in place. Defer references while copying the current
-- full 0031 column set; the scan guards are intentionally recreated in the trigger section.
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_uploaded_files` (
	`key` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`original_name` text NOT NULL,
	`media_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`visibility` text NOT NULL,
	`purpose` text NOT NULL,
	`sha256` text NOT NULL,
	`scan_status` text DEFAULT 'pending' NOT NULL,
	`scan_engine` text,
	`scan_signature` text,
	`quarantine_key` text,
	`hyperknow_image` integer DEFAULT 0 NOT NULL,
	`hyperknow_image_cleanup_token` text,
	`hyperknow_image_cleanup_expires_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`scanned_at` text,
	FOREIGN KEY (`owner_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "uploaded_files_size_valid" CHECK (`byte_size` between 1 and 10485760),
	CONSTRAINT "uploaded_files_visibility_valid" CHECK (`visibility` in ('public', 'private')),
	CONSTRAINT "uploaded_files_purpose_valid" CHECK (`purpose` in ('general', 'product_cover', 'incubation_material', 'book_cover', 'hosting_bundle')),
	CONSTRAINT "uploaded_files_scan_status_valid" CHECK (`scan_status` in ('pending', 'clean', 'infected', 'error'))
);--> statement-breakpoint
INSERT INTO `__new_uploaded_files` (
	`key`, `owner_email`, `original_name`, `media_type`, `byte_size`, `visibility`, `purpose`, `sha256`,
	`scan_status`, `scan_engine`, `scan_signature`, `quarantine_key`, `hyperknow_image`,
	`hyperknow_image_cleanup_token`, `hyperknow_image_cleanup_expires_at`, `created_at`, `scanned_at`
)
SELECT
	`key`, `owner_email`, `original_name`, `media_type`, `byte_size`, `visibility`, `purpose`, `sha256`,
	`scan_status`, `scan_engine`, `scan_signature`, `quarantine_key`, `hyperknow_image`,
	`hyperknow_image_cleanup_token`, `hyperknow_image_cleanup_expires_at`, `created_at`, `scanned_at`
FROM `uploaded_files`;--> statement-breakpoint
DROP TABLE `uploaded_files`;--> statement-breakpoint
ALTER TABLE `__new_uploaded_files` RENAME TO `uploaded_files`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;--> statement-breakpoint
CREATE INDEX `uploaded_files_owner_idx` ON `uploaded_files` (`owner_email`, `created_at`);--> statement-breakpoint
CREATE INDEX `uploaded_files_scan_status_idx` ON `uploaded_files` (`scan_status`, `created_at`);--> statement-breakpoint
CREATE INDEX `uploaded_files_hyperknow_cleanup_idx` ON `uploaded_files` (`hyperknow_image`, `scan_status`, `created_at`);--> statement-breakpoint

CREATE TABLE `product_hostings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`owner_email` text NOT NULL,
	`bundle_key` text NOT NULL,
	`bundle_sha256` text NOT NULL,
	`bundle_zip_bytes` integer NOT NULL,
	`bundle_file_count` integer NOT NULL,
	`bundle_uncompressed_bytes` integer NOT NULL,
	`review_version` integer NOT NULL,
	`approved_version` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`desired` text DEFAULT 'staged' NOT NULL,
	`provider` text DEFAULT 'stepfun_page' NOT NULL,
	`site_id` text,
	`version_id` text,
	`preview_url` text,
	`preview_expires_at` text,
	`live_url` text,
	`failure_code` text,
	`failure_detail` text,
	`lease_token_hash` text,
	`lease_expires_at` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bundle_key`) REFERENCES `uploaded_files`(`key`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "product_hostings_bundle_sha256_valid" CHECK (length(`bundle_sha256`) = 64 AND `bundle_sha256` NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "product_hostings_bundle_sizes_valid" CHECK (`bundle_zip_bytes` >= 0 AND `bundle_file_count` >= 1 AND `bundle_uncompressed_bytes` >= 0),
	CONSTRAINT "product_hostings_review_versions_valid" CHECK (`review_version` >= 1 AND `approved_version` >= 0 AND `approved_version` <= `review_version`),
	CONSTRAINT "product_hostings_state_valid" CHECK (`state` IN ('queued', 'deploying', 'staged', 'promoting', 'live', 'removing', 'removed', 'failed')),
	CONSTRAINT "product_hostings_desired_valid" CHECK (`desired` IN ('staged', 'live', 'removed')),
	CONSTRAINT "product_hostings_provider_valid" CHECK (`provider` = 'stepfun_page'),
	CONSTRAINT "product_hostings_failure_code_valid" CHECK (`failure_code` IS NULL OR `failure_code` IN ('validation_bundle', 'validation_secret', 'provider_quota', 'provider_audit_rejected', 'provider_error', 'provider_auth', 'ambiguous', 'bundle_missing', 'internal')),
	CONSTRAINT "product_hostings_failure_detail_length_valid" CHECK (`failure_detail` IS NULL OR length(`failure_detail`) <= 200),
	CONSTRAINT "product_hostings_lease_token_hash_valid" CHECK (`lease_token_hash` IS NULL OR (length(`lease_token_hash`) = 64 AND `lease_token_hash` NOT GLOB '*[^0-9a-f]*')),
	CONSTRAINT "product_hostings_attempts_nonnegative" CHECK (`attempts` >= 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX `product_hostings_one_active_product_idx` ON `product_hostings` (`product_id`) WHERE `desired` <> 'removed';--> statement-breakpoint
CREATE INDEX `product_hostings_state_desired_idx` ON `product_hostings` (`state`, `desired`);--> statement-breakpoint
CREATE INDEX `product_hostings_owner_idx` ON `product_hostings` (`owner_email`);--> statement-breakpoint

-- ===== TRIGGERS + VIEW (原样保留) =====
-- I2: 若无此触发器，托管资料变更不会推进审核版本，旧批准可能继续覆盖新包。
DROP TRIGGER `product_material_change_requires_review`;--> statement-breakpoint
CREATE TRIGGER `product_material_change_requires_review`
AFTER UPDATE OF `owner_email`, `owner_name`, `title`, `description`, `category`, `demo_type`, `demo_url`, `image_url`, `cover_theme`, `price`, `pricing_model`, `hosting_revision` ON `products`
WHEN `OLD`.`owner_email` IS NOT `NEW`.`owner_email`
  OR `OLD`.`owner_name` IS NOT `NEW`.`owner_name`
  OR `OLD`.`title` IS NOT `NEW`.`title`
  OR `OLD`.`description` IS NOT `NEW`.`description`
  OR `OLD`.`category` IS NOT `NEW`.`category`
  OR `OLD`.`demo_type` IS NOT `NEW`.`demo_type`
  OR `OLD`.`demo_url` IS NOT `NEW`.`demo_url`
  OR `OLD`.`image_url` IS NOT `NEW`.`image_url`
  OR `OLD`.`cover_theme` IS NOT `NEW`.`cover_theme`
  OR `OLD`.`price` IS NOT `NEW`.`price`
  OR `OLD`.`pricing_model` IS NOT `NEW`.`pricing_model`
  OR `OLD`.`hosting_revision` IS NOT `NEW`.`hosting_revision`
BEGIN
  UPDATE `products`
  SET `status` = 'pending_review',
      `review_status` = 'pending_review',
      `review_version` = `OLD`.`review_version` + 1,
      `reviewed_by` = NULL,
      `reviewed_at` = NULL,
      `review_note` = '',
      `submitted_at` = CURRENT_TIMESTAMP
  WHERE `id` = `NEW`.`id`;
END;--> statement-breakpoint

-- I4: 若无此触发器，上传记录可能在扫描结束前或由非托管用途冒充托管 ZIP。
CREATE TRIGGER `uploaded_files_pending_insert_guard`
BEFORE INSERT ON `uploaded_files`
WHEN NEW.`scan_status` <> 'pending'
BEGIN SELECT RAISE(ABORT, 'uploaded_file_must_start_pending'); END;--> statement-breakpoint

-- I4: 若无此触发器，扫描完成后仍可篡改包的摘要/归属/用途，托管审核将无法绑定原始字节。
CREATE TRIGGER `uploaded_files_scan_transition_guard`
BEFORE UPDATE ON `uploaded_files`
WHEN OLD.`key` <> NEW.`key`
  OR OLD.`owner_email` <> NEW.`owner_email`
  OR OLD.`original_name` <> NEW.`original_name`
  OR OLD.`media_type` <> NEW.`media_type`
  OR OLD.`byte_size` <> NEW.`byte_size`
  OR OLD.`visibility` <> NEW.`visibility`
  OR OLD.`purpose` <> NEW.`purpose`
  OR OLD.`sha256` <> NEW.`sha256`
  OR OLD.`created_at` <> NEW.`created_at`
  OR OLD.`hyperknow_image` <> NEW.`hyperknow_image`
  OR NOT (
    (OLD.`scan_status` = 'pending'
      AND NEW.`scan_status` IN ('clean', 'infected', 'error')
      AND OLD.`hyperknow_image_cleanup_token` IS NEW.`hyperknow_image_cleanup_token`
      AND OLD.`hyperknow_image_cleanup_expires_at` IS NEW.`hyperknow_image_cleanup_expires_at`)
    OR (OLD.`scan_status` IS NEW.`scan_status`
      AND OLD.`scan_engine` IS NEW.`scan_engine`
      AND OLD.`scan_signature` IS NEW.`scan_signature`
      AND OLD.`quarantine_key` IS NEW.`quarantine_key`
      AND OLD.`scanned_at` IS NEW.`scanned_at`)
  )
BEGIN SELECT RAISE(ABORT, 'uploaded_file_scan_state_immutable'); END;--> statement-breakpoint

-- I4: 若无此触发器，ZIP 可被赋予普通用途、托管包可公开访问，或非 ZIP 可混入托管清单。
CREATE TRIGGER `uploaded_files_hosting_bundle_guard`
BEFORE INSERT ON `uploaded_files`
WHEN (`NEW`.`media_type` = 'application/zip') <> (`NEW`.`purpose` = 'hosting_bundle')
  OR (`NEW`.`purpose` = 'hosting_bundle' AND `NEW`.`visibility` <> 'private')
BEGIN SELECT RAISE(ABORT, 'uploaded_file_hosting_bundle_invalid'); END;--> statement-breakpoint

-- I4: 若无此触发器，未授权/撤销授权的属主仍可提交远端托管站点。
CREATE TRIGGER `product_hostings_grant_guard`
BEFORE INSERT ON `product_hostings`
WHEN NOT EXISTS (
  SELECT 1 FROM `hosting_grants` g
  WHERE g.`member_email` = NEW.`owner_email` AND g.`revoked_at` IS NULL
)
BEGIN SELECT RAISE(ABORT, 'hosting_not_granted'); END;--> statement-breakpoint

-- I4: 若无此触发器，属主可以超出授权的并行站点配额。
CREATE TRIGGER `product_hostings_quota_guard`
BEFORE INSERT ON `product_hostings`
WHEN EXISTS (
  SELECT 1 FROM `hosting_grants` g
  WHERE g.`member_email` = NEW.`owner_email` AND g.`revoked_at` IS NULL
    AND (SELECT COUNT(*) FROM `product_hostings` h
      WHERE h.`owner_email` = NEW.`owner_email` AND h.`desired` <> 'removed') >= g.`max_sites`
)
BEGIN SELECT RAISE(ABORT, 'hosting_quota_exceeded'); END;--> statement-breakpoint

-- I4: 若无此触发器，托管行的属主可与产品属主分离，错误账号会控制站点。
CREATE TRIGGER `product_hostings_owner_guard`
BEFORE INSERT ON `product_hostings`
WHEN NOT EXISTS (
  SELECT 1 FROM `products` p
  WHERE p.`id` = NEW.`product_id` AND p.`owner_email` = NEW.`owner_email`
)
BEGIN SELECT RAISE(ABORT, 'hosting_owner_mismatch'); END;--> statement-breakpoint

-- I4/I6: 若无此触发器，外链演示产品可绕过不可变包审核并同时进入托管流程。
CREATE TRIGGER `product_hostings_demo_url_guard`
BEFORE INSERT ON `product_hostings`
WHEN EXISTS (
  SELECT 1 FROM `products` p
  WHERE p.`id` = NEW.`product_id` AND p.`demo_url` IS NOT NULL AND length(trim(p.`demo_url`)) > 0
)
BEGIN SELECT RAISE(ABORT, 'hosting_demo_url_conflict'); END;--> statement-breakpoint

-- I2/I4: 若无此触发器，包可能绑定错误审核版本/已批准产品，直接把 desired 改为 live 可绕过新包决议。
CREATE TRIGGER `product_hostings_review_binding_guard`
BEFORE INSERT ON `product_hostings`
WHEN NOT EXISTS (
  SELECT 1 FROM `products` p
  WHERE p.`id` = NEW.`product_id` AND p.`review_version` = NEW.`review_version`
)
BEGIN SELECT RAISE(ABORT, 'hosting_review_version_mismatch'); END;--> statement-breakpoint
CREATE TRIGGER `product_hostings_pending_review_guard`
BEFORE INSERT ON `product_hostings`
WHEN NOT EXISTS (
  SELECT 1 FROM `products` p
  WHERE p.`id` = NEW.`product_id` AND p.`status` = 'pending_review' AND p.`review_status` = 'pending_review'
)
BEGIN SELECT RAISE(ABORT, 'hosting_product_not_pending'); END;--> statement-breakpoint

-- I4: 若无此触发器，bundle_key 可指向未扫描、公开、异属主、用途错误或摘要不一致的文件。
CREATE TRIGGER `product_hostings_bundle_guard`
BEFORE INSERT ON `product_hostings`
WHEN NOT EXISTS (
  SELECT 1 FROM `uploaded_files` f
  WHERE f.`key` = NEW.`bundle_key`
    AND f.`scan_status` = 'clean'
    AND f.`purpose` = 'hosting_bundle'
    AND f.`visibility` = 'private'
    AND f.`owner_email` = NEW.`owner_email`
    AND f.`sha256` = NEW.`bundle_sha256`
)
BEGIN SELECT RAISE(ABORT, 'hosting_bundle_invalid'); END;--> statement-breakpoint

-- I2/I4: 若无此触发器，审核员可批准未部署完成或不是本次审核版本的包。
CREATE TRIGGER `product_hostings_approval_staging_guard`
BEFORE INSERT ON `product_review_decisions`
WHEN NEW.`decision` = 'approved'
  AND EXISTS (
    SELECT 1 FROM `product_hostings` h
    WHERE h.`product_id` = NEW.`product_id` AND h.`desired` <> 'removed'
  )
  AND NOT EXISTS (
    SELECT 1 FROM `product_hostings` h
    WHERE h.`product_id` = NEW.`product_id`
      AND h.`desired` <> 'removed'
      AND h.`state` = 'staged'
      AND h.`review_version` = NEW.`review_version`
  )
BEGIN SELECT RAISE(ABORT, 'hosting_not_staged'); END;--> statement-breakpoint

-- I2/I5: 若无此触发器，托管包绑定列可在审核后改写，批准将不再指向已审核的字节。
CREATE TRIGGER `product_hostings_bound_columns_immutable`
BEFORE UPDATE OF `product_id`, `owner_email`, `bundle_key`, `bundle_sha256`, `review_version`, `created_at` ON `product_hostings`
WHEN OLD.`product_id` IS NOT NEW.`product_id`
  OR OLD.`owner_email` IS NOT NEW.`owner_email`
  OR OLD.`bundle_key` IS NOT NEW.`bundle_key`
  OR OLD.`bundle_sha256` IS NOT NEW.`bundle_sha256`
  OR OLD.`review_version` IS NOT NEW.`review_version`
  OR OLD.`created_at` IS NOT NEW.`created_at`
BEGIN SELECT RAISE(ABORT, 'hosting_bound_columns_immutable'); END;--> statement-breakpoint

-- I2/I5: 若无此触发器，desired 可跳过 staged 审核直接变为 live，或从 removed 复活。
CREATE TRIGGER `product_hostings_desired_transition_guard`
BEFORE UPDATE OF `desired` ON `product_hostings`
WHEN OLD.`desired` IS NOT NEW.`desired`
  AND (
    OLD.`desired` = 'removed'
    OR NEW.`desired` = 'staged'
    OR NEW.`desired` NOT IN ('staged', 'live', 'removed')
    OR (NEW.`desired` = 'live' AND NOT (
      OLD.`desired` = 'staged'
      AND NEW.`approved_version` = NEW.`review_version`
      AND EXISTS (
        SELECT 1 FROM `product_review_decisions` d
        WHERE d.`product_id` = NEW.`product_id`
          AND d.`review_version` = NEW.`review_version`
          AND d.`decision` = 'approved'
      )
    ))
  )
BEGIN SELECT RAISE(ABORT, 'hosting_invalid_transition'); END;--> statement-breakpoint

-- I3: 若无此触发器，部署器可在 desired 非 live、未批准或审核版本过期时公开站点。
-- I2: 任一不在状态迁移表中的跳转（包括 queued/deploying 直接到 live）同样 fail-closed。
CREATE TRIGGER `product_hostings_state_transition_guard`
BEFORE UPDATE OF `state` ON `product_hostings`
BEGIN
  SELECT CASE
    WHEN OLD.`state` IS NOT NEW.`state`
      AND NOT (
        (OLD.`state` = 'queued' AND NEW.`state` IN ('deploying', 'removed', 'failed'))
        OR (OLD.`state` = 'deploying' AND NEW.`state` IN ('staged', 'failed'))
        OR (OLD.`state` = 'staged' AND NEW.`state` IN ('promoting', 'removing'))
        OR (OLD.`state` = 'promoting' AND NEW.`state` IN ('live', 'staged'))
        OR (OLD.`state` = 'live' AND NEW.`state` = 'removing')
        OR (OLD.`state` = 'removing' AND NEW.`state` IN ('removing', 'removed'))
        OR (OLD.`state` = 'failed' AND NEW.`state` IN ('removing', 'removed'))
      )
      THEN RAISE(ABORT, 'hosting_invalid_transition')
  END;
  SELECT CASE
    WHEN OLD.`state` = 'promoting' AND NEW.`state` = 'live' AND NOT (
      NEW.`desired` = 'live'
      AND NEW.`approved_version` = NEW.`review_version`
      AND EXISTS (
        SELECT 1 FROM `products` p
        WHERE p.`id` = NEW.`product_id`
          AND p.`status` = 'published'
          AND p.`review_status` = 'approved'
          AND p.`approved_version` = p.`review_version`
          AND p.`approved_version` = NEW.`approved_version`
      )
    )
      THEN RAISE(ABORT, 'hosting_live_requires_approval')
  END;
END;--> statement-breakpoint

-- I5: 若无此触发器，批准记录不会绑定托管行的 approved_version/desired，合法暂存包也无法按批准上线。
CREATE TRIGGER `product_hostings_approval_apply`
AFTER INSERT ON `product_review_decisions`
WHEN NEW.`decision` = 'approved'
BEGIN
  UPDATE `product_hostings`
  SET `approved_version` = NEW.`review_version`,
      `desired` = 'live'
  WHERE `product_id` = NEW.`product_id`
    AND `desired` <> 'removed'
    AND `state` = 'staged'
    AND `review_version` = NEW.`review_version`;
END;--> statement-breakpoint

-- I5: 若无此触发器，驳回后暂存/排队的远端包仍保持 active desired，部署器可能继续推进它。
CREATE TRIGGER `product_hostings_rejection_cleanup`
AFTER INSERT ON `product_review_decisions`
WHEN NEW.`decision` = 'rejected'
BEGIN
  UPDATE `product_hostings`
  SET `desired` = 'removed'
  WHERE `product_id` = NEW.`product_id` AND `desired` <> 'removed';
END;--> statement-breakpoint

-- I1: 若无此视图，调用方可直接暴露未批准、版本不符或污染主机名的托管 URL。
CREATE VIEW `product_hosted_urls` (`product_id`, `live_url`) AS
SELECT h.`product_id`, h.`live_url`
FROM `product_hostings` h
JOIN `products` p ON p.`id` = h.`product_id`
WHERE h.`state` = 'live'
  AND p.`status` = 'published'
  AND p.`review_status` = 'approved'
  AND p.`approved_version` = p.`review_version`
  AND h.`approved_version` = p.`approved_version`
  AND h.`review_version` = p.`approved_version`
  AND h.`live_url` LIKE 'https://%.page.stepcloud.com'
  AND substr(h.`live_url`, 1, 8) = 'https://'
  AND substr(h.`live_url`, length(h.`live_url`) - length('.page.stepcloud.com') + 1) = '.page.stepcloud.com'
  AND length(h.`live_url`) > 8 + length('.page.stepcloud.com')
  AND length(h.`live_url`) - 8 - length('.page.stepcloud.com') <= 63
  AND substr(h.`live_url`, 9, length(h.`live_url`) - 8 - length('.page.stepcloud.com')) NOT GLOB '*[^a-z0-9-]*'
  AND substr(h.`live_url`, 9, 1) GLOB '[a-z0-9]'
  AND substr(h.`live_url`, length(h.`live_url`) - length('.page.stepcloud.com'), 1) GLOB '[a-z0-9]';
