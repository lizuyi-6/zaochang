import { env } from "cloudflare:workers";
import { database } from "./community";

function envValues(): Record<string, string | undefined> {
  return env as unknown as Record<string, string | undefined>;
}

// 果子账本的资金路径共享原语(2026-10 审计重构 #7):此前 fruit.ts 与 external-fruit.ts
// 各持一份同款 wallet/assertWalletIntegrity/validIdempotencyKey/sqliteTimestamp,三处
// 结算批次各抄一份同款"待结算→可用"资金移动。资金路径收敛为单一事实来源后,触发器
// 与 07-oidc-external/钱包套件仍然全绿才算重构成立。

type Db = ReturnType<typeof database>;

export type WalletOverviewRow = {
  balance: number;
  pendingBalance: number;
  lifetimeEarned?: number;
  lifetimeSpent?: number;
  status: string;
  ledgerBalance: number;
  ledgerPendingBalance: number;
};

// M4(2026-10 审计):结算节流。settleDueFruit / settleDueExternalFruit 是
// 「读出到期项 + 条件写批次」的物化例程,被 wallet/community/shell-state 等读端点
// 每次调用都触发——0 限流时是免费的 D1 读写放大入口(实测 120 连打无一个 429)。
// 到期结算的最小时间粒度是小时级(available_at = T+24h),isolate 内存 60s 节流让
// 每个 isolate 对每个用户至多每分钟真跑一次;节流状态刻意不落库——落库本身就是
// 要消灭的写放大。多 isolate 各自节流,放大上限 = isolate 数,仍远低于现状。
// 结算不承载资金正确性(支付/退款路径的可用性由 SQL 守卫强制),晚 ≤60s 物化无影响。
const SETTLE_THROTTLE_MS = 60_000;
const lastSettleAttemptAt = new Map<string, number>();

/** 记录本次结算尝试;true = 60s 内已尝试过,调用方应直接跳过结算。
 * APP_ENV=test 下禁用(返回恒 false):集成测试惯用 SQL 快进 available_at/
 * created_at 后立即断言物化余额,60s 节流会让结算最多晚一分钟——生产语义允许
 * (到期粒度是小时级),测试需要确定性;与 HK_COURSE_GEN_TIMEOUT_MS 的
 * test-only 覆盖同款约定。env 在调用时读取,不落在模块初始化。 */
export function settleThrottled(email: string): boolean {
  const throttleMs = envValues().APP_ENV === "test" ? 0 : SETTLE_THROTTLE_MS;
  const now = Date.now();
  const last = lastSettleAttemptAt.get(email) ?? 0;
  if (now - last < throttleMs) return true;
  if (lastSettleAttemptAt.size > 5_000) {
    for (const [key, at] of lastSettleAttemptAt) {
      if (now - at >= throttleMs) lastSettleAttemptAt.delete(key);
    }
  }
  lastSettleAttemptAt.set(email, now);
  return false;
}

export function validIdempotencyKey(value: string) {
  return /^[A-Za-z0-9:_-]{8,120}$/.test(value);
}

export function sqliteTimestamp(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/** 钱包 materialized 双余额 + 账本聚合读(超集列:含 lifetime 供 fruit.ts 使用,
 * external 侧类型按需忽略)。完整性断言在 assertWalletIntegrity,读侧不重复实现。 */
export async function walletOverview(email: string) {
  return database().prepare(
    `SELECT balance, pending_balance AS pendingBalance,
            lifetime_earned AS lifetimeEarned, lifetime_spent AS lifetimeSpent,
            status,
            COALESCE((SELECT SUM(delta) FROM fruit_entries WHERE user_email = ? AND bucket = 'available'), 0) AS ledgerBalance,
            COALESCE((SELECT SUM(delta) FROM fruit_entries WHERE user_email = ? AND bucket = 'pending'), 0) AS ledgerPendingBalance
     FROM wallets WHERE user_email = ?`,
  ).bind(email, email, email).first<WalletOverviewRow>();
}

/** 钱包/账本漂移是高危事件:阻断 + 留痕,绝不静默按账本改写钱包。错误类型与风险
 * 事件 id 形态由调用方注入(各域保持既有错误码体系与审计形状)。 */
export async function assertWalletIntegrity(
  email: string,
  row: WalletOverviewRow | null | undefined,
  throwError: (code: "wallet_not_found" | "wallet_ledger_mismatch", status: number) => Error,
  riskId: () => string = () => `risk:${crypto.randomUUID()}`,
): Promise<WalletOverviewRow> {
  if (!row) throw throwError("wallet_not_found", 404);
  if (row.balance === row.ledgerBalance && row.pendingBalance === row.ledgerPendingBalance) return row;
  const db = database();
  await db.batch([
    db.prepare(`UPDATE wallets SET status = 'review', updated_at = CURRENT_TIMESTAMP WHERE user_email = ?`).bind(email),
    db.prepare(
      `INSERT INTO fruit_risk_events (id, user_email, kind, severity, evidence)
       VALUES (?, ?, 'wallet_ledger_mismatch', 'high', ?)`,
    ).bind(riskId(), email, JSON.stringify({ balance: row.balance, ledgerBalance: row.ledgerBalance, pendingBalance: row.pendingBalance, ledgerPendingBalance: row.ledgerPendingBalance })),
  ]);
  throw throwError("wallet_ledger_mismatch", 423);
}

/** 三域(点赞奖励/作品订单/外部支付)结算共用的"待结算→可用"资金移动:CASE 守卫的
 * 钱包 UPDATE + 账本 pending-/available+ 两条分录。钱包在读取与批次之间被置
 * review/frozen 时 ELSE -1 触发 CHECK 令整批原子失败——资金路径不许 fail-open。 */
export function pendingToAvailableStatements(
  db: Db,
  args: { operationId: string; email: string; amount: number },
) {
  return [
    db.prepare(
      `UPDATE wallets SET
         pending_balance = CASE WHEN status = 'active' THEN pending_balance - ? ELSE -1 END,
         balance = CASE WHEN status = 'active' THEN balance + ? ELSE -1 END,
         lifetime_earned = lifetime_earned + ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_email = ?`,
    ).bind(args.amount, args.amount, args.amount, args.email),
    db.prepare(`INSERT INTO fruit_entries (operation_id, user_email, bucket, delta) VALUES (?, ?, 'pending', ?)`).bind(args.operationId, args.email, -args.amount),
    db.prepare(`INSERT INTO fruit_entries (operation_id, user_email, bucket, delta) VALUES (?, ?, 'available', ?)`).bind(args.operationId, args.email, args.amount),
  ];
}
