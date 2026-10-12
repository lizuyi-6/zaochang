import { accessError, jsonError } from "../../../_lib/errors";
import { consumeHostingUploadToken, submitHostingBundle } from "../../../_lib/hosting";
import { MAX_UPLOAD_BYTES } from "../../../_lib/upload-security";
import { enforceRateLimit, requestActorKey } from "../../../_lib/rate-limit";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    await enforceRateLimit(await requestActorKey(request, "hosting-token-put"), 20, 60 * 60);
    const { token } = await context.params;
    // 消费在内容校验之前,所以令牌一旦被有效识别,任何后续失败都不能重放。
    const identity = await consumeHostingUploadToken(token);
    if (request.headers.get("content-type")?.trim().toLowerCase() !== "application/zip") {
      throw accessError("invalid_upload_type", 400);
    }
    const declaredSize = request.headers.get("content-length");
    if (declaredSize && (!/^\d+$/.test(declaredSize) || Number(declaredSize) > MAX_UPLOAD_BYTES)) {
      throw accessError("invalid_upload_size", 400);
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength < 1 || bytes.byteLength > MAX_UPLOAD_BYTES) throw accessError("invalid_upload_size", 400);
    const file = new File([bytes], "hosting.zip", { type: "application/zip" });
    const hosting = await submitHostingBundle({ member: { email: identity.memberEmail }, productId: identity.productId, file });
    return Response.json({ hosting }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
