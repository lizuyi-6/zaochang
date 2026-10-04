// 本地开发模拟登录(dev-login)的纯逻辑:零依赖(不引 cloudflare:workers/其他模块),
// 测试用 --experimental-strip-types 直接 import。下方 AGENT_EMAIL 字面量与
// agent-auth.ts 的导出常量等值,由 hyperknow-hardening 契约钉双向锁死。
//
// 双 fail-closed 门禁(chatgpt-auth 的遗留身份头门禁与此同一 APP_ENV 白名单口径):
// 1) APP_ENV=production 无条件拒绝(即便误配 LOCAL_DEV_LOGIN=1);
// 2) 其余环境必须 APP_ENV 显式等于 development/test 且 LOCAL_DEV_LOGIN=1 才开启。
//    APP_ENV 缺省/typo(如 "PRODUCTION"、未设置)一律视为关闭——生产不靠"忘配"兜底。

export type RawDevLoginEnv = Record<string, string | undefined>;

export function localDevLoginEnabled(env: RawDevLoginEnv): boolean {
  if (env.APP_ENV === "production") return false;
  return (env.APP_ENV === "development" || env.APP_ENV === "test") && env.LOCAL_DEV_LOGIN === "1";
}

// chatgpt-auth 的 oai-authenticated-user-* 遗留身份头门禁(与上方 dev-login 同一
// APP_ENV 白名单口径,抽到这里共用一份实现)。Fail-closed:仅 development/test 显式
// 信任;staging / 未设置 / 拼写错误(如 "Production")一律拒绝——公网可达的 worker
// 一旦信任这些头,任意客户端都能自封任意 email(含创始人/管理员),整账户接管。
// 原 TRUST_OAI_IDENTITY_HEADERS=true 会在 staging 或 APP_ENV 未设置时打开该门,
// 已随开关一并移除(2026-10 全库审查 A4),本函数不读它。
export function legacyIdentityHeadersEnabled(env: RawDevLoginEnv): boolean {
  return env.APP_ENV === "development" || env.APP_ENV === "test";
}

export const DEV_LOGIN_DEFAULT_EMAIL = "preview@zaochang.test";
export const DEV_LOGIN_EMAIL_MAX = 200;

// 规范化+白名单校验;空值回落默认邮箱;非法形状/字符返回 null。
// A8(2026-10 审计):①拒绝 agent 服务账户邮箱——dev-login 自选该邮箱会在
// access-control 的 agent 判定上制造身份混淆(现按 isAgent 判定,但机器身份
// 本就不该被人类模拟登录认领);②域名必须含点,挡 "agent@zaochang" 这类
// dot-less 域(真实域名恒有 TLD)。
export function normalizeDevLoginEmail(raw: string | null | undefined): string | null {
  const email = (raw ?? "").trim().toLowerCase();
  if (!email) return DEV_LOGIN_DEFAULT_EMAIL;
  if (email.length > DEV_LOGIN_EMAIL_MAX) return null;
  const at = email.lastIndexOf("@");
  // 只允许恰好一个 @:lastIndexOf 能挡 "a@" / "@b",但 "a@b@c" 需要首个 @ 与其重合才挡得住。
  if (at <= 0 || at === email.length - 1 || email.indexOf("@") !== at) return null;
  if (/[^a-z0-9._+\-@]/.test(email)) return null;
  if (email === "agent@zaochang") return null;
  if (!email.slice(at + 1).includes(".")) return null;
  return email;
}
