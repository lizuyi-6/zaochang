import { resolveHyperknowAiConfig } from "./config";

export const MAX_HYPERKNOW_ASR_BYTES = 2 * 1024 * 1024;

const ALLOWED_AUDIO_MIMES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
]);

export class HyperknowAsrError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

type AsrPayload = { text?: unknown; error?: unknown; message?: unknown };

export function isAllowedAsrMime(contentType: string): boolean {
  const [rawMime, ...parameters] = contentType.split(";");
  const mime = rawMime.trim().toLowerCase();
  if (!ALLOWED_AUDIO_MIMES.has(mime)) return false;
  return parameters.every((parameter) => /^\s*codecs\s*=\s*"?[a-z0-9., _-]+"?\s*$/i.test(parameter));
}

export async function readAsrAudio(request: Request): Promise<ArrayBuffer> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HYPERKNOW_ASR_BYTES) {
    throw new HyperknowAsrError("audio_too_large", 413);
  }

  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_HYPERKNOW_ASR_BYTES) {
      await reader.cancel().catch(() => {});
      throw new HyperknowAsrError("audio_too_large", 413);
    }
    chunks.push(value);
  }

  const audio = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    audio.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return audio.buffer;
}

function audioExtension(mime: string): string {
  switch (mime) {
    case "audio/ogg": return "ogg";
    case "audio/mp4": return "mp4";
    case "audio/mpeg": return "mp3";
    case "audio/wav":
    case "audio/x-wav": return "wav";
    default: return "webm";
  }
}

export async function transcribeHyperknowAudio(audio: ArrayBuffer, contentType: string): Promise<string> {
  const config = resolveHyperknowAiConfig();
  if (!config) throw new HyperknowAsrError("ai_not_configured", 503);

  const mime = contentType.split(";", 1)[0].trim().toLowerCase();
  const form = new FormData();
  form.set("model", config.asrModel);
  form.set("response_format", "json");
  form.set("file", new Blob([audio], { type: contentType }), `recording.${audioExtension(mime)}`);

  let response: Response;
  try {
    response = await fetch(`${config.asrBaseUrl.replace(/\/+$/, "")}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new HyperknowAsrError("asr_unavailable", 502);
  }

  const raw = await response.text().catch(() => "");
  let payload: AsrPayload | null = null;
  try {
    payload = JSON.parse(raw) as AsrPayload;
  } catch {
    // 非 JSON 错误体不对客户端外泄,统一视为上游不可用。
  }
  const upstreamError = payload?.error;
  const upstreamErrorMessage = upstreamError && typeof upstreamError === "object"
    ? (upstreamError as { message?: unknown }).message
    : undefined;
  const upstreamMessage = typeof upstreamError === "string"
    ? upstreamError
    : typeof upstreamErrorMessage === "string"
      ? upstreamErrorMessage
      : typeof payload?.message === "string"
        ? payload.message
        : raw;
  if (response.status === 400 && /no speech found/i.test(upstreamMessage)) {
    throw new HyperknowAsrError("no_speech", 422);
  }
  if (!response.ok) throw new HyperknowAsrError("asr_unavailable", 502);
  if (typeof payload?.text !== "string") throw new HyperknowAsrError("asr_unavailable", 502);
  return payload.text;
}
