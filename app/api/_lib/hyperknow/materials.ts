import { env } from "cloudflare:workers";
import { database } from "../community";
import { UPLOAD_KEY_PATTERN } from "../upload-core";
import { MAX_UPLOAD_BYTES, sha256Hex } from "../upload-security";

export type OwnedCleanUpload = {
  key: string;
  name: string;
  mediaType: string;
  bytes: Uint8Array;
};

/**
 * 只读取当前会员本人上传、D1 与 R2 均标记 clean 且哈希一致的私有对象。
 * 任一身份/扫描/对象校验不成立时统一返回 null，避免 key 充当存在性预言机。
 */
export async function readOwnedCleanUpload(key: string, memberEmail: string): Promise<OwnedCleanUpload | null> {
  if (!UPLOAD_KEY_PATTERN.test(key) || !memberEmail) return null;
  try {
    const record = await database().prepare(
      `SELECT owner_email AS owner, original_name AS name, media_type AS mediaType,
              visibility, sha256, scan_status AS scanStatus
       FROM uploaded_files WHERE key = ?`,
    ).bind(key).first<{
      owner: string;
      name: string;
      mediaType: string;
      visibility: string;
      sha256: string;
      scanStatus: string;
    }>();
    if (!record || record.owner !== memberEmail || record.visibility !== "private" || record.scanStatus !== "clean") {
      return null;
    }

    const bucket = (env as unknown as { UPLOADS?: R2Bucket }).UPLOADS;
    if (!bucket) return null;
    const object = await bucket.get(key);
    if (!object || object.size < 1 || object.size > MAX_UPLOAD_BYTES
      || object.customMetadata?.scanStatus !== "clean"
      || object.customMetadata?.sha256 !== record.sha256) {
      return null;
    }

    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.byteLength !== object.size || await sha256Hex(bytes) !== record.sha256) return null;
    return { key, name: record.name, mediaType: record.mediaType, bytes };
  } catch {
    // DB/R2 读失败与校验失败同样不返回对象内容，调用方只显示统一的无法读取状态。
    return null;
  }
}
