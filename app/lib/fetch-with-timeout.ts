export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new TypeError("invalid_fetch_timeout");
  return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
