import { requireMember } from "../../_lib/access-control";
import { assertSameOrigin } from "../../_lib/request-origin";
import { decideAuthorization, oauthJsonError } from "../../_lib/oauth-provider";

export const dynamic = "force-dynamic";

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 同意页的 CSP 是 form-action 'self'。浏览器把「表单提交后的重定向」也按 form-action 检查,
// 303 跳往客户端回调(第三方 https 或 MCP 客户端的 http://localhost)会被拦下:授权码已签发、
// 页面看似原地刷新,再点一次就提示授权请求失效(2026-10-12 生产实测 Claude Code 登录卡住)。
// 改为返回中转页,用 meta refresh 做普通导航(不受 form-action 约束),不放宽任何 CSP。
function returnToClient(target: string) {
  const href = escapeHtmlAttribute(target);
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0;url=${href}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>正在返回应用</title></head><body style="font-family:system-ui,sans-serif;padding:32px;line-height:1.6"><p>授权已处理，正在返回应用…</p><p><a href="${href}">如果没有自动跳转，请点这里</a></p></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", pragma: "no-cache" },
  });
}

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    // P3 修复:consent 批准端点补上与 payments approve 相同的 Origin 校验
    // (request_token 虽是 256 位随机且绑定会话,纵深防御应对齐资金端点标准)。
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const form = await request.formData();
    const target = await decideAuthorization(member.email, String(form.get("request_token") ?? ""), String(form.get("decision") ?? "deny"));
    return returnToClient(target);
  } catch (error) {
    return oauthJsonError(error);
  }
}
