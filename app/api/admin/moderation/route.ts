import { requireAdmin } from "../../_lib/access-control";
import { guardWrite } from "../../_lib/route-guards";
import { applyModerationAction } from "../../_lib/moderation";
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
    const guarded = await guardWrite(request, { member: "admin", sameOrigin: true });
    if (guarded instanceof Response) return guarded;
    const input = await request.json() as Record<string, unknown>;
    return await applyModerationAction(guarded.member, input);
  } catch (error) {
    return jsonError(error);
  }
}
