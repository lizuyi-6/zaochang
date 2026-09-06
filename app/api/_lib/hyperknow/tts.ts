import { env } from "cloudflare:workers";
import { HyperknowUpstreamError } from "./llm";
import { resolveConfigOrThrow } from "./config";
import { sanitizeTtsText, ttsCacheKey } from "./protocol";

// StepFun 语音合成引擎 + Hyperknow 官方 6 大原声克隆音色(从原 ttsService.js 移植)。
// 缓存两级:per-isolate 内存 Map → R2 UPLOADS 桶 tts-cache/ 前缀(替代原磁盘
// data/audio_cache/)。与原版的差异(如实记录):
// - 未命中时整段合成后返回(不再逐块 pipe):Workers 无 waitUntil 挂靠点时后台
//   回填不可靠,而 ≤500 字的短文本整段延迟即首次合成延迟,命中后毫秒级不变;
// - 原版"启动预热 6 音色"改为惰性首次合成(Workers 无常驻启动钩子);
// - md5 换 SHA-256(寻址 key,不影响语义);
// - 内存缓存加 100 条 FIFO 上限(原版无界,Workers isolate 内存 128MB 需守卫)。

// 官方 6 大原声克隆 Voice Tone ID(2026-09-05 由 clone_all_hyperknow_voices.js
// 对官方 6 个真实音频样本克隆得到,与 data/cloned_voices.json 一致)。
export const CLONED_VOICES: Record<string, string> = {
  warm: "voice-tone-U5kvAcyum0", // Hyperknow Warm 官方原声克隆
  calm: "voice-tone-U5kvQekdQ8", // Hyperknow Calm 官方原声克隆
  bright: "voice-tone-U5kvhE0w5Y", // Hyperknow Bright 官方原声克隆
  gentle: "voice-tone-U5kvwngGSu", // Hyperknow Gentle 官方原声克隆
  firm: "voice-tone-U5kwECtB0C", // Hyperknow Firm 官方原声克隆
  lively: "voice-tone-U5kwU9GQqm", // Hyperknow Lively 官方原声克隆
};

// /tts/config 的音色目录(色板与描述从原 routes/tts.js 逐字搬运)。
export const VOICE_CATALOG = [
  { id: "warm", label: "Warm (官方原声克隆)", color: ["#F0997B", "#ED93B1"], desc: "Hyperknow Warm 官方原声克隆：温暖亲切" },
  { id: "calm", label: "Calm (官方原声克隆)", color: ["#85B7EB", "#9AA0A6"], desc: "Hyperknow Calm 官方原声克隆：沉稳磁性" },
  { id: "bright", label: "Bright (官方原声克隆)", color: ["#EF9F27", "#F0997B"], desc: "Hyperknow Bright 官方原声克隆：明快启发" },
  { id: "gentle", label: "Gentle (官方原声克隆)", color: ["#AFA9EC", "#ED93B1"], desc: "Hyperknow Gentle 官方原声克隆：优雅舒缓" },
  { id: "firm", label: "Firm (官方原声克隆)", color: ["#5DCAA5", "#85B7EB"], desc: "Hyperknow Firm 官方原声克隆：严谨权威" },
  { id: "lively", label: "Lively (官方原声克隆)", color: ["#97C459", "#5DCAA5"], desc: "Hyperknow Lively 官方原声克隆：轻快生动" },
] as const;

export const TTS_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const;

export function getVoiceToneId(voiceId = "warm"): string {
  return CLONED_VOICES[voiceId] || CLONED_VOICES.warm;
}

const MEMORY_CACHE_LIMIT = 100;
const memoryCache = new Map<string, ArrayBuffer>();

const TTS_R2_PREFIX = "tts-cache";

type TtsEnv = { UPLOADS?: R2Bucket };

export type SynthesizeResult = { cache: "HIT-MEMORY" | "HIT-R2" | "MISS"; audio: ArrayBuffer };

export async function synthesize(text: string, voiceId = "warm", speed = 1.0): Promise<SynthesizeResult> {
  const config = resolveConfigOrThrow();
  const voice = getVoiceToneId(voiceId);
  const cleanText = sanitizeTtsText(text);
  const key = await ttsCacheKey(cleanText, voiceId, speed);

  const cachedMemory = memoryCache.get(key);
  if (cachedMemory) return { cache: "HIT-MEMORY", audio: cachedMemory };

  const r2 = (env as unknown as TtsEnv).UPLOADS;
  if (r2) {
    try {
      const object = await r2.get(`${TTS_R2_PREFIX}/${key}.mp3`);
      if (object) {
        const audio = await object.arrayBuffer();
        remember(key, audio);
        return { cache: "HIT-R2", audio };
      }
    } catch {
      // R2 不可用不阻断服务:退化为直接向上游合成(与原版磁盘缓存失败继续一致)。
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${config.ttsBaseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.ttsModel,
        input: cleanText,
        voice,
        speed: Math.max(0.5, Math.min(2.0, speed)),
      }),
    });
  } catch {
    throw new HyperknowUpstreamError("ai_upstream_error", 502);
  }
  if (!upstream.ok) {
    // 上游状态不外泄:401/403 归配置问题,其余归上游故障。
    throw new HyperknowUpstreamError(upstream.status === 401 || upstream.status === 403 ? "ai_auth_failed" : "ai_upstream_error", 502);
  }
  const audio = await upstream.arrayBuffer();
  remember(key, audio);
  if (r2) {
    try {
      await r2.put(`${TTS_R2_PREFIX}/${key}.mp3`, audio);
    } catch {
      // 缓存写失败不影响本次响应。
    }
  }
  return { cache: "MISS", audio };
}

function remember(key: string, audio: ArrayBuffer) {
  if (memoryCache.has(key)) return;
  if (memoryCache.size >= MEMORY_CACHE_LIMIT) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(key, audio);
}
