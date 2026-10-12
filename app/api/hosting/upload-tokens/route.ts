import { accessError, jsonError } from "../../_lib/errors";
import { guardWrite } from "../../_lib/route-guards";
import { createHostingUploadToken } from "../../_lib/hosting";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const guarded = await guardWrite(request, { member: "member", sameOrigin: true });
    if (guarded instanceof Response) return guarded;
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      throw accessError("invalid_upload_token_request", 400);
    }
    const productId = input && typeof input === "object" ? Number((input as Record<string, unknown>).productId) : NaN;
    if (!Number.isSafeInteger(productId) || productId < 1) throw accessError("invalid_upload_token_request", 400);
    return Response.json(await createHostingUploadToken(guarded.member, productId), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
