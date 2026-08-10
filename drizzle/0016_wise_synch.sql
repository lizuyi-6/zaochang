ALTER TABLE `members` ADD `member_number` integer;--> statement-breakpoint
-- 回填:按注册时间(joined_at)升序、email 兜底,给每个现有 member 一个唯一递增号。
-- 创始人(joined_at 最早)→ #0001。仅处理仍为 NULL 的行,幂等可重放。
WITH ranked AS (
  SELECT email, ROW_NUMBER() OVER (ORDER BY joined_at ASC, email ASC) AS rn
  FROM members
)
UPDATE members
SET member_number = (SELECT rn FROM ranked WHERE ranked.email = members.email)
WHERE member_number IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `members_member_number_idx` ON `members` (`member_number`);--> statement-breakpoint
-- 新成员自动获 MAX(member_number)+1。ensureMember 的 INSERT 不写此列 → NULL → trigger 接管。
-- 仿本仓惯例(不变量靠 trigger 而非仅应用代码),保证即便直接写 D1 也成立。
-- D1 单写入者串行写入 + 上方 UNIQUE 索引兜底:若极端并发撞号,INSERT 会以约束失败可见暴露(非 fail-open)。
CREATE TRIGGER `members_assign_member_number`
AFTER INSERT ON `members`
WHEN NEW.member_number IS NULL
BEGIN
  UPDATE `members`
  SET member_number = (SELECT COALESCE(MAX(member_number), 0) + 1 FROM `members`)
  WHERE email = NEW.email;
END;