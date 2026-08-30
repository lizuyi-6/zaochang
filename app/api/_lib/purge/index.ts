// P2-U:过期数据生命周期。此前全库除 api_rate_limits 外没有任何清理
// (授权请求行/codes/tokens/payments/email codes/auth_sessions 只增不减)。
// 由 wrangler crons 触发;各域在 ./purge/* 注册自己的幂等 DELETE,
// 本文件只做聚合与逐条执行,不依赖任何业务状态机。
// 显式 .ts 扩展名:本模块同时被 bundler(worker)与纯 Node 契约测试加载,
// 后者不做扩展名解析。
import { emailCodePurgeStatements } from "./email-codes.ts";
import { externalFruitPurgeStatements } from "./external-fruit.ts";
import { oauthProviderPurgeStatements } from "./oauth-provider.ts";
import { sessionPurgeStatements } from "./sessions.ts";

export type PurgeStatement = { label: string; statement: D1PreparedStatement };

export function purgeRegistry(db: D1Database): PurgeStatement[] {
  return [
    ...oauthProviderPurgeStatements(db),
    ...externalFruitPurgeStatements(db),
    ...emailCodePurgeStatements(db),
    ...sessionPurgeStatements(db),
  ];
}

export type PurgeLogger = {
  log(message: string): void;
  error(message: string): void;
};

// 逐条执行:某张表在未来重构中不存在时,不影响其余清理;每条结果以 label
// 记录为可检索的结构化日志(不含 token/cookie/secret/body)。
export async function runPurgeRegistry(
  db: D1Database,
  logger: PurgeLogger = console,
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (const { label, statement } of purgeRegistry(db)) {
    try {
      const result = await statement.run();
      ok += 1;
      logger.log(`[cron-purge] ok ${label} changes=${result.meta?.changes ?? 0}`);
    } catch (error) {
      failed += 1;
      logger.error(`[cron-purge] failed ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ok, failed };
}
