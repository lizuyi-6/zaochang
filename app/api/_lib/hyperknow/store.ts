import { database } from "../community";

// Hyperknow Agent 的 D1 持久化(替代原 store.json 单文件库)。
// 原版三个桶 users/conversations/courses 中:users 由造场 members 统一承担
// (假鉴权/明文密码不移植),whiteboards 桶在原版本就空置未用——这里落地为
// hk_whiteboard_sessions(白板无状态化后用于跨请求携带讲座计划与归属校验)。
// 归属列 user_email FK → members.email,越权由路由层 404(不泄露存在性)。

export type StoredConversation = {
  id: string;
  title: string;
  starred: boolean;
  createdAt: string;
  updatedAt: string;
  history: Array<{ role: string; content: string }>;
};

export async function saveConversation(input: {
  id: string;
  userEmail: string;
  title: string;
  history: Array<{ role: string; content: string }>;
}): Promise<void> {
  await database()
    .prepare(
      `INSERT INTO hk_conversations (id, user_email, title, history_json, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         history_json = excluded.history_json,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(input.id, input.userEmail, input.title, JSON.stringify(input.history))
    .run();
}

function rowToConversation(row: { id: string; title: string; starred: number; created_at: string; updated_at: string; history_json: string }): StoredConversation {
  let history: Array<{ role: string; content: string }> = [];
  try {
    const parsed = JSON.parse(row.history_json) as Array<{ role: string; content: string }>;
    if (Array.isArray(parsed)) history = parsed;
  } catch {
    // 历史损坏按空处理,不炸列表。
  }
  return {
    id: row.id,
    title: row.title,
    starred: row.starred === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history,
  };
}

export async function listConversations(userEmail: string): Promise<StoredConversation[]> {
  const { results } = await database()
    .prepare(
      `SELECT id, title, starred, created_at, updated_at, history_json
       FROM hk_conversations WHERE user_email = ? ORDER BY updated_at DESC, id DESC LIMIT 200`,
    )
    .bind(userEmail)
    .all<{ id: string; title: string; starred: number; created_at: string; updated_at: string; history_json: string }>();
  return (results ?? []).map(rowToConversation);
}

export async function getConversation(id: string, userEmail: string): Promise<StoredConversation | null> {
  const row = await database()
    .prepare(
      `SELECT id, title, starred, created_at, updated_at, history_json
       FROM hk_conversations WHERE id = ? AND user_email = ?`,
    )
    .bind(id, userEmail)
    .first<{ id: string; title: string; starred: number; created_at: string; updated_at: string; history_json: string }>();
  return row ? rowToConversation(row) : null;
}

export type StoredCourse = {
  courseUuid: string;
  createdAt: string;
  course: Record<string, unknown>;
};

export async function saveCourse(courseUuid: string, userEmail: string, course: Record<string, unknown>): Promise<void> {
  await database()
    .prepare(
      `INSERT INTO hk_courses (uuid, user_email, title, course_json) VALUES (?, ?, ?, ?)
       ON CONFLICT(uuid) DO UPDATE SET course_json = excluded.course_json, title = excluded.title`,
    )
    .bind(courseUuid, userEmail, String(course.courseTitle ?? ""), JSON.stringify(course))
    .run();
}

export async function listCourses(userEmail: string): Promise<StoredCourse[]> {
  const { results } = await database()
    .prepare(`SELECT uuid, course_json, created_at FROM hk_courses WHERE user_email = ? ORDER BY created_at DESC, uuid DESC LIMIT 200`)
    .bind(userEmail)
    .all<{ uuid: string; course_json: string; created_at: string }>();
  return (results ?? []).map((row) => ({ courseUuid: row.uuid, createdAt: row.created_at, course: safeJson(row.course_json) }));
}

// 归属校验在调用方:传 userEmail 时查不到即 null(越权与不存在同形,404 不泄露)。
export async function getCourse(uuid: string, userEmail: string): Promise<StoredCourse | null> {
  const row = await database()
    .prepare(`SELECT uuid, course_json, created_at FROM hk_courses WHERE uuid = ? AND user_email = ?`)
    .bind(uuid, userEmail)
    .first<{ uuid: string; course_json: string; created_at: string }>();
  return row ? { courseUuid: row.uuid, createdAt: row.created_at, course: safeJson(row.course_json) } : null;
}

export type StoredWhiteboardSession = {
  id: string;
  topic: string;
  createdAt: string;
  plan: { steps: Array<{ step_id: string; spoken_text: string; board_action: Record<string, unknown> }>; language?: string };
};

export async function saveWhiteboardSession(input: { id: string; userEmail: string; topic: string; plan: StoredWhiteboardSession["plan"]; language?: string }): Promise<void> {
  // language 并入 plan_json 存储(免迁移):插话答疑端点据此恢复讲座语言。
  const planJson = JSON.stringify(input.language ? { ...input.plan, language: input.language } : input.plan);
  await database()
    .prepare(`INSERT INTO hk_whiteboard_sessions (id, user_email, topic, plan_json) VALUES (?, ?, ?, ?)`)
    .bind(input.id, input.userEmail, input.topic, planJson)
    .run();
}

export async function getWhiteboardSession(id: string, userEmail: string): Promise<StoredWhiteboardSession | null> {
  const row = await database()
    .prepare(`SELECT id, topic, plan_json, created_at FROM hk_whiteboard_sessions WHERE id = ? AND user_email = ?`)
    .bind(id, userEmail)
    .first<{ id: string; topic: string; plan_json: string; created_at: string }>();
  if (!row) return null;
  const plan = safeJson(row.plan_json) as StoredWhiteboardSession["plan"];
  if (!plan || !Array.isArray(plan.steps)) return null;
  return { id: row.id, topic: row.topic, createdAt: row.created_at, plan };
}

export type StoredCourseTask = {
  id: string;
  userEmail: string;
  query: string;
  briefJson: string | null;
  researchHitsJson: string | null;
  blueprintJson: string | null;
  selectedUnitsJson: string | null;
  unitsJson: string;
  currentUnitIndex: number;
  totalUnits: number;
  status: "pending" | "blueprint_ready" | "generating_units" | "completed" | "failed";
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  errorMessage: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export async function createCourseTask(task: {
  id: string;
  userEmail: string;
  query: string;
  briefJson?: string | null;
  researchHitsJson?: string | null;
  blueprintJson?: string | null;
  status?: string;
  totalUnits?: number;
}): Promise<void> {
  await database()
    .prepare(
      `INSERT INTO hk_course_tasks (id, user_email, query, brief_json, research_hits_json, blueprint_json, status, total_units)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         query = excluded.query,
         brief_json = excluded.brief_json,
         research_hits_json = excluded.research_hits_json,
         blueprint_json = excluded.blueprint_json,
         status = excluded.status,
         total_units = excluded.total_units,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      task.id,
      task.userEmail,
      task.query,
      task.briefJson ?? null,
      task.researchHitsJson ?? null,
      task.blueprintJson ?? null,
      task.status ?? "pending",
      task.totalUnits ?? 0,
    )
    .run();
}

export async function getCourseTask(id: string, userEmail: string): Promise<StoredCourseTask | null> {
  const row = await database()
    .prepare(
      `SELECT id, user_email, query, brief_json, research_hits_json, blueprint_json, selected_units_json,
              units_json, current_unit_index, total_units, status, lease_token, lease_expires_at,
              error_message, version, created_at, updated_at
       FROM hk_course_tasks WHERE id = ? AND user_email = ?`,
    )
    .bind(id, userEmail)
    .first<{
      id: string;
      user_email: string;
      query: string;
      brief_json: string | null;
      research_hits_json: string | null;
      blueprint_json: string | null;
      selected_units_json: string | null;
      units_json: string;
      current_unit_index: number;
      total_units: number;
      status: StoredCourseTask["status"];
      lease_token: string | null;
      lease_expires_at: string | null;
      error_message: string | null;
      version: number;
      created_at: string;
      updated_at: string;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    userEmail: row.user_email,
    query: row.query,
    briefJson: row.brief_json,
    researchHitsJson: row.research_hits_json,
    blueprintJson: row.blueprint_json,
    selectedUnitsJson: row.selected_units_json,
    unitsJson: row.units_json ?? "[]",
    currentUnitIndex: Number(row.current_unit_index ?? 0),
    totalUnits: Number(row.total_units ?? 0),
    status: row.status,
    leaseToken: row.lease_token,
    leaseExpiresAt: row.lease_expires_at,
    errorMessage: row.error_message,
    version: Number(row.version ?? 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function updateCourseTaskBlueprint(
  id: string,
  userEmail: string,
  blueprintJson: string,
  totalUnits: number,
  status: string = "blueprint_ready",
): Promise<void> {
  await database()
    .prepare(
      `UPDATE hk_course_tasks
       SET blueprint_json = ?, total_units = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_email = ?`,
    )
    .bind(blueprintJson, totalUnits, status, id, userEmail)
    .run();
}

export async function saveCourseTaskUnitCheckpoint(
  id: string,
  userEmail: string,
  unit: unknown,
  unitIndex: number,
  totalUnits: number,
): Promise<void> {
  const task = await getCourseTask(id, userEmail);
  let units: unknown[] = [];
  try {
    units = JSON.parse(task?.unitsJson || "[]");
    if (!Array.isArray(units)) units = [];
  } catch {
    units = [];
  }
  units[unitIndex] = unit;
  const filteredUnits = units.filter(Boolean);

  await database()
    .prepare(
      `UPDATE hk_course_tasks
       SET units_json = ?, current_unit_index = ?, total_units = ?, status = 'generating_units', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_email = ?`,
    )
    .bind(JSON.stringify(filteredUnits), unitIndex + 1, totalUnits, id, userEmail)
    .run();
}

export async function markCourseTaskStatus(
  id: string,
  userEmail: string,
  status: string,
  errorMessage?: string,
): Promise<void> {
  await database()
    .prepare(
      `UPDATE hk_course_tasks
       SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_email = ?`,
    )
    .bind(status, errorMessage ?? null, id, userEmail)
    .run();
}

function safeJson(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
