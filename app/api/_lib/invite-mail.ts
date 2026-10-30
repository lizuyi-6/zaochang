// 造场账户邀请码邮件模板(纯逻辑,零 import:Node 测试与管理台预览直接引用同一份)。
// 管理台预览即线上所发:预览只把邀请码换成占位码,其余渲染路径完全一致。
// 纪律:
// - 邀请码只出现在邮件正文里;注册链接不带码(邀请码不得进 URL/访问日志,
//   与 GitHub start 只收 POST 的纪律一致)。
// - 称呼来自申请人自填,进 HTML 前必须转义;邮箱/链接同样转义,不信任任何入参。
// - 发件人固定 zaochang@aetherstudio.top(email-send.ts),回信由 Email Routing 转运营邮箱。

export type InvitationEmailInput = {
  name: string;
  email: string;
  code: string;
  expiresAt: string; // invitation_codes.expires_at,UTC "YYYY-MM-DD HH:MM:SS"
  signinUrl: string; // 形如 https://aetherstudio.top/signin
};

export type InvitationEmail = { subject: string; text: string; html: string };

// 预览占位码:格式与真码同形(ZC- + 16 位),但含真码字母表之外的 0/O/1/I,永远不可能是一张真码。
export const INVITATION_PREVIEW_CODE = "ZC-0000OOOO1111IIII";

export const INVITATION_EMAIL_SUBJECT = "你的造场账户申请已通过 · 邀请码";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

// UTC 台账时间 → 北京时间展示("2026-11-13 10:30:00" → "2026年11月13日 18:30")。
// 解析失败原样返回,不抛错——到期时间只是展示,真正的到期判定在 invitation_codes。
export function formatBeijingTime(utc: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(utc.trim());
  if (!match) return utc;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)) + 8 * 60 * 60 * 1000);
  if (Number.isNaN(date.getTime())) return utc;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日 ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

const FONT = "font-family:-apple-system,'PingFang SC','Microsoft YaHei','Segoe UI',Arial,sans-serif;";
const MONO = "font-family:ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace;";

export function invitationEmail(input: InvitationEmailInput): InvitationEmail {
  const name = input.name.trim() || "你好";
  const expires = `${formatBeijingTime(input.expiresAt)}（北京时间）`;
  const subject = INVITATION_EMAIL_SUBJECT;

  const text = [
    `${name}：`,
    "",
    "你申请的造场账户已通过审核。这是只属于你的邀请码（仅可使用一次）：",
    "",
    `    ${input.code}`,
    "",
    `有效期至 ${expires}。`,
    "",
    "怎么注册：",
    `1. 打开造场登录页 ${input.signinUrl}`,
    `2. 在「邮箱验证码」一栏填写本邮箱 ${input.email} 和上面的邀请码，点「发送验证码」，把收到的 6 位验证码填回去即完成注册；`,
    "   也可以在「首次注册（GitHub）」处填写邀请码，用 GitHub 账号注册。",
    "3. 注册成功后邀请码立即失效，之后直接登录即可，不再需要邀请码。",
    "",
    "邀请码只发给你本人，请不要转发或公开。如果这不是你本人的申请，忽略这封邮件即可。",
    "",
    "—— 造场 zaochang@aetherstudio.top",
  ].join("\n");

  const html = [
    `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head>`,
    `<body style="margin:0;padding:0;background:#f4f2ec;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f2ec;"><tr><td align="center" style="padding:28px 14px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#fffdf8;border:1px solid #c6c5bf;">`,
    `<tr><td style="background:#101416;padding:18px 28px;${FONT}color:#f4f1ea;font-size:17px;font-weight:900;letter-spacing:1px;">造场<span style="${MONO}color:#8c9691;font-size:10px;font-weight:400;letter-spacing:1px;margin-left:10px;">ZAOCHANG / INVITE</span></td></tr>`,
    `<tr><td style="padding:30px 28px 6px 28px;${FONT}color:#171816;">`,
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;">${escape(name)}：</p>`,
    `<p style="margin:0 0 20px 0;font-size:14px;line-height:1.8;color:#3a3c37;">你申请的造场账户已通过审核。这是只属于你的邀请码（仅可使用一次）：</p>`,
    `</td></tr>`,
    `<tr><td style="padding:0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background:#f4f1ea;border:1px dashed #b8b6ad;padding:18px 8px;${MONO}font-size:18px;font-weight:700;letter-spacing:0.5px;color:#101416;white-space:nowrap;">${escape(input.code)}</td></tr></table></td></tr>`,
    `<tr><td style="padding:10px 28px 0 28px;${FONT}font-size:12px;line-height:1.7;color:#73766f;">有效期至 ${escape(expires)}</td></tr>`,
    `<tr><td style="padding:22px 28px 0 28px;${FONT}color:#171816;">`,
    `<p style="margin:0 0 8px 0;font-size:14px;font-weight:700;">怎么注册</p>`,
    `<ol style="margin:0;padding:0 0 0 20px;font-size:13px;line-height:1.9;color:#3a3c37;">`,
    `<li>打开造场登录页（下方按钮）。</li>`,
    `<li>在「邮箱验证码」一栏填写本邮箱 <strong>${escape(input.email)}</strong> 和上面的邀请码，点「发送验证码」，把收到的 6 位验证码填回去即完成注册；也可以在「首次注册（GitHub）」处填写邀请码，用 GitHub 账号注册。</li>`,
    `<li>注册成功后邀请码立即失效，之后直接登录即可，不再需要邀请码。</li>`,
    `</ol></td></tr>`,
    `<tr><td align="center" style="padding:26px 28px 6px 28px;"><a href="${escape(input.signinUrl)}" style="display:inline-block;background:#101416;color:#f4f1ea;${FONT}font-size:14px;font-weight:700;line-height:1;text-decoration:none;padding:14px 34px;">前往造场注册</a></td></tr>`,
    `<tr><td align="center" style="padding:6px 28px 0 28px;${FONT}font-size:11px;line-height:1.6;color:#92948d;word-break:break-all;">按钮打不开时，复制到浏览器打开：${escape(input.signinUrl)}</td></tr>`,
    `<tr><td style="padding:24px 28px 26px 28px;${FONT}font-size:11px;line-height:1.7;color:#92948d;border-top:1px solid #e4e2db;">邀请码只发给你本人，请不要转发或公开。如果这不是你本人的申请，忽略这封邮件即可。<br>造场 · zaochang@aetherstudio.top</td></tr>`,
    `</table></td></tr></table></body></html>`,
  ].join("");

  return { subject, text, html };
}
