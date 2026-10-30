import { env } from "cloudflare:workers";
import { requireAdmin, requireMember } from "../../_lib/access-control";
import { database } from "../../_lib/community";
import { jsonError } from "../../_lib/errors";
import { HYPERKNOW_FEEDBACK_MAX_REQUEST_BYTES } from "../../_lib/feedback-limits";
import { sendEmail } from "../../_lib/email-send";
import { escapeHtml } from "../../_lib/html-escape";
import { assertSameOrigin } from "../../_lib/request-origin";
import { enforceRateLimit, rateLimitKey, requestActorKey } from "../../_lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 4000;
const CONTEXT_LIMITS = {
  screen: 48,
  sessionId: 128,
  courseUuid: 128,
  userAgent: 180,
} as const;
const DEFAULT_NOTIFY_EMAIL = "zaochang@aetherstudio.top";

type FeedbackContext = Partial<Record<keyof typeof CONTEXT_LIMITS, string>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sanitizeContext(value: unknown): FeedbackContext | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  const result: FeedbackContext = {};
  for (const [field, maxLength] of Object.entries(CONTEXT_LIMITS) as Array<[keyof typeof CONTEXT_LIMITS, number]>) {
    const candidate = value[field];
    if (candidate === undefined || candidate === null || candidate === "") continue;
    if (typeof candidate !== "string") return null;
    const cleaned = candidate.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").trim().slice(0, maxLength);
    if (cleaned) result[field] = cleaned;
  }
  return result;
}

function parseStoredContext(value: string): FeedbackContext {
  try {
    const parsed: unknown = JSON.parse(value);
    return sanitizeContext(parsed) ?? {};
  } catch {
    return {};
  }
}

function feedbackEmail(
  id: string,
  userEmail: string,
  createdAt: string,
  context: FeedbackContext,
  message: string,
) {
  const contextEntries = Object.entries(context);
  const contextText = contextEntries.length
    ? contextEntries.map(([key, value]) => `${key}: ${value}`).join("\n")
    : "(none)";
  const contextHtml = contextEntries.length
    ? `<ul>${contextEntries.map(([key, value]) => `<li><strong>${escapeHtml(key)}</strong>: ${escapeHtml(value)}</li>`).join("")}</ul>`
    : "<p>(none)</p>";
  return {
    subject: `见界用户反馈 #${id}`,
    text: `收到一条见界用户反馈\n编号: ${id}\n反馈人: ${userEmail}\n时间: ${createdAt}\n上下文:\n${contextText}\n\n反馈内容:\n${message}`,
    html: [
      "<div style=\"font-family:Arial,sans-serif;line-height:1.6;color:#171816\">",
      "<h2>收到一条见界用户反馈</h2>",
      `<p><strong>编号:</strong> ${escapeHtml(id)}<br><strong>反馈人:</strong> ${escapeHtml(userEmail)}<br><strong>时间:</strong> ${escapeHtml(createdAt)}</p>`,
      "<h3>上下文</h3>",
      contextHtml,
      "<h3>反馈内容</h3>",
      `<pre style=\"white-space:pre-wrap;font:inherit\">${escapeHtml(message)}</pre>`,
      "</div>",
    ].join(""),
  };
}

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const originError = assertSameOrigin(request);
    if (originError) return originError;

    await enforceRateLimit(await rateLimitKey("hyperknow-feedback-user", member.email), 5, 60 * 60);
    await enforceRateLimit(await requestActorKey(request, "hyperknow-feedback-ip"), 30, 60 * 60);

    const rawBody = await request.text().catch(() => null);
    if (rawBody === null) return Response.json({ error: "message_required" }, { status: 400 });
    if (new TextEncoder().encode(rawBody).byteLength > HYPERKNOW_FEEDBACK_MAX_REQUEST_BYTES) {
      return Response.json({ error: "feedback_payload_too_large" }, { status: 413 });
    }
    let input: unknown = null;
    try {
      input = JSON.parse(rawBody);
    } catch {
      input = null;
    }
    if (!isRecord(input) || typeof input.message !== "string") {
      return Response.json({ error: "message_required" }, { status: 400 });
    }
    const message = input.message.trim();
    const messageLength = Array.from(message).length;
    if (messageLength < 1 || messageLength > MAX_MESSAGE_LENGTH) {
      return Response.json({ error: "message_length_invalid" }, { status: 400 });
    }
    const context = sanitizeContext(input.context);
    if (!context) return Response.json({ error: "context_invalid" }, { status: 400 });

    const id = crypto.randomUUID();
    const db = database();
    // 初始值按“通知未确认”处理;落库成功是反馈收到的判据,后续邮件结果只更新通知列。
    const inserted = await db.prepare(
      `INSERT INTO hk_feedback (id, user_email, message, context_json, notify_code)
       VALUES (?, ?, ?, ?, 'notification_pending')
       RETURNING id, created_at AS createdAt`,
    ).bind(id, member.email, message, JSON.stringify(context)).first<{ id: string; createdAt: string }>();
    if (!inserted) throw new Error("hyperknow_feedback_insert_missing_row");

    const values = env as unknown as Record<string, string | undefined>;
    const recipient = values.ZAOCHANG_FOUNDER_EMAIL?.trim() || DEFAULT_NOTIFY_EMAIL;
    const email = feedbackEmail(id, member.email, inserted.createdAt, context, message);
    let notification: { ok: true } | { ok: false; code: string };
    try {
      notification = await sendEmail({ to: recipient, ...email });
    } catch {
      notification = { ok: false, code: "email_send_failed" };
    }
    const notifyStatus = notification.ok
      ? "sent"
      : notification.code === "email_not_configured" ? "not_configured" : "failed";
    const notifyCode = notification.ok ? null : notification.code;
    try {
      await db.prepare(
        `UPDATE hk_feedback SET notify_status = ?, notify_code = ? WHERE id = ?`,
      ).bind(notifyStatus, notifyCode, id).run();
    } catch (error) {
      console.error(`[hyperknow-feedback] notification status update failed id=${id}:`, error instanceof Error ? error.message : error);
    }

    return Response.json({ ok: true, id, notified: notification.ok });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const parsedLimit = Number(url.searchParams.get("limit"));
    const parsedOffset = Number(url.searchParams.get("offset"));
    const limit = Number.isInteger(parsedLimit) && parsedLimit >= 1 ? Math.min(parsedLimit, 100) : 50;
    const offset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? Math.min(parsedOffset, 100_000) : 0;
    const result = await database().prepare(
      `SELECT id, user_email AS userEmail, message, context_json AS contextJson,
              notify_status AS notifyStatus, notify_code AS notifyCode, created_at AS createdAt
       FROM hk_feedback ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    ).bind(limit + 1, offset).all<{
      id: string;
      userEmail: string;
      message: string;
      contextJson: string;
      notifyStatus: "sent" | "failed" | "not_configured";
      notifyCode: string | null;
      createdAt: string;
    }>();
    const rows = result.results ?? [];
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(({ contextJson, ...row }) => ({
      ...row,
      context: parseStoredContext(contextJson),
    }));
    return Response.json({ items, limit, offset, hasMore, nextOffset: hasMore ? offset + limit : null });
  } catch (error) {
    return jsonError(error);
  }
}
