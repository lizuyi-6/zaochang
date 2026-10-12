import { env } from "cloudflare:workers";
import { accessError } from "./errors";
import { isValidHostingWorkerToken } from "./hosting-worker-auth";
import { parseBearerToken } from "./agent-auth";

export function requireHostingWorkerRequest(request: Request): void {
  const token = parseBearerToken(request.headers.get("authorization"));
  const secret = (env as unknown as Record<string, string | undefined>).HOSTING_DEPLOYER_TOKEN;
  if (!isValidHostingWorkerToken(token, secret)) throw accessError("invalid_hosting_token", 401);
}

export function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
