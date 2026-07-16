import { oauthCorsHeaders, oauthJsonError, revokeOAuthToken } from "../../_lib/oauth-provider";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const params = new URLSearchParams(await request.text());
    await revokeOAuthToken(request, params);
    return new Response(null, { status: 200, headers: oauthCorsHeaders() });
  } catch (error) {
    return oauthJsonError(error);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthCorsHeaders() });
}
