import { database, jsonError, requireMember } from "../_lib/community";
import { enforceRateLimit, rateLimitKey } from "../_lib/rate-limit";

const TARGET_TYPES = new Set(["post", "comment", "product", "profile", "circle"]);
const REASONS = new Set(["spam", "harassment", "copyright", "privacy", "fraud", "other"]);

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    await enforceRateLimit(await rateLimitKey("content-report", member.email), 20, 24 * 60 * 60);
    const input = await request.json() as Record<string, unknown>;
    const targetType = String(input.targetType ?? "");
    const targetRef = String(input.targetRef ?? "").trim().slice(0, 120);
    const reason = String(input.reason ?? "");
    const details = String(input.details ?? "").trim().slice(0, 500);
    if (!TARGET_TYPES.has(targetType) || !targetRef || !REASONS.has(reason)) {
      return Response.json({ error: "invalid_report" }, { status: 400 });
    }
    try {
      await database().prepare(
        `INSERT INTO content_reports (id, reporter_email, target_type, target_ref, reason, details)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(`report:${crypto.randomUUID()}`, member.email, targetType, targetRef, reason, details).run();
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        return Response.json({ reported: true, duplicate: true });
      }
      throw error;
    }
    return Response.json({ reported: true }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
