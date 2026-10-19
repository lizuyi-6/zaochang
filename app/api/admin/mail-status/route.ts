// 评审进度状态的新建/局部更新(admin/agent 机器通道)。
// 运营每得到一次评委进度就调用一次(CLI: tmp/mail/status.mjs set <token> --done 4),
// 已发出的邮件里嵌的进度图与状态页链接随即反映新值——这是"实时更新"的写入侧。
// 合并语义:只带改动字段,未带的保持原值;字符串传空串 = 清除该字段。
import { guardWrite } from "../../_lib/route-guards";
import { MAIL_STATUS_TOKEN_PATTERN } from "../../_lib/mail-status";
import { upsertMailStatus } from "../../_lib/mail-status-store";
import { auditAdminAction } from "../../_lib/admin";
import { jsonError } from "../../_lib/community";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const guarded = await guardWrite(request, {
      member: "adminOrAgent",
      sameOrigin: true,
      rate: { bucket: "mail-status-write", limit: 120, windowSeconds: 60 * 60 },
    });
    if (guarded instanceof Response) return guarded;
    const actor = guarded.member;
    const input = await request.json().catch(() => ({})) as Record<string, unknown>;
    const token = typeof input.token === "string" ? input.token.trim() : undefined;
    if (token && !MAIL_STATUS_TOKEN_PATTERN.test(token)) {
      return Response.json({ error: "invalid_token" }, { status: 400 });
    }
    // patch = 顶层字段本身(token/label 之外),也接受显式 state 对象。
    const patch = input.state !== undefined
      ? input.state
      : Object.fromEntries(Object.entries(input).filter(([key]) => key !== "token" && key !== "label"));
    const record = await upsertMailStatus({
      token,
      label: typeof input.label === "string" ? input.label : undefined,
      patch,
      actorEmail: actor.email,
    });
    await auditAdminAction(actor.email, "mail_status.upsert", "mail_status", record.token, record.label);
    const origin = new URL(request.url).origin;
    return Response.json({
      token: record.token,
      label: record.label,
      state: record.state,
      pageUrl: `${origin}/email/status/${record.token}`,
      pngUrl: `${origin}/email/status/${record.token}.png`,
    });
  } catch (error) {
    return jsonError(error);
  }
}
