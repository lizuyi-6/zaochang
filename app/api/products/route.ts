import { requireMember } from "../_lib/access-control";
import { createProduct } from "../_lib/products";
import { jsonError } from "../_lib/community";
import { assertSameOrigin } from "../_lib/request-origin";

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    // L4(2026-10 审计):建作品是高影响写(触发审核流/计费面),此前缺同源断言,
    // 实测跨站 POST 可达业务层;补与其余写端点一致的标准。
    const originError = assertSameOrigin(request);
    if (originError) return originError;
    const product = await createProduct(member, async (): Promise<Record<string, unknown>> => {
      try {
        return (await request.json()) as Record<string, unknown>;
      } catch {
        return {};
      }
    });
    return Response.json({ product, reward: 0 }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
