// 托管部署器的独立机器身份与最小路径能力表。保持零 import,便于入口闸与纯 Node 测试复用。
export const HOSTING_WORKER_CAPABILITIES = [
  { method: "GET", pathname: "/api/hosting-worker/health" },
  { method: "POST", pathname: "/api/hosting-worker/claim" },
  { method: "GET", pathname: "/api/hosting-worker/jobs/{id}/bundle" },
  { method: "POST", pathname: "/api/hosting-worker/jobs/{id}/report" },
] as const;

function bearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match ? match[1].trim() : null;
}

export function isHostingWorkerBearer(authHeader: string | null): boolean {
  return bearerToken(authHeader)?.startsWith("zch_") ?? false;
}

export function isHostingWorkerCapabilityAllowed(method: string, pathname: string): boolean {
  if (HOSTING_WORKER_CAPABILITIES.some((capability) => capability.method === method && capability.pathname === pathname)) {
    return true;
  }
  const bundle = /^\/api\/hosting-worker\/jobs\/([1-9][0-9]*)\/bundle$/.exec(pathname);
  const report = /^\/api\/hosting-worker\/jobs\/([1-9][0-9]*)\/report$/.exec(pathname);
  const jobId = bundle?.[1] ?? report?.[1];
  if (!jobId || !Number.isSafeInteger(Number(jobId))) return false;
  return (method === "GET" && Boolean(bundle)) || (method === "POST" && Boolean(report));
}

export function isValidHostingWorkerToken(token: string | null | undefined, secret: string | undefined): boolean {
  if (!token || !secret || !/^zch_[A-Za-z0-9_-]+$/.test(secret) || secret.length < 48) return false;
  if (!/^zch_[A-Za-z0-9_-]+$/.test(token) || token.length !== secret.length) return false;
  let difference = 0;
  for (let index = 0; index < secret.length; index += 1) {
    difference |= token.charCodeAt(index) ^ secret.charCodeAt(index);
  }
  return difference === 0;
}
