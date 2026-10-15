import { requireAdminOrAgent } from "../../_lib/access-control";
import { guardWrite } from "../../_lib/route-guards";
import { applyModerationAction } from "../../_lib/moderation";
import { database, jsonError } from "../../_lib/community";
import { hostedUrlSelect } from "../../_lib/hosting-sql";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminOrAgent();
    const [reports, products, hostingRows, clients, risks] = await Promise.all([
      database().prepare(`SELECT id, reporter_email AS reporterEmail, target_type AS targetType, target_ref AS targetRef, reason, details, status, created_at AS createdAt FROM content_reports WHERE status = 'pending' ORDER BY created_at ASC LIMIT 100`).all(),
      database().prepare(
        `SELECT id, owner_email AS ownerEmail, owner_name AS ownerName, title, description,
                category, demo_url AS demoUrl, ${hostedUrlSelect("products")}, image_url AS imageUrl, price,
                pricing_model AS pricingModel, review_status AS reviewStatus,
                review_version AS reviewVersion, submitted_at AS submittedAt
         FROM products WHERE review_status = 'pending_review'
         ORDER BY submitted_at ASC, id ASC LIMIT 100`,
      ).all(),
      database().prepare(
        `SELECT h.product_id AS productId, h.id, h.state, h.desired,
                h.review_version AS reviewVersion, h.approved_version AS approvedVersion,
                h.bundle_file_count AS bundleFileCount,
                h.bundle_uncompressed_bytes AS bundleUncompressedBytes,
                h.bundle_sha256 AS bundleSha256, h.preview_url AS previewUrl,
                h.preview_expires_at AS previewExpiresAt,
                h.failure_code AS failureCode, h.failure_detail AS failureDetail
         FROM product_hostings h
         WHERE h.desired <> 'removed'
           AND h.product_id IN (SELECT id FROM products WHERE review_status = 'pending_review')
         ORDER BY h.id DESC`,
      ).all(),
      database().prepare(`SELECT client_id AS clientId, owner_email AS ownerEmail, name, website_url AS websiteUrl, allowed_scopes AS allowedScopes, review_status AS reviewStatus, write_access_approved AS writeAccessApproved, created_at AS createdAt FROM oauth_provider_clients WHERE registration_source = 'developer' AND status = 'active' AND (review_status <> 'verified' OR (allowed_scopes LIKE '%fruit:%' AND write_access_approved = 0)) ORDER BY created_at ASC LIMIT 100`).all(),
      database().prepare(`SELECT id, user_email AS userEmail, kind, severity, evidence, status, created_at AS createdAt FROM fruit_risk_events WHERE status = 'open' ORDER BY created_at ASC LIMIT 100`).all(),
    ]);
    const hostingByProduct = new Map<number, Record<string, unknown>>();
    for (const row of hostingRows.results ?? []) {
      const productId = Number(row.productId);
      if (!hostingByProduct.has(productId)) {
        hostingByProduct.set(productId, {
          id: row.id,
          state: row.state,
          desired: row.desired,
          reviewVersion: row.reviewVersion,
          approvedVersion: row.approvedVersion,
          bundleFileCount: row.bundleFileCount,
          bundleUncompressedBytes: row.bundleUncompressedBytes,
          bundleSha256: row.bundleSha256,
          previewUrl: row.previewUrl,
          previewExpiresAt: row.previewExpiresAt,
          failureCode: row.failureCode,
          failureDetail: row.failureDetail,
        });
      }
    }
    const moderatedProducts = (products.results ?? []).map((product) => ({
      ...product,
      hosting: hostingByProduct.get(Number(product.id)) ?? null,
    }));
    return Response.json({ reports: reports.results, products: moderatedProducts, clients: clients.results, risks: risks.results });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const guarded = await guardWrite(request, { member: "adminOrAgent", sameOrigin: true });
    if (guarded instanceof Response) return guarded;
    const input = await request.json().catch(() => ({})) as Record<string, unknown>;
    return await applyModerationAction(guarded.member, input);
  } catch (error) {
    return jsonError(error);
  }
}
