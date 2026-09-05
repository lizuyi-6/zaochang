import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { enforceRateLimit, rateLimitKey } from "../../../_lib/rate-limit";
import { synthesize } from "../../../_lib/hyperknow/tts";
import { HyperknowNotConfiguredError, HyperknowUpstreamError } from "../../../_lib/hyperknow/llm";

export const dynamic = "force-dynamic";

// 实时音频流分发端点(原 routes/tts.js /stream)。GET 由 <audio>/<Audio> 元素直接
// 拉流,同源 Cookie 随请求携带,requireMember 天然生效;白板每步旁白与试听都会
// 调用,限流放宽到 120/h。缓存语义经 X-Cache 头暴露(HIT-MEMORY/HIT-R2/MISS)。
// 未命中时整段合成后返回(与原版逐块 pipe 的差异见 tts.ts 模块注释)。
export async function GET(request: Request) {
  try {
    const member = await requireMember();
    const url = new URL(request.url);
    const text = url.searchParams.get("text") || "欢迎体验 Hyperknow 智能教学系统。";
    const voice = url.searchParams.get("voice") || "warm";
    const speed = Number.parseFloat(url.searchParams.get("speed") || "1.0") || 1.0;

    await enforceRateLimit(await rateLimitKey("hyperknow-tts", member.email), 120, 60 * 60);

    let result;
    try {
      result = await synthesize(text, voice, speed);
    } catch (error) {
      if (error instanceof HyperknowNotConfiguredError) {
        return Response.json({ error: error.code }, { status: error.status });
      }
      if (error instanceof HyperknowUpstreamError) {
        return Response.json({ error: error.code }, { status: error.status });
      }
      throw error;
    }
    return new Response(result.audio, {
      headers: {
        "content-type": "audio/mpeg",
        "x-cache": result.cache,
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
