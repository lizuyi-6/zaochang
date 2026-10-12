import { requireMember } from "../_lib/access-control";
import { database, jsonError, type MemberIdentity } from "../_lib/community";
import { accessError } from "../_lib/errors";
import { enforceRateLimit, rateLimitKey } from "../_lib/rate-limit";
import { PRODUCT_CATEGORIES, createProduct, getProduct, listMyProducts, updateProduct } from "../_lib/products";
import { createHostingUploadToken, getHostingStatus, requestHostingRemoval } from "../_lib/hosting";
import hostingRules from "../_lib/hosting-rules.json" with { type: "json" };
import { MAX_UPLOAD_BYTES } from "../_lib/upload-security";
import { storeScannedUpload } from "../_lib/upload-core";
import { parseBearerToken } from "../_lib/agent-auth";
import { assertSameOrigin } from "../_lib/request-origin";
import { publicAppOrigin } from "../../oauth-session";
import { requireMcpOAuthBearer } from "../_lib/oauth-provider";

const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26"] as const;
const MAX_MCP_REQUEST_BYTES = 11 * 1024 * 1024;
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const EXTERNAL_DEMO_REVIEW_WARNING = "External experience links (demo_url) cannot currently pass platform review because review requires experience content that cannot be replaced in place. If your account has an invitation hosting grant, use static hosting and keep demo_url blank; otherwise leave it blank and use the cover and description to present the project.";
const HOSTING_ALLOWED_EXTENSIONS = hostingRules.extensions.allowed.map((extension) => `.${extension}`).join(", ");
const HOSTING_UPLOAD_CONSTRAINTS = `Static websites only: ZIP up to ${hostingRules.bundle.maxZipBytes / (1024 * 1024)} MiB and ${hostingRules.bundle.maxEntries} archive entries maximum (directory entries count), with root ${hostingRules.bundle.rootFile} required. Allowed extensions from hosting-rules.json: ${HOSTING_ALLOWED_EXTENSIONS}. Do not include dotfiles (including .env), private keys, or node_modules. Hosting requires an invitation grant, and product demo_url must be empty. Hosted links become public only after platform review approval.`;

type JsonRpcId = string | number | null;
type JsonRpcRequest = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function rpcResponse(id: JsonRpcId, result: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json({ jsonrpc: "2.0", id, result }, { status, headers: { ...jsonHeaders, ...extraHeaders } });
}

function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } }, { headers: jsonHeaders });
}

function mcpResourceMetadataUrl(request: Request) {
  return `${publicAppOrigin(request)}/.well-known/oauth-protected-resource/api/mcp`;
}

function challengeRequired(request: Request, invalid = false) {
  const metadata = mcpResourceMetadataUrl(request);
  const challenge = invalid
    ? `Bearer error="invalid_token", resource_metadata="${metadata}"`
    : `Bearer resource_metadata="${metadata}"`;
  return Response.json({ error: "invalid_api_key" }, {
    status: 401,
    headers: { "www-authenticate": challenge, "cache-control": "no-store" },
  });
}

function withBearerChallenge(request: Request, response: Response) {
  if (response.status !== 401) return response;
  const headers = new Headers(response.headers);
  headers.set("www-authenticate", `Bearer error="invalid_token", resource_metadata="${mcpResourceMetadataUrl(request)}"`);
  headers.set("cache-control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function insufficientScope(request: Request) {
  const metadata = mcpResourceMetadataUrl(request);
  return Response.json({ error: "insufficient_scope" }, {
    status: 403,
    headers: {
      "www-authenticate": `Bearer error="insufficient_scope", scope="mcp:projects", resource_metadata="${metadata}"`,
      "cache-control": "no-store",
    },
  });
}

function errorToolResult(error: unknown): ToolResult {
  let code = "server_error";
  if (error && typeof error === "object" && "code" in error) code = String((error as { code: unknown }).code);
  else if (error instanceof Error && /^[a-z0-9_]+$/.test(error.message)) code = error.message;
  const retryAfterSeconds = error && typeof error === "object" && "retryAfterSeconds" in error
    ? Number((error as { retryAfterSeconds: unknown }).retryAfterSeconds)
    : NaN;
  const contentText = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 1
    ? `${code} (retry after ${Math.floor(retryAfterSeconds)}s)`
    : code;
  return {
    isError: true,
    content: [{ type: "text", text: contentText }],
    structuredContent: {
      error: code,
      ...(Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 1
        ? { retryAfterSeconds: Math.floor(retryAfterSeconds) }
        : {}),
    },
  };
}

function successToolResult(value: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value };
}

function demoUrlWarnings(args: Record<string, unknown>) {
  return typeof args.demo_url === "string" && args.demo_url.trim()
    ? [`demo_url_cannot_be_approved: ${EXTERNAL_DEMO_REVIEW_WARNING}`]
    : [];
}

function inputSchema(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

type ToolInputProperty = { type?: string; enum?: readonly unknown[]; minimum?: number; maximum?: number };
type ToolInputSchema = {
  properties: Record<string, ToolInputProperty>;
  required: string[];
  additionalProperties: boolean;
};

const tools = [
  {
    name: "list_my_products",
    description: "列出当前授权会员自己的项目及审核状态。",
    inputSchema: inputSchema({}),
  },
  {
    name: "get_product",
    description: "读取当前授权会员自己的一个项目。",
    inputSchema: inputSchema({ id: { type: "integer", minimum: 1 } }, ["id"]),
  },
  {
    name: "create_product",
    description: "提交一个新项目；新项目会进入审核队列。",
    inputSchema: inputSchema({
      title: { type: "string" },
      description: { type: "string" },
      category: { type: "string", enum: PRODUCT_CATEGORIES },
      demo_url: { type: "string", description: EXTERNAL_DEMO_REVIEW_WARNING },
      pricing_model: { type: "string", enum: ["free", "one_time", "per_use"] },
      price: { type: "integer", minimum: 0, maximum: 99 },
      cover_theme: { type: "string" },
      cover_upload_key: { type: "string" },
    }, ["title", "description", "category"]),
  },
  {
    name: "update_product",
    description: "修改当前授权会员自己的项目；修改已上架项目后会重新进入审核。",
    inputSchema: inputSchema({
      id: { type: "integer", minimum: 1 },
      title: { type: "string" },
      description: { type: "string" },
      category: { type: "string", enum: PRODUCT_CATEGORIES },
      demo_url: { type: "string", description: EXTERNAL_DEMO_REVIEW_WARNING },
      pricing_model: { type: "string", enum: ["free", "one_time", "per_use"] },
      price: { type: "integer", minimum: 0, maximum: 99 },
      cover_theme: { type: "string" },
      cover_upload_key: { type: "string" },
    }, ["id"]),
  },
  {
    name: "upload_cover",
    description: "上传项目封面；内容会先通过现有恶意软件扫描管线。",
    inputSchema: inputSchema({
      filename: { type: "string" },
      mime_type: { type: "string", enum: ["image/png", "image/jpeg", "image/webp"] },
      data_base64: { type: "string" },
    }, ["filename", "mime_type", "data_base64"]),
  },
  {
    name: "begin_hosting_upload",
    description: `Create a one-time static-site ZIP upload URL for an existing project owned by the signed-in member. Prerequisites: the member must have an invitation hosting grant and demo_url must be empty. ${HOSTING_UPLOAD_CONSTRAINTS}`,
    inputSchema: inputSchema({ product_id: { type: "integer", minimum: 1 } }, ["product_id"]),
  },
  {
    name: "get_hosting_status",
    description: "Read the signed-in owner's static-hosting and review status, including the next executable step. Rows with desired=removed are omitted by the shared REST status function; a null hosting field does not prove remote cleanup.",
    inputSchema: inputSchema({ product_id: { type: "integer", minimum: 1 } }, ["product_id"]),
  },
  {
    name: "remove_hosting",
    description: "Request removal of the signed-in owner's hosted site. Removal is audited and may take time while the deployer removes the remote site; get_hosting_status omits desired=removed rows and cannot confirm remote cleanup.",
    inputSchema: inputSchema({ product_id: { type: "integer", minimum: 1 } }, ["product_id"]),
  },
];

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) throw accessError("invalid_arguments", 400);
  return value;
}

function requiredId(args: Record<string, unknown>): number {
  const id = args.id;
  if (!Number.isSafeInteger(id) || Number(id) < 1) throw accessError("invalid_arguments", 400);
  return Number(id);
}

function requiredProductId(args: Record<string, unknown>): number {
  const productId = args.product_id;
  if (!Number.isSafeInteger(productId) || Number(productId) < 1) throw accessError("invalid_arguments", 400);
  return Number(productId);
}

function hostingNextStep(status: Awaited<ReturnType<typeof getHostingStatus>>): string {
  const hosting = status.hosting as Record<string, unknown> | null;
  if (!hosting) return "No active hosting record is visible. If removal was just requested, this status API does not expose removed rows or confirm remote cleanup; ask the hosting operator to verify cleanup before creating another deployment.";

  const state = typeof hosting.state === "string" ? hosting.state : "unknown";
  const desired = typeof hosting.desired === "string" ? hosting.desired : "unknown";
  const failureCode = typeof hosting.failureCode === "string" ? hosting.failureCode : "";
  const hostedUrl = typeof hosting.hostedUrl === "string" ? hosting.hostedUrl : "";

  if (desired === "removed") {
    return state === "removed" ? "Hosting has been removed; no further action is needed." : "Removal is in progress; wait and poll again.";
  }
  if (state === "queued" || state === "deploying" || state === "promoting" || state === "removing") {
    return "The hosting job is in progress; wait and poll again in 10–20 seconds.";
  }
  if (state === "staged") {
    return desired === "live"
      ? "The product is approved; wait for the deployer to promote this staged bundle, then poll again."
      : "The bundle is staged; wait for platform review before the hosted link is public.";
  }
  if (state === "live") {
    return hostedUrl
      ? "The approved hostedUrl is public."
      : "The provider reports a live site, but hostedUrl is not exposed; wait for product approval and poll again.";
  }
  if (state === "removed") return "Hosting has been removed; no further action is needed.";
  if (state === "failed") {
    if (failureCode === "validation_bundle") return "Fix the ZIP structure, allowed extensions, size, archive entry count (including directories), and root index.html, then call begin_hosting_upload again.";
    if (failureCode === "validation_secret") return "Remove secrets and private keys from the static files, then create a new ZIP and call begin_hosting_upload again.";
    if (failureCode === "bundle_missing") return "The stored bundle is unavailable; build and upload a new ZIP with begin_hosting_upload.";
    if (failureCode === "ambiguous") return "Remote state is uncertain; do not upload another bundle. Ask the hosting operator to reconcile the recorded site first.";
    if (failureCode === "provider_auth") return "The deployer could not authenticate with the hosting provider; ask the hosting operator to check its provider credential.";
    if (failureCode === "provider_quota") return "The hosting provider quota is exhausted; ask the hosting operator to resolve quota before retrying.";
    if (failureCode === "provider_audit_rejected") return "The provider rejected the staged site during review; ask the hosting operator to inspect the provider audit result.";
    return "Review failureCode and failureDetail, then ask the hosting operator for the next action before retrying.";
  }
  return "Read the current state and failureCode, then poll again or ask the hosting operator to investigate.";
}

function validateToolArguments(name: string, args: Record<string, unknown>) {
  const definition = tools.find((tool) => tool.name === name);
  if (!definition) throw accessError("unknown_tool", 400);
  const schema = definition.inputSchema as unknown as ToolInputSchema;
  const allowed = new Set(Object.keys(schema.properties));
  if (schema.additionalProperties === false && Object.keys(args).some((key) => !allowed.has(key))) {
    throw accessError("invalid_arguments", 400);
  }
  if (schema.required.some((key) => !Object.prototype.hasOwnProperty.call(args, key))) {
    throw accessError("invalid_arguments", 400);
  }
  for (const [key, value] of Object.entries(args)) {
    const property = schema.properties[key];
    if (!property) continue;
    if (property.type === "string" && typeof value !== "string") throw accessError("invalid_arguments", 400);
    if (property.type === "integer" && (!Number.isSafeInteger(value)
      || (property.minimum !== undefined && Number(value) < property.minimum)
      || (property.maximum !== undefined && Number(value) > property.maximum))) {
      throw accessError("invalid_arguments", 400);
    }
    if (property.enum && !property.enum.includes(value)) throw accessError("invalid_arguments", 400);
  }
}

function mapMcpProductInput(args: Record<string, unknown>): Record<string, unknown> {
  const input = { ...args };
  const snakeToCamel = {
    demo_url: "demoUrl",
    pricing_model: "pricingModel",
    cover_theme: "coverTheme",
  } as const;
  for (const [snake, camel] of Object.entries(snakeToCamel)) {
    if (Object.prototype.hasOwnProperty.call(input, snake)) {
      input[camel] = input[snake];
      delete input[snake];
    }
  }
  if (typeof input.cover_upload_key === "string") input.imageUrl = `/api/uploads/${input.cover_upload_key}`;
  delete input.cover_upload_key;
  return input;
}

function decodeBase64(value: string): Uint8Array {
  if (!value || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw accessError("invalid_upload_encoding", 400);
  }
  const estimated = Math.floor((value.length * 3) / 4) - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);
  if (estimated < 1 || estimated > MAX_UPLOAD_BYTES) throw accessError("invalid_upload_size", 400);
  const binary = atob(value);
  if (binary.length > MAX_UPLOAD_BYTES) throw accessError("invalid_upload_size", 400);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function readMcpJson(request: Request): Promise<JsonRpcRequest> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_MCP_REQUEST_BYTES) {
    throw accessError("request_body_too_large", 413);
  }
  if (!request.body) throw new Error("invalid_json");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_MCP_REQUEST_BYTES) {
        await reader.cancel();
        throw accessError("request_body_too_large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as JsonRpcRequest;
}

async function callTool(name: string, args: Record<string, unknown>, member: MemberIdentity, request: Request): Promise<ToolResult> {
  try {
    validateToolArguments(name, args);
    if (name === "list_my_products") {
      return successToolResult({ products: await listMyProducts(member) as Record<string, unknown>[] });
    }
    if (name === "get_product") {
      return successToolResult({ product: await getProduct(member, requiredId(args)) as Record<string, unknown> });
    }
    if (name === "create_product") {
      const input = mapMcpProductInput(args);
      const product = await createProduct(member, input);
      return successToolResult({ product, reward: 0, warnings: demoUrlWarnings(args) });
    }
    if (name === "update_product") {
      const id = requiredId(args);
      const input = mapMcpProductInput(args);
      delete input.id;
      const product = await updateProduct(member, id, input);
      return successToolResult({ product, warnings: demoUrlWarnings(args) });
    }
    if (name === "upload_cover") {
      await enforceRateLimit(await rateLimitKey("upload", member.email), 30, 60 * 60);
      const filename = requiredString(args, "filename");
      const mimeType = requiredString(args, "mime_type");
      if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(mimeType)) {
        throw accessError("product_cover_must_be_image", 400);
      }
      const bytes = decodeBase64(requiredString(args, "data_base64"));
      const fileBytes = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(fileBytes).set(bytes);
      const file = new File([fileBytes], filename, { type: mimeType });
      const upload = await storeScannedUpload({
        file,
        ownerEmail: member.email,
        visibility: "private",
        purpose: "product_cover",
      });
      return successToolResult({ cover_upload_key: upload.key, url: upload.url, name: upload.name });
    }
    if (name === "begin_hosting_upload") {
      const productId = requiredProductId(args);
      const publicOrigin = publicAppOrigin(request);
      await enforceRateLimit(await rateLimitKey("hosting-token", member.email), 10, 60 * 60);
      const issued = await createHostingUploadToken(member, productId);
      const uploadUrl = new URL(issued.url, publicOrigin).toString();
      const instructions = `curl --fail --show-error -sS -X PUT -H "content-type: application/zip" --data-binary @bundle.zip "${uploadUrl}" # One-time URL; valid for 15 minutes; do not share.`;
      return successToolResult({
        upload_url: uploadUrl,
        method: "PUT",
        content_type: "application/zip",
        expires_at: issued.expiresAt,
        max_bytes: issued.maxBytes,
        instructions,
      });
    }
    if (name === "get_hosting_status") {
      const status = await getHostingStatus(member, requiredProductId(args));
      return successToolResult({ ...status, next_step: hostingNextStep(status) });
    }
    if (name === "remove_hosting") {
      const productId = requiredProductId(args);
      await requestHostingRemoval(member, productId);
      return successToolResult({ product_id: productId, requested: true });
    }
  } catch (error) {
    if (name === "begin_hosting_upload" && error && typeof error === "object"
      && "code" in error && error.code === "hosting_owner_mismatch") {
      return errorToolResult(accessError("product_not_found", 404));
    }
    return errorToolResult(error);
  }
  throw accessError("unknown_tool", 400);
}

type McpCredential = { kind: "api_key" | "oauth"; id: string };

async function callWriteToolWithAudit(name: string, args: Record<string, unknown>, member: MemberIdentity, credential: McpCredential, request: Request): Promise<ToolResult> {
  const writeTool = name === "create_product" || name === "update_product" || name === "upload_cover"
    || name === "begin_hosting_upload" || name === "remove_hosting";
  if (!writeTool) return callTool(name, args, member, request);
  const auditId = crypto.randomUUID();
  const initialProductId = Number.isSafeInteger(args.product_id) && Number(args.product_id) > 0
    ? Number(args.product_id)
    : Number.isSafeInteger(args.id) && Number(args.id) > 0 ? Number(args.id) : null;
  try {
    await database().prepare(
      `INSERT INTO mcp_write_audit (id, member_email, credential_kind, credential_id, tool_name, product_id, result)
       VALUES (?, ?, ?, ?, ?, ?, 'audit_incomplete')`,
    ).bind(auditId, member.email, credential.kind, credential.id, name, initialProductId).run();
  } catch {
    return errorToolResult(accessError("audit_unavailable", 503));
  }
  const result = await callTool(name, args, member, request);
  const errorCode = result.isError ? String(result.structuredContent?.error ?? "server_error") : "ok";
  const resultCode = /^[a-z0-9_]+$/.test(errorCode) ? errorCode : "server_error";
  const product = result.structuredContent?.product;
  const structuredProductId = result.structuredContent?.product_id;
  const returnedProductId = product && typeof product === "object" && "id" in product
    && Number.isSafeInteger((product as { id: unknown }).id)
    ? Number((product as { id: number }).id)
    : Number.isSafeInteger(structuredProductId)
      ? Number(structuredProductId)
      : initialProductId;
  try {
    await database().prepare(
      `UPDATE mcp_write_audit SET product_id = ?, result = ? WHERE id = ? AND member_email = ?`,
    ).bind(returnedProductId, resultCode, auditId, member.email).run();
  } catch {
    return errorToolResult(accessError("audit_unavailable", 503));
  }
  return result;
}

export async function GET() {
  return Response.json({ error: "method_not_allowed" }, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const originHeader = request.headers.get("origin");
  if (originHeader !== null) {
    if (!originHeader || assertSameOrigin(request)) {
      return Response.json({ error: "origin_not_allowed" }, { status: 403, headers: { "cache-control": "no-store" } });
    }
  }

  const bearer = parseBearerToken(request.headers.get("authorization"));
  if (!bearer) return challengeRequired(request);

  let member: MemberIdentity;
  let credential: McpCredential;
  try {
    if (bearer.startsWith("zca_")) {
      const oauthMember = await requireMcpOAuthBearer(request);
      member = oauthMember;
      credential = { kind: "oauth", id: oauthMember.clientId };
      await enforceRateLimit(await rateLimitKey("mcp-oauth", `${oauthMember.clientId}:${oauthMember.email}`), 60, 60);
    } else if (bearer.startsWith("zc_")) {
      member = await requireMember();
      if (member.authVia !== "api_key" || !member.apiKeyId) return challengeRequired(request, true);
      credential = { kind: "api_key", id: member.apiKeyId };
      await enforceRateLimit(await rateLimitKey("mcp-api-key", member.apiKeyId), 60, 60);
    } else {
      return challengeRequired(request, true);
    }
    await enforceRateLimit(await rateLimitKey("mcp-member", member.email), 120, 60);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
    if (code === "insufficient_scope") return insufficientScope(request);
    const status = error && typeof error === "object" && "status" in error ? Number((error as { status: unknown }).status) : 500;
    if (status === 401) return withBearerChallenge(request, jsonError(error));
    return jsonError(error);
  }

  let body: JsonRpcRequest;
  try {
    body = await readMcpJson(request);
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && (error as { status: unknown }).status === 413) {
      return Response.json({ error: "request_body_too_large" }, { status: 413, headers: { "cache-control": "no-store" } });
    }
    return rpcError(null, -32700, "Parse error");
  }

  const id = body && Object.prototype.hasOwnProperty.call(body, "id")
    ? (typeof body.id === "string" || typeof body.id === "number" || body.id === null ? body.id : null)
    : undefined;
  if (body?.method === "notifications/initialized") {
    return new Response(null, { status: 202, headers: { "cache-control": "no-store" } });
  }
  if (id === undefined) return new Response(null, { status: 202, headers: { "cache-control": "no-store" } });
  if (body?.jsonrpc !== "2.0" || typeof body.method !== "string") return rpcError(id, -32600, "Invalid Request");
  // Streamable HTTP:协商后的请求携带 MCP-Protocol-Version;无效/不支持的值必须 400。
  // initialize 本身尚未协商,不校验该头。
  const protocolHeader = request.headers.get("mcp-protocol-version");
  if (body.method !== "initialize" && protocolHeader !== null
    && !SUPPORTED_PROTOCOLS.includes(protocolHeader as typeof SUPPORTED_PROTOCOLS[number])) {
    return Response.json(
      { jsonrpc: "2.0", id, error: { code: -32600, message: "Unsupported MCP-Protocol-Version", data: { supported: SUPPORTED_PROTOCOLS } } },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  if (body.method === "initialize") {
    const params = plainObject(body.params) ? body.params : {};
    if (typeof params.protocolVersion !== "string") {
      return rpcError(id, -32602, "Invalid protocolVersion", { supported: SUPPORTED_PROTOCOLS });
    }
    // MCP 生命周期规范:客户端请求的版本不受支持时,服务端回复自己支持的最新版本,
    // 由客户端决定是否继续——直接报错会让更新的客户端(如 Claude Code 2.1.x)无法接入。
    const negotiated = SUPPORTED_PROTOCOLS.includes(params.protocolVersion as typeof SUPPORTED_PROTOCOLS[number])
      ? params.protocolVersion
      : SUPPORTED_PROTOCOLS[0];
    return rpcResponse(id, {
      protocolVersion: negotiated,
      capabilities: { tools: {} },
      serverInfo: { name: "zaochang", title: "造场 Agent 接入", version: "1.0.0" },
    });
  }
  if (body.method === "ping") return rpcResponse(id, {});
  if (body.method === "tools/list") return rpcResponse(id, { tools });
  if (body.method === "tools/call") {
    const params = plainObject(body.params) ? body.params : {};
    const name = params.name;
    if (typeof name !== "string" || !tools.some((tool) => tool.name === name)) return rpcError(id, -32602, "Unknown tool");
    const args = plainObject(params.arguments) ? params.arguments : {};
    const result = await callWriteToolWithAudit(name, args, member, credential, request);
    const capacityExceeded = result.isError === true
      && result.structuredContent?.error === "upload_capacity_exceeded";
    const retryAfterSeconds = Number(result.structuredContent?.retryAfterSeconds);
    return rpcResponse(
      id,
      result,
      capacityExceeded ? 429 : 200,
      capacityExceeded && Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 1
        ? { "retry-after": String(Math.floor(retryAfterSeconds)) }
        : {},
    );
  }
  if (body.method.startsWith("notifications/")) return new Response(null, { status: 202, headers: { "cache-control": "no-store" } });
  return rpcError(id, -32601, "Method not found");
}
