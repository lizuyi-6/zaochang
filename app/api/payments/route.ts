import { requireMember } from "../_lib/access-control";
import { jsonError } from "../_lib/community";
import { enforceRateLimit, rateLimitKey } from "../_lib/rate-limit";
import { refundExternalPaymentForMember } from "../_lib/external-fruit";
import { checkoutProduct, getFruitPaymentState, refundProductOrder } from "../_lib/fruit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const member = await requireMember();
    const productId = Number(new URL(request.url).searchParams.get("productId"));
    if (!Number.isInteger(productId)) return Response.json({ error: "invalid_product" }, { status: 400 });
    return Response.json(await getFruitPaymentState(member.email, productId));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    // 唯一此前无限流的资金端点:结算/退款有 CHECK+幂等兜底,不会因此出错,
    // 但无限流就是免费的 D1 写放大入口。20/h 与发帖同档。
    await enforceRateLimit(await rateLimitKey("payments", member.email), 20, 60 * 60);
    const input = await request.json() as Record<string, unknown>;
    const action = String(input.action ?? "");
    const idempotencyKey = String(input.idempotencyKey ?? "");
    if (action === "checkout") {
      const productId = Number(input.productId);
      return Response.json(await checkoutProduct(member.email, productId, idempotencyKey));
    }
    if (action === "refund") {
      return Response.json(await refundProductOrder(member.email, String(input.orderId ?? ""), idempotencyKey));
    }
    if (action === "external_refund") {
      return Response.json(await refundExternalPaymentForMember(member.email, String(input.paymentId ?? ""), idempotencyKey));
    }
    return Response.json({ error: "invalid_payment_action" }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}
