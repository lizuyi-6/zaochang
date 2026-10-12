import { requireMember } from "../_lib/access-control";
import { accessError } from "../_lib/errors";
import { jsonError } from "../_lib/community";
import { enforceRateLimit, rateLimitKey } from "../_lib/rate-limit";
import { createUserApiKeyRecord, listUserApiKeys, revokeUserApiKey } from "../_lib/user-api-key";
import { assertSameOrigin } from "../_lib/request-origin";

async function requireCookieSession() {
  const member = await requireMember();
  if (member.authVia !== "session") throw accessError("cookie_session_required", 403);
  return member;
}

export async function GET() {
  try {
    const member = await requireCookieSession();
    return Response.json({ keys: await listUserApiKeys(member.email) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const member = await requireCookieSession();
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    await enforceRateLimit(await rateLimitKey("create-api-key", member.email), 10, 60 * 60);
    let body: Record<string, unknown>;
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json");
      body = parsed as Record<string, unknown>;
    } catch {
      throw accessError("invalid_json", 400);
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const expiresInDays = body.expires_in_days;
    if (!name || name.length > 60) throw accessError("invalid_api_key_name", 400);
    if (expiresInDays !== 30 && expiresInDays !== 90 && expiresInDays !== 365) {
      throw accessError("invalid_api_key_expiry", 400);
    }
    const created = await createUserApiKeyRecord({
      memberEmail: member.email,
      name,
      expiresInDays,
    });
    return Response.json(created, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const member = await requireCookieSession();
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    let body: Record<string, unknown>;
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json");
      body = parsed as Record<string, unknown>;
    } catch {
      throw accessError("invalid_json", 400);
    }
    const id = typeof body.id === "string" ? body.id : "";
    if (!id || id.length > 80) throw accessError("invalid_api_key_id", 400);
    if (!await revokeUserApiKey(member.email, id)) throw accessError("api_key_not_found", 404);
    return Response.json({ revoked: true, id }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
