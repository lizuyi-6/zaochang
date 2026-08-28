// 本地开发模拟登录(dev-login)的纯逻辑:零依赖(不引 cloudflare:workers),
// 测试可像 reading-ai-prompts.ts 一样直接 import。
//
// 双 fail-closed 门禁,比 chatgpt-auth 的 TRUST_OAI_IDENTITY_HEADERS 更严:
// 1) APP_ENV=production 无条件拒绝(即便误配 LOCAL_DEV_LOGIN=1);
// 2) 其余环境必须 APP_ENV 显式等于 development/test 且 LOCAL_DEV_LOGIN=1 才开启。
//    APP_ENV 缺省/typo(如 "PRODUCTION"、未设置)一律视为关闭——生产不靠"忘配"兜底。

export type RawDevLoginEnv = Record<string, string | undefined>;

export function localDevLoginEnabled(env: RawDevLoginEnv): boolean {
  if (env.APP_ENV === "production") return false;
  return (env.APP_ENV === "development" || env.APP_ENV === "test") && env.LOCAL_DEV_LOGIN === "1";
}

export const DEV_LOGIN_DEFAULT_EMAIL = "preview@zaochang.test";
export const DEV_LOGIN_EMAIL_MAX = 200;

// 规范化+白名单校验;空值回落默认邮箱;非法形状/字符返回 null。
export function normalizeDevLoginEmail(raw: string | null | undefined): string | null {
  const email = (raw ?? "").trim().toLowerCase();
  if (!email) return DEV_LOGIN_DEFAULT_EMAIL;
  if (email.length > DEV_LOGIN_EMAIL_MAX) return null;
  const at = email.lastIndexOf("@");
  // 只允许恰好一个 @:lastIndexOf 能挡 "a@" / "@b",但 "a@b@c" 需要首个 @ 与其重合才挡得住。
  if (at <= 0 || at === email.length - 1 || email.indexOf("@") !== at) return null;
  if (/[^a-z0-9._+\-@]/.test(email)) return null;
  return email;
}
