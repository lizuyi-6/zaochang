-- 0019:社区计数与可见性触发器补齐 + 点赞每日限额时区对齐
--
-- 背景(缺陷修复):
-- 1. posts.likes_count 是死计数器:like_post 只写 community_actions,无任何自增
--    点,所有帖子永远显示 0 赞。仿 products 的 product_likes 计数器(0007/0008)
--    为 posts 建对称触发器,并回填存量。
-- 2. posts.comments_count 的自增在应用层是 INSERT 后单独一条 UPDATE(非原子),
--    且无递减路径(隐藏评论后计数虚高)。改为触发器维护:可见评论 INSERT +1,
--    moderation 隐藏 -1;应用层不再手写 UPDATE。
-- 3. 帖子被管理员隐藏后,其评论区仍可读可写(comments 路由只对 product 目标做
--    可见性校验)。补 DB 层闸:隐藏帖禁止新评论(直连 D1 写同样被挡);
--    读取侧的校验在 comments 路由内。
-- 4. 点赞奖励"每日"限额(0003)按 UTC 午夜重置,对中文社区是早 8 点;与统计侧
--    的 '+8 hours' 口径(public-community todayFruitMovement)不一致。统一对齐
--    北京时间午夜:created_at(UTC) >= datetime('now','+8 hours','start of day','-8 hours')。
--    应用层 fruit.ts 的限额预检查使用同一表达式,两侧口径一致。
--
-- 纯触发器/数据回填迁移:不改任何表结构,snapshot 与 0018 相同(0009 先例)。

-- ---------- 1. posts.likes_count 触发器 + 回填 ----------
CREATE TRIGGER `post_likes_count_insert`
AFTER INSERT ON `community_actions`
WHEN NEW.`kind` = 'like_post' AND NEW.`target_ref` GLOB '[0-9]*'
BEGIN
  UPDATE `posts`
  SET `likes_count` = `likes_count` + 1
  WHERE `id` = CAST(NEW.`target_ref` AS INTEGER);
END;--> statement-breakpoint
CREATE TRIGGER `post_likes_count_delete`
AFTER DELETE ON `community_actions`
WHEN OLD.`kind` = 'like_post' AND OLD.`target_ref` GLOB '[0-9]*'
BEGIN
  UPDATE `posts`
  SET `likes_count` = MAX(0, `likes_count` - 1)
  WHERE `id` = CAST(OLD.`target_ref` AS INTEGER);
END;--> statement-breakpoint
UPDATE `posts`
SET `likes_count` = (
  SELECT COUNT(*) FROM `community_actions`
  WHERE `kind` = 'like_post' AND `target_ref` = CAST(`posts`.`id` AS TEXT)
);--> statement-breakpoint

-- ---------- 2. posts.comments_count 触发器 + 回填 ----------
CREATE TRIGGER `post_comments_count_insert`
AFTER INSERT ON `comments`
WHEN NEW.`target_type` = 'post' AND NEW.`target_ref` GLOB '[0-9]*'
  AND NEW.`moderation_status` = 'visible'
BEGIN
  UPDATE `posts`
  SET `comments_count` = `comments_count` + 1
  WHERE `id` = CAST(NEW.`target_ref` AS INTEGER);
END;--> statement-breakpoint
CREATE TRIGGER `post_comments_count_hide`
AFTER UPDATE OF `moderation_status` ON `comments`
WHEN OLD.`moderation_status` = 'visible' AND NEW.`moderation_status` <> 'visible'
  AND NEW.`target_type` = 'post' AND NEW.`target_ref` GLOB '[0-9]*'
BEGIN
  UPDATE `posts`
  SET `comments_count` = MAX(0, `comments_count` - 1)
  WHERE `id` = CAST(NEW.`target_ref` AS INTEGER);
END;--> statement-breakpoint
UPDATE `posts`
SET `comments_count` = (
  SELECT COUNT(*) FROM `comments`
  WHERE `comments`.`target_type` = 'post'
    AND `comments`.`target_ref` = CAST(`posts`.`id` AS TEXT)
    AND `comments`.`moderation_status` = 'visible'
);--> statement-breakpoint

-- ---------- 3. 隐藏帖评论区闸(直连 D1 写也成立) ----------
CREATE TRIGGER `post_comments_visible_post_guard`
BEFORE INSERT ON `comments`
WHEN NEW.`target_type` = 'post'
  AND NEW.`target_ref` GLOB '[0-9]*'
  AND NOT EXISTS (
    SELECT 1 FROM `posts`
    WHERE CAST(`id` AS TEXT) = NEW.`target_ref`
      AND `moderation_status` = 'visible'
  )
BEGIN SELECT RAISE(ABORT, 'post_comment_post_not_visible'); END;--> statement-breakpoint

-- ---------- 4. 点赞每日限额对齐北京时间午夜(0003 原文重建,仅改窗口表达式) ----------
DROP TRIGGER `fruit_reward_actor_daily_guard`;--> statement-breakpoint
DROP TRIGGER `fruit_reward_recipient_daily_guard`;--> statement-breakpoint
CREATE TRIGGER `fruit_reward_actor_daily_guard`
BEFORE INSERT ON `fruit_reward_events`
WHEN NEW.`status` = 'granted' AND (
	SELECT COUNT(*) FROM `fruit_reward_events`
	WHERE `actor_email` = NEW.`actor_email`
	  AND `status` = 'granted'
	  AND `created_at` >= datetime('now', '+8 hours', 'start of day', '-8 hours')
) >= 10
BEGIN SELECT RAISE(ABORT, 'like_actor_daily_limit'); END;--> statement-breakpoint
CREATE TRIGGER `fruit_reward_recipient_daily_guard`
BEFORE INSERT ON `fruit_reward_events`
WHEN NEW.`status` = 'granted' AND COALESCE((
	SELECT SUM(`amount`) FROM `fruit_reward_events`
	WHERE `recipient_email` = NEW.`recipient_email`
	  AND `status` = 'granted'
	  AND `created_at` >= datetime('now', '+8 hours', 'start of day', '-8 hours')
), 0) + NEW.`amount` > 20
BEGIN SELECT RAISE(ABORT, 'like_recipient_daily_limit'); END;--> statement-breakpoint
