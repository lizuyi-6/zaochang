// 会员身份相关 SQL(零 import):注册建行、GitHub 昵称同步、完成引导、设用户名/昵称、管理员开通。
// 路由与 tests/member-onboarding.test.mjs 共用同一份文本(node:sqlite + 全量迁移直接执行)。

// GitHub 每次登录同步昵称:本人设定过昵称(display_name_custom=1)后不再覆盖。
// 绑定:displayName, email
export const SYNC_PROVIDER_DISPLAY_NAME_SQL = `UPDATE members SET display_name = ? WHERE email = ? AND display_name_custom = 0`;

// 邀请码注册(GitHub):新成员带 onboarding_required=1;同邮箱已是成员时(换登录方式)
// 不动引导标记,本人设定过的昵称也不覆盖。绑定:email, displayName
export const OAUTH_REGISTER_MEMBER_SQL = `INSERT INTO members (email, display_name, onboarding_required)
VALUES (?, ?, 1)
ON CONFLICT(email) DO UPDATE SET display_name = CASE
  WHEN members.display_name_custom = 1 THEN members.display_name
  ELSE excluded.display_name
END`;

// 邀请码注册(邮箱):新成员带 onboarding_required=1。绑定:email, displayName
export const EMAIL_REGISTER_MEMBER_SQL = `INSERT INTO members (email, display_name, onboarding_required)
VALUES (?, ?, 1)
ON CONFLICT(email) DO NOTHING`;

// 管理员开通:不经邀请码。普通 INSERT(邮箱已存在即 UNIQUE 失败、整批回滚)。绑定:email, displayName
export const PROVISION_MEMBER_SQL = `INSERT INTO members (email, display_name, onboarding_required) VALUES (?, ?, 1)`;

// 完成引导:只在仍待引导且尚无用户名时生效;选填资料传 NULL 表示保留现值。
// 绑定:username, nickname, bio, bio, location, location, website, website, email
export const COMPLETE_ONBOARDING_SQL = `UPDATE members
SET username = ?, display_name = ?, display_name_custom = 1,
    bio = CASE WHEN ? IS NULL THEN bio ELSE ? END,
    location = CASE WHEN ? IS NULL THEN location ELSE ? END,
    website = CASE WHEN ? IS NULL THEN website ELSE ? END,
    onboarding_required = 0
WHERE email = ? AND onboarding_required = 1 AND username IS NULL`;

// 资料页一次性认领用户名(存量会员)。绑定:username, email
export const CLAIM_USERNAME_SQL = `UPDATE members SET username = ? WHERE email = ? AND username IS NULL`;

// 资料页改昵称。绑定:nickname, email
export const SET_NICKNAME_SQL = `UPDATE members SET display_name = ?, display_name_custom = 1 WHERE email = ?`;
