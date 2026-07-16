import { oauthCorsHeaders, oauthJsonError, publicTokenIdentity, requireBearer } from "../../_lib/oauth-provider";

export const dynamic = "force-dynamic";

async function userInfo(request: Request) {
  try {
    const identity = await requireBearer(request, ["openid"]);
    return Response.json(publicTokenIdentity(identity), { headers: oauthCorsHeaders() });
  } catch (error) {
    return oauthJsonError(error);
  }
}

export const GET = userInfo;
export const POST = userInfo;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthCorsHeaders() });
}
