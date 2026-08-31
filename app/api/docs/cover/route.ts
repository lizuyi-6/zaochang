import { requireFounder } from "../../_lib/access-control";
import { auditAdminAction } from "../../_lib/admin";
import { database, jsonError } from "../../_lib/community";
import { invalidateDocDataCache } from "../../_lib/docs";
import { enforceRateLimit, rateLimitKey } from "../../_lib/rate-limit";
import { storeScannedUpload } from "../../_lib/upload-core";

export const dynamic = "force-dynamic";

// 图书封面上传(仅创始人)。复用与 /api/uploads 相同的「扫描后入库」管线:
// ClamAV clean 才置 clean 并提升出 quarantine,失败 fail-closed,绝不绕过扫描。
// 与通用上传不同的是:这里允许 visibility=public(封面要对匿名读者可见),
// 并把返回的公开图片地址写回目标书根的 docs.cover_image / docs.banner_image。
// slot=cover(竖版,书架卡片) | banner(横版,封面页横幅),缺省 cover。
// purpose 固定 book_cover,使 /api/uploads/[key] 的私有门控对这类上传天然 403(public 才放行)。
export async function POST(request: Request) {
  try {
    const founder = await requireFounder();
    await enforceRateLimit(await rateLimitKey("book-cover", founder.email), 20, 60 * 60);
    const form = await request.formData();
    const file = form.get("file");
    const docId = String(form.get("docId") ?? "").trim().slice(0, 80);
    const slotRaw = String(form.get("slot") ?? "cover");
    const slot = slotRaw === "banner" ? "banner" : "cover";
    const column = slot === "banner" ? "banner_image" : "cover_image";
    const visibility = String(form.get("visibility") ?? "public");
    if (!(file instanceof File)) {
      return Response.json({ error: "invalid_upload" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return Response.json({ error: "book_cover_must_be_image" }, { status: 400 });
    }
    if (visibility !== "public" && visibility !== "private") {
      return Response.json({ error: "invalid_visibility" }, { status: 400 });
    }

    // 目标必须是一本已存在的书根(is_book=1),才允许把封面写回它的 cover/banner。
    const book = docId
      ? await database().prepare(`SELECT id FROM docs WHERE id = ? AND is_book = 1 LIMIT 1`).bind(docId).first<{ id: string }>()
      : null;
    if (docId && !book) {
      return Response.json({ error: "book_not_found" }, { status: 404 });
    }

    const stored = await storeScannedUpload({
      file,
      ownerEmail: founder.email,
      visibility,
      purpose: "book_cover",
    });

    if (book) {
      await database().prepare(
        `UPDATE docs SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(stored.url, book.id).run();
      // 封面/横幅字段在生产 isolate 元数据缓存内:写后必须失效本 isolate,
      // 否则书架/封面页会继续展示旧图满一个 TTL(与 createDoc/updateDoc 同界)。
      invalidateDocDataCache();
    }
    await auditAdminAction(founder.email, `book_cover_upload_${slot}`, "docs", book?.id ?? "", stored.key);

    return Response.json({
      key: stored.key,
      name: stored.name,
      type: stored.type,
      size: stored.size,
      visibility,
      purpose: "book_cover",
      slot,
      scanStatus: "clean",
      url: stored.url,
      docId: book?.id ?? null,
    }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
