-- M3(2026-10 审计):fruit_external_payment_guard 重建。
-- 原 guard(0005)只校验支付行自身状态:pending/未过期/金额双方一致/24h 冷静期/
-- 双方钱包 active/按定价模型查权益,唯独不校验发起方客户端的授权态。JS 侧唯一的
-- 检查点 paymentClientCanCharge(external-fruit.ts)与 db.batch 提交之间是
-- read-then-act:管理员驳回 client 的瞬间存在窄窗口,payer 仍可完成扣款
-- (payer 扣款、已被驳回 client 的 owner 入账)。触发器与批次同事务,是唯一的
-- 原子强制点,这里把 JS 侧谓词原样下沉:
--   status='active' AND review_status='verified' AND write_access_approved=1
-- (列由 0006 引入、0031 重建表时保留)。退款 guard 刻意不校验客户端授权态:
-- 会员自助退款是买家保护语义,客户端被驳回后钱更要能拿回来(对应 L1 的定性)。
DROP TRIGGER IF EXISTS `fruit_external_payment_guard`;--> statement-breakpoint
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
	  AND EXISTS (
		SELECT 1 FROM `oauth_provider_clients` c
		WHERE c.`client_id` = p.`client_id`
		  AND c.`status` = 'active'
		  AND c.`review_status` = 'verified'
		  AND c.`write_access_approved` = 1
	  )
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
