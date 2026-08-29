// 账本落地·内容隐藏·资产头:自 tests/rendered-html.test.mjs 保序拆分(测试体逐字未改)。
// 执行顺序由 tests/rendered-html.test.mjs 的注册顺序保证。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  baseUrl,
  runId,
  adminEmail,
  projectRoot,
  authHeaders,
  executeLocalD1,
  queryLocalD1,
  creditTestFruit,
  reviewProduct,
} from "../harness/preview.mjs";

export function register() {
test("settlement writes a visible transactions row for the seller", async () => {
  // P1 复核用例:订单结算此前只动账本分录与钱包,不写 transactions——卖家
  // "最近流水"与余额脱节。购买侧两方都有流水,结算侧必须同样落行。
  const ownerEmail = `settlement-tx-owner-${runId}@example.com`;
  const ownerHeaders = authHeaders("结算流水作者", ownerEmail);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `结算流水作品 ${runId}`, description: "验证订单结算同时写入卖家可见流水。", category: "互动体验", coverTheme: "mint", pricingModel: "one_time", price: 3 }),
  });
  assert.equal(created.status, 201);
  const productId = (await created.json()).product.id;
  await reviewProduct(productId);
  const buyerEmail = `settlement-tx-buyer-${runId}@example.com`;
  const buyerHeaders = authHeaders("结算流水买家", buyerEmail);
  await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  await creditTestFruit(buyerEmail, 10, "settlement-tx-buyer");
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = '${buyerEmail}'`);
  const checkout = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `settlement_tx_${runId}` }) });
  assert.equal(checkout.status, 200);
  await executeLocalD1(`UPDATE product_orders SET available_at = '2020-01-01 00:00:00' WHERE product_id = ${productId} AND status = 'paid'`);
  const settled = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(settled.wallet.pendingBalance, 0);
  assert.equal(settled.wallet.balance, 3);
  const rows = await queryLocalD1(`SELECT delta, type, reference_id FROM transactions WHERE user_email = '${ownerEmail}' AND type = 'settlement'`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].delta, 3);
  assert.match(rows[0].reference_id, /^order:/);
});

test("hidden posts close their comment surface and counters stay consistent", async () => {
  // P2 复核用例:帖子被管理员隐藏后,评论区此前仍可读可写;comments_count 此前
  // 是非原子的裸 UPDATE 且隐藏评论后不减;posts.likes_count 此前是死计数器。
  const authorHeaders = authHeaders("被隐藏帖作者", `hidden-post-author-${runId}@example.com`);
  const posted = await fetch(`${baseUrl}/api/actions`, {
    method: "POST",
    headers: authorHeaders,
    body: JSON.stringify({ action: "post", content: `待隐藏动态 ${runId}，内容用于评论区联动验证。` }),
  });
  assert.equal(posted.status, 201);
  const postId = String((await posted.json()).post.id);

  const commenterHeaders = authHeaders("评论用户", `hidden-post-commenter-${runId}@example.com`);
  const before = await fetch(`${baseUrl}/api/comments`, {
    method: "POST",
    headers: commenterHeaders,
    body: JSON.stringify({ targetType: "post", targetRef: postId, content: "隐藏前的可见评论" }),
  });
  assert.equal(before.status, 201);
  let counts = await queryLocalD1(`SELECT comments_count AS n, likes_count AS likes FROM posts WHERE id = ${postId}`);
  assert.equal(counts[0].n, 1);
  const like = await fetch(`${baseUrl}/api/actions`, {
    method: "POST",
    headers: commenterHeaders,
    body: JSON.stringify({ action: "toggle_action", kind: "like_post", targetRef: postId }),
  });
  assert.equal((await like.json()).active, true);
  counts = await queryLocalD1(`SELECT likes_count AS likes FROM posts WHERE id = ${postId}`);
  assert.equal(counts[0].likes, 1);
  const unlike = await fetch(`${baseUrl}/api/actions`, {
    method: "POST",
    headers: commenterHeaders,
    body: JSON.stringify({ action: "toggle_action", kind: "like_post", targetRef: postId }),
  });
  assert.equal((await unlike.json()).active, false);
  counts = await queryLocalD1(`SELECT likes_count AS likes FROM posts WHERE id = ${postId}`);
  assert.equal(counts[0].likes, 0);

  const report = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: commenterHeaders,
    body: JSON.stringify({ targetType: "post", targetRef: postId, reason: "spam", details: "测试举报：隐藏该动态。" }),
  });
  assert.equal(report.status, 201);
  const adminHeaders = authHeaders("发布审核管理员", adminEmail);
  const queue = await (await fetch(`${baseUrl}/api/admin/moderation`, { headers: adminHeaders })).json();
  const queuedReport = queue.reports.find((item) => item.targetType === "post" && item.targetRef === postId);
  assert.equal(typeof queuedReport?.id, "string");
  const hide = await fetch(`${baseUrl}/api/admin/moderation`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ action: "hide_reported_content", targetRef: queuedReport.id }),
  });
  assert.equal(hide.status, 200);

  const read = await fetch(`${baseUrl}/api/comments?targetType=post&targetRef=${encodeURIComponent(postId)}`, { headers: commenterHeaders });
  assert.equal(read.status, 404);
  const write = await fetch(`${baseUrl}/api/comments`, {
    method: "POST",
    headers: commenterHeaders,
    body: JSON.stringify({ targetType: "post", targetRef: postId, content: "隐藏后不应再能评论" }),
  });
  assert.equal(write.status, 404);
  // 单独隐藏一条评论(举报 comment 目标):count 递减触发器挂在 comments 表的
  // moderation_status 翻转上,隐藏帖子本身不会动它。
  const firstComment = (await (await before.json()).comment) ?? null;
  assert.ok(firstComment?.id, "评论响应应含 comment.id");
  const commentReport = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: commenterHeaders,
    body: JSON.stringify({ targetType: "comment", targetRef: String(firstComment.id), reason: "spam", details: "测试举报：隐藏该评论。" }),
  });
  assert.equal(commentReport.status, 201);
  const queueAfterHide = await (await fetch(`${baseUrl}/api/admin/moderation`, { headers: adminHeaders })).json();
  const queuedCommentReport = queueAfterHide.reports.find((item) => item.targetType === "comment" && item.targetRef === String(firstComment.id));
  assert.equal(typeof queuedCommentReport?.id, "string");
  const hideComment = await fetch(`${baseUrl}/api/admin/moderation`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ action: "hide_reported_content", targetRef: queuedCommentReport.id }),
  });
  assert.equal(hideComment.status, 200);
  counts = await queryLocalD1(`SELECT comments_count AS n FROM posts WHERE id = ${postId}`);
  assert.equal(counts[0].n, 0, "隐藏评论必须同步递减 comments_count");
});

test("docs PATCH rejects a nonexistent parent instead of orphaning the doc to root", async () => {
  // P2 复核用例:PATCH 不存在的 parentId 曾穿过防环游标被静默写入,
  // 文档树随后把孤儿"提升到根"。
  const docsRunId = crypto.randomUUID();
  const created = await fetch(`${baseUrl}/api/docs`, {
    method: "POST",
    headers: authHeaders("造场创始人", adminEmail),
    body: JSON.stringify({ title: `孤儿子级 ${docsRunId.slice(0, 8)}`, slug: `orphan-${docsRunId.slice(0, 8)}`, visibility: "public" }),
  });
  assert.equal(created.status, 201);
  const doc = (await created.json()).doc;
  const patch = await fetch(`${baseUrl}/api/docs`, {
    method: "PATCH",
    headers: authHeaders("造场创始人", adminEmail),
    body: JSON.stringify({ id: doc.id, parentId: "doc:definitely-not-here" }),
  });
  assert.equal(patch.status, 404);
  assert.deepEqual(await patch.json(), { error: "parent_not_found" });
  const rows = await queryLocalD1(`SELECT parent_id AS parentId FROM docs WHERE id = '${doc.id}'`);
  assert.equal(rows[0].parentId, null);
});

test("product approval refuses an external cover image like an external demo", async () => {
  // P2 复核用例:外链封面曾可以过审——过审后图床可被原地替换(内容调包/追踪)。
  const ownerHeaders = authHeaders("外链封面作者", `external-cover-${runId}@example.com`);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `外链封面作品 ${runId}`, description: "封面指向外部图床,审批必须与外链 demo 同规拒绝。", category: "互动体验", coverTheme: "blue", pricingModel: "free", imageUrl: "https://evil.example/cover.jpg" }),
  });
  assert.equal(created.status, 201);
  const productId = (await created.json()).product.id;
  const response = await fetch(`${baseUrl}/api/admin/moderation`, {
    method: "PATCH",
    headers: authHeaders("发布审核管理员", adminEmail),
    body: JSON.stringify({ action: "approve_product", targetRef: String(productId), note: "尝试批准外链封面作品,应被拒绝。" }),
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "external_demo_requires_immutable_package" });
});

test("published static asset headers file keeps product apps same-origin framed", () => {
  // P2-O 门禁:生产环境 /product-apps/* 与 /downloads/* 由 Workers Assets 直接服务,
  // worker 的安全头分支不会运行——public/_headers 是这些路径唯一的防线,受测试保护。
  const headers = readFileSync(join(projectRoot, "public", "_headers"), "utf8");
  const productApps = headers.slice(headers.indexOf("/product-apps/*"), headers.indexOf("/product-apps/wander"));
  assert.match(productApps, /X-Content-Type-Options: nosniff/i);
  assert.match(productApps, /X-Frame-Options: SAMEORIGIN/i);
  assert.match(productApps, /frame-ancestors 'self'/i);
  const downloads = headers.slice(headers.indexOf("/downloads/*"), headers.indexOf("/product-apps/*"));
  assert.match(downloads, /X-Content-Type-Options: nosniff/i);
  assert.match(downloads, /Content-Disposition: attachment/i);
});
}
