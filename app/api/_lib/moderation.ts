// 管理动作域模块:admin/moderation 路由的 PATCH 状态机。
// 此前 130 行果子账本补偿逻辑(fruit_operations/钱包调整/fruit_entries/transactions/
// 订单退款/权益撤销/风险事件)内嵌在路由文件里;收敛到此,路由只留 GET 聚合与守卫。
// 所有 SQL 与错误码/状态码与搬迁前逐字一致——行为零变化。
import type { MemberIdentity } from "./access-control";
import { adminAuditStatement } from "./admin";
import { database } from "./community";
import { adminRemoveHosting } from "./hosting";
import {
  isExternalDemoImmutableError,
  isHostingNotStagedError,
  isModerationRemediationNotAllowedError,
  isProductReviewNotPendingError,
  isUniqueConstraintError,
  isWalletPendingError,
} from "./errors";

type ModerationInput = Record<string, unknown>;

export async function applyModerationAction(admin: MemberIdentity, input: ModerationInput): Promise<Response> {
  const action = String(input.action ?? "");
  const targetRef = String(input.targetRef ?? "").slice(0, 160);
  if (action === "remove_hosting") {
    if (admin.isAgent) return Response.json({ error: "admin_forbidden" }, { status: 403 });
    const productId = Number(targetRef);
    const note = String(input.note ?? "").trim().slice(0, 500);
    if (!Number.isInteger(productId) || note.length < 4) {
      return Response.json({ error: "invalid_hosting_removal" }, { status: 400 });
    }
    await adminRemoveHosting(admin, productId, note);
    return Response.json({ updated: true });
  }
  if (action === "approve_product" || action === "reject_product") {
    const productId = Number(targetRef);
    const note = String(input.note ?? "").trim().slice(0, 500);
    if (!Number.isInteger(productId) || note.length < 4) {
      return Response.json({ error: "invalid_product_review" }, { status: 400 });
    }
    const db = database();
    const decision = action === "approve_product" ? "approved" : "rejected";
    const product = await db.prepare(
      `SELECT review_status AS reviewStatus, review_version AS reviewVersion,
              review_note AS reviewNote, demo_url AS demoUrl, image_url AS imageUrl
       FROM products WHERE id = ?`,
    ).bind(productId).first<{ reviewStatus: string; reviewVersion: number; reviewNote: string; demoUrl: string | null; imageUrl: string | null }>();
    if (!product) return Response.json({ error: "product_not_found" }, { status: 404 });
    if (product.reviewStatus !== "pending_review") {
      if (product.reviewStatus === decision && product.reviewNote === note) {
        return Response.json({ updated: false, replayed: true, productId, reviewStatus: decision, reviewVersion: product.reviewVersion });
      }
      return Response.json({ error: "product_review_already_decided" }, { status: 409 });
    }
    // 与 demoUrl 同规:外链封面在过审后可被图床原地替换(内容调包)兼作追踪信标,
    // 批准只接受站内上传(/api/uploads/...,扫描 clean 且归属校验在提交时完成)。
    const externalCover = Boolean(product.imageUrl) && !product.imageUrl!.startsWith("/api/uploads/");
    if (decision === "approved" && (product.demoUrl || externalCover)) {
      return Response.json({ error: "external_demo_requires_immutable_package" }, { status: 409 });
    }
    const decisionId = `product-review:${productId}:${product.reviewVersion}`;
    try {
      await db.batch([
        db.prepare(
          `INSERT INTO product_review_decisions
           (id, product_id, review_version, reviewer_email, decision, note)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(decisionId, productId, product.reviewVersion, admin.email, decision, note),
        adminAuditStatement(admin.email, action, "product", targetRef, `version=${product.reviewVersion}; note=${note}`),
      ]);
    } catch (error) {
      if (isExternalDemoImmutableError(error)) {
        return Response.json({ error: "external_demo_requires_immutable_package" }, { status: 409 });
      }
      if (isHostingNotStagedError(error)) {
        return Response.json({ error: "hosting_not_staged" }, { status: 409 });
      }
      if (isProductReviewNotPendingError(error) || isUniqueConstraintError(error)) {
        const decided = await db.prepare(
          `SELECT review_status AS reviewStatus, review_version AS reviewVersion,
                  review_note AS reviewNote, reviewed_by AS reviewedBy
           FROM products WHERE id = ?`,
        ).bind(productId).first<{ reviewStatus: string; reviewVersion: number; reviewNote: string; reviewedBy: string | null }>();
        if (decided?.reviewStatus === decision && decided.reviewNote === note && decided.reviewedBy === admin.email) {
          return Response.json({ updated: false, replayed: true, productId, reviewStatus: decision, reviewVersion: decided.reviewVersion });
        }
        return Response.json({ error: "product_review_already_decided" }, { status: 409 });
      }
      throw error;
    }
    return Response.json({ updated: true, productId, reviewStatus: decision, reviewVersion: product.reviewVersion });
  }
  if (action === "approve_client" || action === "reject_client") {
    const approved = action === "approve_client";
    const note = String(input.note ?? "").trim().slice(0, 500);
    if (!approved && note.length < 4) return Response.json({ error: "invalid_client_review" }, { status: 400 });
    const db = database();
    const client = await db.prepare("SELECT 1 AS found FROM oauth_provider_clients WHERE client_id = ? AND status = 'active'").bind(targetRef).first();
    if (!client) return Response.json({ error: "client_not_found" }, { status: 404 });
    const statements = [db.prepare(
      `UPDATE oauth_provider_clients SET review_status = ?, write_access_approved = ?, updated_at = CURRENT_TIMESTAMP
       WHERE client_id = ? AND status = 'active'`,
    ).bind(approved ? "verified" : "rejected", approved ? 1 : 0, targetRef)];
    if (!approved) {
      statements.push(
        db.prepare("UPDATE oauth_provider_access_tokens SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE client_id = ?").bind(targetRef),
        db.prepare("UPDATE oauth_provider_refresh_tokens SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE client_id = ?").bind(targetRef),
        db.prepare("UPDATE oauth_provider_consents SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE client_id = ?").bind(targetRef),
        db.prepare("UPDATE external_fruit_payments SET status = 'cancelled', approval_challenge_hash = NULL WHERE client_id = ? AND status = 'pending'").bind(targetRef),
      );
    }
    statements.push(adminAuditStatement(admin.email, action, "oauth_client", targetRef, note ? `note=${note}` : ""));
    await db.batch(statements);
    return Response.json({ updated: true });
  }
  if (action === "resolve_risk" || action === "dismiss_risk") {
    const note = String(input.note ?? "").trim().slice(0, 500);
    if (note.length < 4) return Response.json({ error: "invalid_risk_resolution" }, { status: 400 });
    const db = database();
    const risk = await db.prepare("SELECT 1 AS found FROM fruit_risk_events WHERE id = ? AND status = 'open'").bind(targetRef).first();
    if (!risk) return Response.json({ error: "risk_not_found" }, { status: 404 });
    await db.batch([
      db.prepare(`UPDATE fruit_risk_events SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'open'`).bind(action === "resolve_risk" ? "resolved" : "dismissed", targetRef),
      adminAuditStatement(admin.email, action, "fruit_risk", targetRef, `note=${note}`),
    ]);
    return Response.json({ updated: true });
  }
  if (["hide_reported_content", "dismiss_report"].includes(action)) {
    const note = String(input.note ?? "").trim().slice(0, 500);
    if (note.length < 4) return Response.json({ error: "invalid_report_resolution" }, { status: 400 });
    const report = await database().prepare(
      `SELECT target_type AS targetType, target_ref AS targetRef, reason
       FROM content_reports WHERE id = ? AND status = 'pending'`,
    ).bind(targetRef).first<{ targetType: string; targetRef: string; reason: string }>();
    if (!report) return Response.json({ error: "report_not_found" }, { status: 404 });
    const db = database();
    const statements = [];
    let remediation = { refundedPending: 0, compensatedSettled: 0, revokedEntitlements: 0 };
    if (action === "hide_reported_content") {
      statements.push(hideContentStatement(report.targetType, report.targetRef));
      if (report.targetType === "product" && /^\d+$/.test(report.targetRef)) {
        const plan = await buildProductTakedownStatements(db, Number(report.targetRef), report.reason, targetRef, targetRef);
        if (!plan) return Response.json({ error: "product_not_found" }, { status: 404 });
        remediation = plan.remediation;
        statements.push(...plan.statements);
      }
    }
    statements.push(
      db.prepare(`UPDATE content_reports SET status = 'resolved', resolution = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(action === "hide_reported_content" ? "hidden" : "dismissed", targetRef),
      adminAuditStatement(admin.email, action, report.targetType, report.targetRef, `report=${targetRef}; note=${note}`),
    );
    try {
      await db.batch(statements);
    } catch (error) {
      if (isWalletPendingError(error) || isModerationRemediationNotAllowedError(error)) {
        return Response.json({ error: "moderation_refund_reserve_unavailable" }, { status: 409 });
      }
      throw error;
    }
    return Response.json({ updated: true, remediation });
  }
  return Response.json({ error: "invalid_admin_action" }, { status: 400 });
}

function hideContentStatement(targetType: string, targetRef: string) {
  if (targetType === "post" && /^\d+$/.test(targetRef)) return database().prepare(`UPDATE posts SET moderation_status = 'hidden' WHERE id = ?`).bind(Number(targetRef));
  if (targetType === "comment" && /^\d+$/.test(targetRef)) return database().prepare(`UPDATE comments SET moderation_status = 'hidden' WHERE id = ?`).bind(Number(targetRef));
  if (targetType === "product" && /^\d+$/.test(targetRef)) return database().prepare(`UPDATE products SET moderation_status = 'hidden' WHERE id = ?`).bind(Number(targetRef));
  throw Object.assign(new Error("unsupported_report_target"), { code: "unsupported_report_target", status: 400 });
}

export async function buildProductTakedownStatements(
  db: D1Database,
  productId: number,
  reason: string,
  riskId: string,
  reportId: string | null,
) {
  const product = await db.prepare(`SELECT owner_email AS ownerEmail FROM products WHERE id = ?`)
    .bind(productId).first<{ ownerEmail: string }>();
  if (!product) return null;
  const summary = await db.prepare(
    `SELECT
       SUM(CASE WHEN pricing_model = 'one_time' AND status = 'paid' THEN 1 ELSE 0 END) AS refundedPending,
       SUM(CASE WHEN pricing_model = 'one_time' AND status = 'settled' THEN 1 ELSE 0 END) AS compensatedSettled,
       (SELECT COUNT(*) FROM product_entitlements WHERE product_id = ? AND status = 'active') AS revokedEntitlements
     FROM product_orders WHERE product_id = ?`,
  ).bind(productId, productId).first<{ refundedPending: number; compensatedSettled: number; revokedEntitlements: number }>();
  const remediation = {
    refundedPending: Number(summary?.refundedPending ?? 0),
    compensatedSettled: Number(summary?.compensatedSettled ?? 0),
    revokedEntitlements: Number(summary?.revokedEntitlements ?? 0),
  };
  const statements = [
    db.prepare(
      `INSERT INTO fruit_operations
       (id, kind, idempotency_key, actor_email, target_email, amount,
        reference_type, reference_id, related_operation_id, description)
       SELECT
         CASE WHEN status = 'paid' THEN 'moderation-refund:' ELSE 'moderation-compensation:' END || id,
         CASE WHEN status = 'paid' THEN 'moderation_refund' ELSE 'moderation_compensation' END,
         CASE WHEN status = 'paid' THEN 'moderation-refund:' ELSE 'moderation-compensation:' END || id,
         seller_email, buyer_email, amount, 'order', id, purchase_operation_id,
         CASE WHEN status = 'paid' THEN '违规下架退款' ELSE '违规下架平台补偿' END
       FROM product_orders
       WHERE product_id = ? AND pricing_model = 'one_time' AND status IN ('paid', 'settled')`,
    ).bind(productId),
    db.prepare(
      `UPDATE wallets SET
         balance = balance + (
           SELECT COALESCE(SUM(amount), 0) FROM product_orders
           WHERE product_id = ? AND pricing_model = 'one_time'
             AND status IN ('paid', 'settled') AND buyer_email = wallets.user_email
         ),
         lifetime_spent = MAX(0, lifetime_spent - (
           SELECT COALESCE(SUM(amount), 0) FROM product_orders
           WHERE product_id = ? AND pricing_model = 'one_time'
             AND status IN ('paid', 'settled') AND buyer_email = wallets.user_email
         )),
         updated_at = CURRENT_TIMESTAMP
       WHERE EXISTS (
         SELECT 1 FROM product_orders
         WHERE product_id = ? AND pricing_model = 'one_time'
           AND status IN ('paid', 'settled') AND buyer_email = wallets.user_email
       )`,
    ).bind(productId, productId, productId),
    db.prepare(
      `UPDATE wallets SET
         pending_balance = pending_balance - (
           SELECT COALESCE(SUM(amount), 0) FROM product_orders
           WHERE product_id = ? AND pricing_model = 'one_time' AND status = 'paid'
         ),
         status = 'review', updated_at = CURRENT_TIMESTAMP
       WHERE user_email = ? AND EXISTS (
         SELECT 1 FROM product_orders
         WHERE product_id = ? AND status IN ('paid', 'settled')
       )`,
    ).bind(productId, product.ownerEmail, productId),
    db.prepare(
      `INSERT INTO fruit_entries (operation_id, user_email, bucket, delta)
       SELECT CASE WHEN status = 'paid' THEN 'moderation-refund:' ELSE 'moderation-compensation:' END || id,
              buyer_email, 'available', amount
       FROM product_orders
       WHERE product_id = ? AND pricing_model = 'one_time' AND status IN ('paid', 'settled')`,
    ).bind(productId),
    db.prepare(
      `INSERT INTO fruit_entries (operation_id, user_email, bucket, delta)
       SELECT 'moderation-refund:' || id, seller_email, 'pending', -amount
       FROM product_orders
       WHERE product_id = ? AND pricing_model = 'one_time' AND status = 'paid'`,
    ).bind(productId),
    db.prepare(
      `INSERT INTO transactions (user_email, delta, type, description, reference_id)
       SELECT buyer_email, amount,
              CASE WHEN status = 'paid' THEN 'moderation_refund' ELSE 'moderation_compensation' END,
              CASE WHEN status = 'paid' THEN '违规下架退款' ELSE '违规下架平台补偿' END,
              id
       FROM product_orders
       WHERE product_id = ? AND pricing_model = 'one_time' AND status IN ('paid', 'settled')`,
    ).bind(productId),
    db.prepare(
      `UPDATE product_orders SET
         refund_operation_id = CASE
           WHEN status = 'paid' THEN 'moderation-refund:' || id
           ELSE 'moderation-compensation:' || id
         END,
         status = 'refunded', refunded_at = CURRENT_TIMESTAMP
       WHERE product_id = ? AND pricing_model = 'one_time' AND status IN ('paid', 'settled')`,
    ).bind(productId),
    db.prepare(
      `UPDATE product_entitlements SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
       WHERE product_id = ? AND status = 'active'`,
    ).bind(productId),
    db.prepare(
      `INSERT OR IGNORE INTO fruit_risk_events (id, user_email, kind, severity, evidence)
       SELECT ?, owner_email, 'moderated_paid_product', 'high', ? FROM products
       WHERE id = ? AND EXISTS (
         SELECT 1 FROM product_orders
         WHERE product_id = ? AND (
           status IN ('paid', 'settled') OR refund_operation_id LIKE 'moderation-%'
         )
       )`,
    ).bind(
      `risk:moderation:${riskId}`,
      JSON.stringify({ productId, reportId, reason, disposition: "access_revoked_and_one_time_orders_remediated" }),
      productId,
      productId,
    ),
  ];
  return { remediation, statements };
}

export async function applyAdminContentAction(
  admin: MemberIdentity,
  input: Record<string, unknown>,
): Promise<Response> {
  const action = String(input.action ?? "");
  const type = String(input.type ?? "");
  const ref = String(input.ref ?? "").trim().slice(0, 160);
  const reason = String(input.reason ?? "").trim().slice(0, 500);
  if (action !== "takedown" && action !== "restore") return Response.json({ error: "invalid_content_action" }, { status: 400 });
  if (!["product", "post", "comment"].includes(type)) return Response.json({ error: "invalid_content_type" }, { status: 400 });
  if (!/^\d+$/.test(ref) || !Number.isSafeInteger(Number(ref))) return Response.json({ error: "invalid_content_ref" }, { status: 400 });
  if (reason.length < 4) return Response.json({ error: "invalid_admin_reason" }, { status: 400 });
  if (action === "restore" && type === "product") return Response.json({ error: "content_restore_not_supported" }, { status: 400 });

  const db = database();
  const numericRef = Number(ref);
  const table = type === "product" ? "products" : type === "post" ? "posts" : "comments";
  const current = await db.prepare(`SELECT moderation_status AS moderationStatus FROM ${table} WHERE id = ?`)
    .bind(numericRef).first<{ moderationStatus: string }>();
  if (!current) return Response.json({ error: "content_not_found" }, { status: 404 });
  if (action === "takedown" && current.moderationStatus === "hidden") return Response.json({ error: "content_already_hidden" }, { status: 409 });
  if (action === "restore" && current.moderationStatus !== "hidden") return Response.json({ error: "content_not_hidden" }, { status: 409 });

  const remediation = { refundedPending: 0, compensatedSettled: 0, revokedEntitlements: 0 };
  const status = action === "takedown" ? "hidden" : "visible";
  const statements = [db.prepare(`UPDATE ${table} SET moderation_status = ? WHERE id = ?`).bind(status, numericRef)];
  if (action === "takedown" && type === "product") {
    const plan = await buildProductTakedownStatements(db, numericRef, reason, `admin:${crypto.randomUUID()}`, null);
    if (!plan) return Response.json({ error: "content_not_found" }, { status: 404 });
    Object.assign(remediation, plan.remediation);
    statements.push(...plan.statements);
  }
  const auditAction = action === "takedown" ? "takedown_content" : "restore_content";
  statements.push(adminAuditStatement(
    admin.email,
    auditAction,
    type,
    ref,
    JSON.stringify({ type, ref, reason, remediation }),
  ));
  try {
    const result = await db.batch(statements);
    if (Number(result[0]?.meta?.changes ?? 0) === 0) return Response.json({ error: "content_not_found" }, { status: 404 });
  } catch (error) {
    if (isWalletPendingError(error) || isModerationRemediationNotAllowedError(error)) {
      return Response.json({ error: "moderation_refund_reserve_unavailable" }, { status: 409 });
    }
    throw error;
  }
  return Response.json({ updated: true, type, ref, remediation });
}
