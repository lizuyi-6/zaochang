// 会员身份字段的校验纯逻辑(零 import):唯一用户名 + 昵称 + 首次引导的选填资料。
// 服务端(/api/onboarding、/api/profile/identity、管理员开通)、引导页表单与 Node 测试共用。
// 用户名格式与 drizzle/0043 的触发器同口径——这里给友好错误码,触发器是绕不过的底线。

export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,19}$/;
export const NICKNAME_LIMITS = { min: 2, max: 20 } as const;
export const PROFILE_LIMITS = { bioMin: 4, bioMax: 180, location: 40, website: 120 } as const;

// 保留名:站点/角色/系统词,防冒充与路由撞名。全部小写,比较前已归一。
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "admin", "administrator", "root", "system", "sysadmin", "superuser",
  "zaochang", "aether", "aetherstudio", "official", "staff", "team",
  "support", "help", "service", "security", "moderator", "mod",
  "founder", "agent", "bot", "api", "www", "mail", "email", "noreply",
  "lattice", "jianjie", "hyperknow", "welcome", "signin", "signup",
  "login", "logout", "apply", "profile", "settings", "null", "undefined",
]);

// 昵称里不允许出现的冒充词(子串匹配)。
const RESERVED_NICKNAME_FRAGMENTS = ["造场官方", "官方账号", "管理员", "系统消息"];

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const stripControls = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, " ");

// 用户名:NFKC 归一(全角 ｚｃ → zc)、去空白、转小写,再按格式与保留名判定。
export function normalizeUsername(value: unknown): Result<string> {
  if (typeof value !== "string") return { ok: false, error: "invalid_username" };
  const username = value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  if (!USERNAME_PATTERN.test(username)) return { ok: false, error: "invalid_username" };
  if (RESERVED_USERNAMES.has(username)) return { ok: false, error: "username_reserved" };
  return { ok: true, value: username };
}

// 昵称:可重复;按字符(码点)计长,压空白、去控制字符。
export function normalizeNickname(value: unknown): Result<string> {
  if (typeof value !== "string") return { ok: false, error: "invalid_nickname" };
  const nickname = stripControls(value).replace(/\s+/g, " ").trim();
  const length = [...nickname].length;
  if (length < NICKNAME_LIMITS.min || length > NICKNAME_LIMITS.max) return { ok: false, error: "invalid_nickname" };
  if (RESERVED_NICKNAME_FRAGMENTS.some((fragment) => nickname.includes(fragment))) {
    return { ok: false, error: "nickname_reserved" };
  }
  return { ok: true, value: nickname };
}

// 选填资料:空 = 不改(保留现值),非空才校验。口径与资料编辑(update_profile)一致。
export type OptionalProfile = { bio: string | null; location: string | null; website: string | null };

export function normalizeOptionalProfile(input: Record<string, unknown>): Result<OptionalProfile> {
  const text = (value: unknown) => (typeof value === "string" ? stripControls(value).trim() : "");
  const bio = text(input.bio);
  const location = text(input.location).replace(/\s+/g, " ");
  const website = text(input.website);
  if (bio && ([...bio].length < PROFILE_LIMITS.bioMin || [...bio].length > PROFILE_LIMITS.bioMax)) {
    return { ok: false, error: "invalid_bio" };
  }
  if ([...location].length > PROFILE_LIMITS.location) return { ok: false, error: "invalid_location" };
  // 与 community-actions.ts update_profile 同一条规则(http(s):// 开头或形如 example.com)。
  if (website && (website.length > PROFILE_LIMITS.website || !/^(https?:\/\/|[\w.-]+\.[a-z]{2,})/i.test(website))) {
    return { ok: false, error: "invalid_website" };
  }
  return { ok: true, value: { bio: bio || null, location: location || null, website: website || null } };
}
