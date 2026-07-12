import { env } from "cloudflare:workers";
import { optionalMember } from "../../_lib/community";

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  if (!/^[a-f0-9-]+(?:\.[a-zA-Z0-9]{1,8})?$/.test(key)) return new Response("Not found", { status: 404 });
  const bucket = (env as unknown as { UPLOADS?: R2Bucket }).UPLOADS;
  if (!bucket) return new Response("Unavailable", { status: 503 });
  const object = await bucket.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const visibility = object.customMetadata?.visibility;
  if (visibility !== "public") {
    const member = await optionalMember();
    if (!member || object.customMetadata?.owner !== member.email) {
      return new Response("Forbidden", { status: 403 });
    }
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", visibility === "public" ? "public, max-age=31536000, immutable" : "private, no-store");
  return new Response(object.body, { headers });
}
