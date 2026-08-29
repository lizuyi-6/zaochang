import { database, jsonError } from "../_lib/community";
import { guardWrite } from "../_lib/route-guards";

const TARGET_TYPES = new Set(["post", "comment", "product", "profile", "circle"]);
const REASONS = new Set(["spam", "harassment", "copyright", "privacy", "fraud", "other"]);

export async function POST(request: Request) {
  try {
    const guarded = await guardWrite(request, {
      member: "member",
      sameOrigin: true,
      rate: { bucket: "content-report", limit: 20, windowSeconds: 24 * 60 * 60 },
    });
    if (guarded instanceof Response) return guarded;
    const member = guarded.member;
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
