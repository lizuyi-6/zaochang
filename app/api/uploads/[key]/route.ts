import { env } from "cloudflare:workers";
import { database, optionalMember } from "../../_lib/community";

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  if (!/^[a-f0-9-]+(?:\.[a-zA-Z0-9]{1,8})?$/.test(key)) return new Response("Not found", { status: 404 });
  const record = await database().prepare(
    `SELECT owner_email AS owner, original_name AS originalName,
            media_type AS mediaType, visibility, purpose, sha256, scan_status AS scanStatus
     FROM uploaded_files WHERE key = ?`,
  ).bind(key).first<{
    owner: string;
    originalName: string;
    mediaType: string;
    visibility: string;
    purpose: string;
    sha256: string;
    scanStatus: string;
  }>();
  if (!record || record.scanStatus !== "clean") return new Response("Not found", { status: 404 });
  const bucket = (env as unknown as { UPLOADS?: R2Bucket }).UPLOADS;
  if (!bucket) return new Response("Unavailable", { status: 503 });
  const object = await bucket.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  if (object.customMetadata?.scanStatus !== "clean" || object.customMetadata?.sha256 !== record.sha256) {
    return new Response("Not found", { status: 404 });
  }
  const visibility = record.visibility;
  if (visibility !== "public") {
    const member = await optionalMember();
    const owner = member && record.owner === member.email;
    const adminEmails = String((env as unknown as Record<string, string | undefined>).ZAOCHANG_ADMIN_EMAILS ?? "")
      .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
    let reviewer = false;
    let approvedProductCover = false;
    if (!owner && record.purpose === "product_cover") {
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
  headers.set("content-type", record.mediaType);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", visibility === "public" ? "public, max-age=31536000, immutable" : "no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-security-policy", "default-src 'none'; sandbox");
  const disposition = record.mediaType.startsWith("image/") ? "inline" : "attachment";
  headers.set("content-disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(record.originalName)}`);
  return new Response(object.body, { headers });
}
