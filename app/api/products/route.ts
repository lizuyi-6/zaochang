import { requireMember } from "../_lib/access-control";
import { createProduct } from "../_lib/products";
import { jsonError } from "../_lib/community";

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const product = await createProduct(member, () => request.json() as Promise<Record<string, unknown>>);
    return Response.json({ product, reward: 0 }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
