// 评审进度公开读侧(收件人侧):GET /email/status/<token> 状态页,
// GET /email/status/<token>.png 邮件内嵌的实时进度图。
// token 是 128bit 随机能力 URL:命中才返回,未命中一律 404(不泄露存在性)。
// 两路都 no-store:匿名边缘缓存若命中,收件人看到的就不是"当前"进度。
import { mailStatusSummary, MAIL_STATUS_TOKEN_PATTERN } from "../../../api/_lib/mail-status";
import { readMailStatus } from "../../../api/_lib/mail-status-store";
import { renderMailStatusPanelPng, MAIL_STATUS_PANEL } from "../../../api/_lib/status-panel-png";
import { escapeHtml } from "../../../api/_lib/html-escape";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

const FONT = `font-family:'PingFang SC','Microsoft YaHei','Hiragino Sans GB','Noto Sans CJK SC','Source Han Sans SC',Arial,sans-serif;`;

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
}

export async function GET(_request: Request, context: Ctx) {
  const { token: param } = await context.params;
  const raw = param ?? "";
  const asPng = raw.endsWith(".png");
  const token = asPng ? raw.slice(0, -4) : raw;
  if (!MAIL_STATUS_TOKEN_PATTERN.test(token)) return notFound();
  const record = await readMailStatus(token);
  if (!record) return notFound();

  if (asPng) {
    const png = await renderMailStatusPanelPng(record.state);
    return new Response(png, {
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }

  const state = record.state;
  const percent = typeof state.total === "number"
    ? Math.round((Math.min(state.done ?? 0, state.total) / state.total) * 100)
    : null;
  const rows: Array<[string, string]> = [];
  if (state.stage) rows.push(["当前阶段", state.stage]);
  if (typeof state.total === "number") {
    rows.push(["评审进度", `${Math.min(state.done ?? 0, state.total)} / ${state.total} 位评委`]);
  }
  if (state.eta) rows.push(["预计通知", `${state.eta} 前`]);
  const note = state.note ? `<p style="margin:18px 0 0;${FONT}font-size:14px;line-height:1.85;color:#241B10;">${escapeHtml(state.note)}</p>` : "";
  const detail = rows.map(([k, v]) =>
    `<tr><td width="96" valign="top" style="padding:8px 0;${FONT}font-size:13px;line-height:1.6;color:#6E6152;">${escapeHtml(k)}</td>`
    + `<td valign="top" style="padding:8px 0 8px 14px;${FONT}font-size:14px;line-height:1.6;color:#241B10;font-weight:bold;">${escapeHtml(v)}</td></tr>`,
  ).join("");
  const bar = percent === null ? "" :
    `<div style="margin:16px 0 4px;height:8px;border-radius:4px;background:#E4EAE6;overflow:hidden;">`
    + `<div style="height:100%;width:${Math.max(percent, 2)}%;background:#164E46;"></div></div>`;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>见界创赛选拔 · 评审进度</title>
</head>
<body style="margin:0;padding:0;background:#EFE8DA;">
<div style="max-width:520px;margin:0 auto;padding:24px 14px;">
<div style="background:#164E46;border-radius:12px 12px 0 0;padding:18px 26px;${FONT}font-size:15px;font-weight:bold;color:#FFFFFF;">见界创赛选拔 · 评审进度</div>
<div style="background:#FFFFFF;border:1px solid #E7E1D4;border-top:0;border-radius:0 0 12px 12px;padding:24px 26px 26px;">
<img src="/email/status/${token}.png" width="${MAIL_STATUS_PANEL.width / 2}" alt="${escapeHtml(mailStatusSummary(state))}" style="display:block;width:100%;max-width:460px;height:auto;border:0;">
${bar}
<p style="margin:14px 0 0;${FONT}font-size:16px;line-height:1.7;color:#241B10;font-weight:bold;">${escapeHtml(mailStatusSummary(state))}</p>
${detail ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 0;border-collapse:collapse;">${detail}</table>` : ""}
${note}
<p style="margin:22px 0 0;${FONT}font-size:12px;line-height:1.8;color:#92948d;">本页面随评审进度实时更新,刷新即可看到最新状态。结果确定后仍会以邮件正式通知你。</p>
</div>
</div>
</body>
</html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
