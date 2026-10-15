import { requireMember } from "../../../../_lib/access-control";
import { decideExternalPayment, externalPaymentReturnUrl, ExternalFruitError } from "../../../../_lib/external-fruit";
import { enforceRateLimit, rateLimitKey, RateLimitError } from "../../../../_lib/rate-limit";
import { publicAppOrigin } from "../../../../../oauth-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const requestOrigin = request.headers.get("origin");
    if (!requestOrigin || requestOrigin !== publicAppOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
    const member = await requireMember();
    // M4(2026-10 审计):确认端点在 decideExternalPayment 里带结算/状态翻转写,
    // 与其余资金端点同标准补限流;60/h 远超人类操作频率。
    await enforceRateLimit(await rateLimitKey("payment-approve", member.email), 60, 60 * 60);
    const form = await request.formData();
    const result = await decideExternalPayment(member.email, String(form.get("payment_id") ?? ""), String(form.get("challenge") ?? ""), String(form.get("decision") ?? "deny"));
    return Response.redirect(externalPaymentReturnUrl(result.returnUri, result.payment), 303);
  } catch (error) {
    if (error instanceof ExternalFruitError) return Response.json({ error: error.code }, { status: error.status });
    if (error instanceof RateLimitError) {
      return Response.json(
        { error: error.code },
        { status: 429, headers: error.retryAfterSeconds ? { "retry-after": String(Math.floor(error.retryAfterSeconds)) } : undefined },
      );
    }
    throw error;
  }
}
