import { requireMember } from "../../../_lib/access-control";
import { jsonError } from "../../../_lib/errors";
import { database } from "../../../_lib/community";
import { currentCredits } from "../../../_lib/hyperknow/credits";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type CreditEventCursor = { createdAt: string; id: string };
type CreditEventRow = {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
};

function parseCursor(value: string | null): CreditEventCursor | null | false {
  if (!value) return null;
  if (value.length > 100) return false;
  const separator = value.indexOf("|");
  if (separator < 0) return false;
  const createdAt = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(createdAt) || !/^[a-f0-9]{32}$/.test(id)) return false;
  return { createdAt, id };
}

function nextBeijingMidnight(now = new Date()): string {
  const beijingNow = new Date(now.getTime() + 8 * 3_600_000);
  const nextUtcDate = Date.UTC(
    beijingNow.getUTCFullYear(),
    beijingNow.getUTCMonth(),
    beijingNow.getUTCDate() + 1,
  );
  return new Date(nextUtcDate - 8 * 3_600_000).toISOString();
}

export async function GET(request: Request) {
  try {
    const member = await requireMember();
    const cursor = parseCursor(new URL(request.url).searchParams.get("cursor"));
    if (cursor === false) return Response.json({ error: "invalid_cursor" }, { status: 400 });

    // 读取余额时执行北京日界懒重置;若发生变化,数据库触发器会在同一事务写 daily_reset 流水。
    const credits = await currentCredits(member);
    const db = database();
    const rows = cursor
      ? await db.prepare(
        `SELECT id, delta, balance_after AS balanceAfter, reason, created_at AS createdAt
         FROM hk_credit_events
         WHERE user_email = ? AND (created_at < ? OR (created_at = ? AND id < ?))
         ORDER BY created_at DESC, id DESC LIMIT ?`,
      ).bind(member.email, cursor.createdAt, cursor.createdAt, cursor.id, PAGE_SIZE + 1).all<CreditEventRow>()
      : await db.prepare(
        `SELECT id, delta, balance_after AS balanceAfter, reason, created_at AS createdAt
         FROM hk_credit_events WHERE user_email = ?
         ORDER BY created_at DESC, id DESC LIMIT ?`,
      ).bind(member.email, PAGE_SIZE + 1).all<CreditEventRow>();

    const page = rows.results.slice(0, PAGE_SIZE);
    const hasMore = rows.results.length > PAGE_SIZE;
    const last = page[page.length - 1];
    return Response.json({
      success: true,
      data: {
        remaining: credits.remaining,
        max: credits.max,
        tier: credits.tier,
        resets_at: nextBeijingMidnight(),
        events: page,
        next_cursor: hasMore && last ? `${last.createdAt}|${last.id}` : null,
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
