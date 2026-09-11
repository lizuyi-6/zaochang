import { env } from "cloudflare:workers";
import { database } from "../community";
import { isFounderEmail } from "../admin";

// hyperknow 独立积分与会员套餐(每日重置)。
// - 每日额度根据会员套餐划分: FREE=20, PRO=100, MAX=500, 北京日界(UTC+8)零点整额续满;
//   创始人号或 HK_MAX_USERS/HK_USER_TIERS 自动激活 MAX 套餐。
// - 懒重置:读取/消费时发现 reset_date 落后当天即续满,不需要定时任务,错过的日子自然归零重来。
// - 扣减是条件 UPDATE(balance >= cost),SQLite 写串行化保证并发下不可能透支;
//   changes=0 即余额不足。调用方约定"先校验后扣费"。
// - 消费档位:AI 对话 HK_CHAT_COST=2, 课程蓝图生成 HK_COURSE_COST=10 (白板/TTS 不计费)。

export const HK_DAILY_CREDITS = 20;
export const HK_CHAT_COST = 2;
export const HK_COURSE_COST = 10;

export type SubscriptionTier = "FREE" | "PRO" | "MAX";

export const TIER_CONFIG: Record<SubscriptionTier, { maxCredits: number; label: string }> = {
  FREE: { maxCredits: 20, label: "FREE" },
  PRO: { maxCredits: 100, label: "PRO" },
  MAX: { maxCredits: 500, label: "MAX" },
};

/** 解析用户的订阅等级：支持环境变量指定、指定名单，以及创始人号默认激活 MAX 套餐 */
export function resolveUserTier(userEmail: string): SubscriptionTier {
  const normEmail = userEmail.trim().toLowerCase();
  const values = env as unknown as Record<string, string | undefined>;

  // 1. 显式用户套餐映射: HK_USER_TIERS="2251213429@qq.com:MAX,other@x.com:PRO"
  const tierPairs = (values.HK_USER_TIERS || "").split(",");
  for (const pair of tierPairs) {
    const [e, t] = pair.split(":").map((s) => s.trim().toLowerCase());
    if (e === normEmail) {
      if (t === "max") return "MAX";
      if (t === "pro") return "PRO";
      return "FREE";
    }
  }

  // 2. HK_MAX_USERS 白名单
  const maxUsers = (values.HK_MAX_USERS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (maxUsers.includes(normEmail)) return "MAX";

  // 3. 创始人号天然默认享有 MAX 尊享套餐
  if (isFounderEmail(normEmail) || normEmail === "2251213429@qq.com") {
    return "MAX";
  }

  return "FREE";
}

export function dailyCreditsFor(userEmail: string): number {
  const tier = resolveUserTier(userEmail);
  return TIER_CONFIG[tier].maxCredits;
}

// 北京日期(UTC+8)的 YYYY-MM-DD。toISOString 恒为 UTC,加 8h 偏移即北京挂钟日期。
export function beijingToday(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}

// 懒重置 + 确保行存在;返回今日余额。INSERT..ON CONFLICT 里用 reset_date 比对:
// 已是今天 → 保留余额;落后 → 整额续满(excluded.balance 即每日额度)。
async function ensureFreshRow(userEmail: string, today: string): Promise<void> {
  const max = dailyCreditsFor(userEmail);
  await database()
    .prepare(
      `INSERT INTO hk_credits (user_email, balance, reset_date) VALUES (?, ?, ?)
       ON CONFLICT(user_email) DO UPDATE SET
         balance = CASE WHEN reset_date = excluded.reset_date THEN balance ELSE excluded.balance END,
         reset_date = excluded.reset_date,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(userEmail, max, today)
    .run();
}

export async function currentCredits(
  userEmail: string,
): Promise<{ remaining: number; max: number; tier: SubscriptionTier }> {
  const today = beijingToday();
  const max = dailyCreditsFor(userEmail);
  const tier = resolveUserTier(userEmail);
  await ensureFreshRow(userEmail, today);
  const row = await database()
    .prepare(`SELECT balance FROM hk_credits WHERE user_email = ? AND reset_date = ?`)
    .bind(userEmail, today)
    .first<{ balance: number }>();
  return { remaining: row?.balance ?? max, max, tier };
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

// 确保幂等计费锁表存在
async function ensureCreditChargesTable(): Promise<void> {
  try {
    await database()
      .prepare(
        `CREATE TABLE IF NOT EXISTS hk_credit_charges (
          key TEXT PRIMARY KEY,
          user_email TEXT NOT NULL,
          cost INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          lease_token TEXT,
          lease_expires_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
      )
      .run();
  } catch (err) {
    console.warn("[hyperknow-credits] ensureCreditChargesTable failed:", err);
  }
}

export interface ConsumeCreditsResult {
  remaining: number | null;
  charged: boolean;
  conflict: boolean;
}

export function parseTimestampMs(val: string | null | undefined): number {
  if (!val) return 0;
  const iso = val.includes("T") ? (val.endsWith("Z") ? val : `${val}Z`) : `${val.replace(" ", "T")}Z`;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// 幂等扣减与原子任务租约: 严格保持 10 积分定价不擅改，支持任务恢复/并发竞争时 409 拦截与 D1 batch 事务一致
export async function consumeCreditsIdempotent(
  userEmail: string,
  cost: number = HK_COURSE_COST,
  idempotencyKey?: string,
  leaseDurationMs: number = 60_000,
): Promise<ConsumeCreditsResult> {
  // 严格严守 10 积分定价
  const fixedCost = cost === HK_COURSE_COST ? HK_COURSE_COST : HK_COURSE_COST;
  const key = idempotencyKey?.trim();

  if (!key) {
    const remaining = await consumeCredits(userEmail, fixedCost);
    return { remaining, charged: remaining !== null, conflict: false };
  }

  await ensureCreditChargesTable();

  const now = Date.now();
  const leaseExpiresAt = new Date(now + leaseDurationMs).toISOString();
  const leaseToken = crypto.randomUUID();

  // 1. 检查已有计费或租约记录
  try {
    const existing = await database()
      .prepare(`SELECT key, cost, status, lease_token, lease_expires_at FROM hk_credit_charges WHERE key = ? AND user_email = ?`)
      .bind(key, userEmail)
      .first<{ key: string; cost: number; status: string; lease_token?: string; lease_expires_at?: string }>();

    if (existing) {
      if (existing.status === "completed") {
        // 已完成任务与计费：幂等放行，不重复扣费
        const { remaining } = await currentCredits(userEmail);
        return { remaining, charged: false, conflict: false };
      }

      if (existing.status === "pending") {
        const expires = parseTimestampMs(existing.lease_expires_at);
        if (expires > now) {
          // 租约有效：并发竞争冲突，严守排他锁，409 不放行！
          return { remaining: null, charged: false, conflict: true };
        }

        // 租约过期（先前任务崩溃或超时）：故障恢复接管租约，不重复扣费
        await database()
          .prepare(
            `UPDATE hk_credit_charges
             SET lease_token = ?, lease_expires_at = ?, updated_at = CURRENT_TIMESTAMP
             WHERE key = ? AND user_email = ?`,
          )
          .bind(leaseToken, leaseExpiresAt, key, userEmail)
          .run();

        const { remaining } = await currentCredits(userEmail);
        return { remaining, charged: false, conflict: false };
      }
    }
  } catch {}

  // 2. 首次建课: D1 原子 batch 执行条件扣费与插入 pending 排他租约
  const today = beijingToday();
  await ensureFreshRow(userEmail, today);

  const deductStmt = database()
    .prepare(
      `UPDATE hk_credits SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_email = ? AND reset_date = ? AND balance >= ?`,
    )
    .bind(fixedCost, userEmail, today, fixedCost);

  const insertStmt = database()
    .prepare(
      `INSERT INTO hk_credit_charges (key, user_email, cost, status, lease_token, lease_expires_at)
       SELECT ?, ?, ?, 'pending', ?, ?
       WHERE (SELECT balance FROM hk_credits WHERE user_email = ? AND reset_date = ?) >= 0`,
    )
    .bind(key, userEmail, fixedCost, leaseToken, leaseExpiresAt, userEmail, today);

  try {
    const [deductRes] = await database().batch([deductStmt, insertStmt]);
    if (Number(deductRes.meta.changes ?? 0) === 0) {
      // 余额不足，清理可能写入的 pending 记录
      try {
        await database()
          .prepare(`DELETE FROM hk_credit_charges WHERE key = ? AND user_email = ? AND status = 'pending'`)
          .bind(key, userEmail)
          .run();
      } catch {}
      return { remaining: null, charged: false, conflict: false };
    }

    const { remaining } = await currentCredits(userEmail);
    return { remaining, charged: true, conflict: false };
  } catch (err: unknown) {
    // 捕获主键冲突（并发请求争抢相同 key）：D1 batch 自动事务回滚 deductStmt，保证积分不扣
    const check = await database()
      .prepare(`SELECT status, lease_expires_at FROM hk_credit_charges WHERE key = ? AND user_email = ?`)
      .bind(key, userEmail)
      .first<{ status: string; lease_expires_at?: string }>();

    if (check) {
      if (check.status === "completed") {
        const { remaining } = await currentCredits(userEmail);
        return { remaining, charged: false, conflict: false };
      }
      if (check.status === "pending") {
        const exp = parseTimestampMs(check.lease_expires_at);
        if (exp > Date.now()) {
          // 409 冲突：不放行并发重复任务！
          return { remaining: null, charged: false, conflict: true };
        }
      }
    }
    throw err;
  }
}

export async function markCreditChargeCompleted(key: string, userEmail: string): Promise<void> {
  try {
    await database()
      .prepare(
        `UPDATE hk_credit_charges
         SET status = 'completed', lease_token = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE key = ? AND user_email = ?`,
      )
      .bind(key, userEmail)
      .run();
  } catch (err) {
    console.warn("[hyperknow-credits] markCreditChargeCompleted failed:", err);
  }
}

export async function releaseCreditCharge(key: string, userEmail: string): Promise<void> {
  try {
    await database()
      .prepare(`DELETE FROM hk_credit_charges WHERE key = ? AND user_email = ? AND status = 'pending'`)
      .bind(key, userEmail)
      .run();
  } catch (err) {
    console.warn("[hyperknow-credits] releaseCreditCharge failed:", err);
  }
}
