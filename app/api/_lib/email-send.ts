import { env } from "cloudflare:workers";

// 验证码邮件外发传输层。三层解析,任何一层不可用都不得 fail-open 成"假装发出"
// ——验证码发不出去 = 该登录方式不可用,路由显式回 503(与 ai_not_configured 同语义)。
//
// 解析顺序:
// 1) EMAIL_SEND_BASE_URL + EMAIL_SEND_ACCOUNT_ID + EMAIL_SEND_API_TOKEN 三者齐备
//    → REST POST {base}/accounts/{account}/email/sending/send。生产不用这条路;
//    它是测试 harness 的假上游入口(见 tests 的 startFakeEmailUpstream,
//    与 AI_CHAT_BASE_URL 假上游同构,测试永不触达真实外发)。
// 2) Worker 声明了 send_email binding(名 EMAIL,wrangler.prod/staging.jsonc)
//    → binding.send()。生产路径,零新增 secret。
// 3) 两者皆无 → 功能惰性:sendEmail 回 { ok:false, code:"email_not_configured" },
//    路由转成 503。
//
// 发件地址固定 zaochang@aetherstudio.top:回复/退信由 Email Routing 的 catch-all
// 规则转发到运营邮箱,用户不会写进一个黑洞地址。

export const EMAIL_FROM = "zaochang@aetherstudio.top";

export const EMAIL_CODE_TTL_MINUTES = 10;

type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type SendEmailBinding = {
  send: (message: { to: string; from: string; subject: string; text: string; html: string }) => Promise<unknown>;
};

export type EmailSendResult = { ok: true } | { ok: false; code: string };

type WorkerEnv = Record<string, string | undefined> & { EMAIL?: SendEmailBinding };

function workerEnv(): WorkerEnv {
  return env as unknown as WorkerEnv;
}

function emailBinding(): SendEmailBinding | null {
  const binding = workerEnv().EMAIL;
  return binding && typeof binding.send === "function" ? binding : null;
}

export function emailSendConfigured(): boolean {
  const values = workerEnv();
  return Boolean(values.EMAIL_SEND_BASE_URL && values.EMAIL_SEND_ACCOUNT_ID && values.EMAIL_SEND_API_TOKEN)
    || emailBinding() !== null;
}

function restConfigured(values: WorkerEnv): values is WorkerEnv & { EMAIL_SEND_BASE_URL: string; EMAIL_SEND_ACCOUNT_ID: string; EMAIL_SEND_API_TOKEN: string } {
  return Boolean(values.EMAIL_SEND_BASE_URL && values.EMAIL_SEND_ACCOUNT_ID && values.EMAIL_SEND_API_TOKEN);
}

export async function sendEmail(message: OutgoingEmail): Promise<EmailSendResult> {
  const values = workerEnv();
  if (restConfigured(values)) {
    const base = values.EMAIL_SEND_BASE_URL.replace(/\/+$/, "");
    try {
      const response = await fetch(`${base}/accounts/${values.EMAIL_SEND_ACCOUNT_ID}/email/sending/send`, {
        method: "POST",
        headers: { authorization: `Bearer ${values.EMAIL_SEND_API_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return { ok: false, code: `email_send_http_${response.status}` };
      const result = await response.json().catch(() => null) as null | { success?: boolean };
      if (result && result.success === false) return { ok: false, code: "email_send_rejected" };
      return { ok: true };
    } catch {
      return { ok: false, code: "email_send_network_error" };
    }
  }

  const binding = emailBinding();
  if (binding) {
    try {
      await binding.send({ to: message.to, from: EMAIL_FROM, subject: message.subject, text: message.text, html: message.html });
      return { ok: true };
    } catch (error) {
      const code = (error as { code?: string })?.code;
      return { ok: false, code: typeof code === "string" && code ? code : "email_send_failed" };
    }
  }

  return { ok: false, code: "email_not_configured" };
}

// 验证码邮件正文。六位数字在 text/html 两版里同码出现;测试用 text 版的
// /(\d{6})/ 提取。措辞固定,不携带任何链接(纯验证码登录,无魔法链接面)。
export function verificationEmail(code: string, ttlMinutes: number): Omit<OutgoingEmail, "to"> {
  const subject = `造场登录验证码 ${code}`;
  const text = `你的造场登录验证码是 ${code},${ttlMinutes} 分钟内有效。\n若非本人操作,请忽略本邮件——没有验证码,任何人无法登录你的账号。\n—— 造场 zaochang@aetherstudio.top`;
  const html = [
    `<div style="margin:0;padding:24px;background:#f4f2ec;font-family:-apple-system,'Segoe UI',sans-serif;color:#171816;">`,
    `<div style="max-width:420px;margin:0 auto;background:#fffdf8;border:1px solid #c6c5bf;border-radius:8px;padding:28px 24px;">`,
    `<p style="margin:0 0 6px;font-size:13px;">你的造场登录验证码:</p>`,
    `<p style="margin:0 0 18px;font-size:30px;font-weight:700;letter-spacing:8px;font-family:ui-monospace,monospace;">${code}</p>`,
    `<p style="margin:0 0 4px;font-size:12px;color:#474943;">${ttlMinutes} 分钟内有效。若非本人操作,请忽略本邮件——没有验证码,任何人无法登录你的账号。</p>`,
    `<p style="margin:18px 0 0;font-size:10px;color:#92948d;">造场 · zaochang@aetherstudio.top</p>`,
    `</div></div>`,
  ].join("");
  return { subject, text, html };
}
