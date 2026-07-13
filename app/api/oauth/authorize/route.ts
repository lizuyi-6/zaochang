import { requireMember } from "../../_lib/community";
import { decideAuthorization, oauthJsonError } from "../../_lib/oauth-provider";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const form = await request.formData();
    const target = await decideAuthorization(member.email, String(form.get("request_token") ?? ""), String(form.get("decision") ?? "deny"));
    return Response.redirect(target, 303);
  } catch (error) {
    return oauthJsonError(error);
  }
}
