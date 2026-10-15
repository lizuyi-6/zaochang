-- M1(2026-10 审计):follow_creator 的 target_ref 存量回填。
-- 此前 follow 的 target_ref 直接存显示名,而 members.display_name 无唯一约束且每次
-- 登录 upsert——重名用户会互相冒领粉丝数/通知/feed「关注」内容。新代码(2026-10)
-- 起 target_ref 一律存目标成员 email(唯一身份键);本迁移把存量行里"能无歧义
-- 解析"的显示名换成对应 email:
--   * 显示名在 members 中恰好唯一 → 回填;
--   * 已是某个成员 email 的行 → 原样(防显示名文本恰与 email 同形的成员被误改);
--   * 重名/无主行 → 原样保留。它们对新的读取路径(按 email 匹配)永远不命中,
--     等价于死数据,不会造成错投;需要时由运营按 created_at 语境人工裁定。
UPDATE `community_actions`
SET `target_ref` = (
	SELECT m.`email` FROM `members` m
	WHERE m.`display_name` = `community_actions`.`target_ref`
)
WHERE `kind` = 'follow_creator'
  AND NOT EXISTS (SELECT 1 FROM `members` m WHERE m.`email` = `community_actions`.`target_ref`)
  AND (SELECT COUNT(*) FROM `members` m WHERE m.`display_name` = `community_actions`.`target_ref`) = 1;
