import { requireAdminOrAgent } from "../../_lib/access-control";
import { database, jsonError } from "../../_lib/community";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminOrAgent();
    const db = database();
    const [members, products, posts, queues, fruit] = await Promise.all([
      db.prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN joined_at >= datetime('now', 'start of day') THEN 1 ELSE 0 END) AS newToday,
                SUM(CASE WHEN joined_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS new7Days,
                SUM(CASE WHEN suspended_at IS NOT NULL THEN 1 ELSE 0 END) AS suspended
         FROM members`,
      ).first(),
      db.prepare(
        `SELECT SUM(CASE WHEN review_status = 'pending_review' THEN 1 ELSE 0 END) AS pendingReview,
                SUM(CASE WHEN review_status = 'approved' THEN 1 ELSE 0 END) AS approved,
                SUM(CASE WHEN review_status = 'rejected' THEN 1 ELSE 0 END) AS rejected
         FROM products`,
      ).first(),
      db.prepare(`SELECT COUNT(*) AS total FROM posts`).first(),
      db.prepare(
        `SELECT
          (SELECT COUNT(*) FROM fruit_risk_events WHERE status = 'open') AS fruitRisk,
          (SELECT COUNT(*) FROM fruit_risk_events WHERE status = 'open' AND severity = 'high') AS fruitRiskHigh,
          (SELECT COUNT(*) FROM content_reports WHERE status = 'pending') AS reports,
          (SELECT COUNT(*) FROM products WHERE review_status = 'pending_review') AS productReviews,
          (SELECT COUNT(*) FROM oauth_provider_clients WHERE registration_source = 'developer' AND status = 'active'
            AND (review_status <> 'verified' OR (allowed_scopes LIKE '%fruit:%' AND write_access_approved = 0))) AS thirdPartyApps,
          (SELECT COUNT(*) FROM incubation_projects WHERE status <> '进入银河') AS incubation`,
      ).first(),
      db.prepare(
        `SELECT COALESCE(SUM(balance), 0) AS walletBalanceTotal,
                COALESCE(SUM(pending_balance), 0) AS walletPendingBalanceTotal,
                COALESCE(SUM(balance + pending_balance), 0) AS walletCombinedTotal,
                SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) AS reviewWallets,
                (SELECT COUNT(*) FROM fruit_operations WHERE created_at >= datetime('now', '-24 hours')) AS operationsLast24h
         FROM wallets`,
      ).first(),
    ]);
    return Response.json({
      members: {
        total: Number(members?.total ?? 0),
        newToday: Number(members?.newToday ?? 0),
        new7Days: Number(members?.new7Days ?? 0),
        suspended: Number(members?.suspended ?? 0),
      },
      products: {
        byReviewStatus: {
          pendingReview: Number(products?.pendingReview ?? 0),
          approved: Number(products?.approved ?? 0),
          rejected: Number(products?.rejected ?? 0),
        },
      },
      posts: { total: Number(posts?.total ?? 0) },
      queues: {
        fruitRisk: { total: Number(queues?.fruitRisk ?? 0), high: Number(queues?.fruitRiskHigh ?? 0) },
        reports: Number(queues?.reports ?? 0),
        productReviews: Number(queues?.productReviews ?? 0),
        thirdPartyApps: Number(queues?.thirdPartyApps ?? 0),
        incubation: Number(queues?.incubation ?? 0),
      },
      fruit: {
        walletBalanceTotal: Number(fruit?.walletBalanceTotal ?? 0),
        walletPendingBalanceTotal: Number(fruit?.walletPendingBalanceTotal ?? 0),
        walletCombinedTotal: Number(fruit?.walletCombinedTotal ?? 0),
        reviewWallets: Number(fruit?.reviewWallets ?? 0),
        operationsLast24h: Number(fruit?.operationsLast24h ?? 0),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
