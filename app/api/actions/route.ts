import { guardWrite } from "../_lib/route-guards";
import { jsonError } from "../_lib/community";
import { handleExperienceAction, handleMemberAction } from "../_lib/community-actions";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as Record<string, unknown>;
    if (String(input.action ?? "") === "experience") {
      return await handleExperienceAction(request, input);
    }
    const guarded = await guardWrite(request, {
      member: "member",
      sameOrigin: true,
      rate: { bucket: "member-action", limit: 180, windowSeconds: 60 * 60 },
    });
    if (guarded instanceof Response) return guarded;
    // 必须 await:try/catch 只覆盖同步段,裸 return 的 Promise 拒约会绕过本 catch,
    // 被 vinext 入口层兜成无响应体的 500(域模块的错误码全部丢失)。
    return await handleMemberAction(guarded.member, input);
  } catch (error) {
    return jsonError(error);
  }
}
