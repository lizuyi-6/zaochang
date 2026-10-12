import { accessError, jsonError } from "../../_lib/errors";
import { guardWrite } from "../../_lib/route-guards";
import { submitHostingBundle } from "../../_lib/hosting";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const guarded = await guardWrite(request, { member: "member", sameOrigin: true });
    if (guarded instanceof Response) return guarded;
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw accessError("invalid_upload", 400);
    }
    const productId = Number(String(form.get("productId") ?? ""));
    const file = form.get("file");
    if (!Number.isSafeInteger(productId) || productId < 1 || !(file instanceof File)) {
      throw accessError("invalid_upload", 400);
    }
    const hosting = await submitHostingBundle({ member: guarded.member, productId, file });
    return Response.json({ hosting }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
