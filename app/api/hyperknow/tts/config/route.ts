import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { VOICE_CATALOG, TTS_SPEEDS, getVoiceToneId } from "../../../_lib/hyperknow/tts";

export const dynamic = "force-dynamic";

// 官方 6 大预设音色配置(原 routes/tts.js /config 的 1:1 响应形状)。
export async function GET() {
  try {
    await requireMember();
    return Response.json({
      availableVoices: VOICE_CATALOG.map((voice) => ({
        id: voice.id,
        label: voice.label,
        toneId: getVoiceToneId(voice.id),
        color: voice.color,
        desc: voice.desc,
      })),
      speeds: TTS_SPEEDS,
    });
  } catch (error) {
    return jsonError(error);
  }
}
