UPDATE `products`
SET `status` = 'pending_review',
    `review_status` = 'pending_review',
    `review_version` = `review_version` + 1,
    `reviewed_by` = NULL,
    `reviewed_at` = NULL,
    `review_note` = '',
    `submitted_at` = CURRENT_TIMESTAMP
WHERE `demo_url` IS NOT NULL
  AND trim(`demo_url`) <> ''
  AND (`status` = 'published' OR `review_status` = 'approved');
--> statement-breakpoint
CREATE TRIGGER `product_review_external_demo_guard`
BEFORE INSERT ON `product_review_decisions`
WHEN NEW.`decision` = 'approved' AND EXISTS (
  SELECT 1 FROM `products`
  WHERE `id` = NEW.`product_id`
    AND `review_version` = NEW.`review_version`
    AND `demo_url` IS NOT NULL
    AND trim(`demo_url`) <> ''
)
BEGIN SELECT RAISE(ABORT, 'external_demo_requires_immutable_package'); END;
--> statement-breakpoint
CREATE UNIQUE INDEX `fruit_operations_moderation_once_idx`
ON `fruit_operations` (`related_operation_id`)
WHERE `kind` IN ('moderation_refund', 'moderation_compensation');
--> statement-breakpoint
CREATE TRIGGER `fruit_moderation_remediation_guard`
BEFORE INSERT ON `fruit_operations`
WHEN NEW.`kind` IN ('moderation_refund', 'moderation_compensation') AND NOT EXISTS (
  SELECT 1
  FROM `product_orders` o
  JOIN `products` p ON p.`id` = o.`product_id`
  WHERE o.`id` = NEW.`reference_id`
    AND NEW.`reference_type` = 'order'
    AND o.`pricing_model` = 'one_time'
    AND (
      (NEW.`kind` = 'moderation_refund' AND o.`status` = 'paid')
      OR (NEW.`kind` = 'moderation_compensation' AND o.`status` = 'settled')
    )
    AND p.`moderation_status` = 'hidden'
    AND o.`purchase_operation_id` = NEW.`related_operation_id`
    AND o.`seller_email` = NEW.`actor_email`
    AND o.`buyer_email` = NEW.`target_email`
    AND o.`amount` = NEW.`amount`
)
BEGIN SELECT RAISE(ABORT, 'moderation_remediation_not_allowed'); END;
