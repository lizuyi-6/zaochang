import { requireMember } from "../_lib/access-control";
import { jsonError } from "../_lib/community";
import { accessError } from "../_lib/errors";
import { enforceRateLimit, rateLimitKey } from "../_lib/rate-limit";
import { PRODUCT_CATEGORIES, createProduct, getProduct, listMyProducts, updateProduct } from "../_lib/products";
import { MAX_UPLOAD_BYTES } from "../_lib/upload-security";
import { storeScannedUpload } from "../_lib/upload-core";
import { parseBearerToken } from "../_lib/agent-auth";
import { assertSameOrigin } from "../_lib/request-origin";

const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26"] as const;
const MAX_MCP_REQUEST_BYTES = 11 * 1024 * 1024;
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

type JsonRpcId = string | number | null;
type JsonRpcRequest = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function rpcResponse(id: JsonRpcId, result: unknown, status = 200) {
  return Response.json({ jsonrpc: "2.0", id, result }, { status, headers: jsonHeaders });
}

function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } }, { headers: jsonHeaders });
}

function challengeRequired() {
  return Response.json({ error: "invalid_api_key" }, {
    status: 401,
    headers: { "www-authenticate": "Bearer", "cache-control": "no-store" },
  });
}

function withBearerChallenge(response: Response) {
  if (response.status !== 401) return response;
  const headers = new Headers(response.headers);
  headers.set("www-authenticate", "Bearer");
  headers.set("cache-control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function errorToolResult(error: unknown): ToolResult {
  let code = "server_error";
  if (error && typeof error === "object" && "code" in error) code = String((error as { code: unknown }).code);
  else if (error instanceof Error && /^[a-z0-9_]+$/.test(error.message)) code = error.message;
  return { isError: true, content: [{ type: "text", text: code }], structuredContent: { error: code } };
}

function successToolResult(value: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value };
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
    description: "列出当前 API key 主人的项目及审核状态。",
    inputSchema: inputSchema({}),
  },
  {
    name: "get_product",
    description: "读取当前 API key 主人的一个项目。",
    inputSchema: inputSchema({ id: { type: "integer", minimum: 1 } }, ["id"]),
  },
  {
    name: "create_product",
    description: "提交一个新项目；新项目会进入审核队列。",
    inputSchema: inputSchema({
      title: { type: "string" },
      description: { type: "string" },
      category: { type: "string", enum: PRODUCT_CATEGORIES },
      demo_url: { type: "string" },
      pricing_model: { type: "string", enum: ["free", "one_time", "per_use"] },
      price: { type: "integer", minimum: 0, maximum: 99 },
      cover_theme: { type: "string" },
      cover_upload_key: { type: "string" },
    }, ["title", "description", "category"]),
  },
  {
    name: "update_product",
    description: "修改当前 API key 主人的项目；修改已上架项目后会重新进入审核。",
    inputSchema: inputSchema({
      id: { type: "integer", minimum: 1 },
      title: { type: "string" },
      description: { type: "string" },
      category: { type: "string", enum: PRODUCT_CATEGORIES },
      demo_url: { type: "string" },
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

async function callTool(name: string, args: Record<string, unknown>, member: Awaited<ReturnType<typeof requireMember>>): Promise<ToolResult> {
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
      return successToolResult({ product, reward: 0 });
    }
    if (name === "update_product") {
      const id = requiredId(args);
      const input = mapMcpProductInput(args);
      delete input.id;
      const product = await updateProduct(member, id, input);
      return successToolResult({ product });
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
  if (!bearer?.startsWith("zc_")) return challengeRequired();

  let member;
  try {
    member = await requireMember();
    if (member.authVia !== "api_key" || !member.apiKeyId) return challengeRequired();
    await enforceRateLimit(await rateLimitKey("mcp-api-key", member.apiKeyId), 60, 60);
  } catch (error) {
    return withBearerChallenge(jsonError(error));
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

  if (body.method === "initialize") {
    const params = plainObject(body.params) ? body.params : {};
    if (typeof params.protocolVersion !== "string" || !SUPPORTED_PROTOCOLS.includes(params.protocolVersion as typeof SUPPORTED_PROTOCOLS[number])) {
      return rpcError(id, -32602, "Unsupported protocolVersion", { supported: SUPPORTED_PROTOCOLS });
    }
    return rpcResponse(id, {
      protocolVersion: params.protocolVersion,
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
    return rpcResponse(id, await callTool(name, args, member));
  }
  if (body.method.startsWith("notifications/")) return new Response(null, { status: 202, headers: { "cache-control": "no-store" } });
  return rpcError(id, -32601, "Method not found");
}
