import { isFounderEmail, optionalMember } from "../_lib/access-control";
import { ensureMember, jsonError } from "../_lib/community";
import { loadMemberCommunityState } from "../_lib/community-state";
import { settleDueExternalFruit } from "../_lib/external-fruit";
import { settleDueFruit } from "../_lib/fruit";
import { loadPublicCommunityState } from "../_lib/public-community";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const member = await optionalMember();
    if (member) {
      await ensureMember(member);
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
      isFounder: member ? isFounderEmail(member.email) : false,
    });
  } catch (error) {
    return jsonError(error);
  }
}
