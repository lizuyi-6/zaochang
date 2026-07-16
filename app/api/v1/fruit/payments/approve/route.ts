import { requireMember } from "../../../../_lib/community";
import { decideExternalPayment, externalPaymentReturnUrl, ExternalFruitError } from "../../../../_lib/external-fruit";
import { publicAppOrigin } from "../../../../../oauth-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const requestOrigin = request.headers.get("origin");
    if (!requestOrigin || requestOrigin !== publicAppOrigin(request)) return Response.json({ error: "invalid_origin" }, { status: 403 });
    const member = await requireMember();
    const form = await request.formData();
    const result = await decideExternalPayment(member.email, String(form.get("payment_id") ?? ""), String(form.get("challenge") ?? ""), String(form.get("decision") ?? "deny"));
    return Response.redirect(externalPaymentReturnUrl(result.returnUri, result.payment), 303);
  } catch (error) {
    if (error instanceof ExternalFruitError) return Response.json({ error: error.code }, { status: error.status });
    throw error;
  }
}
