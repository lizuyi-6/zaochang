import { env } from "cloudflare:workers";
import { database } from "./community";
import { inspectUpload, scanUpload, UploadSecurityError } from "./upload-security";

// 可复用的「扫描后入库」上传管线:与 app/api/uploads/route.ts 同源同安全语义。
// 写库默认 'pending',ClamAV 扫描通过(clean)才置为 clean 并把对象从 quarantine
// 提升到正式 key;infected/error 一律 fail-closed,绝不落为可读的 clean。
// 该函数不做任何鉴权/限流——调用方必须先自行鉴权(成员/创始人),并按需限流。

export type StoredUpload = {
  key: string;
  name: string;
  type: string;
  size: number;
  url: string;
};

export async function storeScannedUpload(args: {
  file: File;
  ownerEmail: string;
  visibility: "public" | "private";
  purpose: string;
}): Promise<StoredUpload> {
  const inspected = await inspectUpload(args.file);
  const bucket = (env as unknown as { UPLOADS?: R2Bucket }).UPLOADS;
  if (!bucket) throw new UploadSecurityError("uploads_unavailable", 503);
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
    args.ownerEmail,
    inspected.originalName,
    inspected.mediaType,
    inspected.bytes.byteLength,
    args.visibility,
    args.purpose,
    inspected.sha256,
    quarantineKey,
  ).run();

  try {
    await bucket.put(quarantineKey, inspected.bytes, {
      httpMetadata: { contentType: "application/octet-stream" },
      customMetadata: { owner: args.ownerEmail, scanStatus: "pending" },
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
      throw new UploadSecurityError("malware_detected", 422);
    }
    await bucket.put(key, inspected.bytes, {
      httpMetadata: { contentType: inspected.mediaType },
      customMetadata: {
        owner: args.ownerEmail,
        originalName: inspected.originalName,
        visibility: args.visibility,
        purpose: args.purpose,
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

  return {
    key,
    name: inspected.originalName,
    type: inspected.mediaType,
    size: inspected.bytes.byteLength,
    url: `/api/uploads/${encodeURIComponent(key)}`,
  };
}
