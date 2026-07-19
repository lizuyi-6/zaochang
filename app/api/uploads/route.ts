import { env } from "cloudflare:workers";
import { database, jsonError, requireMember } from "../_lib/community";
import { enforceRateLimit, rateLimitKey } from "../_lib/rate-limit";
import { inspectUpload, scanUpload, UploadSecurityError } from "../_lib/upload-security";

export async function POST(request: Request) {
  try {
    const member = await requireMember();
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
    const inspected = await inspectUpload(file);
    const bucket = (env as unknown as { UPLOADS?: R2Bucket }).UPLOADS;
    if (!bucket) return Response.json({ error: "uploads_unavailable" }, { status: 503 });
    const id = crypto.randomUUID();
    const key = `${id}${inspected.extension}`;
    const quarantineKey = `quarantine/${id}`;
    const db = database();
    await db.prepare(
      `INSERT INTO uploaded_files
       (key, owner_email, original_name, media_type, byte_size, visibility,
        purpose, sha256, scan_status, quarantine_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    ).bind(
      key,
      member.email,
      inspected.originalName,
      inspected.mediaType,
      inspected.bytes.byteLength,
      visibility,
      purpose,
      inspected.sha256,
      quarantineKey,
    ).run();

    try {
      await bucket.put(quarantineKey, inspected.bytes, {
        httpMetadata: { contentType: "application/octet-stream" },
        customMetadata: { owner: member.email, scanStatus: "pending" },
      });
      const scan = await scanUpload(inspected.bytes, inspected.sha256);
      if (scan.verdict === "infected") {
        await bucket.delete(quarantineKey);
        await db.prepare(
          `UPDATE uploaded_files
           SET scan_status = 'infected', scan_engine = ?, scan_signature = ?,
               quarantine_key = NULL, scanned_at = CURRENT_TIMESTAMP
           WHERE key = ? AND scan_status = 'pending'`,
        ).bind(scan.engine, scan.signature, key).run();
        return Response.json({ error: "malware_detected" }, { status: 422 });
      }
      await bucket.put(key, inspected.bytes, {
        httpMetadata: { contentType: inspected.mediaType },
        customMetadata: {
          owner: member.email,
          originalName: inspected.originalName,
          visibility,
          purpose,
          scanStatus: "clean",
          sha256: inspected.sha256,
          scanEngine: scan.engine,
        },
      });
      await bucket.delete(quarantineKey);
      const updated = await db.prepare(
        `UPDATE uploaded_files
         SET scan_status = 'clean', scan_engine = ?, scan_signature = NULL,
             quarantine_key = NULL, scanned_at = CURRENT_TIMESTAMP
         WHERE key = ? AND scan_status = 'pending'`,
      ).bind(scan.engine, key).run();
      if (updated.meta.changes !== 1) {
        await bucket.delete(key);
        throw new UploadSecurityError("upload_scan_state_conflict", 503);
      }
    } catch (error) {
      await bucket.delete(quarantineKey).catch(() => undefined);
      await db.prepare(
        `UPDATE uploaded_files
         SET scan_status = 'error', quarantine_key = NULL, scanned_at = CURRENT_TIMESTAMP
         WHERE key = ? AND scan_status = 'pending'`,
      ).bind(key).run().catch(() => undefined);
      throw error;
    }

    return Response.json({
      key,
      name: inspected.originalName,
      type: inspected.mediaType,
      size: inspected.bytes.byteLength,
      visibility,
      purpose,
      scanStatus: "clean",
      url: `/api/uploads/${encodeURIComponent(key)}`,
    }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
