// 飞书多维表格「新增记录」自动化 → 这里 → 给报名者发一封确认回执。
//
// 这是一条机器通道,没有浏览器同源可言:鉴权只认 x-aetherguard-token 头里的共享密钥
// (Worker secret AETHERGUARD_FORM_TOKEN),缺失或不等一律 401,不回显任何配置细节。
// 发信走腾讯企业邮 SMTP(wecom.work 域背后的实际投递主机 smtp.exmail.qq.com:465)。
// 凭据优先读 AETHERGUARD_MAIL_*,缺省才回落到项目通用的 MAIL_*——AetherGuard 的
// 发件箱是 AetherGuard@qiongyutech.com,不该和站点通知共用同一个账号配置。
// 幂等不由本路由负责——同一条记录重复触发会重复发信;飞书的 HTTP 节点默认只在
// 新增记录时触发一次,重试请在飞书侧观察执行日志,不要在这里静默去重(那会让
// 「重发回执」变成不可能)。
import { env } from "cloudflare:workers";
import { sendSmtpMail } from "../../_lib/mail-send";
import { jsonError } from "../../_lib/community";
import { enforceRateLimit, RateLimitError, requestActorKey } from "../../_lib/rate-limit";
import { normalizeAetherGuardSignup, renderAetherGuardReceipt, signupTokenMatches } from "../../_lib/aetherguard-signup";

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
    await enforceRateLimit(await requestActorKey(request, "aetherguard-signup"), 20, 60 * 60);

    const user = secrets.AETHERGUARD_MAIL_USER ?? secrets.MAIL_USER;
    const pass = secrets.AETHERGUARD_MAIL_PASS ?? secrets.MAIL_PASS;
    const host = secrets.AETHERGUARD_MAIL_HOST ?? secrets.MAIL_HOST_SMTP;
    if (!user || !pass || !host) {
      return Response.json({ error: "mail_not_configured" }, { status: 503 });
    }

    const receipt = renderAetherGuardReceipt(normalized.value);
    try {
      await sendSmtpMail({ host, port: 465, user, pass }, {
        to: normalized.value.email,
        subject: receipt.subject,
        html: receipt.html,
        fromName: FROM_NAME,
        messageId: `aetherguard-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      });
    } catch (error) {
      return Response.json(
        { error: "mail_send_failed", detail: String(error instanceof Error ? error.message : error).slice(0, 160) },
        { status: 502 },
      );
    }

    return Response.json({ ok: true, reference: normalized.value.recordId.slice(-8).toUpperCase() });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json({ error: error.code }, { status: error.status });
    }
    return jsonError(error);
  }
}