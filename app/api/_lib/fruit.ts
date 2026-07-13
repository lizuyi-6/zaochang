import { database } from "./community";

export const FRUIT_POLICY = {
  onboardingGrant: 20,
  likeReward: 1,
  likeActorDailyLimit: 10,
  likeRecipientDailyLimit: 20,
  likeVelocityLimit: 6,
  accountMinimumAgeHours: 24,
  settlementHours: 24,
  oneTimeRefundMinutes: 10,
} as const;

export type PricingModel = "free" | "one_time" | "per_use";

export class FruitError extends Error {
  constructor(public code: string, public status = 409) {
    super(code);
  }
}

type WalletRow = {
  balance: number;
  pendingBalance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  status: string;
};

type ProductRow = {
  id: number;
  title: string;
  ownerEmail: string;
  price: number;
  pricingModel: PricingModel;
};

type OrderRow = {
  id: string;
  buyerEmail: string;
  sellerEmail: string;
  productId: number;
  pricingModel: PricingModel;
  amount: number;
  status: "paid" | "settled" | "refunded";
  idempotencyKey: string;
  purchaseOperationId: string;
  refundableUntil: string | null;
  availableAt: string;
  purchasedAt: string;
};

type OperationRow = {
  kind: string;
  amount: number;
  referenceId: string;
  relatedOperationId: string | null;
};

function validIdempotencyKey(value: string) {
  return /^[a-zA-Z0-9:_-]{8,120}$/.test(value);
}

function isUniqueError(error: unknown) {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

function isBalanceError(error: unknown) {
  return error instanceof Error && (
    error.message.includes("wallet_balance_nonnegative") ||
    error.message.includes("CHECK constraint failed: balance")
  );
}

function isPendingError(error: unknown) {
  return error instanceof Error && (
    error.message.includes("wallet_pending_nonnegative") ||
    error.message.includes("CHECK constraint failed: pending_balance")
  );
}

function errorIncludes(error: unknown, marker: string) {
  return error instanceof Error && error.message.includes(marker);
}

function rewardGuardReason(error: unknown) {
  if (errorIncludes(error, "like_velocity_limit")) return "velocity_limit";
  if (errorIncludes(error, "like_actor_daily_limit")) return "actor_daily_limit";
  if (errorIncludes(error, "like_recipient_daily_limit")) return "recipient_daily_limit";
  if (errorIncludes(error, "like_actor_not_eligible")) return "wallet_restricted";
  return null;
}

async function wallet(email: string) {
  return database().prepare(
    `SELECT balance, pending_balance AS pendingBalance,
            lifetime_earned AS lifetimeEarned, lifetime_spent AS lifetimeSpent,
            status
     FROM wallets WHERE user_email = ?`,
  ).bind(email).first<WalletRow>();
}

async function product(productId: number) {
  return database().prepare(
    `SELECT id, title, owner_email AS ownerEmail, price,
            pricing_model AS pricingModel
     FROM products WHERE id = ? AND status = 'published'`,
  ).bind(productId).first<ProductRow>();
}

async function assertTransferEligible(userEmail: string) {
  const db = database();
  const actor = await db.prepare(
    `SELECT joined_at AS joinedAt FROM members WHERE email = ?`,
  ).bind(userEmail).first<{ joinedAt: string }>();
  const ageHours = actor ? (Date.now() - Date.parse(`${actor.joinedAt}Z`)) / 3_600_000 : -1;
  if (Number.isFinite(ageHours) && ageHours >= FRUIT_POLICY.accountMinimumAgeHours) return;
  await db.prepare(
    `INSERT INTO fruit_risk_events (id, user_email, kind, severity, evidence)
     VALUES (?, ?, 'new_account_transfer_blocked', 'medium', ?)`,
  ).bind(`risk:${crypto.randomUUID()}`, userEmail, JSON.stringify({ minimumAgeHours: FRUIT_POLICY.accountMinimumAgeHours })).run();
  throw new FruitError("account_too_new_for_transfer", 403);
}

async function orderByIdempotency(buyerEmail: string, key: string) {
  return database().prepare(
    `SELECT id, buyer_email AS buyerEmail, seller_email AS sellerEmail,
            product_id AS productId, pricing_model AS pricingModel, amount,
            status, idempotency_key AS idempotencyKey,
            purchase_operation_id AS purchaseOperationId,
            refundable_until AS refundableUntil, available_at AS availableAt,
            purchased_at AS purchasedAt
     FROM product_orders WHERE buyer_email = ? AND idempotency_key = ?`,
  ).bind(buyerEmail, key).first<OrderRow>();
}

async function orderById(buyerEmail: string, orderId: string) {
  return database().prepare(
    `SELECT id, buyer_email AS buyerEmail, seller_email AS sellerEmail,
            product_id AS productId, pricing_model AS pricingModel, amount,
            status, idempotency_key AS idempotencyKey,
            purchase_operation_id AS purchaseOperationId,
            refundable_until AS refundableUntil, available_at AS availableAt,
            purchased_at AS purchasedAt
     FROM product_orders WHERE buyer_email = ? AND id = ?`,
  ).bind(buyerEmail, orderId).first<OrderRow>();
}

async function operationByIdempotency(key: string) {
  return database().prepare(
    `SELECT kind, amount, reference_id AS referenceId,
            related_operation_id AS relatedOperationId
     FROM fruit_operations WHERE idempotency_key = ?`,
  ).bind(key).first<OperationRow>();
}

function publicOrder(row: OrderRow) {
  return {
    id: row.id,
    productId: row.productId,
    pricingModel: row.pricingModel,
    amount: row.amount,
    status: row.status,
    purchasedAt: row.purchasedAt,
    refundableUntil: row.refundableUntil,
  };
}

export async function settleDueFruit(sellerEmail: string) {
  const db = database();
  const sellerWallet = await wallet(sellerEmail);
  if (!sellerWallet || sellerWallet.status !== "active") return;
  const due = await db.prepare(
    `SELECT id, amount, product_id AS productId
     FROM product_orders
     WHERE seller_email = ? AND status = 'paid' AND available_at <= CURRENT_TIMESTAMP
     ORDER BY available_at ASC LIMIT 50`,
  ).bind(sellerEmail).all<{ id: string; amount: number; productId: number }>();

  for (const item of due.results) {
    const operationId = `settlement:${item.id}`;
    try {
      await db.batch([
        db.prepare(
          `INSERT INTO fruit_operations
           (id, kind, idempotency_key, target_email, amount, reference_type, reference_id, description)
           VALUES (?, 'settlement', ?, ?, ?, 'order', ?, '作品收入结算')`,
        ).bind(operationId, operationId, sellerEmail, item.amount, item.id),
        db.prepare(
          `UPDATE wallets SET
             pending_balance = CASE WHEN status = 'active' THEN pending_balance - ? ELSE -1 END,
             balance = CASE WHEN status = 'active' THEN balance + ? ELSE -1 END,
             lifetime_earned = lifetime_earned + ?, updated_at = CURRENT_TIMESTAMP
           WHERE user_email = ?`,
        ).bind(item.amount, item.amount, item.amount, sellerEmail),
        db.prepare(
          `INSERT INTO fruit_entries (operation_id, user_email, bucket, delta)
           VALUES (?, ?, 'pending', ?)`,
        ).bind(operationId, sellerEmail, -item.amount),
        db.prepare(
          `INSERT INTO fruit_entries (operation_id, user_email, bucket, delta)
           VALUES (?, ?, 'available', ?)`,
        ).bind(operationId, sellerEmail, item.amount),
        db.prepare(
          `UPDATE product_orders SET status = 'settled', settled_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'paid'`,
        ).bind(item.id),
      ]);
    } catch (error) {
      if (!isUniqueError(error) && !errorIncludes(error, "settlement_order_not_payable")) throw error;
    }
  }
}

export async function getFruitPaymentState(userEmail: string, productId: number) {
  await settleDueFruit(userEmail);
  const db = database();
  const [item, balance, entitlement] = await Promise.all([
    product(productId),
    wallet(userEmail),
    db.prepare(
      `SELECT order_id AS orderId FROM product_entitlements
       WHERE buyer_email = ? AND product_id = ? AND status = 'active'`,
    ).bind(userEmail, productId).first<{ orderId: string }>(),
  ]);
  if (!item) throw new FruitError("product_not_found", 404);
  const owner = item.ownerEmail === userEmail;
  return {
    product: { id: item.id, title: item.title, price: item.price, pricingModel: item.pricingModel },
    wallet: balance,
    access: {
      allowed: item.pricingModel === "free" || owner || Boolean(entitlement),
      reason: owner ? "owner" : entitlement ? "entitled" : item.pricingModel === "free" ? "free" : "payment_required",
    },
  };
}

export async function checkoutProduct(userEmail: string, productId: number, idempotencyKey: string) {
  if (!Number.isInteger(productId) || !validIdempotencyKey(idempotencyKey)) {
    throw new FruitError("invalid_checkout", 400);
  }
  const replay = await orderByIdempotency(userEmail, idempotencyKey);
  if (replay) {
    if (replay.productId !== productId) throw new FruitError("idempotency_conflict", 409);
    return { access: replay.status !== "refunded", charged: false, replayed: true, order: publicOrder(replay), wallet: await wallet(userEmail) };
  }

  const db = database();
  const item = await product(productId);
  if (!item) throw new FruitError("product_not_found", 404);
  if (item.ownerEmail === userEmail) return { access: true, charged: false, reason: "owner", wallet: await wallet(userEmail) };
  if (item.pricingModel === "free" || item.price === 0) return { access: true, charged: false, reason: "free", wallet: await wallet(userEmail) };
  await assertTransferEligible(userEmail);

  if (item.pricingModel === "one_time") {
    const entitlement = await db.prepare(
      `SELECT order_id AS orderId FROM product_entitlements
       WHERE buyer_email = ? AND product_id = ? AND status = 'active'`,
    ).bind(userEmail, productId).first<{ orderId: string }>();
    if (entitlement) return { access: true, charged: false, reason: "already_owned", wallet: await wallet(userEmail) };
  }

  const [buyerWallet, sellerWallet] = await Promise.all([wallet(userEmail), wallet(item.ownerEmail)]);
  if (!buyerWallet || !sellerWallet) throw new FruitError("wallet_not_found", 404);
  if (buyerWallet.status !== "active" || sellerWallet.status !== "active") throw new FruitError("wallet_restricted", 423);

  const id = crypto.randomUUID();
  const orderId = `order:${id}`;
  const operationId = `purchase:${id}`;
  const refundable = item.pricingModel === "one_time";
  try {
    const statements = [
      db.prepare(
        `INSERT INTO fruit_operations
         (id, kind, idempotency_key, actor_email, target_email, amount, reference_type, reference_id, description)
         VALUES (?, 'purchase', ?, ?, ?, ?, 'product', ?, ?)`,
      ).bind(operationId, `checkout:${userEmail}:${idempotencyKey}`, userEmail, item.ownerEmail, item.price, String(productId), `购买《${item.title}》`),
      db.prepare(
        `INSERT INTO product_orders
         (id, buyer_email, product_id, seller_email, pricing_model, amount, idempotency_key,
          purchase_operation_id, refundable_until, available_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?,
                 CASE WHEN ? THEN datetime('now', '+${FRUIT_POLICY.oneTimeRefundMinutes} minutes') ELSE NULL END,
                 datetime('now', '+${FRUIT_POLICY.settlementHours} hours'))`,
      ).bind(orderId, userEmail, productId, item.ownerEmail, item.pricingModel, item.price, idempotencyKey, operationId, refundable ? 1 : 0),
      db.prepare(
        `UPDATE wallets SET
           balance = CASE WHEN status = 'active' THEN balance - ? ELSE -1 END,
           lifetime_spent = lifetime_spent + ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_email = ?`,
      ).bind(item.price, item.price, userEmail),
      db.prepare(
        `UPDATE wallets SET
           pending_balance = CASE WHEN status = 'active' THEN pending_balance + ? ELSE -1 END,
           updated_at = CURRENT_TIMESTAMP WHERE user_email = ?`,
      ).bind(item.price, item.ownerEmail),
      db.prepare(
        `INSERT INTO fruit_entries (operation_id, user_email, bucket, delta)
         VALUES (?, ?, 'available', ?)`,
      ).bind(operationId, userEmail, -item.price),
      db.prepare(
        `INSERT INTO fruit_entries (operation_id, user_email, bucket, delta)
         VALUES (?, ?, 'pending', ?)`,
      ).bind(operationId, item.ownerEmail, item.price),
      db.prepare(
        `INSERT INTO transactions (user_email, delta, type, description, reference_id)
         VALUES (?, ?, 'purchase', ?, ?)`,
      ).bind(userEmail, -item.price, `购买《${item.title}》`, orderId),
      db.prepare(
        `INSERT INTO transactions (user_email, delta, type, description, reference_id)
         VALUES (?, 0, 'sale_pending', ?, ?)`,
      ).bind(item.ownerEmail, `《${item.title}》收入待结算 +${item.price}`, orderId),
    ];
    if (item.pricingModel === "one_time") {
      statements.push(db.prepare(
        `INSERT INTO product_entitlements (buyer_email, product_id, order_id, status, revoked_at)
         VALUES (?, ?, ?, 'active', NULL)
         ON CONFLICT (buyer_email, product_id) DO UPDATE SET
           order_id = excluded.order_id, status = 'active', granted_at = CURRENT_TIMESTAMP, revoked_at = NULL`,
      ).bind(userEmail, productId, orderId));
    }
    await db.batch(statements);
  } catch (error) {
    if (isBalanceError(error)) throw new FruitError("insufficient_balance", 409);
    if (errorIncludes(error, "paid_transfer_actor_not_eligible")) throw new FruitError("wallet_restricted", 423);
    if (isUniqueError(error)) {
      const duplicate = await orderByIdempotency(userEmail, idempotencyKey);
      if (duplicate) {
        if (duplicate.productId !== productId) throw new FruitError("idempotency_conflict", 409);
        return { access: duplicate.status !== "refunded", charged: false, replayed: true, order: publicOrder(duplicate), wallet: await wallet(userEmail) };
      }
    }
    if (errorIncludes(error, "entitlement_already_active")) {
      const entitlement = await db.prepare(
        `SELECT order_id AS orderId FROM product_entitlements
         WHERE buyer_email = ? AND product_id = ? AND status = 'active'`,
      ).bind(userEmail, productId).first<{ orderId: string }>();
      if (entitlement) return { access: true, charged: false, replayed: false, reason: "already_owned", wallet: await wallet(userEmail) };
    }
    throw error;
  }

  const created = await orderById(userEmail, orderId);
  if (!created) throw new FruitError("order_not_persisted", 500);
  return { access: true, charged: true, replayed: false, order: publicOrder(created), wallet: await wallet(userEmail) };
}

export async function refundProductOrder(userEmail: string, orderId: string, idempotencyKey: string) {
  if (!orderId.startsWith("order:") || !validIdempotencyKey(idempotencyKey)) throw new FruitError("invalid_refund", 400);
  const db = database();
  const replayKey = `refund:${userEmail}:${idempotencyKey}`;
  const previousOperation = await operationByIdempotency(replayKey);
  if (previousOperation) {
    if (previousOperation.kind !== "refund" || previousOperation.referenceId !== orderId) {
      throw new FruitError("idempotency_conflict", 409);
    }
    const previousOrder = await orderById(userEmail, orderId);
    if (!previousOrder) throw new FruitError("order_not_found", 404);
    return { refunded: previousOrder.status === "refunded", replayed: true, order: publicOrder(previousOrder), wallet: await wallet(userEmail) };
  }
  const current = await orderById(userEmail, orderId);
  if (!current) throw new FruitError("order_not_found", 404);
  if (current.status === "refunded") return { refunded: true, replayed: true, order: publicOrder(current), wallet: await wallet(userEmail) };
  if (current.pricingModel !== "one_time") throw new FruitError("per_use_not_refundable", 409);
  if (current.status !== "paid") throw new FruitError("refund_window_closed", 409);
  const refundable = current.refundableUntil && Date.parse(`${current.refundableUntil}Z`) > Date.now();
  if (!refundable) throw new FruitError("refund_window_closed", 409);

  const operationId = `refund:${crypto.randomUUID()}`;
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO fruit_operations
         (id, kind, idempotency_key, actor_email, target_email, amount, reference_type, reference_id, related_operation_id, description)
         VALUES (?, 'refund', ?, ?, ?, ?, 'order', ?, ?, '一次解锁退款')`,
      ).bind(operationId, replayKey, current.sellerEmail, userEmail, current.amount, orderId, current.purchaseOperationId),
      db.prepare(
        `UPDATE wallets SET
           balance = CASE WHEN status = 'active' THEN balance + ? ELSE -1 END,
           lifetime_spent = MAX(0, lifetime_spent - ?), updated_at = CURRENT_TIMESTAMP
         WHERE user_email = ?`,
      ).bind(current.amount, current.amount, userEmail),
      db.prepare(
        `UPDATE wallets SET
           pending_balance = CASE WHEN status = 'active' THEN pending_balance - ? ELSE -1 END,
           updated_at = CURRENT_TIMESTAMP WHERE user_email = ?`,
      ).bind(current.amount, current.sellerEmail),
      db.prepare(
        `INSERT INTO fruit_entries (operation_id, user_email, bucket, delta)
         VALUES (?, ?, 'available', ?)`,
      ).bind(operationId, userEmail, current.amount),
      db.prepare(
        `INSERT INTO fruit_entries (operation_id, user_email, bucket, delta)
         VALUES (?, ?, 'pending', ?)`,
      ).bind(operationId, current.sellerEmail, -current.amount),
      db.prepare(
        `UPDATE product_orders SET status = 'refunded', refund_operation_id = ?, refunded_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'paid'`,
      ).bind(operationId, orderId),
      db.prepare(
        `UPDATE product_entitlements SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
         WHERE buyer_email = ? AND product_id = ? AND order_id = ?`,
      ).bind(userEmail, current.productId, orderId),
      db.prepare(
        `INSERT INTO transactions (user_email, delta, type, description, reference_id)
         VALUES (?, ?, 'refund', '一次解锁退款', ?)`,
      ).bind(userEmail, current.amount, orderId),
    ]);
  } catch (error) {
    if (isPendingError(error)) throw new FruitError("refund_reserve_unavailable", 409);
    if (isUniqueError(error) || errorIncludes(error, "refund_order_not_payable")) {
      const duplicateOperation = await operationByIdempotency(replayKey);
      if (duplicateOperation && duplicateOperation.referenceId !== orderId) {
        throw new FruitError("idempotency_conflict", 409);
      }
      const replay = await orderById(userEmail, orderId);
      if (replay?.status === "refunded") return { refunded: true, replayed: true, order: publicOrder(replay), wallet: await wallet(userEmail) };
    }
    throw error;
  }
  const refunded = await orderById(userEmail, orderId);
  if (!refunded) throw new FruitError("order_not_found", 404);
  return { refunded: true, replayed: false, order: publicOrder(refunded), wallet: await wallet(userEmail) };
}

export async function tipProduct(userEmail: string, productId: number, amount: number, idempotencyKey: string) {
  if (!Number.isInteger(productId) || ![5, 10, 25].includes(amount) || !validIdempotencyKey(idempotencyKey)) {
    throw new FruitError("invalid_tip", 400);
  }
  const db = database();
  const replayKey = `tip:${userEmail}:${idempotencyKey}`;
  const replay = await db.prepare(
    `SELECT amount, reference_id AS referenceId
     FROM fruit_operations WHERE idempotency_key = ? AND actor_email = ? AND kind = 'tip'`,
  ).bind(replayKey, userEmail).first<{ amount: number; referenceId: string }>();
  if (replay) {
    if (replay.amount !== amount || replay.referenceId !== String(productId)) throw new FruitError("idempotency_conflict", 409);
    return { tipped: replay.amount, replayed: true, wallet: await wallet(userEmail) };
  }
  const item = await product(productId);
  if (!item || item.ownerEmail === userEmail) throw new FruitError("tip_not_allowed", 409);
  await assertTransferEligible(userEmail);
  const [sender, recipient] = await Promise.all([wallet(userEmail), wallet(item.ownerEmail)]);
  if (sender?.status !== "active" || recipient?.status !== "active") throw new FruitError("wallet_restricted", 423);
  const operationId = `tip:${crypto.randomUUID()}`;
  const reference = `tip:${productId}:${operationId}`;
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO fruit_operations
         (id, kind, idempotency_key, actor_email, target_email, amount, reference_type, reference_id, description)
         VALUES (?, 'tip', ?, ?, ?, ?, 'product', ?, ?)`,
      ).bind(operationId, replayKey, userEmail, item.ownerEmail, amount, String(productId), `支持《${item.title}》`),
      db.prepare(
        `UPDATE wallets SET
           balance = CASE WHEN status = 'active' THEN balance - ? ELSE -1 END,
           lifetime_spent = lifetime_spent + ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_email = ?`,
      ).bind(amount, amount, userEmail),
      db.prepare(
        `UPDATE wallets SET
           balance = CASE WHEN status = 'active' THEN balance + ? ELSE -1 END,
           lifetime_earned = lifetime_earned + ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_email = ?`,
      ).bind(amount, amount, item.ownerEmail),
      db.prepare(`INSERT INTO fruit_entries (operation_id, user_email, bucket, delta) VALUES (?, ?, 'available', ?)`).bind(operationId, userEmail, -amount),
      db.prepare(`INSERT INTO fruit_entries (operation_id, user_email, bucket, delta) VALUES (?, ?, 'available', ?)`).bind(operationId, item.ownerEmail, amount),
      db.prepare(`INSERT INTO transactions (user_email, delta, type, description, reference_id) VALUES (?, ?, 'tip_sent', ?, ?)`).bind(userEmail, -amount, `支持《${item.title}》`, reference),
      db.prepare(`INSERT INTO transactions (user_email, delta, type, description, reference_id) VALUES (?, ?, 'tip_received', ?, ?)`).bind(item.ownerEmail, amount, `作品《${item.title}》收到支持`, reference),
    ]);
  } catch (error) {
    if (isBalanceError(error)) throw new FruitError("insufficient_balance", 409);
    if (errorIncludes(error, "paid_transfer_actor_not_eligible")) throw new FruitError("wallet_restricted", 423);
    if (isUniqueError(error)) {
      const duplicate = await operationByIdempotency(replayKey);
      if (duplicate?.kind === "tip" && duplicate.amount === amount && duplicate.referenceId === String(productId)) {
        return { tipped: duplicate.amount, replayed: true, wallet: await wallet(userEmail) };
      }
      throw new FruitError("idempotency_conflict", 409);
    }
    throw error;
  }
  return { tipped: amount, replayed: false, wallet: await wallet(userEmail) };
}

async function suppressLikeReward(recipientEmail: string, actorEmail: string, targetRef: string, reason: string, risky: boolean) {
  const db = database();
  const eventId = `reward:${crypto.randomUUID()}`;
  const statements = [
    db.prepare(
      `INSERT OR IGNORE INTO fruit_reward_events
       (id, recipient_email, actor_email, kind, target_type, target_ref, amount, status, reason)
       VALUES (?, ?, ?, 'product_like', 'product', ?, 0, 'suppressed', ?)`,
    ).bind(eventId, recipientEmail, actorEmail, targetRef, reason),
  ];
  if (risky) {
    statements.push(db.prepare(
      `INSERT INTO fruit_risk_events (id, user_email, kind, severity, evidence)
       VALUES (?, ?, 'like_reward_suppressed', 'medium', ?)`,
    ).bind(`risk:${crypto.randomUUID()}`, actorEmail, JSON.stringify({ targetRef, reason })));
  }
  await db.batch(statements);
  return { granted: false, amount: 0, reason };
}

export async function awardProductLike(recipientEmail: string, actorEmail: string, productId: number) {
  const db = database();
  const targetRef = String(productId);
  const existing = await db.prepare(
    `SELECT status, amount, reason FROM fruit_reward_events
     WHERE actor_email = ? AND kind = 'product_like' AND target_type = 'product' AND target_ref = ?`,
  ).bind(actorEmail, targetRef).first<{ status: string; amount: number; reason: string }>();
  if (existing) return { granted: existing.status === "granted", amount: existing.amount, reason: "already_processed" };
  if (recipientEmail === actorEmail) return suppressLikeReward(recipientEmail, actorEmail, targetRef, "self_like", false);

  const [actor, recipient, counters] = await Promise.all([
    db.prepare(
      `SELECT m.joined_at AS joinedAt, w.status
       FROM members m JOIN wallets w ON w.user_email = m.email WHERE m.email = ?`,
    ).bind(actorEmail).first<{ joinedAt: string; status: string }>(),
    wallet(recipientEmail),
    db.prepare(
      `SELECT
         SUM(CASE WHEN actor_email = ? AND status = 'granted' AND created_at >= date('now') THEN 1 ELSE 0 END) AS actorToday,
         SUM(CASE WHEN recipient_email = ? AND status = 'granted' AND created_at >= date('now') THEN amount ELSE 0 END) AS recipientToday,
         SUM(CASE WHEN actor_email = ? AND created_at >= datetime('now', '-60 seconds') THEN 1 ELSE 0 END) AS recent
       FROM fruit_reward_events`,
    ).bind(actorEmail, recipientEmail, actorEmail).first<{ actorToday: number; recipientToday: number; recent: number }>(),
  ]);
  if (!actor || !recipient || actor.status !== "active" || recipient.status !== "active") {
    return suppressLikeReward(recipientEmail, actorEmail, targetRef, "wallet_restricted", false);
  }
  const ageHours = (Date.now() - Date.parse(`${actor.joinedAt}Z`)) / 3_600_000;
  if (!Number.isFinite(ageHours) || ageHours < FRUIT_POLICY.accountMinimumAgeHours) {
    return suppressLikeReward(recipientEmail, actorEmail, targetRef, "account_too_new", false);
  }
  if (Number(counters?.recent ?? 0) >= FRUIT_POLICY.likeVelocityLimit) {
    return suppressLikeReward(recipientEmail, actorEmail, targetRef, "velocity_limit", true);
  }
  if (Number(counters?.actorToday ?? 0) >= FRUIT_POLICY.likeActorDailyLimit) {
    return suppressLikeReward(recipientEmail, actorEmail, targetRef, "actor_daily_limit", true);
  }
  if (Number(counters?.recipientToday ?? 0) >= FRUIT_POLICY.likeRecipientDailyLimit) {
    return suppressLikeReward(recipientEmail, actorEmail, targetRef, "recipient_daily_limit", true);
  }

  const operationId = `reward:${crypto.randomUUID()}`;
  const rewardId = `reward-event:${crypto.randomUUID()}`;
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO fruit_operations
         (id, kind, idempotency_key, target_email, amount, reference_type, reference_id, description)
         VALUES (?, 'like_reward', ?, ?, ?, 'product_like', ?, '作品收到有效喜欢')`,
      ).bind(operationId, `like-reward:${actorEmail}:${targetRef}`, recipientEmail, FRUIT_POLICY.likeReward, targetRef),
      db.prepare(
        `UPDATE wallets SET
           balance = CASE WHEN status = 'active' THEN balance + ? ELSE -1 END,
           lifetime_earned = lifetime_earned + ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_email = ?`,
      ).bind(FRUIT_POLICY.likeReward, FRUIT_POLICY.likeReward, recipientEmail),
      db.prepare(`INSERT INTO fruit_entries (operation_id, user_email, bucket, delta) VALUES (?, ?, 'available', ?)`).bind(operationId, recipientEmail, FRUIT_POLICY.likeReward),
      db.prepare(
        `INSERT INTO fruit_reward_events
         (id, recipient_email, actor_email, kind, target_type, target_ref, amount, status, reason, operation_id)
         VALUES (?, ?, ?, 'product_like', 'product', ?, ?, 'granted', 'qualified_unique_like', ?)`,
      ).bind(rewardId, recipientEmail, actorEmail, targetRef, FRUIT_POLICY.likeReward, operationId),
      db.prepare(`INSERT INTO transactions (user_email, delta, type, description, reference_id) VALUES (?, ?, 'like_reward', '作品收到有效喜欢', ?)`).bind(recipientEmail, FRUIT_POLICY.likeReward, `like:${actorEmail}:${targetRef}`),
    ]);
  } catch (error) {
    const guardReason = rewardGuardReason(error);
    if (guardReason) {
      return suppressLikeReward(recipientEmail, actorEmail, targetRef, guardReason, guardReason.endsWith("limit"));
    }
    if (isUniqueError(error)) return { granted: false, amount: 0, reason: "already_processed" };
    throw error;
  }
  return { granted: true, amount: FRUIT_POLICY.likeReward, reason: "qualified_unique_like" };
}
