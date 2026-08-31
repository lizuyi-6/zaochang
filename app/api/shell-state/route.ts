import { optionalMember } from "../_lib/access-control";
import { ensureMember, database, jsonError } from "../_lib/community";
import { listMemberActions, listMemberNotifications } from "../_lib/community-state";
import { settleDueExternalFruit } from "../_lib/external-fruit";
import { settleDueFruit, getWalletOverview } from "../_lib/fruit";
import { countVisiblePosts, loadCircleStats } from "../_lib/public-community";

export const dynamic = "force-dynamic";

// 站壳顶栏专用轻量聚合:只返回导航栏真正渲染的四类小数据(帖子数/圈子统计/
// 钱包余额/是否有未读),替代站壳此前整份拉取 /api/community(公开 6 组聚合 +
// 登录侧十余串行查询、~600B 也好过几 KB 的多余字段,更重要的是 D1 查询数)。
// 语义对齐 /api/community:登录时同样 ensureMember + 到期果子结算,钱包余额
// 沿用带账本一致性校验的 getWalletOverview(FruitError 仍由 jsonError 映射);
// 未读判定 = 通知 UNION 流中存在未被 read_notification 行标记的 id(与站壳
// 此前的客户端推导一致)。匿名请求只算公开两样,不触碰成员数据。
// 响应 no-store:站壳在硬加载/登录态变化时各拉一次,/api/ 前缀本就不入匿名缓存。
export async function GET() {
  try {
    const member = await optionalMember();
    const db = database();
    const [posts, circleStats] = await Promise.all([countVisiblePosts(db), loadCircleStats(db)]);

    let wallet: { balance: number } | null = null;
    let hasUnread = false;
    if (member) {
      await ensureMember(member);
      await Promise.all([settleDueFruit(member.email), settleDueExternalFruit(member.email)]);
      const overview = await getWalletOverview(member.email);
      const [notifications, actions] = await Promise.all([
        listMemberNotifications(db, member.email, member.displayName),
        listMemberActions(db, member.email),
      ]);
      const read = new Set(
        actions
          .filter((action) => action.kind === "read_notification")
          .map((action) => String(action.targetRef)),
      );
      hasUnread = notifications.some((notification) => !read.has(String(notification.id)));
      wallet = { balance: Number(overview?.balance ?? 0) };
    }

    return Response.json({ platformStats: { posts }, circleStats, wallet, hasUnread });
  } catch (error) {
    return jsonError(error);
  }
}
