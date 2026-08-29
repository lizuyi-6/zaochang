// 鉴权与访问控制的模块化入口:任何路由/页面/内容类型要启用鉴权,从这里一行接入。
// 只做代码声明,不做任何 UI 入口(启用 = import + 声明,不在站点界面上暴露任何配置入口)。
//
// 全景与职责分层(各层保持单一职责,本文件是决策层,也是消费者的唯一 import 面):
//  - 身份解析(是谁):chatgpt-auth.ts —— agent Bearer → 会话 Cookie → 遗留 OAI 头(生产禁用)
//  - 成员落地(记账):community.ts —— requireMember 惰性建 members/wallets/collections 行
//  - 角色白名单(配置):admin.ts —— isAdminEmail/isFounderEmail,读两个独立 env 白名单
//  - 机器能力闸(平行通道):agent-auth.ts + worker/index.ts —— AGENT_WRITE_CAPABILITIES,
//    worker 入口 fail-closed chokepoint,与本模块互不替代
//
// 三种"快速启用"姿势:
//  1) authorize({ member, roles }) —— 声明式:一句话说清"要不要登录 + 要什么角色"
//  2) requireRole/requireAdmin/requireFounder/requireDocEditor —— 命令式便捷原语
//  3) canViewContent —— 通用内容可见性闸:任何内容类型用同一 visibility 语义
//     (public | members | private)一行接闸;docs 的 canViewDoc 委托至此。
// 错误统一走 accessError(coded error),由 community.ts 的 jsonError 识别并映射为
// { error: code } + status;页面侧调用方 catch 后自行 notFound()/redirect,与现状一致。
import { optionalMember, requireMember, type MemberIdentity } from "./community";
import { accessError } from "./errors";
import { isFounderEmail, isAdminEmail } from "./admin";

export { optionalMember, requireMember };
export { isAdminEmail, isFounderEmail };
// accessError 的实现已收敛到 errors.ts(错误语义单一事实来源);此处 re-export 维持模块入口不变。
export { accessError };
export type { MemberIdentity };

// 角色是两个独立 env 白名单的投影(ZAOCHANG_ADMIN_EMAILS / ZAOCHANG_FOUNDER_EMAIL),
// 互不推导。新增角色 = 在 admin.ts 加白名单读取 + 在此扩展 hasRole,调用方无感。
export type AccessRole = "admin" | "founder";

export type AccessRule = {
  // "required":未登录 → 401 auth_required(并照常惰性落地成员行);
  // "optional":未登录返回 null,不抛错(角色要求仅在已登录时校验)。
  member: "required" | "optional";
  // 需要的角色,命中其一即可。未命中 → 403;单角色时错误码为 <role>_forbidden
  // (admin_forbidden / founder_forbidden,与历史语义逐字一致),多角色时为 role_forbidden。
  roles?: readonly AccessRole[];
};

// 统一 coded error:jsonError 按形状识别。不要在路由里再手写 Object.assign(new Error...)。
// (实现见 errors.ts,此处 re-export。)

export function hasRole(member: MemberIdentity, role: AccessRole): boolean {
  if (role === "admin") return isAdminEmail(member.email);
  return isFounderEmail(member.email);
}

function roleDeniedCode(roles: readonly AccessRole[]): string {
  return roles.length === 1 ? `${roles[0]}_forbidden` : "role_forbidden";
}

// 声明式守卫。API 路由的典型接入:
//   const member = await authorize({ member: "required", roles: ["admin"] });
// 页面组件的典型接入(catch → notFound(),不泄露存在性):
//   try { await authorize({ member: "required", roles: ["founder"] }); } catch { notFound(); }
export async function authorize(rule: AccessRule): Promise<MemberIdentity | null> {
  if (rule.member === "required") {
    return requireRole(...(rule.roles ?? []));
  }
  const member = await optionalMember();
  if (!member) return null;
  if (rule.roles && rule.roles.length > 0 && !rule.roles.some((role) => hasRole(member, role))) {
    throw accessError(roleDeniedCode(rule.roles), 403);
  }
  return member;
}

// 命令式原语:必须登录 + 命中任一角色。无角色参数时等价 requireMember。
export async function requireRole(...roles: AccessRole[]): Promise<MemberIdentity> {
  const member = await requireMember();
  if (roles.length > 0 && !roles.some((role) => hasRole(member, role))) {
    throw accessError(roleDeniedCode(roles), 403);
  }
  return member;
}

// 历史语义别名(错误码/状态码与旧 admin.ts 实现逐字一致)。
export function requireAdmin(): Promise<MemberIdentity> {
  return requireRole("admin");
}

export function requireFounder(): Promise<MemberIdentity> {
  return requireRole("founder");
}

// 文档编辑准入:founder 或 agent。后者由 worker 入口能力表保证只命中 POST/PATCH /api/docs;
// DELETE 走 requireFounder → agent 被拦。agent 不继承 founder 的其他权限(财务/admin 等)。
export async function requireDocEditor(): Promise<MemberIdentity> {
  const member = await requireMember();
  if (member.isAgent) return member;
  if (isFounderEmail(member.email)) return member;
  throw accessError("founder_forbidden", 403);
}

// ---- 通用内容可见性闸 ----
// 任何内容类型(文档/书籍/产品/未来新类型)复用同一 visibility 语义:
//   public → 人人可见;members/private → 需登录(当前两者等价,细分属后续产品决策)。
// fail-closed 语义由调用方保证:不可见时对外表现与"不存在"一致(404,不泄露存在性)。
export type ContentVisibility = "public" | "members" | "private";
export type GatedContent = { visibility: ContentVisibility };

export function canViewContent(content: GatedContent, member: MemberIdentity | null): boolean {
  if (content.visibility === "public") return true;
  return member !== null;
}
