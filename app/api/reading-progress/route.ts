import { requireMember, type MemberIdentity } from "../_lib/access-control";
import { database, jsonError } from "../_lib/community";
import { canViewDoc, listAllDocs, type DocRow } from "../_lib/docs";

export const dynamic = "force-dynamic";

// fail-closed 校验:bookId 必须是一本对 member 可见的书(is_book=1),
// chapterId 必须可见、且位于 bookId 的子树内(含书根本身——封面页也算合法进度点)。
// 任一不满足返回 false。用全量 docs 在应用层判定祖先链,避免被诱导写入不可见或
// 不相关文档的进度(例如把 A 书的章节记到 B 书名下)。
async function validateProgressTarget(
  bookId: string,
  chapterId: string,
  member: MemberIdentity,
): Promise<boolean> {
  const all = await listAllDocs();
  const byId = new Map<string, DocRow>(all.map((row) => [row.id, row] as const));
  const book = byId.get(bookId);
  const chapter = byId.get(chapterId);
  if (!book || book.isBook !== 1 || !canViewDoc(book, member)) return false;
  if (!chapter || !canViewDoc(chapter, member)) return false;
  if (chapterId === bookId) return true;
  let cursor: DocRow | undefined = chapter;
  const seen = new Set<string>();
  while (cursor && cursor.parentId && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    const parent = byId.get(cursor.parentId);
    if (!parent) return false;
    if (parent.id === bookId) return true;
    cursor = parent;
  }
  return false;
}

// 上报阅读进度(upsert)。仅登录用户;匿名 requireMember 抛 401。
// paragraph 上限不在此处硬编码(以正文实际块数为准,由客户端按 data-pp 生成);
// 此处只 clamp 到非负整数,合法性完全由 chapterId 归属校验保证。
export async function POST(req: Request) {
  try {
    const member = await requireMember();
    const body = (await req.json().catch(() => ({}))) as { bookId?: string; chapterId?: string; paragraph?: number };
    const bookId = String(body.bookId ?? "");
    const chapterId = String(body.chapterId ?? "");
    const paragraph = Math.max(0, Math.floor(Number(body.paragraph) || 0));
    if (!bookId || !chapterId) return jsonError({ code: "missing_fields", status: 400 });
    const ok = await validateProgressTarget(bookId, chapterId, member);
    // fail-closed:校验失败一律 404,不区分"不存在/不可见/非该书章节",避免存在性泄露。
    if (!ok) return jsonError({ code: "target_not_found", status: 404 });
    await database()
      .prepare(
        `INSERT INTO reading_progress (user_email, book_id, last_chapter_id, last_paragraph, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_email, book_id) DO UPDATE SET
           last_chapter_id = excluded.last_chapter_id,
           last_paragraph = excluded.last_paragraph,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(member.email, bookId, chapterId, paragraph)
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

// 返回当前用户所有书的阅读进度(最近阅读列表),按 updated_at 倒序。
// JOIN docs 自动排除已删除的书;登录用户对其进度中所有书均可见
// (canViewDoc 对 member 非空恒真),故无需应用层再过滤。
export async function GET() {
  try {
    const member = await requireMember();
    const rows = (
      await database()
        .prepare(
          `SELECT rp.book_id AS bookId, rp.last_chapter_id AS lastChapterId,
                  rp.last_paragraph AS lastParagraph, rp.updated_at AS updatedAt,
                  b.slug AS bookSlug, b.title AS bookTitle,
                  b.cover_hue AS coverHue, b.cover_image AS coverImage,
                  c.slug AS chapterSlug, c.title AS chapterTitle
           FROM reading_progress rp
           JOIN docs b ON b.id = rp.book_id
           LEFT JOIN docs c ON c.id = rp.last_chapter_id
           WHERE rp.user_email = ?
           ORDER BY rp.updated_at DESC`,
        )
        .bind(member.email)
        .all()
    ).results;
    return Response.json({ progress: rows });
  } catch (error) {
    return jsonError(error);
  }
}
