// 见界选拔结果邮件的线上发送(admin/agent 机器通道 + 管理台「选拔」分区的发送按钮)。
// 渲染用共享纯逻辑 mail-templates.ts(与管理台预览同一份代码,所见即所发);
// 模板/签名从本域静态目录现取(public/mail-templates/,唯一事实来源)。
// 纪律:一人一封不群发——同收件人同模板已发过即 409(mail_already_sent),
// 显式 force 才重发,全部写管理审计。SMTP 凭据只在 CF secret,不进仓库。
import { env } from "cloudflare:workers";
import { guardWrite } from "../../_lib/route-guards";
import { database, jsonError } from "../../_lib/community";
import { auditAdminAction } from "../../_lib/admin";
import { MAIL_TEMPLATE_BRAND, mailTemplateMeta, renderMailTemplate } from "../../_lib/mail-templates";
import { sendSmtpMail } from "../../_lib/mail-send";

export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const guarded = await guardWrite(request, {
      member: "adminOrAgent",
      sameOrigin: true,
      // 发送是真出信:限流比其它写操作更狠,异常批量调用在边缘就拦下。
      rate: { bucket: "mail-send", limit: 30, windowSeconds: 60 * 60 },
    });
    if (guarded instanceof Response) return guarded;
    const actor = guarded.member;
    const input = await request.json().catch(() => ({})) as Record<string, unknown>;

    const to = typeof input.to === "string" ? input.to.trim().toLowerCase() : "";
    if (!EMAIL_PATTERN.test(to) || to.length > 120) {
      return Response.json({ error: "invalid_email" }, { status: 400 });
    }
    const meta = mailTemplateMeta(typeof input.template === "string" ? input.template : "");
    if (!meta) return Response.json({ error: "unknown_template" }, { status: 400 });

    const origin = new URL(request.url).origin;
    const [templateHtml, signature] = await Promise.all([
      fetch(`${origin}/mail-templates/${meta.id}`).then((response) => {
        if (!response.ok) throw new Error(`template_fetch_${response.status}`);
        return response.text();
      }),
      fetch(`${origin}/mail-templates/signature.json`)
        .then((response) => response.ok ? response.json() as Promise<Record<string, unknown>> : {})
        .catch(() => ({}) as Record<string, unknown>),
    ]);
    // 签名兜底在下、调用方值在上(同名覆盖),与 send.mjs 合并顺序一致;
    // 非字符串值一律丢弃,模板替换只吃字符串。
    const provided = (typeof input.values === "object" && input.values ? input.values : {}) as Record<string, unknown>;
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries({ ...signature, ...provided })) {
      if (typeof value === "string") values[key] = value;
    }

    let rendered: ReturnType<typeof renderMailTemplate>;
    try {
      rendered = renderMailTemplate(templateHtml, {
        values,
        subjectSuffix: typeof input.subjectSuffix === "string" ? input.subjectSuffix.slice(0, 40) : "",
        attach: typeof input.attachUrl === "string" && input.attachUrl.trim()
          ? { url: input.attachUrl.trim(), label: typeof input.attachLabel === "string" ? input.attachLabel.slice(0, 20) : undefined }
          : null,
        statusToken: typeof input.statusToken === "string" && input.statusToken.trim() ? input.statusToken.trim() : null,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "render_failed";
      return Response.json({ error: code }, { status: 400 });
    }
    if (rendered.missing.length && input.allowMissing !== true) {
      return Response.json({ error: "missing_placeholders", missing: rendered.missing }, { status: 400 });
    }

    // 一人一封:审计日志即发送台账(同收件人+同模板命中即拒,force 显式覆盖)。
    if (input.force !== true) {
      const sent = await database().prepare(
        `SELECT id FROM admin_audit_events WHERE action = 'mail.send' AND target_ref = ? AND detail = ? LIMIT 1`,
      ).bind(to, meta.id).first<{ id: string }>();
      if (sent) return Response.json({ error: "mail_already_sent" }, { status: 409 });
    }

    // dryRun:渲染+校验全走完但不连 SMTP(线上自查/验收探针用)。
    if (input.dryRun === true) {
      return Response.json({ ok: true, dryRun: true, to, subject: rendered.subject, htmlBytes: new TextEncoder().encode(rendered.html).length });
    }

    const secrets = env as unknown as Record<string, string | undefined>;
    const user = secrets.MAIL_USER;
    const pass = secrets.MAIL_PASS;
    const host = secrets.MAIL_HOST_SMTP;
    if (!user || !pass || !host) {
      return Response.json({ error: "mail_not_configured" }, { status: 503 });
    }
    let queued: string;
    try {
      queued = await sendSmtpMail({ host, port: 465, user, pass }, {
        to,
        subject: rendered.subject,
        html: rendered.html,
        fromName: MAIL_TEMPLATE_BRAND,
        messageId: `${meta.id.toLowerCase()}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      });
    } catch (error) {
      return Response.json({ error: "mail_send_failed", detail: String(error instanceof Error ? error.message : error).slice(0, 160) }, { status: 502 });
    }
    await auditAdminAction(actor.email, "mail.send", "recruit_mail", to, meta.id);

    // 候选人联动:带 candidateId 时发送成功即推进环节(模板元数据 nextStage),
    // 并把本次用的进度令牌回填到候选人档案(若尚未绑定)。
    let candidateStage: string | null = null;
    const candidateId = typeof input.candidateId === "string" ? input.candidateId.trim() : "";
    if (candidateId) {
      const statusToken = typeof input.statusToken === "string" && /^[a-f0-9]{32}$/.test(input.statusToken) ? input.statusToken : null;
      const updated = await database().prepare(
        `UPDATE recruit_candidates
         SET stage = ?, status_token = COALESCE(status_token, ?), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).bind(meta.nextStage, statusToken, candidateId).run();
      if ((updated.meta?.changes ?? 0) > 0) {
        candidateStage = meta.nextStage;
        await auditAdminAction(actor.email, "recruit_candidate.update", "recruit_candidate", candidateId, `mail:${meta.id}→${meta.nextStage}`);
      }
    }

    return Response.json({ ok: true, to, subject: rendered.subject, queued: queued.slice(0, 120), candidateStage });
  } catch (error) {
    return jsonError(error);
  }
}
