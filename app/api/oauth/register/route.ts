import { OAuthProviderError, registerDynamicOAuthClient } from "../../_lib/oauth-provider";
import { enforceRateLimit, RateLimitError, requestActorKey } from "../../_lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_REGISTRATION_BYTES = 16 * 1024;
const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "cache-control": "no-store",
};

function registrationError(error: unknown) {
  const providerError = error instanceof OAuthProviderError ? error : null;
  const code = providerError?.code ?? (error instanceof RateLimitError ? error.code : "server_error");
  const status = providerError?.status ?? (error instanceof RateLimitError ? error.status : 500);
  const description = providerError?.description;
  return Response.json({ error: code, ...(description ? { error_description: description } : {}) }, {
    status,
    headers: corsHeaders,
  });
}

async function readRegistrationBody(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new OAuthProviderError("invalid_client_metadata", 400, "请求必须使用 application/json。");
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_REGISTRATION_BYTES) {
    throw new OAuthProviderError("invalid_client_metadata", 400, "注册请求不能超过 16 KiB。");
  }
  if (!request.body) throw new OAuthProviderError("invalid_client_metadata", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REGISTRATION_BYTES) {
        await reader.cancel();
        throw new OAuthProviderError("invalid_client_metadata", 400, "注册请求不能超过 16 KiB。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch {
    throw new OAuthProviderError("invalid_client_metadata", 400, "JSON 格式无效。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new OAuthProviderError("invalid_client_metadata", 400, "注册请求必须是 JSON 对象。");
  }
  return parsed as Record<string, unknown>;
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    await enforceRateLimit(await requestActorKey(request, "oauth-register"), 10, 60 * 60);
    const input = await readRegistrationBody(request);
    const client = await registerDynamicOAuthClient(input);
    return Response.json(client, { status: 201, headers: corsHeaders });
  } catch (error) {
    return registrationError(error);
  }
}
