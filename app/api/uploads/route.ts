import { env } from "cloudflare:workers";
import { jsonError, requireMember } from "../_lib/community";
import { enforceRateLimit, rateLimitKey } from "../_lib/rate-limit";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    await enforceRateLimit(await rateLimitKey("upload", member.email), 30, 60 * 60);
    const form = await request.formData();
    const file = form.get("file");
    const visibility = form.get("visibility");
    const purpose = String(form.get("purpose") ?? "general");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_UPLOAD_BYTES || !allowedTypes.has(file.type)) {
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
    const bucket = (env as unknown as { UPLOADS?: R2Bucket }).UPLOADS;
    if (!bucket) return Response.json({ error: "uploads_unavailable" }, { status: 503 });
    const extension = file.name.includes(".") ? `.${file.name.split(".").pop()!.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}` : "";
    const key = `${crypto.randomUUID()}${extension}`;
    await bucket.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { owner: member.email, originalName: file.name, visibility, purpose },
    });
    return Response.json({ key, name: file.name, type: file.type, size: file.size, visibility, purpose, url: `/api/uploads/${encodeURIComponent(key)}` }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
