import { requireMember } from "../../_lib/access-control";
import { assertSameOrigin } from "../../_lib/request-origin";
import { decideAuthorization, oauthJsonError } from "../../_lib/oauth-provider";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    // P3 修复:consent 批准端点补上与 payments approve 相同的 Origin 校验
    // (request_token 虽是 256 位随机且绑定会话,纵深防御应对齐资金端点标准)。
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const form = await request.formData();
    const target = await decideAuthorization(member.email, String(form.get("request_token") ?? ""), String(form.get("decision") ?? "deny"));
    return Response.redirect(target, 303);
  } catch (error) {
    return oauthJsonError(error);
  }
}
