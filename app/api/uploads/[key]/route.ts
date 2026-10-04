import { env } from "cloudflare:workers";
import { UPLOAD_KEY_PATTERN } from "../../_lib/upload-core";
import { isAdminEmail, optionalMember } from "../../_lib/access-control";
import { database } from "../../_lib/community";
import { PUBLISHED_PRODUCT_SQL } from "../../../lib/product-policy";

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  if (!UPLOAD_KEY_PATTERN.test(key)) return new Response("Not found", { status: 404 });
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
    const owner = member !== null && record.owner === member.email;
    let reviewer = false;
    let approvedProductCover = false;
    // 注意:此分支对匿名访客也要进入——approvedProductCover(已批准产品封面公开可见)
    // 不依赖登录态;只有 reviewer 才需要 member。member 为 null 时 reviewer 恒 false。
    if (!owner && record.purpose === "product_cover") {
      const imageUrl = `/api/uploads/${encodeURIComponent(key)}`;
      // M1(2026-10 审计):封面可被多个产品共用——"是否已批准产品的当前封面"必须
      // 用 EXISTS 全量判定;.first() 命中待审产品会把已批准产品共用的封面错判 403。
      if (member !== null && isAdminEmail(member.email)) {
        reviewer = Boolean(await database().prepare(
          `SELECT 1 AS pending FROM products WHERE image_url = ? AND review_status = 'pending_review'`,
        ).bind(imageUrl).first());
      }
      approvedProductCover = Boolean(await database().prepare(
        `SELECT 1 AS published FROM products WHERE image_url = ? AND ${PUBLISHED_PRODUCT_SQL} LIMIT 1`,
      ).bind(imageUrl).first());
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
