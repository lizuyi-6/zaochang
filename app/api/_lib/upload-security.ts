import { env } from "cloudflare:workers";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type AcceptedUpload = {
  bytes: Uint8Array;
  extension: string;
  mediaType: string;
  originalName: string;
  sha256: string;
};

export type UploadScanResult = {
  engine: string;
  signature: string | null;
  verdict: "clean" | "infected";
};

const acceptedTypes = new Map([
  ["image/png", { extensions: ["png"], matches: isPng }],
  ["image/jpeg", { extensions: ["jpg", "jpeg"], matches: isJpeg }],
  ["image/webp", { extensions: ["webp"], matches: isWebp }],
  ["application/pdf", { extensions: ["pdf"], matches: isPdf }],
  ["text/plain", { extensions: ["txt", "md"], matches: isUtf8Text }],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", { extensions: ["docx"], matches: isDocx }],
]);

export async function inspectUpload(file: File): Promise<AcceptedUpload> {
  const originalName = file.name.trim();
  if (!originalName || originalName.length > 180 || /[\u0000-\u001f\u007f\\/]/.test(originalName)) {
    throw new UploadSecurityError("invalid_upload_name", 400);
  }
  if (file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
    throw new UploadSecurityError("invalid_upload_size", 400);
  }
  const config = acceptedTypes.get(file.type);
  const extension = originalName.includes(".") ? originalName.split(".").pop()!.toLowerCase() : "";
  if (!config || !config.extensions.includes(extension)) {
    throw new UploadSecurityError("invalid_upload_type", 400);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size || !config.matches(bytes)) {
    throw new UploadSecurityError("upload_content_type_mismatch", 400);
  }
  return {
    bytes,
    extension: `.${extension}`,
    mediaType: file.type,
    originalName,
    sha256: await sha256Hex(bytes),
  };
}

export async function scanUpload(bytes: Uint8Array, expectedSha256: string): Promise<UploadScanResult> {
  const values = env as unknown as Record<string, string | undefined>;
  const scannerUrl = values.UPLOAD_SCANNER_URL;
  const scannerToken = values.UPLOAD_SCANNER_TOKEN;
  if (!scannerUrl || !scannerToken) throw new UploadSecurityError("upload_scanner_unavailable", 503);

  let endpoint: URL;
  try {
    endpoint = new URL(scannerUrl);
  } catch {
    throw new UploadSecurityError("upload_scanner_misconfigured", 503);
  }
  const loopback = endpoint.hostname === "127.0.0.1" || endpoint.hostname === "localhost" || endpoint.hostname === "[::1]";
  if (!((endpoint.protocol === "http:" && loopback) || endpoint.protocol === "https:")) {
    throw new UploadSecurityError("upload_scanner_misconfigured", 503);
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${scannerToken}`,
        "content-type": "application/octet-stream",
        "x-content-sha256": expectedSha256,
      },
      body: toArrayBuffer(bytes),
      signal: AbortSignal.timeout(112_000),
    });
  } catch {
    throw new UploadSecurityError("upload_scanner_unavailable", 503);
  }
  const result = await response.json().catch(() => null) as null | {
    engine?: unknown;
    sha256?: unknown;
    signature?: unknown;
    verdict?: unknown;
  };
  if (!response.ok || !result || result.sha256 !== expectedSha256) {
    throw new UploadSecurityError("upload_scanner_unavailable", 503);
  }
  if (result.verdict !== "clean" && result.verdict !== "infected") {
    throw new UploadSecurityError("upload_scanner_invalid_response", 503);
  }
  const engine = typeof result.engine === "string" ? result.engine.slice(0, 120) : "unknown";
  const signature = typeof result.signature === "string" ? result.signature.slice(0, 160) : null;
  return { engine, signature, verdict: result.verdict };
}

export async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function toArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export class UploadSecurityError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function startsWith(bytes: Uint8Array, expected: number[]) {
  return expected.every((value, index) => bytes[index] === value);
}

function containsAscii(bytes: Uint8Array, value: string) {
  const expected = new TextEncoder().encode(value);
  outer: for (let offset = 0; offset <= bytes.length - expected.length; offset += 1) {
    for (let index = 0; index < expected.length; index += 1) {
      if (bytes[offset + index] !== expected[index]) continue outer;
    }
    return true;
  }
  return false;
}

function isPng(bytes: Uint8Array) {
  return bytes.length >= 24 && startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function isJpeg(bytes: Uint8Array) {
  return bytes.length >= 4 && startsWith(bytes, [0xff, 0xd8, 0xff]) && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
}

function isWebp(bytes: Uint8Array) {
  return bytes.length >= 16 && containsAscii(bytes.slice(0, 4), "RIFF") && containsAscii(bytes.slice(8, 12), "WEBP");
}

function isPdf(bytes: Uint8Array) {
  return bytes.length >= 12 && startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]) && containsAscii(bytes.slice(Math.max(0, bytes.length - 2048)), "%%EOF");
}

function isUtf8Text(bytes: Uint8Array) {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function isDocx(bytes: Uint8Array) {
  return bytes.length >= 64
    && startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
    && containsAscii(bytes, "[Content_Types].xml")
    && containsAscii(bytes, "word/document.xml");
}
