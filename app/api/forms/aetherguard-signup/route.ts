// 飞书多维表格「新增记录」自动化 → 这里 → 报名落库 + 给报名者发一封确认回执。
//
// 这是一条机器通道,没有浏览器同源可言:鉴权只认 x-aetherguard-token 头里的共享密钥
// (Worker secret AETHERGUARD_FORM_TOKEN),缺失或不等一律 401,不回显任何配置细节。
// 发信走腾讯企业邮 SMTP(wecom.work 域背后的实际投递主机 smtp.exmail.qq.com:465)。
// 凭据优先读 AETHERGUARD_MAIL_*,缺省才回落到项目通用的 MAIL_*——AetherGuard 的
// 发件箱是 AetherGuard@qiongyutech.com,不该和站点通知共用同一个账号配置。
// 报名必须先落库(aetherguard_signups)再发信:笔试表单只收报名编号,这张表就是
// 笔试收件反查身份的数据源;SMTP 挂了也只丢一封邮件,不丢报名。
// 发信幂等不由本路由负责——同一条记录重复触发会重复发信;飞书的 HTTP 节点默认只在
// 新增记录时触发一次,重试请在飞书侧观察执行日志,不要在这里静默去重(那会让
// 「重发回执」变成不可能);落库本身按 record_id upsert,重复触发只更新不重复插。
import { env } from "cloudflare:workers";
import { database, jsonError } from "../../_lib/community";
import { sendRecruitMail } from "../../_lib/mail-rotation";
import { mailboxPool } from "../../_lib/mail-rotation-policy";
import { enforceRateLimit, RateLimitError, requestActorKey } from "../../_lib/rate-limit";
import {
  normalizeAetherGuardSignup,
  renderAetherGuardReceipt,
  signupReference,
  signupTokenMatches,
} from "../../_lib/aetherguard-signup";

export const dynamic = "force-dynamic";

const TOKEN_HEADER = "x-aetherguard-token";
const FROM_NAME = "AetherGuard 项目组";

export async function POST(request: Request) {
  try {
    const input = await request.json().catch(() => ({})) as Record<string, unknown>;

    // 先验密钥再解析业务字段:未授权调用不该拿到任何字段级错误反馈。
    const secrets = env as unknown as Record<string, string | undefined>;
    if (!(await signupTokenMatches(request.headers.get(TOKEN_HEADER), secrets.AETHERGUARD_FORM_TOKEN))) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const normalized = normalizeAetherGuardSignup(input);
    if (!normalized.ok) return Response.json({ error: normalized.error }, { status: 400 });

    // 一条报名只该对应一封回执;限流按来源 IP 计数,防止表单被脚本刷成发信器。
    // 上限放到 120/h:飞书自动化的出网 IP 是共享的,一次宣讲会/集中提交很容易冲过
    // 20 条,超额会让后面的报名直接 429——连库都不落,回执更没机会发。
    await enforceRateLimit(await requestActorKey(request, "aetherguard-signup"), 120, 60 * 60);

    if (!mailboxPool(secrets).length) {
      return Response.json({ error: "mail_not_configured" }, { status: 503 });
    }

    const value = normalized.value;
    // reference 是笔试表单关联身份的唯一键,必须与回执里展示的编号同源同形。
    const reference = signupReference(value.recordId);

    // 先落库再发信:发信失败(502)时报名仍在,回执可以人工补发,数据不丢。
    await database()
      .prepare(
        `INSERT INTO aetherguard_signups (
           id, record_id, reference, name, email, grade, major, student_id, phone, submitted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(record_id) DO UPDATE SET
           reference = excluded.reference,
           name = excluded.name,
           email = excluded.email,
           grade = excluded.grade,
           major = excluded.major,
           student_id = excluded.student_id,
           phone = excluded.phone,
           submitted_at = excluded.submitted_at,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        crypto.randomUUID(),
        value.recordId,
        reference,
        value.name,
        value.email,
        value.grade,
        value.major,
        value.studentId,
        value.phone,
        new Date().toISOString(),
      )
      .run();

    const receipt = renderAetherGuardReceipt(value);
    // 走轮换池:品牌发件箱被风控时自动落到通用发件箱,每次尝试都留痕。
    const delivery = await sendRecruitMail({
      kind: "signup_receipt",
      reference,
      to: value.email,
      subject: receipt.subject,
      html: receipt.html,
      fromName: FROM_NAME,
      messageIdPrefix: "aetherguard",
    });
    if (!delivery.sent) {
      return Response.json(
        {
          error: "mail_send_failed",
          detail: delivery.failure ? `${delivery.failure.kind}:${delivery.failure.code}` : "no_mailbox_available",
          attempts: delivery.attempts,
        },
        { status: 502 },
      );
    }

    return Response.json({ ok: true, reference, mailbox: delivery.mailbox });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json({ error: error.code }, { status: error.status });
    }
    return jsonError(error);
  }
}
