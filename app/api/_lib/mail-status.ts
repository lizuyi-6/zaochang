// 见界结果邮件「评审进行中」实时状态的纯逻辑层(token + 状态归一化/合并)。
// 不 import 任何 D1/Worker 模块——tests/mail-status-panel.test.mjs 直接在 Node 下
// 断言这些不变量;D1 读写在 mail-status-store.ts。
// 邮件发出后内容固定,唯一能让收件人每次打开都看到最新进度的机制:
//  1) 邮件里一张由服务按请求实时渲染的 PNG(app/email/status/<token>.png)
//  2) 一个永远最新的状态页链接(app/email/status/<token>)
// 两者共用同一份 state_json,token 是 128bit 随机(不可枚举的能力 URL)。
// 状态只放聚合进度(已评/总数),绝不放评委身份——给候选人的邮件不暴露评审人。

export const MAIL_STATUS_TOKEN_PATTERN = /^[a-f0-9]{32}$/;

// 场上字段上限:stage/eta 短词,note 一段话;done 钳进 [0,total]。
const LIMITS = { stage: 40, eta: 40, note: 500, total: 50 } as const;

export type MailStatusState = {
  stage?: string;
  total?: number;
  done?: number;
  eta?: string;
  note?: string;
};

export function newMailStatusToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clampText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function clampCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return undefined;
  return value;
}

// 输入归一化:只认白名单字段,超长截断,非法类型丢弃。
// total 缺失时默认 1(done 0..total),让缺字段的调用也能得到合法进度。
export function normalizeMailStatusState(input: unknown): MailStatusState {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;
  const state: MailStatusState = {};
  const stage = clampText(raw.stage, LIMITS.stage);
  if (stage) state.stage = stage;
  const eta = clampText(raw.eta, LIMITS.eta);
  if (eta) state.eta = eta;
  const note = clampText(raw.note, LIMITS.note);
  if (note) state.note = note;
  const total = clampCount(raw.total);
  if (total !== undefined) state.total = Math.min(Math.max(total, 1), LIMITS.total);
  const done = clampCount(raw.done);
  if (done !== undefined) {
    // 无 total 时存值但不参与百分比(mailStatusPercent 要求 total 存在),
    // 绝不"发明"一个 total——否则 done-only 补丁会被算成 100% 完成。
    state.done = state.total !== undefined ? Math.min(done, state.total) : Math.min(done, LIMITS.total);
  }
  return state;
}

// 局部更新合并进既有状态:运营只想改 done 时不用带全量字段。
// 顺序要紧:done 必须合并后再按合并后的 total 钳——若先用"缺省 total=1"钳,
// {done:4} 这类局部补丁会被削成 1。空串 = 清除该字段(撤下过期 note);
// 非法类型的键整体忽略,不污染既有值。
export function mergeMailStatusState(current: unknown, patch: unknown): MailStatusState {
  const base = normalizeMailStatusState(current);
  if (!patch || typeof patch !== "object") return base;
  const raw = patch as Record<string, unknown>;
  for (const key of ["stage", "eta", "note"] as const) {
    if (!(key in raw)) continue;
    const value = clampText(raw[key], LIMITS[key]);
    if (value) base[key] = value;
    else delete base[key];
  }
  if ("total" in raw) {
    const total = clampCount(raw.total);
    if (total !== undefined) {
      base.total = Math.min(Math.max(total, 1), LIMITS.total);
      base.done = Math.min(base.done ?? 0, base.total);
    }
  }
  if ("done" in raw) {
    const done = clampCount(raw.done);
    if (done !== undefined) {
      if (base.total !== undefined) base.done = Math.min(done, base.total);
      else base.done = Math.min(done, LIMITS.total);
    }
  }
  return base;
}

export function parseMailStatusState(json: string): MailStatusState {
  try {
    return normalizeMailStatusState(JSON.parse(json));
  } catch {
    return {};
  }
}

// 进度百分比:数字状态缺失时返回 null(PNG 走无数字的空轨形态)。
export function mailStatusPercent(state: MailStatusState): number | null {
  if (typeof state.total !== "number" || state.total < 1) return null;
  const done = Math.min(Math.max(state.done ?? 0, 0), state.total);
  return Math.round((done / state.total) * 100);
}

// 状态页/图片 alt 用的中文摘要(收件人视角,不暴露评委身份)。
export function mailStatusSummary(state: MailStatusState): string {
  const parts: string[] = [];
  if (state.stage) parts.push(state.stage);
  if (typeof state.total === "number") {
    parts.push(`${Math.min(state.done ?? 0, state.total)}/${state.total} 位评委已完成`);
  } else {
    parts.push("评审正在进行");
  }
  if (state.eta) parts.push(`预计 ${state.eta} 前通知结果`);
  return parts.join(" · ");
}
