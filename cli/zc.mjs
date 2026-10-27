#!/usr/bin/env node
// zc —— 造场 MCP 客户端 CLI。
// 终端直连造场 /api/mcp,复用与 Claude Code / Codex 相同的接入面:
// OAuth(动态注册 + PKCE + loopback 回调)或个人 API key(zc_ 前缀)。
//
// 用法速览(详见 cli/README.md):
//   zc login                       # 浏览器 OAuth 授权(默认)
//   zc login --api-key             # 粘贴个人 API key
//   zc whoami / zc ping / zc logout
//   zc tools list
//   zc call list_my_products
//   zc call create_product --arg 'title=我的站' --arg 'description=……' --arg 'category=web'
//   zc call begin_hosting_upload --arg product_id=7
//   zc host upload 7 ./bundle.zip # begin_hosting_upload + 一次性 PUT 一条龙

import { readFileSync, statSync } from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_ORIGIN,
  clearConfig,
  configPath,
  loadConfig,
  oauthTokenProvider,
  saveConfig,
} from "./lib/config.mjs";
import { McpError, McpSession, toolErrorSummary } from "./lib/mcp.mjs";
import { runLogin } from "./lib/oauth.mjs";
import { CLI_VERSION, CliError, formatTime, readLineFromStdin } from "./lib/util.mjs";

const API_KEY_PATTERN = /^zc_[A-Za-z0-9_-]{43}$/;

const GLOBAL_OPTIONS = {
  origin: { type: "string" },
  config: { type: "string" },
  json: { type: "boolean" },
};

function parseCommand(command, argv, options = {}, maxPositionals = 0) {
  try {
    const parsed = parseArgs({
      args: argv,
      options: { ...GLOBAL_OPTIONS, ...options },
      allowPositionals: maxPositionals > 0,
      strict: true,
    });
    if (parsed.positionals.length > maxPositionals) {
      throw new CliError(`多余的参数:${parsed.positionals.slice(maxPositionals).join(" ")}`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(`${command} 参数不合法:${error.message}`, { hint: `zc ${command} --help 查看用法。` });
  }
}

function normalizedOrigin(value) {
  return value.replace(/\/+$/, "");
}

/** 常量 token provider(API key 模式):无 invalidate,401 直接报错引导重登。 */
function apiKeyProvider(apiKey) {
  return async () => apiKey;
}

/**
 * 凭据解析:ZC_API_KEY 环境变量 > 配置文件。返回 provider + 展示信息。
 * --origin 必须与配置里的 origin 一致——凭据与 origin 绑定,静默跨站调用等于凭据错用。
 */
function resolveCredential({ originFlag, configFlag }) {
  const envKey = (process.env.ZC_API_KEY ?? "").trim();
  if (envKey) {
    if (!API_KEY_PATTERN.test(envKey)) {
      throw new CliError("ZC_API_KEY 不是合法的造场个人 API key(应为 zc_ 前缀 + 43 位)。", { hint: "在造场「密钥管理」创建后重试。" });
    }
    const origin = normalizedOrigin(originFlag ?? DEFAULT_ORIGIN);
    return { origin, provider: apiKeyProvider(envKey), describe: { mode: "api_key", label: `API key ${envKey.slice(0, 11)}…(ZC_API_KEY)` } };
  }
  const config = loadConfig(configFlag);
  if (!config) {
    throw new CliError("还没有登录。", { hint: "先运行 zc login,或设置 ZC_API_KEY 环境变量。" });
  }
  const configOrigin = normalizedOrigin(config.origin);
  const origin = normalizedOrigin(originFlag ?? config.origin);
  if (originFlag && normalizedOrigin(originFlag) !== configOrigin) {
    throw new CliError(`--origin(${origin})与已登录的 ${configOrigin} 不一致。`, { hint: `zc logout 后 zc login --origin ${origin} 换站,或去掉 --origin。` });
  }
  if (config.auth.mode === "api_key") {
    return {
      origin,
      provider: apiKeyProvider(config.auth.apiKey),
      describe: { mode: "api_key", label: `API key ${config.auth.apiKey.slice(0, 11)}…` },
    };
  }
  // OAuth:loadAuth 每次现读文件,saveAuth 整体回写——刷新轮换落盘与并发进程解耦。
  const loadAuth = async () => {
    const fresh = loadConfig(configFlag);
    if (!fresh || fresh.auth.mode !== "oauth") {
      throw new CliError("配置文件已变化(可能在其它终端登出)。", { hint: "重新运行 zc login。" });
    }
    return fresh.auth;
  };
  const saveAuth = async (auth) => {
    const fresh = loadConfig(configFlag);
    saveConfig(configFlag, { ...(fresh ?? { origin: config.origin, version: 1 }), auth });
  };
  const provider = oauthTokenProvider({ origin, loadAuth, saveAuth });
  return {
    origin,
    provider,
    describe: {
      mode: "oauth",
      label: `OAuth 客户端「${config.auth.clientName}」`,
      expiresAt: config.auth.accessExpiresAt ?? null,
    },
  };
}

function newSession(credential) {
  return new McpSession({ origin: credential.origin, tokenProvider: credential.provider });
}

function printToolResult(result, { json = false } = {}) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  const structured = result?.structuredContent;
  if (structured !== undefined) {
    process.stdout.write(`${JSON.stringify(structured, null, 2)}\n`);
    return;
  }
  const text = result?.content?.map((item) => item.text ?? "").join("\n") ?? "";
  process.stdout.write(`${text}\n`);
}

async function cmdLogin(argv) {
  const args = parseCommand("login", argv, {
    "api-key": { type: "boolean" },
    "no-browser": { type: "boolean" },
    name: { type: "string" },
  });
  const origin = normalizedOrigin(args.values.origin ?? DEFAULT_ORIGIN);

  if (args.values["api-key"]) {
    const key = await readLineFromStdin("粘贴个人 API key(zc_ 开头,输入时不隐藏,注意环境):");
    if (!API_KEY_PATTERN.test(key)) {
      throw new CliError("不是合法的造场个人 API key(应为 zc_ 前缀 + 43 位)。");
    }
    saveConfig(args.values.config, { origin, auth: { mode: "api_key", apiKey: key } });
    process.stdout.write(`已保存 API key 到 ${configPath(args.values.config)}\n正在验证…\n`);
    try {
      const session = newSession({ origin, provider: apiKeyProvider(key) });
      const info = await session.initialize();
      process.stdout.write(`验证通过:${info.serverInfo.title}(${info.serverInfo.version}),协议 ${session.protocolVersion}\n`);
    } catch (error) {
      clearConfig(args.values.config);
      throw error;
    }
    return;
  }

  const { defaultClientName } = await import("./lib/oauth.mjs");
  const login = await runLogin({
    origin,
    clientName: args.values.name ?? defaultClientName(),
    noBrowser: args.values["no-browser"] === true,
    log: (line) => process.stdout.write(`${line}\n`),
  });
  saveConfig(args.values.config, {
    origin,
    auth: {
      mode: "oauth",
      clientId: login.clientId,
      clientName: login.clientName,
      accessToken: login.tokens.access_token,
      refreshToken: login.tokens.refresh_token ?? null,
      accessExpiresAt: Date.now() + (login.tokens.expires_in ?? 3600) * 1000,
    },
  });
  process.stdout.write(`登录成功:${login.clientName} → ${origin}\n`);
  const session = newSession({ origin, provider: apiKeyProvider(login.tokens.access_token) });
  const info = await session.initialize();
  process.stdout.write(`已连通 ${info.serverInfo.title}(${info.serverInfo.version}),协议 ${session.protocolVersion}\n`);
}

async function cmdLogout(argv) {
  const args = parseCommand("logout", argv);
  const config = loadConfig(args.values.config);
  if (!config) {
    process.stdout.write("未登录,无需登出。\n");
    return;
  }
  if (config.auth.mode === "oauth" && config.auth.refreshToken) {
    try {
      const { revokeToken } = await import("./lib/oauth.mjs");
      await revokeToken({ origin: config.origin, clientId: config.auth.clientId, token: config.auth.refreshToken });
      process.stdout.write("已吊销服务端令牌族。\n");
    } catch (error) {
      process.stderr.write(`服务端吊销失败(${error instanceof Error ? error.message : error}),仍将删除本地凭据。\n`);
    }
  }
  clearConfig(args.values.config);
  process.stdout.write(`已删除本地凭据:${configPath(args.values.config)}\n`);
}

async function cmdWhoami(argv) {
  const args = parseCommand("whoami", argv);
  const credential = resolveCredential({ originFlag: args.values.origin, configFlag: args.values.config });
  const session = newSession(credential);
  const info = await session.initialize();
  if (args.values.json) {
    process.stdout.write(`${JSON.stringify({
      origin: credential.origin,
      credential: credential.describe,
      server: info.serverInfo,
      protocolVersion: session.protocolVersion,
      configPath: configPath(args.values.config),
    }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`端点:${credential.origin}/api/mcp\n`);
  process.stdout.write(`凭据:${credential.describe.label}\n`);
  if (credential.describe.expiresAt) {
    process.stdout.write(`令牌过期:${formatTime(credential.describe.expiresAt)}(过期自动刷新)\n`);
  }
  process.stdout.write(`服务端:${info.serverInfo.title}(${info.serverInfo.name} ${info.serverInfo.version})\n`);
  process.stdout.write(`协议版本:${session.protocolVersion}\n`);
}

async function cmdPing(argv) {
  const args = parseCommand("ping", argv);
  const credential = resolveCredential({ originFlag: args.values.origin, configFlag: args.values.config });
  const started = Date.now();
  await newSession(credential).ping();
  process.stdout.write(`pong(${Date.now() - started}ms,${credential.origin})\n`);
}

async function cmdTools(argv) {
  const [sub, ...rest] = argv;
  if (sub !== "list") {
    throw new CliError(`未知的 tools 子命令:${sub ?? "(空)"}`, { hint: "zc tools list" });
  }
  const args = parseCommand("tools list", rest);
  const credential = resolveCredential({ originFlag: args.values.origin, configFlag: args.values.config });
  const tools = await newSession(credential).listTools();
  if (args.values.json) {
    process.stdout.write(`${JSON.stringify(tools, null, 2)}\n`);
    return;
  }
  for (const tool of tools) {
    const required = Array.isArray(tool.inputSchema?.required) && tool.inputSchema.required.length
      ? `  必填:${tool.inputSchema.required.join(", ")}`
      : "  必填:(无)";
    process.stdout.write(`${tool.name}\n  ${String(tool.description ?? "").split("\n")[0]}\n${required}\n`);
  }
  process.stdout.write(`共 ${tools.length} 个工具。\n`);
}

function buildToolArguments({ argsJson, argList }) {
  let arguments_ = {};
  if (argsJson !== undefined) {
    let parsed;
    try {
      parsed = JSON.parse(argsJson);
    } catch {
      throw new CliError("--args 不是合法 JSON。", { hint: `--args '${argsJson.slice(0, 60)}…' 有语法错误。` });
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new CliError("--args 必须是 JSON 对象。");
    }
    arguments_ = { ...arguments_, ...parsed };
  }
  for (const pair of argList ?? []) {
    const split = pair.indexOf("=");
    if (split <= 0) throw new CliError(`--arg 需要 key=value 形式,收到:${pair}`);
    const key = pair.slice(0, split);
    const raw = pair.slice(split + 1);
    let value = raw;
    try {
      value = JSON.parse(raw);
    } catch {
      // 不是 JSON 字面量就按原始字符串传。
    }
    arguments_[key] = value;
  }
  return arguments_;
}

async function cmdCall(argv) {
  const args = parseCommand("call", argv, {
    args: { type: "string" },
    arg: { type: "string", multiple: true },
  }, 1);
  const [toolName] = args.positionals;
  if (!toolName) throw new CliError("缺少工具名。", { hint: "zc tools list 查看可用工具。" });
  const toolArguments = buildToolArguments({ argsJson: args.values.args, argList: args.values.arg });

  const credential = resolveCredential({ originFlag: args.values.origin, configFlag: args.values.config });
  const result = await newSession(credential).callTool(toolName, toolArguments);
  if (result?.isError) {
    process.stderr.write(`工具执行失败:${toolErrorSummary(result)}\n`);
    if (result.structuredContent && Object.keys(result.structuredContent).length > 1) {
      process.stderr.write(`${JSON.stringify(result.structuredContent, null, 2)}\n`);
    }
    process.exitCode = 1;
    return;
  }
  printToolResult(result, { json: args.values.json === true });
}

async function cmdHost(argv) {
  const [sub, ...rest] = argv;
  if (sub !== "upload") {
    throw new CliError(`未知的 host 子命令:${sub ?? "(空)"}`, { hint: "zc host upload <product_id> <bundle.zip>" });
  }
  const args = parseCommand("host upload", rest, {}, 2);
  const [productIdText, zipPath] = args.positionals;
  const productId = Number(productIdText);
  if (!Number.isSafeInteger(productId) || productId < 1) {
    throw new CliError(`product_id 必须是正整数,收到:${productIdText}`);
  }
  let fileSize;
  let fileBytes;
  try {
    fileSize = statSync(zipPath).size;
    fileBytes = readFileSync(zipPath);
  } catch (error) {
    throw new CliError(`无法读取 ZIP 文件:${zipPath}(${error instanceof Error ? error.message : error})`);
  }

  const credential = resolveCredential({ originFlag: args.values.origin, configFlag: args.values.config });
  const session = newSession(credential);
  const begin = await session.callTool("begin_hosting_upload", { product_id: productId });
  if (begin?.isError) {
    process.stderr.write(`申请上传地址失败:${toolErrorSummary(begin)}\n`);
    process.exitCode = 1;
    return;
  }
  const issued = begin.structuredContent ?? {};
  const uploadUrl = issued.upload_url;
  const maxBytes = Number(issued.max_bytes ?? 0);
  if (typeof uploadUrl !== "string" || !uploadUrl) {
    throw new CliError("begin_hosting_upload 响应缺少 upload_url。");
  }
  if (maxBytes > 0 && fileSize > maxBytes) {
    throw new CliError(`ZIP 为 ${fileSize} 字节,超过托管上限 ${maxBytes} 字节。`);
  }
  process.stdout.write(`已取得一次性上传地址(有效期至 ${issued.expires_at ?? "?"}),开始上传 ${fileSize} 字节…\n`);

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": "application/zip" },
    body: fileBytes,
    signal: AbortSignal.timeout(300_000),
  });
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => "");
    throw new CliError(`上传失败(HTTP ${uploadResponse.status}:${detail.slice(0, 200)})`, {
      hint: "一次性地址只能用一次且 15 分钟内有效;失败后重新 zc host upload。",
    });
  }
  process.stdout.write("上传完成,等待部署器处理。\n");
  const status = await session.callTool("get_hosting_status", { product_id: productId });
  printToolResult(status, { json: args.values.json === true });
}

const HELP = `zc ${CLI_VERSION} —— 造场 MCP 客户端

用法:zc <命令> [参数]

  login [--origin URL] [--name 名称] [--no-browser]   OAuth 浏览器授权登录
  login --api-key [--origin URL]                     粘贴个人 API key(zc_ 前缀)
  logout                                             吊销令牌并删除本地凭据
  whoami                                             查看当前凭据与服务端信息
  ping                                               连通性测试
  tools list [--json]                                列出 MCP 工具
  call <工具> [--args JSON] [--arg key=value …]      调用工具
  host upload <product_id> <bundle.zip>              申请一次性地址并上传静态站 ZIP

全局选项:--origin URL(默认 ${DEFAULT_ORIGIN})  --config 路径  --json

环境变量:ZC_API_KEY(zc_ 个人 API key,优先于登录凭据)、ZC_CLI_CONFIG(配置文件路径)

凭据保存在 ~/.zaochang/zc-cli.json(权限 0600);OAuth 刷新令牌自动轮换落盘。`;

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "login": return cmdLogin(rest);
    case "logout": return cmdLogout(rest);
    case "whoami": return cmdWhoami(rest);
    case "ping": return cmdPing(rest);
    case "tools": return cmdTools(rest);
    case "call": return cmdCall(rest);
    case "host": return cmdHost(rest);
    case "--version": case "-v":
      process.stdout.write(`${CLI_VERSION}\n`);
      return;
    case "--help": case "-h": case "help": case undefined:
      process.stdout.write(`${HELP}\n`);
      if (command === undefined) process.exitCode = 1;
      return;
    default:
      throw new CliError(`未知命令:${command}`, { hint: "zc --help 查看用法。" });
  }
}

// 只有作为脚本直接执行时才分发命令;被测试 import 时不产生副作用。
const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    if (error instanceof CliError || error instanceof McpError) {
      process.stderr.write(`${error.message}\n`);
      const hint = error instanceof McpError ? error.data?.hint : error.hint;
      if (hint) process.stderr.write(`${hint}\n`);
    } else {
      process.stderr.write(`意外错误:${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    }
    process.exitCode = 1;
  });
}
