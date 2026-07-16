import { env } from "cloudflare:workers";
import { database, optionalMember } from "../../_lib/community";

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  if (!/^[a-f0-9-]+(?:\.[a-zA-Z0-9]{1,8})?$/.test(key)) return new Response("Not found", { status: 404 });
  const bucket = (env as unknown as { UPLOADS?: R2Bucket }).UPLOADS;
  if (!bucket) return new Response("Unavailable", { status: 503 });
  const object = await bucket.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const visibility = object.customMetadata?.visibility;
  if (visibility !== "public") {
    const member = await optionalMember();
    const owner = member && object.customMetadata?.owner === member.email;
    const adminEmails = String((env as unknown as Record<string, string | undefined>).ZAOCHANG_ADMIN_EMAILS ?? "")
      .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
    let reviewer = false;
    let approvedProductCover = false;
    if (!owner && object.customMetadata?.purpose === "product_cover") {
      const imageUrl = `/api/uploads/${encodeURIComponent(key)}`;
      const product = await database().prepare(
        `SELECT status, moderation_status AS moderationStatus,
                review_status AS reviewStatus,
                approved_version AS approvedVersion, review_version AS reviewVersion
         FROM products WHERE image_url = ?`,
      ).bind(imageUrl).first<{
        status: string;
        moderationStatus: string;
        reviewStatus: string;
        approvedVersion: number;
        reviewVersion: number;
      }>();
      reviewer = Boolean(member)
        && adminEmails.includes(member!.email.toLowerCase())
        && product?.reviewStatus === "pending_review";
      approvedProductCover = product?.status === "published"
        && product.moderationStatus === "visible"
        && product.reviewStatus === "approved"
        && product.approvedVersion === product.reviewVersion;
    }
    if (!owner && !reviewer && !approvedProductCover) {
      return new Response("Forbidden", { status: 403 });
    }
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", visibility === "public" ? "public, max-age=31536000, immutable" : "no-store");
  return new Response(object.body, { headers });
}
