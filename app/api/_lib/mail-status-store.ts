// mail_status_tokens 的 D1 读写(与纯逻辑层 mail-status.ts 分开:
// 纯逻辑可在 Node 测试下直接断言,D1 访问需要 cloudflare:workers 环境)。
import { database } from "./community";
import {
  MAIL_STATUS_TOKEN_PATTERN,
  mergeMailStatusState,
  newMailStatusToken,
  parseMailStatusState,
} from "./mail-status.ts";
import type { MailStatusState } from "./mail-status.ts";

export type MailStatusRecord = {
  token: string;
  label: string;
  state: MailStatusState;
  updatedAt: string;
};

// 单行读取:token 形状不合法直接 null(调用方一律按 404 处理,不泄露存在性)。
export async function readMailStatus(token: string): Promise<MailStatusRecord | null> {
  if (!MAIL_STATUS_TOKEN_PATTERN.test(token)) return null;
  const row = await database().prepare(
    `SELECT token, label, state_json AS stateJson, updated_at AS updatedAt
     FROM mail_status_tokens WHERE token = ?`,
  ).bind(token).first<{ token: string; label: string; stateJson: string; updatedAt: string }>();
  if (!row) return null;
  return { token: row.token, label: row.label, state: parseMailStatusState(row.stateJson), updatedAt: row.updatedAt };
}

// 更新或新建(token 缺省则新建)。合并语义见 mail-status.ts 的 mergeMailStatusState:
// 只改带来的字段,未带的保持原值。返回最终记录,调用方负责审计与响应。
export async function upsertMailStatus(args: {
  token?: string;
  label?: string;
  patch: unknown;
  actorEmail: string;
}): Promise<MailStatusRecord> {
  const token = args.token && MAIL_STATUS_TOKEN_PATTERN.test(args.token) ? args.token : newMailStatusToken();
  const existing = await database().prepare(
    `SELECT label, state_json AS stateJson FROM mail_status_tokens WHERE token = ?`,
  ).bind(token).first<{ label: string; stateJson: string }>();
  // state_json 是 JSON 字符串,必须先 parse 再合并:mergeMailStatusState 的
  // normalize 对非对象一律返回空状态——直接把字符串喂进去,每次局部更新都会把
  // 既有 total/stage 清空(生产实测:set --done 5 后 total 消失)。
  const current = parseMailStatusState(existing?.stateJson ?? "{}");
  const state = mergeMailStatusState(current, args.patch);
  const label = typeof args.label === "string" && args.label.trim() ? args.label.trim().slice(0, 60) : existing?.label ?? "";
  await database().prepare(
    `INSERT INTO mail_status_tokens (token, label, state_json, updated_by, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(token) DO UPDATE SET
       label = excluded.label,
       state_json = excluded.state_json,
       updated_by = excluded.updated_by,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(token, label, JSON.stringify(state), args.actorEmail).run();
  const record = await readMailStatus(token);
  if (!record) throw new Error("mail_status_upsert_readback_failed");
  return record;
}
