// WebAuthn 挑战行生命周期:已消费/已过期行清掉(谓词与 email codes 清理一致)。
// 显式 .ts 扩展名:本模块同时被 bundler(worker)与纯 Node 契约测试加载。
export function webauthnChallengePurgeStatements(db: D1Database) {
  return [
    {
      label: "webauthn.challenges_consumed",
      statement: db.prepare(`DELETE FROM webauthn_challenges WHERE consumed_at IS NOT NULL`),
    },
    {
      label: "webauthn.challenges_expired",
      statement: db.prepare(`DELETE FROM webauthn_challenges WHERE expires_at < datetime('now', '-1 day')`),
    },
  ];
}
