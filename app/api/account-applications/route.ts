import { submitApplication } from "../_lib/account-applications";
import { jsonError } from "../_lib/community";

export const dynamic = "force-dynamic";

// 造场账户申请 · 公开提交。同源、Turnstile(配置时)、三层限流与统一 202 响应
// 见 _lib/account-applications.ts 的 submitApplication。
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    return await submitApplication(request, body);
  } catch (error) {
    return jsonError(error);
  }
}
