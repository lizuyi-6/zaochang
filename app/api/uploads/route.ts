import { jsonError, requireMember } from "../_lib/community";
import { enforceRateLimit, rateLimitKey } from "../_lib/rate-limit";
import { storeScannedUpload } from "../_lib/upload-core";
import { assertSameOrigin } from "../_lib/request-origin";

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    // CSRF 纵深:跨站写请求 403(见 request-origin.ts;SameSite=Lax 之外的防线)。
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    await enforceRateLimit(await rateLimitKey("upload", member.email), 30, 60 * 60);
    const form = await request.formData();
    const file = form.get("file");
    const visibility = form.get("visibility");
    const purpose = String(form.get("purpose") ?? "general");
    if (!(file instanceof File)) {
      return Response.json({ error: "invalid_upload" }, { status: 400 });
    }
    if (visibility !== "public" && visibility !== "private") {
      return Response.json({ error: "invalid_visibility" }, { status: 400 });
    }
    if (!new Set(["general", "product_cover", "incubation_material"]).has(purpose)) {
      return Response.json({ error: "invalid_upload_purpose" }, { status: 400 });
    }
    if (purpose === "product_cover" && visibility !== "private") {
      return Response.json({ error: "product_cover_must_be_private" }, { status: 400 });
    }
    if (purpose === "product_cover" && !file.type.startsWith("image/")) {
      return Response.json({ error: "product_cover_must_be_image" }, { status: 400 });
    }
    // 落库+扫描走共享管线(upload-core):写库 pending,ClamAV clean 才提升为可读,失败一律 fail-closed。
    const stored = await storeScannedUpload({ file, ownerEmail: member.email, visibility, purpose });
    return Response.json({
      key: stored.key,
      name: stored.name,
      type: stored.type,
      size: stored.size,
      visibility,
      purpose,
      scanStatus: "clean",
      url: stored.url,
    }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
