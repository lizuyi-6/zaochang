// zc CLI 凭据持久化:单一 JSON 文件保存 origin + 一份凭据(OAuth 或个人 API key)。
// - 路径解析顺序:--config 参数 > ZC_CLI_CONFIG 环境变量 > ~/.zaochang/zc-cli.json。
// - 原子写(tmp + rename),目录 0700、文件 0600(best-effort,Windows 上 chmod 是近似)。
// - OAuth 刷新令牌是轮换语义(重放会全族吊销),所以每次拿到新令牌都必须立刻落盘。

import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { CliError } from "./util.mjs";

export const DEFAULT_ORIGIN = "https://aetherstudio.top";
const CONFIG_VERSION = 1;

/** 解析配置文件路径。preferExplicit 是 --config 的值;env 每次调用时读(懒)。 */
export function configPath(preferExplicit) {
  if (preferExplicit) return path.resolve(preferExplicit);
  const fromEnv = process.env.ZC_CLI_CONFIG;
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(homedir(), ".zaochang", "zc-cli.json");
}

/**
 * @typedef {{ mode: "oauth", clientId: string, clientName: string, accessToken: string,
 *             refreshToken: string | null, accessExpiresAt: number }}
 * @typedef {{ mode: "api_key", apiKey: string }}
 * @typedef {{ version: number, origin: string, auth: (OAuthAuth | ApiKeyAuth) }} CliConfig
 */

/** 读取配置;文件不存在返回 null;损坏则报错并给出修复方式(fail loud,不静默重登)。 */
export function loadConfig(preferExplicit) {
  const file = configPath(preferExplicit);
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CliError(`配置文件不是合法 JSON:${file}`, { hint: "删除该文件后重新 zc login。" });
  }
  if (!parsed || typeof parsed !== "object" || typeof parsed.origin !== "string"
    || !parsed.auth || typeof parsed.auth !== "object" || typeof parsed.auth.mode !== "string") {
    throw new CliError(`配置文件结构不完整:${file}`, { hint: "删除该文件后重新 zc login。" });
  }
  return parsed;
}

/** 原子保存配置。ensureFreshAuth 由调用方在拿到新令牌后立即调用。 */
export function saveConfig(preferExplicit, config) {
  const file = configPath(preferExplicit);
  const dir = path.dirname(file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify({ ...config, version: CONFIG_VERSION }, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(tmp, 0o600);
  } catch {
    // Windows/部分文件系统不支持精确 chmod,尽力而为。
  }
  renameSync(tmp, file);
  try {
    chmodSync(file, 0o600);
  } catch {
    // 同上。
  }
}

/** 删除配置(登出)。文件不存在视为成功。凭据文件必须真删——改名留存等于没登出。 */
export function clearConfig(preferExplicit) {
  const file = configPath(preferExplicit);
  try {
    rmSync(file, { force: true });
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
}

/**
 * OAuth 凭据的懒加载 token provider:过期前 30s 主动刷新;401 时 invalidate() 强制刷新。
 * 每次刷新成功立即落盘(轮换令牌丢一次就是全族吊销,不能攒在内存里)。
 */
export function oauthTokenProvider({ origin, loadAuth, saveAuth }) {
  const provider = async () => {
    const auth = await loadAuth();
    if (auth.mode !== "oauth" || !auth.accessToken) {
      throw new CliError("当前没有可用的 OAuth 令牌。", { hint: "先运行 zc login。" });
    }
    if (!auth.accessExpiresAt || auth.accessExpiresAt - 30_000 <= Date.now()) {
      return provider.invalidate();
    }
    return auth.accessToken;
  };
  provider.invalidate = async () => {
    const auth = await loadAuth();
    if (auth.mode !== "oauth" || !auth.refreshToken) {
      throw new CliError("登录已失效且没有刷新令牌。", { hint: "重新运行 zc login。" });
    }
    const { refreshTokens } = await import("./oauth.mjs");
    const tokens = await refreshTokens({ origin, clientId: auth.clientId, refreshToken: auth.refreshToken });
    await saveAuth({
      ...auth,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      accessExpiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    });
    return tokens.access_token;
  };
  return provider;
}
