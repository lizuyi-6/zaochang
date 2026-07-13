import { exchangeToken, oauthCorsHeaders, oauthJsonError } from "../../_lib/oauth-provider";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const params = new URLSearchParams(await request.text());
    const payload = await exchangeToken(request, params);
    return Response.json(payload, { headers: { ...oauthCorsHeaders(), pragma: "no-cache" } });
  } catch (error) {
    return oauthJsonError(error);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthCorsHeaders() });
}
