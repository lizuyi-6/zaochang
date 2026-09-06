import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { listConversations } from "../../../_lib/hyperknow/store";

export const dynamic = "force-dynamic";

// 历史会话列表(原 routes/courses.js list_past_conversations 的 1:1 响应形状,
// 字段名 conversation_id/created_at/last_updated_at 与前端 App.tsx 历史视图对齐)。
// 原版按 user_id 过滤是死代码(从不写入 user_id),这里按登录成员真实隔离。
export async function GET() {
  try {
    const member = await requireMember();
    const conversations = await listConversations(member.email);
    return Response.json({
      conversations: conversations.map((conv) => ({
        conversation_id: conv.id,
        title: conv.title,
        created_at: conv.createdAt,
        last_updated_at: conv.updatedAt,
        starred: conv.starred,
        history: conv.history,
      })),
      pagination: { has_more: false, next_cursor: null },
    });
  } catch (error) {
    return jsonError(error);
  }
}
