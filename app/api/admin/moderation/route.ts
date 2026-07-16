import { adminAuditStatement, requireAdmin } from "../../_lib/admin";
import { database, jsonError } from "../../_lib/community";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const [reports, products, clients, risks] = await Promise.all([
      database().prepare(`SELECT id, reporter_email AS reporterEmail, target_type AS targetType, target_ref AS targetRef, reason, details, status, created_at AS createdAt FROM content_reports WHERE status = 'pending' ORDER BY created_at ASC LIMIT 100`).all(),
      database().prepare(
        `SELECT id, owner_email AS ownerEmail, owner_name AS ownerName, title, description,
                category, demo_url AS demoUrl, image_url AS imageUrl, price,
                pricing_model AS pricingModel, review_status AS reviewStatus,
                review_version AS reviewVersion, submitted_at AS submittedAt
         FROM products WHERE review_status = 'pending_review'
         ORDER BY submitted_at ASC, id ASC LIMIT 100`,
      ).all(),
      database().prepare(`SELECT client_id AS clientId, owner_email AS ownerEmail, name, website_url AS websiteUrl, allowed_scopes AS allowedScopes, review_status AS reviewStatus, write_access_approved AS writeAccessApproved, created_at AS createdAt FROM oauth_provider_clients WHERE status = 'active' AND (review_status <> 'verified' OR (allowed_scopes LIKE '%fruit:%' AND write_access_approved = 0)) ORDER BY created_at ASC LIMIT 100`).all(),
      database().prepare(`SELECT id, user_email AS userEmail, kind, severity, evidence, status, created_at AS createdAt FROM fruit_risk_events WHERE status = 'open' ORDER BY created_at ASC LIMIT 100`).all(),
    ]);
    return Response.json({ reports: reports.results, products: products.results, clients: clients.results, risks: risks.results });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const input = await request.json() as Record<string, unknown>;
    const action = String(input.action ?? "");
    const targetRef = String(input.targetRef ?? "").slice(0, 160);
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
                review_note AS reviewNote, demo_url AS demoUrl
         FROM products WHERE id = ?`,
      ).bind(productId).first<{ reviewStatus: string; reviewVersion: number; reviewNote: string; demoUrl: string | null }>();
      if (!product) return Response.json({ error: "product_not_found" }, { status: 404 });
      if (product.reviewStatus !== "pending_review") {
        if (product.reviewStatus === decision && product.reviewNote === note) {
          return Response.json({ updated: false, replayed: true, productId, reviewStatus: decision, reviewVersion: product.reviewVersion });
        }
        return Response.json({ error: "product_review_already_decided" }, { status: 409 });
      }
      if (decision === "approved" && product.demoUrl) {
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
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("external_demo_requires_immutable_package")) {
          return Response.json({ error: "external_demo_requires_immutable_package" }, { status: 409 });
        }
        if (message.includes("product_review_not_pending") || message.includes("UNIQUE constraint failed")) {
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
      statements.push(adminAuditStatement(admin.email, action, "oauth_client", targetRef));
      await db.batch(statements);
      return Response.json({ updated: true });
    }
    if (action === "resolve_risk" || action === "dismiss_risk") {
      const db = database();
      const risk = await db.prepare("SELECT 1 AS found FROM fruit_risk_events WHERE id = ? AND status = 'open'").bind(targetRef).first();
      if (!risk) return Response.json({ error: "risk_not_found" }, { status: 404 });
      await db.batch([
        db.prepare(`UPDATE fruit_risk_events SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'open'`).bind(action === "resolve_risk" ? "resolved" : "dismissed", targetRef),
        adminAuditStatement(admin.email, action, "fruit_risk", targetRef),
      ]);
      return Response.json({ updated: true });
    }
    if (["hide_reported_content", "dismiss_report"].includes(action)) {
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
          const productId = Number(report.targetRef);
          const product = await db.prepare(
            `SELECT owner_email AS ownerEmail FROM products WHERE id = ?`,
          ).bind(productId).first<{ ownerEmail: string }>();
          if (!product) return Response.json({ error: "product_not_found" }, { status: 404 });
          const summary = await db.prepare(
            `SELECT
               SUM(CASE WHEN pricing_model = 'one_time' AND status = 'paid' THEN 1 ELSE 0 END) AS refundedPending,
               SUM(CASE WHEN pricing_model = 'one_time' AND status = 'settled' THEN 1 ELSE 0 END) AS compensatedSettled,
               (SELECT COUNT(*) FROM product_entitlements WHERE product_id = ? AND status = 'active') AS revokedEntitlements
             FROM product_orders WHERE product_id = ?`,
          ).bind(productId, productId).first<{ refundedPending: number; compensatedSettled: number; revokedEntitlements: number }>();
          remediation = {
            refundedPending: Number(summary?.refundedPending ?? 0),
            compensatedSettled: Number(summary?.compensatedSettled ?? 0),
            revokedEntitlements: Number(summary?.revokedEntitlements ?? 0),
          };
          statements.push(
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
              `risk:moderation:${targetRef}`,
              JSON.stringify({ productId, reportId: targetRef, reason: report.reason, disposition: "access_revoked_and_one_time_orders_remediated" }),
              productId,
              productId,
            ),
          );
        }
      }
      statements.push(
        db.prepare(`UPDATE content_reports SET status = 'resolved', resolution = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(action === "hide_reported_content" ? "hidden" : "dismissed", targetRef),
        adminAuditStatement(admin.email, action, report.targetType, report.targetRef, `report=${targetRef}`),
      );
      try {
        await db.batch(statements);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("wallet_pending_nonnegative") || message.includes("moderation_remediation_not_allowed")) {
          return Response.json({ error: "moderation_refund_reserve_unavailable" }, { status: 409 });
        }
        throw error;
      }
      return Response.json({ updated: true, remediation });
    }
    return Response.json({ error: "invalid_admin_action" }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}

function hideContentStatement(targetType: string, targetRef: string) {
  if (targetType === "post" && /^\d+$/.test(targetRef)) return database().prepare(`UPDATE posts SET moderation_status = 'hidden' WHERE id = ?`).bind(Number(targetRef));
  if (targetType === "comment" && /^\d+$/.test(targetRef)) return database().prepare(`UPDATE comments SET moderation_status = 'hidden' WHERE id = ?`).bind(Number(targetRef));
  if (targetType === "product" && /^\d+$/.test(targetRef)) return database().prepare(`UPDATE products SET moderation_status = 'hidden' WHERE id = ?`).bind(Number(targetRef));
  throw Object.assign(new Error("unsupported_report_target"), { code: "unsupported_report_target", status: 400 });
}
