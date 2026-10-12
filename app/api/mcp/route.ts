import { requireMember } from "../_lib/access-control";
import { database, jsonError, type MemberIdentity } from "../_lib/community";
import { accessError } from "../_lib/errors";
import { enforceRateLimit, rateLimitKey } from "../_lib/rate-limit";
import { PRODUCT_CATEGORIES, createProduct, getProduct, listMyProducts, updateProduct } from "../_lib/products";
import { MAX_UPLOAD_BYTES } from "../_lib/upload-security";
import { storeScannedUpload } from "../_lib/upload-core";
import { parseBearerToken } from "../_lib/agent-auth";
import { assertSameOrigin } from "../_lib/request-origin";
import { publicAppOrigin } from "../../oauth-session";
import { requireMcpOAuthBearer } from "../_lib/oauth-provider";

const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26"] as const;
const MAX_MCP_REQUEST_BYTES = 11 * 1024 * 1024;
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const EXTERNAL_DEMO_REVIEW_WARNING = "External experience links (demo_url) cannot currently pass platform review because review requires experience content that cannot be replaced in place. Until static hosting is available, leave demo_url blank and use the cover and description to present the project.";

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

async function callTool(name: string, args: Record<string, unknown>, member: MemberIdentity): Promise<ToolResult> {
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
  } catch (error) {
    return errorToolResult(error);
  }
  throw accessError("unknown_tool", 400);
}

type McpCredential = { kind: "api_key" | "oauth"; id: string };

async function callWriteToolWithAudit(name: string, args: Record<string, unknown>, member: MemberIdentity, credential: McpCredential): Promise<ToolResult> {
  const writeTool = name === "create_product" || name === "update_product" || name === "upload_cover";
  if (!writeTool) return callTool(name, args, member);
  const auditId = crypto.randomUUID();
  const initialProductId = Number.isSafeInteger(args.id) && Number(args.id) > 0 ? Number(args.id) : null;
  try {
    await database().prepare(
      `INSERT INTO mcp_write_audit (id, member_email, credential_kind, credential_id, tool_name, product_id, result)
       VALUES (?, ?, ?, ?, ?, ?, 'audit_incomplete')`,
    ).bind(auditId, member.email, credential.kind, credential.id, name, initialProductId).run();
  } catch {
    return errorToolResult(accessError("audit_unavailable", 503));
  }
  const result = await callTool(name, args, member);
  const errorCode = result.isError ? String(result.structuredContent?.error ?? "server_error") : "ok";
  const resultCode = /^[a-z0-9_]+$/.test(errorCode) ? errorCode : "server_error";
  const product = result.structuredContent?.product;
  const returnedProductId = product && typeof product === "object" && "id" in product
    && Number.isSafeInteger((product as { id: unknown }).id)
    ? Number((product as { id: number }).id)
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
    const result = await callWriteToolWithAudit(name, args, member, credential);
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
