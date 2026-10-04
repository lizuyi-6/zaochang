ALTER TABLE `oauth_provider_access_tokens` ADD `family_id` text;--> statement-breakpoint
-- 回填(2026-10 审计 L2-L4):refresh 轮换乘出的行按其父 refresh 的家族归属;
-- 授权码直出的首枚令牌无谱系可考(同批 refresh 未记录授权码),设为自身 hash 的
-- 独立家族——历史行至多损失跨表连坐,新发行行从迁移起谱系完整。
UPDATE `oauth_provider_access_tokens`
SET `family_id` = COALESCE(
  (SELECT `family_id` FROM `oauth_provider_refresh_tokens` WHERE `token_hash` = `oauth_provider_access_tokens`.`refresh_parent_hash`),
  'legacy-' || `token_hash`
);--> statement-breakpoint
CREATE INDEX `oauth_provider_access_family_idx` ON `oauth_provider_access_tokens` (`family_id`);
