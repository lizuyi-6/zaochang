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
  plan: { steps: Array<{ step_id: string; spoken_text: string; board_action: Record<string, unknown> }> };
};

export async function saveWhiteboardSession(input: { id: string; userEmail: string; topic: string; plan: StoredWhiteboardSession["plan"] }): Promise<void> {
  await database()
    .prepare(`INSERT INTO hk_whiteboard_sessions (id, user_email, topic, plan_json) VALUES (?, ?, ?, ?)`)
    .bind(input.id, input.userEmail, input.topic, JSON.stringify(input.plan))
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

function safeJson(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
