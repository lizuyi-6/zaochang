// 见界创赛选拔邮件模板:目录、占位符抽取与渲染(纯逻辑,无 cloudflare/D1 依赖)。
// 渲染语义与发送器 tmp/mail/send.mjs 严格对齐——管理台预览的 HTML 必须就是
// 收件人收到的 HTML:占位符裸替换(不转义,与 send.mjs 的 split/join 一致)、
// 附件按钮注入同一锚点、E8 状态块同一替换/摘除规则。差异以 tests/mail-templates.test.mjs 守住。
//
// 模板文件在 public/mail-templates/E0..E8.html(唯一事实来源,修改走 git);
// 网页端经静态路径读取,发送器经文件系统读取,两边读的是同一份文件。

export const MAIL_TEMPLATE_BRAND = "见界创赛选拔"; // 出现在【】里但不是占位符

export type MailTemplateMeta = {
  id: string;
  name: string;
  subject: string; // 含品牌前缀,与模板 <title> 一致(测试对照真实文件守住)
  scenario: string;
  // 发出这封邮件后候选人应处的环节(管理台「标记已发送」按它推进 recruit_candidates.stage)。
  nextStage: "applied" | "homework" | "group" | "final" | "admitted" | "rejected";
  hasStatusBlock: boolean;
};

export const MAIL_TEMPLATE_CATALOG: readonly MailTemplateMeta[] = [
  { id: "E0", name: "作业已收到", subject: "【见界创赛选拔】作业已收到", scenario: "收到作业后的确认回执", nextStage: "homework", hasStatusBlock: false },
  { id: "E1", name: "作业通过 · 邀进群面", subject: "【见界创赛选拔】作业评审结果通知", scenario: "作业评审通过,通知群面安排", nextStage: "group", hasStatusBlock: false },
  { id: "E2", name: "作业待定 · 递补名单", subject: "【见界创赛选拔】作业评审结果通知", scenario: "暂未通过但进入递补名单,告知递补截止日期", nextStage: "homework", hasStatusBlock: false },
  { id: "E3", name: "作业未通过 · 人才库", subject: "【见界创赛选拔】作业评审结果通知", scenario: "作业未通过,邀请加入人才库", nextStage: "rejected", hasStatusBlock: false },
  { id: "E4", name: "群面通过 · 邀进终面", subject: "【见界创赛选拔】群面结果通知", scenario: "群面通过,通知终面安排", nextStage: "final", hasStatusBlock: false },
  { id: "E5", name: "群面未通过 · 人才库", subject: "【见界创赛选拔】群面结果通知", scenario: "群面未进入终面,邀请加入人才库", nextStage: "rejected", hasStatusBlock: false },
  { id: "E6", name: "录取通知", subject: "【见界创赛选拔】录取通知", scenario: "终面通过,发录取与入群安排", nextStage: "admitted", hasStatusBlock: false },
  { id: "E7", name: "终面未录取 · 人才库", subject: "【见界创赛选拔】终面结果通知", scenario: "终面未录取,邀请加入人才库", nextStage: "rejected", hasStatusBlock: false },
  { id: "E8", name: "作业评审进行中", subject: "【见界创赛选拔】作业评审进行中", scenario: "评审期间安抚邮件,可嵌实时进度块(配进度令牌)", nextStage: "homework", hasStatusBlock: true },
] as const;

export function mailTemplateMeta(id: string): MailTemplateMeta | null {
  return MAIL_TEMPLATE_CATALOG.find((meta) => meta.id === id) ?? null;
}

// 按出现顺序抽取【占位符】,去重;品牌文字与 {{handlebars}} 都不是占位符。
export function extractMailTemplatePlaceholders(html: string): string[] {
  const keys: string[] = [];
  for (const match of html.matchAll(/【([^】]+)】/g)) {
    const key = match[1];
    if (key !== MAIL_TEMPLATE_BRAND && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

// 未填占位符 = 模板里有但 values 没提供的键(品牌除外)。与 send.mjs 的拦发条件一致。
export function missingMailTemplatePlaceholders(html: string, values: Record<string, string>): string[] {
  return extractMailTemplatePlaceholders(html).filter((key) => !(key in values));
}

// 签名行锚点:8 个模板各恰好出现一次,send.mjs 注入附件按钮前硬性校验。
export const MAIL_SIGNATURE_ANCHOR = '<tr><td class="jj-px" style="padding:4px 40px 32px 40px;">';

const MAIL_FONT = "font-family:'PingFang SC','Microsoft YaHei','Hiragino Sans GB','Noto Sans CJK SC','Source Han Sans SC',Arial,sans-serif;";

export type MailRenderOptions = {
  values: Record<string, string>; // 调用方已并入签名兜底值(同名以调用方为准)
  subjectSuffix?: string; // 追加在主题后(如「(试发)」)
  subjectOverride?: string; // 整题覆盖
  attach?: { url: string; label?: string } | null; // 注入下载按钮(签名区上方)
  // E8 状态块:有块且 status 为空 → 整块摘除(send.mjs 不带 --status-token 的行为);
  // 给了 token → {{statusImg}}/{{statusUrl}} 换成真实链接。
  statusToken?: string | null;
  statusBaseUrl?: string; // 默认 https://aetherstudio.top
};

export type MailRenderResult = {
  html: string;
  subject: string;
  missing: string[]; // 仍未填的占位符(send.mjs 遇此拒发,除非 --allow-missing)
};

export function renderMailTemplate(templateHtml: string, options: MailRenderOptions): MailRenderResult {
  let body = templateHtml;
  for (const [key, value] of Object.entries(options.values)) {
    body = body.split(`【${key}】`).join(value);
  }
  // 替换后统计剩余占位符(与 send.mjs 拦发口径一致:结果里剩下的、且不在 values 里的键)。
  const missing = extractMailTemplatePlaceholders(body).filter((key) => !(key in options.values));

  const attach = options.attach ?? null;
  if (attach?.url) {
    let host = "";
    try { host = new URL(attach.url).host; } catch { host = ""; }
    if (!attach.url.startsWith("https://") || (host !== "aetherstudio.top" && host !== "www.aetherstudio.top")) {
      throw new Error("attach_url_not_aetherstudio");
    }
    const label = attach.label?.trim() || "下载回执 PDF";
    const hits = body.split(MAIL_SIGNATURE_ANCHOR).length - 1;
    if (hits !== 1) throw new Error(`attach_anchor_mismatch:${hits}`);
    const buttonRow = [
      `<tr><td class="jj-px" style="padding:0 40px;">`,
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:20px 0 24px 0;">`,
      `<a href="${attach.url}" style="display:inline-block;background:#164E46;color:#FFFFFF;${MAIL_FONT}font-size:15px;font-weight:bold;line-height:1;text-decoration:none;border-radius:8px;padding:14px 34px;">${label}</a>`,
      `</td></tr><tr><td align="center" style="padding:0 0 4px 0;${MAIL_FONT}font-size:11px;line-height:1.6;color:#92948d;word-break:break-all;">链接打不开时可复制到浏览器打开:<br>${attach.url}</td></tr></table>`,
      `</td></tr>`,
    ].join("");
    body = body.replace(MAIL_SIGNATURE_ANCHOR, `${buttonRow}${MAIL_SIGNATURE_ANCHOR}`);
  }

  if (body.includes("<!--STATUS-BLOCK-START-->")) {
    const block = /<!--STATUS-BLOCK-START-->[\s\S]*?<!--STATUS-BLOCK-END-->/.exec(body);
    if (!block) throw new Error("status_block_malformed");
    if (!options.statusToken) {
      body = body.replace(block[0], "");
    } else {
      if (!/^[a-f0-9]{32}$/.test(options.statusToken)) throw new Error("invalid_status_token");
      const base = options.statusBaseUrl ?? "https://aetherstudio.top";
      const inner = block[0]
        .replace("<!--STATUS-BLOCK-START-->", "")
        .replace("<!--STATUS-BLOCK-END-->", "")
        .replace(/\{\{statusImg\}\}/g, `${base}/email/status/${options.statusToken}.png`)
        .replace(/\{\{statusUrl\}\}/g, `${base}/email/status/${options.statusToken}`);
      if (inner.includes("{{status")) throw new Error("status_block_unreplaced");
      body = body.replace(block[0], inner);
    }
  }

  const title = templateHtml.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
  const subject = options.subjectOverride?.trim() || (title + (options.subjectSuffix ?? ""));
  return { html: body, subject, missing };
}
