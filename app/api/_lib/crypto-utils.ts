// 常量时间比较与 base64url 的单一实现(2026-10 审计重构 #6):此前 agent-auth 与
// oauth-session 各持一份同款拷贝。零 import——测试可 --experimental-strip-types 直载。
//
// 常量时间比较:token/state/验证码哈希同为高熵认证值,防时序侧信道泄露;长度不等
// 直接 false(长度本身不是秘密)。
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
