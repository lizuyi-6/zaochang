/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { resolvePublicAppOrigin } from "../app/lib/public-origin";
import { GITHUB_CONNECTION_CSP } from "../app/lib/security-policy";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  APP_ENV?: string;
  PUBLIC_APP_ORIGIN?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = resolvePublicAppOrigin(url.href, env.APP_ENV, env.PUBLIC_APP_ORIGIN);
    const prepared = await prepareRequestBody(request);
    if (prepared instanceof Response) return withSecurityHeaders(request, prepared, origin);

    if (url.pathname === "/.well-known/openid-configuration") {
      return withSecurityHeaders(request, Response.json({
        issuer: origin,
        authorization_endpoint: `${origin}/oauth/authorize`,
        token_endpoint: `${origin}/api/oauth/token`,
        userinfo_endpoint: `${origin}/api/oauth/userinfo`,
        jwks_uri: `${origin}/api/oauth/jwks`,
        revocation_endpoint: `${origin}/api/oauth/revoke`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        subject_types_supported: ["pairwise"],
        id_token_signing_alg_values_supported: ["ES256"],
        token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: ["openid", "profile", "email", "fruit:balance", "fruit:pay", "fruit:refund"],
        claims_supported: ["sub", "name", "email", "email_verified"],
      }, { headers: { "cache-control": "public, max-age=300" } }), origin);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return withSecurityHeaders(request, await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths), origin);
    }

    const response = await handler.fetch(prepared, env, ctx);
    return withSecurityHeaders(request, response, origin);
  },
};

const MAX_REQUEST_BYTES = 11 * 1024 * 1024;

async function prepareRequestBody(request: Request) {
  if (!request.body || !["POST", "PUT", "PATCH"].includes(request.method)) return request;
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: "request_too_large" }, { status: 413 });
  }
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: "request_too_large" }, { status: 413 });
  }
  return new Request(request, { body });
}

function withSecurityHeaders(request: Request, response: Response, publicOrigin: string) {
  const url = new URL(request.url);
  const sameOriginEmbed = url.pathname.startsWith("/product-apps/");
  const githubConnection = url.pathname === "/api/auth/github/start";
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", sameOriginEmbed ? "SAMEORIGIN" : "DENY");
  headers.set("referrer-policy", githubConnection ? "no-referrer" : "strict-origin-when-cross-origin");
  headers.set("permissions-policy", githubConnection
    ? "camera=(), microphone=(), geolocation=(), payment=()"
    : "camera=(), microphone=(), geolocation=(self), payment=()");
  headers.set("cross-origin-opener-policy", "same-origin");
  if (new URL(publicOrigin).protocol === "https:") {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
  if ((headers.get("content-type") ?? "").startsWith("text/html")) {
    headers.set("content-security-policy", githubConnection
      ? GITHUB_CONNECTION_CSP
      : `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors ${sameOriginEmbed ? "'self'" : "'none'"}; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; worker-src 'self' blob:`);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default worker;
