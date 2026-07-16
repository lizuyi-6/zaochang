import { oauthJsonError, providerJwks } from "../../_lib/oauth-provider";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await providerJwks(), { headers: { "cache-control": "public, max-age=300" } });
  } catch (error) {
    return oauthJsonError(error);
  }
}
