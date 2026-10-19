// 见界选拔结果邮件的 SMTP 发送(腾讯企业邮 smtp.exmail.qq.com:465,TLS 直连)。
// 只跑在 Workers 上(cloudflare:sockets);正文渲染在 mail-templates.ts(纯逻辑),
// 这里只负责把渲染好的 HTML 投递出去。协议状态机与 tmp/mail/send.mjs 同款:
// AUTH LOGIN 两行凭据、base64  chunked 76 正文、续行(250-)读到「数字码+空格」末行。
// 错误只回服务器应答文本,不含凭据。
import { connect } from "cloudflare:sockets";

export type SmtpCredentials = { host: string; port: number; user: string; pass: string };

function b64encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

const b64Text = (text: string) => b64encode(new TextEncoder().encode(text));

export async function sendSmtpMail(credentials: SmtpCredentials, message: {
  to: string;
  subject: string;
  html: string;
  fromName: string;
  messageId: string;
  timeoutMs?: number;
}): Promise<string> {
  const timeoutMs = message.timeoutMs ?? 25_000;
  const socket = connect(`${credentials.host}:${credentials.port}`, { secureTransport: "on" });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  const session = (async (): Promise<string> => {
    const nextLine = async (): Promise<string> => {
      for (;;) {
        const at = buffer.indexOf("\r\n");
        if (at >= 0) {
          const line = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          return line;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error("smtp_eof");
        buffer += decoder.decode(value, { stream: true });
      }
    };
    const readReply = async (): Promise<{ code: string; text: string }> => {
      const lines: string[] = [];
      for (;;) {
        const line = await nextLine();
        lines.push(line);
        if (/^\d{3} /.test(line)) break;
      }
      return { code: lines[lines.length - 1].slice(0, 3), text: lines.join(" | ") };
    };
    // label 只用于报错定位(凭据行绝不把命令文本写进错误)。
    const cmd = async (command: string | null, expect: string, label: string): Promise<string> => {
      if (command !== null) await writer.write(encoder.encode(command + "\r\n"));
      const reply = await readReply();
      if (!reply.code.startsWith(expect)) {
        throw new Error(`smtp_${label}_${reply.code}: ${reply.text.slice(0, 120)}`);
      }
      return reply.text;
    };

    await cmd(null, "220", "banner");
    await cmd("EHLO zaochang-admin", "250", "ehlo");
    await cmd("AUTH LOGIN", "334", "auth");
    await cmd(btoa(credentials.user), "334", "auth_user");
    await cmd(btoa(credentials.pass), "235", "auth_pass");
    await cmd(`MAIL FROM:<${credentials.user}>`, "250", "mail_from");
    await cmd(`RCPT TO:<${message.to}>`, "250", "rcpt_to");
    await cmd("DATA", "354", "data");
    const bodyB64 = b64Text(message.html).replace(/(.{76})/g, "$1\r\n");
    const wire = [
      `From: =?utf-8?B?${b64Text(message.fromName)}?= <${credentials.user}>`,
      `To: <${message.to}>`,
      `Subject: =?utf-8?B?${b64Text(message.subject)}?=`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${message.messageId}@qiongyutech.com>`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      bodyB64,
      "",
      ".",
    ].join("\r\n");
    await writer.write(encoder.encode(wire + "\r\n"));
    const queued = await cmd(null, "250", "queued");
    await cmd("QUIT", "221").catch(() => "");
    return queued;
  })();

  try {
    return await Promise.race([
      session,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("smtp_timeout")), timeoutMs)),
    ]);
  } finally {
    try { writer.releaseLock(); } catch { /* 已释放 */ }
    try { reader.releaseLock(); } catch { /* 已释放 */ }
    await socket.close().catch(() => {});
  }
}
