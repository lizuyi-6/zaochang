import { hasRole, optionalMember } from "../_lib/access-control";
import { ensureMember, jsonError } from "../_lib/community";
import { loadMemberCommunityState } from "../_lib/community-state";
import { settleDueExternalFruit } from "../_lib/external-fruit";
import { settleDueFruit } from "../_lib/fruit";
import { enforceRateLimit, rateLimitKey } from "../_lib/rate-limit";
import { loadPublicCommunityState } from "../_lib/public-community";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const member = await optionalMember();
    if (member) {
      await ensureMember(member);
      // M4(2026-10 审计):整份社区聚合是重量级读,登录侧还叠加双结算;补 360/h
      // 成员级限流(约每 10 秒一次,正常浏览远够),匿名公开半边不限。
      await enforceRateLimit(await rateLimitKey("community-read", member.email), 360, 60 * 60);
      await Promise.all([settleDueFruit(member.email), settleDueExternalFruit(member.email)]);
    }

    const publicState = await loadPublicCommunityState();
    const memberState = member ? await loadMemberCommunityState(member) : null;

    return Response.json({
      products: publicState.products,
      posts: publicState.posts,
      platformStats: publicState.platformStats,
      wallet: memberState?.wallet ?? null,
      transactions: memberState?.transactions ?? [],
      profile: memberState?.profile ?? null,
      actions: memberState?.actions ?? [],
      collections: memberState?.collections ?? [],
      collectionItems: memberState?.collectionItems ?? [],
      ownedProducts: memberState?.ownedProducts ?? [],
      notifications: memberState?.notifications ?? [],
      orders: memberState?.orders ?? [],
      productLikes: memberState?.productLikes ?? [],
      authoredBooks: memberState?.authoredBooks ?? [],
      recentReading: memberState?.recentReading ?? [],
      circleStats: publicState.circleStats,
      liveRoomStats: publicState.liveRoomStats,
      signedIn: Boolean(member),
      isFounder: member ? hasRole(member, "founder") : false,
    });
  } catch (error) {
    return jsonError(error);
  }
}
