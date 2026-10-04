import { database } from "./community";

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
