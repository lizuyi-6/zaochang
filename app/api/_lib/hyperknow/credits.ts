import { database } from "../community";

// hyperknow 独立积分(每日重置)。
// - 每日额度 HK_DAILY_CREDITS,北京日界(UTC+8)零点整额续满;懒重置:读取/消费
//   时发现 reset_date 落后当天即续满,不需要定时任务,错过的日子自然归零重来。
// - 扣减是条件 UPDATE(balance >= cost),SQLite 写串行化保证并发下不可能透支;
//   changes=0 即余额不足。调用方约定"先校验后扣费":配置缺失/上游非 2xx 的失败
//   发生在扣费点之前(不在流中),不产生扣费;流开始后的中途失败不退费。
// - 消费档位:AI 对话 HK_CHAT_COST,课程蓝图生成 HK_COURSE_COST(白板/TTS 不计费)。

export const HK_DAILY_CREDITS = 20;
export const HK_CHAT_COST = 2;
export const HK_COURSE_COST = 10;

// 北京日期(UTC+8)的 YYYY-MM-DD。toISOString 恒为 UTC,加 8h 偏移即北京挂钟日期。
export function beijingToday(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}

// 懒重置 + 确保行存在;返回今日余额。INSERT..ON CONFLICT 里用 reset_date 比对:
// 已是今天 → 保留余额;落后 → 整额续满(excluded.balance 即每日额度)。
async function ensureFreshRow(userEmail: string, today: string): Promise<void> {
  await database()
    .prepare(
      `INSERT INTO hk_credits (user_email, balance, reset_date) VALUES (?, ?, ?)
       ON CONFLICT(user_email) DO UPDATE SET
         balance = CASE WHEN reset_date = excluded.reset_date THEN balance ELSE excluded.balance END,
         reset_date = excluded.reset_date,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(userEmail, HK_DAILY_CREDITS, today)
    .run();
}

export async function currentCredits(
  userEmail: string,
): Promise<{ remaining: number; max: number }> {
  const today = beijingToday();
  await ensureFreshRow(userEmail, today);
  const row = await database()
    .prepare(`SELECT balance FROM hk_credits WHERE user_email = ? AND reset_date = ?`)
    .bind(userEmail, today)
    .first<{ balance: number }>();
  return { remaining: row?.balance ?? HK_DAILY_CREDITS, max: HK_DAILY_CREDITS };
}

// 条件扣减。成功返回扣后余额;余额不足(含 cost > 今日额度本身)返回 null。
export async function consumeCredits(userEmail: string, cost: number): Promise<number | null> {
  const today = beijingToday();
  await ensureFreshRow(userEmail, today);
  const updated = await database()
    .prepare(
      `UPDATE hk_credits SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_email = ? AND reset_date = ? AND balance >= ?`,
    )
    .bind(cost, userEmail, today, cost)
    .run();
  if (Number(updated.meta.changes ?? 0) === 0) return null;
  const row = await database()
    .prepare(`SELECT balance FROM hk_credits WHERE user_email = ?`)
    .bind(userEmail)
    .first<{ balance: number }>();
  return row?.balance ?? null;
}
