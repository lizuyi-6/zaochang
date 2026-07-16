import { database } from "./community";
import { FRUIT_POLICY } from "./fruit";
import { hashToken, randomToken } from "../../oauth-session";
import { isClientRedirectUri, type requireBearer } from "./oauth-provider";

type ExternalIdentity = Awaited<ReturnType<typeof requireBearer>>;

type PaymentRow = {
  id: string;
  clientId: string;
  clientName: string;
  clientStatus: "active" | "revoked";
  clientReviewStatus: "unverified" | "verified" | "rejected";
  clientWriteAccessApproved: number;
  payerEmail: string;
  merchantEmail: string;
  externalReference: string;
  title: string;
  description: string;
  pricingModel: "one_time" | "per_use";
  amount: number;
  status: "pending" | "paid" | "settled" | "refunded" | "cancelled" | "expired";
  idempotencyKey: string;
  returnUri: string;
  purchaseOperationId: string | null;
  refundableUntil: string | null;
  availableAt: string | null;
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
};

type WalletRow = {
  balance: number;
  pendingBalance: number;
  ledgerBalance: number;
  ledgerPendingBalance: number;
  status: string;
};

export class ExternalFruitError extends Error {
  constructor(public code: string, public status = 409) {
    super(code);
  }
}

function validIdempotencyKey(value: string) {
  return /^[A-Za-z0-9:_-]{8,120}$/.test(value);
}

function sqliteTimestamp(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function errorIncludes(error: unknown, marker: string) {
  return error instanceof Error && error.message.includes(marker);
}

function isUniqueError(error: unknown) {
  return errorIncludes(error, "UNIQUE constraint failed");
}

function isBalanceError(error: unknown) {
  return errorIncludes(error, "wallet_balance_nonnegative") || errorIncludes(error, "CHECK constraint failed: balance");
}

function isPendingError(error: unknown) {
  return errorIncludes(error, "wallet_pending_nonnegative") || errorIncludes(error, "CHECK constraint failed: pending_balance");
}

async function wallet(email: string) {
  return database().prepare(
    `SELECT balance, pending_balance AS pendingBalance, status,
            COALESCE((SELECT SUM(delta) FROM fruit_entries WHERE user_email = ? AND bucket = 'available'), 0) AS ledgerBalance,
            COALESCE((SELECT SUM(delta) FROM fruit_entries WHERE user_email = ? AND bucket = 'pending'), 0) AS ledgerPendingBalance
     FROM wallets WHERE user_email = ?`,
  ).bind(email, email, email).first<WalletRow>();
}

async function assertWalletIntegrity(email: string, row: WalletRow | null | undefined) {
  if (!row) throw new ExternalFruitError("wallet_not_found", 404);
  if (row.balance === row.ledgerBalance && row.pendingBalance === row.ledgerPendingBalance) return;
  await database().batch([
    database().prepare(`UPDATE wallets SET status = 'review', updated_at = CURRENT_TIMESTAMP WHERE user_email = ?`).bind(email),
    database().prepare(
      `INSERT INTO fruit_risk_events (id, user_email, kind, severity, evidence)
       VALUES (?, ?, 'wallet_ledger_mismatch', 'high', ?)`,
    ).bind(`risk:${randomToken(20)}`, email, JSON.stringify({ balance: row.balance, ledgerBalance: row.ledgerBalance, pendingBalance: row.pendingBalance, ledgerPendingBalance: row.ledgerPendingBalance })),
  ]);
  throw new ExternalFruitError("wallet_ledger_mismatch", 423);
}

async function reconcileWalletFromLedger(email: string) {
  await database().prepare(
    `UPDATE wallets SET
       balance = COALESCE((SELECT SUM(delta) FROM fruit_entries WHERE user_email = ? AND bucket = 'available'), 0),
       pending_balance = COALESCE((SELECT SUM(delta) FROM fruit_entries WHERE user_email = ? AND bucket = 'pending'), 0),
       updated_at = CURRENT_TIMESTAMP WHERE user_email = ?`,
  ).bind(email, email, email).run();
}

async function paymentById(id: string) {
  return database().prepare(
    `SELECT p.id, p.client_id AS clientId, c.name AS clientName,
            c.status AS clientStatus, c.review_status AS clientReviewStatus,
            c.write_access_approved AS clientWriteAccessApproved,
            p.payer_email AS payerEmail, p.merchant_email AS merchantEmail,
            p.external_reference AS externalReference, p.title, p.description,
            p.pricing_model AS pricingModel, p.amount, p.status,
            p.idempotency_key AS idempotencyKey, p.return_uri AS returnUri,
            p.purchase_operation_id AS purchaseOperationId,
            p.refundable_until AS refundableUntil, p.available_at AS availableAt,
            p.expires_at AS expiresAt, p.paid_at AS paidAt, p.created_at AS createdAt
     FROM external_fruit_payments p JOIN oauth_provider_clients c ON c.client_id = p.client_id
     WHERE p.id = ?`,
  ).bind(id).first<PaymentRow>();
}

function paymentClientCanCharge(row: PaymentRow) {
  return row.clientStatus === "active" && row.clientReviewStatus === "verified" && row.clientWriteAccessApproved === 1;
}

function publicPayment(row: PaymentRow, origin?: string) {
  return {
    id: row.id,
    clientId: row.clientId,
    externalReference: row.externalReference,
    title: row.title,
    pricingModel: row.pricingModel,
    amount: row.amount,
    status: row.status,
    createdAt: row.createdAt,
    paidAt: row.paidAt,
    refundableUntil: row.refundableUntil,
    ...(row.status === "pending" && origin ? { approvalUrl: `${origin}/oauth/payment/${encodeURIComponent(row.id)}` } : {}),
  };
}

export async function createExternalPayment(identity: ExternalIdentity, input: Record<string, unknown>, idempotencyKey: string, origin: string) {
  if (!validIdempotencyKey(idempotencyKey)) throw new ExternalFruitError("invalid_idempotency_key", 400);
  const amount = Number(input.amount);
  const pricingModel = input.pricingModel === "per_use" ? "per_use" : input.pricingModel === "one_time" ? "one_time" : null;
  const externalReference = String(input.externalReference ?? "").trim();
  const title = String(input.title ?? "").trim();
  const description = String(input.description ?? "").trim().slice(0, 240);
  const returnUri = String(input.returnUri ?? "").trim();
  if (!Number.isInteger(amount) || amount < 1 || amount > 99 || !pricingModel || externalReference.length < 1 || externalReference.length > 120 || title.length < 2 || title.length > 80) {
    throw new ExternalFruitError("invalid_payment", 400);
  }
  if (!await isClientRedirectUri(identity.clientId, returnUri)) throw new ExternalFruitError("invalid_return_uri", 400);
  if (identity.userEmail === identity.clientOwnerEmail) throw new ExternalFruitError("self_payment_not_allowed", 409);

  const db = database();
  const replay = await db.prepare(
    `SELECT id FROM external_fruit_payments
     WHERE client_id = ? AND payer_email = ? AND idempotency_key = ?`,
  ).bind(identity.clientId, identity.userEmail, idempotencyKey).first<{ id: string }>();
  if (replay) {
    const existing = await paymentById(replay.id);
    if (!existing) throw new ExternalFruitError("payment_not_found", 404);
    if (existing.amount !== amount || existing.externalReference !== externalReference || existing.pricingModel !== pricingModel || existing.returnUri !== returnUri || existing.title !== title) {
      throw new ExternalFruitError("idempotency_conflict", 409);
    }
    return { payment: publicPayment(existing, origin), replayed: true };
  }

  const payerMember = await db.prepare(`SELECT joined_at AS joinedAt FROM members WHERE email = ?`).bind(identity.userEmail).first<{ joinedAt: string }>();
  const payerAgeHours = payerMember ? (Date.now() - Date.parse(`${payerMember.joinedAt}Z`)) / 3_600_000 : -1;
  if (!Number.isFinite(payerAgeHours) || payerAgeHours < FRUIT_POLICY.accountMinimumAgeHours) {
    await db.prepare(
      `INSERT INTO fruit_risk_events (id, user_email, kind, severity, evidence)
       VALUES (?, ?, 'new_account_external_transfer_blocked', 'medium', ?)`,
    ).bind(`risk:${randomToken(20)}`, identity.userEmail, JSON.stringify({ clientId: identity.clientId, minimumAgeHours: FRUIT_POLICY.accountMinimumAgeHours })).run();
    throw new ExternalFruitError("account_too_new_for_transfer", 403);
  }

  if (pricingModel === "one_time") {
    const entitlement = await db.prepare(
      `SELECT payment_id AS paymentId FROM external_fruit_entitlements
       WHERE client_id = ? AND payer_email = ? AND external_reference = ? AND status = 'active'`,
    ).bind(identity.clientId, identity.userEmail, externalReference).first<{ paymentId: string }>();
    if (entitlement) return { owned: true, paymentId: entitlement.paymentId, replayed: false };
  }
  const [payerWallet, merchantWallet] = await Promise.all([wallet(identity.userEmail), wallet(identity.clientOwnerEmail)]);
  await assertWalletIntegrity(identity.userEmail, payerWallet);
  await assertWalletIntegrity(identity.clientOwnerEmail, merchantWallet);
  if (!payerWallet || !merchantWallet) throw new ExternalFruitError("wallet_not_found", 404);
  if (payerWallet.status !== "active" || merchantWallet.status !== "active") throw new ExternalFruitError("wallet_restricted", 423);
  if (payerWallet.balance < amount) throw new ExternalFruitError("insufficient_balance", 409);

  const id = `extpay_${randomToken(24)}`;
  try {
    await db.prepare(
      `INSERT INTO external_fruit_payments
       (id, client_id, payer_email, merchant_email, external_reference, title, description,
        pricing_model, amount, idempotency_key, return_uri, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, identity.clientId, identity.userEmail, identity.clientOwnerEmail, externalReference, title, description, pricingModel, amount, idempotencyKey, returnUri, sqliteTimestamp(new Date(Date.now() + 15 * 60 * 1000))).run();
  } catch (error) {
    if (!isUniqueError(error)) throw error;
    const duplicate = await db.prepare(
      `SELECT id FROM external_fruit_payments
       WHERE client_id = ? AND payer_email = ? AND idempotency_key = ?`,
    ).bind(identity.clientId, identity.userEmail, idempotencyKey).first<{ id: string }>();
    if (duplicate) {
      const existing = await paymentById(duplicate.id);
      if (existing && existing.amount === amount && existing.externalReference === externalReference && existing.pricingModel === pricingModel && existing.returnUri === returnUri && existing.title === title) {
        return { payment: publicPayment(existing, origin), replayed: true };
      }
    }
    throw new ExternalFruitError("idempotency_conflict", 409);
  }
  const created = await paymentById(id);
  if (!created) throw new ExternalFruitError("payment_not_persisted", 500);
  return { payment: publicPayment(created, origin), replayed: false };
}

export async function prepareExternalPaymentApproval(paymentId: string, userEmail: string) {
  const db = database();
  let row = await paymentById(paymentId);
  if (!row || row.payerEmail !== userEmail) throw new ExternalFruitError("payment_not_found", 404);
  if (row.status === "pending" && !paymentClientCanCharge(row)) {
    await db.prepare(`UPDATE external_fruit_payments SET status = 'cancelled', approval_challenge_hash = NULL WHERE id = ? AND status = 'pending'`).bind(paymentId).run();
    throw new ExternalFruitError("client_not_authorized", 403);
  }
  if (row.status === "pending" && Date.parse(`${row.expiresAt}Z`) <= Date.now()) {
    await db.prepare(`UPDATE external_fruit_payments SET status = 'expired' WHERE id = ? AND status = 'pending'`).bind(paymentId).run();
    row = { ...row, status: "expired" };
  }
  const payerWallet = await wallet(userEmail);
  if (!payerWallet) throw new ExternalFruitError("wallet_not_found", 404);
  if (row.status !== "pending") return { payment: row, wallet: payerWallet, challenge: null };
  const challenge = randomToken(32);
  await db.prepare(
    `UPDATE external_fruit_payments SET approval_challenge_hash = ?
     WHERE id = ? AND payer_email = ? AND status = 'pending'`,
  ).bind(await hashToken(challenge), paymentId, userEmail).run();
  return { payment: row, wallet: payerWallet, challenge };
}

export async function decideExternalPayment(userEmail: string, paymentId: string, challenge: string, decision: string) {
  const db = database();
  const row = await paymentById(paymentId);
  if (!row || row.payerEmail !== userEmail) throw new ExternalFruitError("payment_not_found", 404);
  if (row.status === "pending" && !paymentClientCanCharge(row)) {
    await db.prepare(`UPDATE external_fruit_payments SET status = 'cancelled', approval_challenge_hash = NULL WHERE id = ? AND status = 'pending'`).bind(paymentId).run();
    throw new ExternalFruitError("client_not_authorized", 403);
  }
  if (row.status !== "pending") return { payment: publicPayment(row), replayed: true, returnUri: row.returnUri };
  if (Date.parse(`${row.expiresAt}Z`) <= Date.now()) {
    await db.prepare(`UPDATE external_fruit_payments SET status = 'expired' WHERE id = ? AND status = 'pending'`).bind(paymentId).run();
    throw new ExternalFruitError("payment_expired", 409);
  }
  const challengeHash = await hashToken(challenge);
  const validChallenge = await db.prepare(
    `SELECT 1 AS valid FROM external_fruit_payments
     WHERE id = ? AND payer_email = ? AND status = 'pending' AND approval_challenge_hash = ?`,
  ).bind(paymentId, userEmail, challengeHash).first<{ valid: number }>();
  if (!validChallenge) throw new ExternalFruitError("invalid_approval_challenge", 403);
  if (decision !== "allow") {
    await db.prepare(
      `UPDATE external_fruit_payments SET status = 'cancelled', approval_challenge_hash = NULL
       WHERE id = ? AND payer_email = ? AND status = 'pending' AND approval_challenge_hash = ?`,
    ).bind(paymentId, userEmail, challengeHash).run();
    const cancelled = await paymentById(paymentId);
    if (!cancelled) throw new ExternalFruitError("payment_not_found", 404);
    return { payment: publicPayment(cancelled), replayed: false, returnUri: cancelled.returnUri };
  }

  const [payerWallet, merchantWallet] = await Promise.all([wallet(row.payerEmail), wallet(row.merchantEmail)]);
  await assertWalletIntegrity(row.payerEmail, payerWallet);
  await assertWalletIntegrity(row.merchantEmail, merchantWallet);

  const operationId = `external-purchase:${paymentId}`;
  const refundable = row.pricingModel === "one_time";
  const statements = [
    db.prepare(
      `INSERT INTO fruit_operations
       (id, kind, idempotency_key, actor_email, target_email, amount, reference_type, reference_id, description)
       VALUES (?, 'external_purchase', ?, ?, ?, ?, 'external_payment', ?, ?)`,
    ).bind(operationId, operationId, row.payerEmail, row.merchantEmail, row.amount, paymentId, `外部应用支付《${row.title}》`),
    db.prepare(
      `UPDATE wallets SET balance = CASE WHEN status = 'active' THEN balance - ? ELSE -1 END,
         lifetime_spent = lifetime_spent + ?, updated_at = CURRENT_TIMESTAMP WHERE user_email = ?`,
    ).bind(row.amount, row.amount, row.payerEmail),
    db.prepare(
      `UPDATE wallets SET pending_balance = CASE WHEN status = 'active' THEN pending_balance + ? ELSE -1 END,
         updated_at = CURRENT_TIMESTAMP WHERE user_email = ?`,
    ).bind(row.amount, row.merchantEmail),
    db.prepare(`INSERT INTO fruit_entries (operation_id, user_email, bucket, delta) VALUES (?, ?, 'available', ?)`).bind(operationId, row.payerEmail, -row.amount),
    db.prepare(`INSERT INTO fruit_entries (operation_id, user_email, bucket, delta) VALUES (?, ?, 'pending', ?)`).bind(operationId, row.merchantEmail, row.amount),
    db.prepare(
      `UPDATE external_fruit_payments SET status = 'paid', purchase_operation_id = ?,
         paid_at = CURRENT_TIMESTAMP, refundable_until = CASE WHEN ? THEN datetime('now', '+${FRUIT_POLICY.oneTimeRefundMinutes} minutes') ELSE NULL END,
         available_at = datetime('now', '+${FRUIT_POLICY.settlementHours} hours'), approval_challenge_hash = NULL
       WHERE id = ? AND status = 'pending' AND approval_challenge_hash = ?`,
    ).bind(operationId, refundable ? 1 : 0, paymentId, challengeHash),
    db.prepare(`INSERT INTO transactions (user_email, delta, type, description, reference_id) VALUES (?, ?, 'external_purchase', ?, ?)`).bind(row.payerEmail, -row.amount, `通过 ${row.clientName} 支付《${row.title}》`, paymentId),
    db.prepare(`INSERT INTO transactions (user_email, delta, type, description, reference_id) VALUES (?, 0, 'external_sale_pending', ?, ?)`).bind(row.merchantEmail, `${row.clientName} 收入待结算 +${row.amount}`, paymentId),
  ];
  if (row.pricingModel === "one_time") {
    statements.push(db.prepare(
      `INSERT INTO external_fruit_entitlements
       (client_id, payer_email, external_reference, payment_id, status, revoked_at)
       VALUES (?, ?, ?, ?, 'active', NULL)
       ON CONFLICT(client_id, payer_email, external_reference) DO UPDATE SET
         payment_id = excluded.payment_id, status = 'active', granted_at = CURRENT_TIMESTAMP, revoked_at = NULL`,
    ).bind(row.clientId, row.payerEmail, row.externalReference, paymentId));
  }
  try {
    await db.batch(statements);
  } catch (error) {
    if (isBalanceError(error)) throw new ExternalFruitError("insufficient_balance", 409);
    if (errorIncludes(error, "external_entitlement_already_active")) {
      const current = await paymentById(paymentId);
      if (current?.status === "paid") return { payment: publicPayment(current), replayed: true, returnUri: current.returnUri };
      throw new ExternalFruitError("already_owned", 409);
    }
    if (errorIncludes(error, "external_payment_not_payable")) {
      const current = await paymentById(paymentId);
      if (current?.status === "paid") return { payment: publicPayment(current), replayed: true, returnUri: current.returnUri };
      throw new ExternalFruitError("wallet_restricted", 423);
    }
    if (isUniqueError(error)) {
      const current = await paymentById(paymentId);
      if (current?.status === "paid") return { payment: publicPayment(current), replayed: true, returnUri: current.returnUri };
    }
    throw error;
  }
  const paid = await paymentById(paymentId);
  if (!paid) throw new ExternalFruitError("payment_not_found", 404);
  return { payment: publicPayment(paid), replayed: false, returnUri: paid.returnUri };
}

export async function getExternalPayment(identity: ExternalIdentity, paymentId: string) {
  const row = await paymentById(paymentId);
  if (!row || row.clientId !== identity.clientId || row.payerEmail !== identity.userEmail) throw new ExternalFruitError("payment_not_found", 404);
  return publicPayment(row);
}

export async function refundExternalPayment(identity: Pick<ExternalIdentity, "clientId" | "userEmail">, paymentId: string, idempotencyKey: string) {
  if (!validIdempotencyKey(idempotencyKey)) throw new ExternalFruitError("invalid_idempotency_key", 400);
  const db = database();
  const row = await paymentById(paymentId);
  if (!row || row.clientId !== identity.clientId || row.payerEmail !== identity.userEmail) throw new ExternalFruitError("payment_not_found", 404);
  if (row.status === "refunded") return { payment: publicPayment(row), replayed: true };
  if (row.pricingModel !== "one_time") throw new ExternalFruitError("per_use_not_refundable", 409);
  if (row.status !== "paid" || !row.purchaseOperationId || !row.refundableUntil || Date.parse(`${row.refundableUntil}Z`) <= Date.now()) {
    throw new ExternalFruitError("refund_window_closed", 409);
  }
  await Promise.all([reconcileWalletFromLedger(row.payerEmail), reconcileWalletFromLedger(row.merchantEmail)]);
  const replayKey = `external-refund:${identity.clientId}:${identity.userEmail}:${idempotencyKey}`;
  const prior = await db.prepare(
    `SELECT reference_id AS referenceId FROM fruit_operations WHERE idempotency_key = ?`,
  ).bind(replayKey).first<{ referenceId: string }>();
  if (prior && prior.referenceId !== paymentId) throw new ExternalFruitError("idempotency_conflict", 409);

  const operationId = `external-refund:${randomToken(20)}`;
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO fruit_operations
         (id, kind, idempotency_key, actor_email, target_email, amount, reference_type, reference_id, related_operation_id, description)
         VALUES (?, 'external_refund', ?, ?, ?, ?, 'external_payment', ?, ?, '外部应用一次解锁退款')`,
      ).bind(operationId, replayKey, row.merchantEmail, row.payerEmail, row.amount, paymentId, row.purchaseOperationId),
      db.prepare(
        `UPDATE wallets SET balance = balance + ?,
           lifetime_spent = MAX(0, lifetime_spent - ?), updated_at = CURRENT_TIMESTAMP WHERE user_email = ?`,
      ).bind(row.amount, row.amount, row.payerEmail),
      db.prepare(
        `UPDATE wallets SET pending_balance = pending_balance - ?,
           updated_at = CURRENT_TIMESTAMP WHERE user_email = ?`,
      ).bind(row.amount, row.merchantEmail),
      db.prepare(`INSERT INTO fruit_entries (operation_id, user_email, bucket, delta) VALUES (?, ?, 'available', ?)`).bind(operationId, row.payerEmail, row.amount),
      db.prepare(`INSERT INTO fruit_entries (operation_id, user_email, bucket, delta) VALUES (?, ?, 'pending', ?)`).bind(operationId, row.merchantEmail, -row.amount),
      db.prepare(
        `UPDATE external_fruit_payments SET status = 'refunded', refund_operation_id = ?, refunded_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'paid'`,
      ).bind(operationId, paymentId),
      db.prepare(
        `UPDATE external_fruit_entitlements SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
         WHERE client_id = ? AND payer_email = ? AND external_reference = ? AND payment_id = ?`,
      ).bind(row.clientId, row.payerEmail, row.externalReference, paymentId),
      db.prepare(`INSERT INTO transactions (user_email, delta, type, description, reference_id) VALUES (?, ?, 'external_refund', '外部应用一次解锁退款', ?)`).bind(row.payerEmail, row.amount, paymentId),
    ]);
  } catch (error) {
    if (isPendingError(error)) throw new ExternalFruitError("refund_reserve_unavailable", 409);
    if (isUniqueError(error) || errorIncludes(error, "external_refund_not_payable")) {
      const current = await paymentById(paymentId);
      if (current?.status === "refunded") return { payment: publicPayment(current), replayed: true };
    }
    throw error;
  }
  const refunded = await paymentById(paymentId);
  if (!refunded) throw new ExternalFruitError("payment_not_found", 404);
  return { payment: publicPayment(refunded), replayed: false };
}

export async function refundExternalPaymentForMember(userEmail: string, paymentId: string, idempotencyKey: string) {
  const row = await paymentById(paymentId);
  if (!row || row.payerEmail !== userEmail) throw new ExternalFruitError("payment_not_found", 404);
  return refundExternalPayment({ clientId: row.clientId, userEmail }, paymentId, idempotencyKey);
}

export async function settleDueExternalFruit(merchantEmail: string) {
  const db = database();
  const merchantWallet = await wallet(merchantEmail);
  if (!merchantWallet || merchantWallet.status !== "active") return;
  try {
    await assertWalletIntegrity(merchantEmail, merchantWallet);
  } catch {
    return;
  }
  const due = await db.prepare(
    `SELECT id, amount FROM external_fruit_payments
     WHERE merchant_email = ? AND status = 'paid' AND available_at <= CURRENT_TIMESTAMP
     ORDER BY available_at ASC LIMIT 50`,
  ).bind(merchantEmail).all<{ id: string; amount: number }>();
  for (const item of due.results) {
    const operationId = `external-settlement:${item.id}`;
    try {
      await db.batch([
        db.prepare(
          `INSERT INTO fruit_operations
           (id, kind, idempotency_key, target_email, amount, reference_type, reference_id, description)
           VALUES (?, 'external_settlement', ?, ?, ?, 'external_payment', ?, '外部应用收入结算')`,
        ).bind(operationId, operationId, merchantEmail, item.amount, item.id),
        db.prepare(
          `UPDATE wallets SET pending_balance = CASE WHEN status = 'active' THEN pending_balance - ? ELSE -1 END,
             balance = CASE WHEN status = 'active' THEN balance + ? ELSE -1 END,
             lifetime_earned = lifetime_earned + ?, updated_at = CURRENT_TIMESTAMP WHERE user_email = ?`,
        ).bind(item.amount, item.amount, item.amount, merchantEmail),
        db.prepare(`INSERT INTO fruit_entries (operation_id, user_email, bucket, delta) VALUES (?, ?, 'pending', ?)`).bind(operationId, merchantEmail, -item.amount),
        db.prepare(`INSERT INTO fruit_entries (operation_id, user_email, bucket, delta) VALUES (?, ?, 'available', ?)`).bind(operationId, merchantEmail, item.amount),
        db.prepare(`UPDATE external_fruit_payments SET status = 'settled', settled_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'paid'`).bind(item.id),
      ]);
    } catch (error) {
      if (!isUniqueError(error) && !errorIncludes(error, "external_settlement_not_payable")) throw error;
    }
  }
}

export function externalPaymentReturnUrl(returnUri: string, payment: { id: string; status: string; externalReference: string }) {
  const target = new URL(returnUri);
  target.searchParams.set("payment_id", payment.id);
  target.searchParams.set("payment_status", payment.status);
  target.searchParams.set("external_reference", payment.externalReference);
  return target.toString();
}
