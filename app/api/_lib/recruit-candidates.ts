// 见界创赛选拔候选人的校验纯逻辑(无 cloudflare/D1 依赖,Node 测试直接断言)。
// 存储见 db/schema.ts recruit_candidates;读写路由 app/api/admin/recruit-candidates/route.ts。

export const RECRUIT_STAGES = ["applied", "homework", "group", "final", "admitted", "rejected"] as const;
export type RecruitStage = (typeof RECRUIT_STAGES)[number];

export const RECRUIT_STAGE_LABELS: Record<RecruitStage, string> = {
  applied: "已报名",
  homework: "作业评审",
  group: "群面",
  final: "终面",
  admitted: "已录取",
  rejected: "未通过",
};

export const RECRUIT_CANDIDATE_LIMITS = { name: 40, email: 120, position: 40, note: 500 } as const;

// 岗位下拉的预置选项:与结果邮件原型里的角色划分一致。
// 只负责"少打字";岗位本身仍是自由文本(选「自定义」手填),不在此处收窄取值。
export const RECRUIT_POSITION_OPTIONS = [
  "队长 / 项目负责人",
  "调研",
  "商业计划书 / 文案",
  "PPT / 视觉",
  "技术 / 产品",
] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RecruitCandidateInput = {
  name: string;
  email: string;
  position: string;
  stage: RecruitStage;
  note: string;
};

// 创建/更新共用的字段规整:trim + 长度 + 邮箱形状 + 环节白名单。
// 返回 { ok: true, value } 或 { ok: false, error }(error 是可回前端的稳定错误码)。
export function normalizeRecruitCandidateInput(
  input: unknown,
): { ok: true; value: RecruitCandidateInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "invalid_body" };
  const raw = input as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  const position = typeof raw.position === "string" ? raw.position.trim() : "";
  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  const stage = typeof raw.stage === "string" ? raw.stage : "applied";
  if (!name || name.length > RECRUIT_CANDIDATE_LIMITS.name) return { ok: false, error: "invalid_name" };
  if (!EMAIL_PATTERN.test(email) || email.length > RECRUIT_CANDIDATE_LIMITS.email) return { ok: false, error: "invalid_email" };
  if (!position || position.length > RECRUIT_CANDIDATE_LIMITS.position) return { ok: false, error: "invalid_position" };
  if (note.length > RECRUIT_CANDIDATE_LIMITS.note) return { ok: false, error: "invalid_note" };
  if (!(RECRUIT_STAGES as readonly string[]).includes(stage)) return { ok: false, error: "invalid_stage" };
  return { ok: true, value: { name, email, position, stage: stage as RecruitStage, note } };
}

// 局部更新(PATCH):只校验带来的字段;环节单改很常见(推进/淘汰)。
// statusToken 是特例:把候选人绑到既有进度令牌(32 位十六进制),传 null 解绑。
export function normalizeRecruitCandidatePatch(
  input: unknown,
): { ok: true; patch: Partial<RecruitCandidateInput> & { statusToken?: string | null } } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "invalid_body" };
  const raw = input as Record<string, unknown>;
  const patch: Partial<RecruitCandidateInput> & { statusToken?: string | null } = {};
  if ("name" in raw) {
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name || name.length > RECRUIT_CANDIDATE_LIMITS.name) return { ok: false, error: "invalid_name" };
    patch.name = name;
  }
  if ("email" in raw) {
    const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
    if (!EMAIL_PATTERN.test(email) || email.length > RECRUIT_CANDIDATE_LIMITS.email) return { ok: false, error: "invalid_email" };
    patch.email = email;
  }
  if ("position" in raw) {
    const position = typeof raw.position === "string" ? raw.position.trim() : "";
    if (!position || position.length > RECRUIT_CANDIDATE_LIMITS.position) return { ok: false, error: "invalid_position" };
    patch.position = position;
  }
  if ("note" in raw) {
    const note = typeof raw.note === "string" ? raw.note.trim() : "";
    if (note.length > RECRUIT_CANDIDATE_LIMITS.note) return { ok: false, error: "invalid_note" };
    patch.note = note;
  }
  if ("stage" in raw) {
    if (typeof raw.stage !== "string" || !(RECRUIT_STAGES as readonly string[]).includes(raw.stage)) {
      return { ok: false, error: "invalid_stage" };
    }
    patch.stage = raw.stage as RecruitStage;
  }
  if ("statusToken" in raw) {
    const token = raw.statusToken;
    if (token !== null && (typeof token !== "string" || !/^[a-f0-9]{32}$/.test(token))) {
      return { ok: false, error: "invalid_status_token" };
    }
    patch.statusToken = token;
  }
  return { ok: true, patch };
}
