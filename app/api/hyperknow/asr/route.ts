import { requireMember } from "../../_lib/access-control";
import { jsonError } from "../../_lib/errors";
import { enforceRateLimit, rateLimitKey } from "../../_lib/rate-limit";
import { assertSameOrigin } from "../../_lib/request-origin";
import {
  HyperknowAsrError,
  isAllowedAsrMime,
  readAsrAudio,
  transcribeHyperknowAudio,
} from "../../_lib/hyperknow/asr";

export const dynamic = "force-dynamic";

function asrErrorResponse(error: HyperknowAsrError): Response {
  return Response.json({ error: error.code }, {
    status: error.status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    await enforceRateLimit(await rateLimitKey("hyperknow-asr", member.email), 30, 10 * 60);

    const contentType = request.headers.get("content-type") ?? "";
    if (!isAllowedAsrMime(contentType)) {
      return asrErrorResponse(new HyperknowAsrError("audio_type_unsupported", 415));
    }
    const audio = await readAsrAudio(request);
    const text = await transcribeHyperknowAudio(audio, contentType);
    return Response.json({ text }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof HyperknowAsrError) return asrErrorResponse(error);
    return jsonError(error);
  }
}
