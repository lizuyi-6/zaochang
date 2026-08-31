import { optionalMember } from "../_lib/access-control";
import { ensureMember, database, jsonError } from "../_lib/community";
import { listMemberNotifications, listReadNotificationRefs } from "../_lib/community-state";
import { settleDueExternalFruit } from "../_lib/external-fruit";
import { settleDueFruit, getWalletOverview } from "../_lib/fruit";
import { countVisiblePosts, loadCircleStats } from "../_lib/public-community";

export const dynamic = "force-dynamic";

// 站壳顶栏专用轻量聚合:只返回导航栏真正渲染的四类小数据(帖子数/圈子统计/
// 钱包余额/是否有未读),替代站壳此前整份拉取 /api/community(公开 6 组聚合 +
// 登录侧十余串行查询、~600B 也好过几 KB 的多余字段,更重要的是 D1 查询数)。
// 语义对齐 /api/community:登录时同样 ensureMember + 到期果子结算。结算与余额
// 读取与 /api/community 同为 best-effort——账本不一致时结算跳过、钱包置 review,
// 此处仍返回物化余额(账本强校验在支付/退款等写路径,读路径行为与 /api/community
// 逐字一致,不在本接口单独改变状态码契约)。
// 未读判定 = 通知 UNION 流中存在未被 read_notification 行标记的 id;已读标记只查
// read_notification 行,不搬运成员全部行为流水。匿名请求只算公开两样,不触碰成员数据。
// 响应 no-store:站壳在硬加载/账户切换/写操作刷新事件时各拉一次,/api/ 前缀本就不入匿名缓存。
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
      const [notifications, read] = await Promise.all([
        listMemberNotifications(db, member.email, member.displayName),
        listReadNotificationRefs(db, member.email),
      ]);
      hasUnread = notifications.some((notification) => !read.has(String(notification.id)));
      wallet = { balance: Number(overview?.balance ?? 0) };
    }

    return Response.json({ platformStats: { posts }, circleStats, wallet, hasUnread });
  } catch (error) {
    return jsonError(error);
  }
}
