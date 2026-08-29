// 产品审核门控:自 tests/rendered-html.test.mjs 保序拆分(测试体逐字未改)。
// 执行顺序由 tests/rendered-html.test.mjs 的注册顺序保证。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baseUrl,
  runId,
  adminEmail,
  output,
  authHeaders,
  fetchIdempotentWithRetry,
  executeLocalD1,
  creditTestFruit,
  reviewProduct,
} from "../harness/preview.mjs";

export function register() {
test("all submitted products require platform review before public access or fruit actions", async () => {
  const email = `creator-${runId}@example.com`;
  const headers = authHeaders("测试创作者", email);
  const title = `边界天气台 ${runId}`;
  const productPayload = JSON.stringify({
    title,
    description: "把窗外天气转换成一段可操作的声音与颜色体验。",
    category: "互动体验",
    coverTheme: "blue",
    pricingModel: "one_time",
    price: 5,
  });
  const sendPublish = () => fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers,
    body: productPayload,
  });
  let publish = await sendPublish();
  let publishBody = await publish.text();
  if (publish.status === 503 && publishBody.includes("worker restarted mid-request")) {
    const probe = await fetch(`${baseUrl}/api/community`, { headers });
    assert.equal(probe.status, 200);
    const state = await probe.json();
    assert.equal(state.products.some((product) => product.title === title), false);
    assert.equal(state.wallet.balance, 0);
    publish = await sendPublish();
    publishBody = await publish.text();
  }
  assert.equal(publish.status, 201, `${publishBody}\n${output}`);
  const published = JSON.parse(publishBody);
  assert.equal(published.product.title, title);
  assert.equal(published.product.pricingModel, "one_time");
  assert.equal(published.product.price, 5);
  assert.equal(published.product.status, "pending_review");
  assert.equal(published.product.reviewStatus, "pending_review");
  assert.equal(published.product.reviewVersion, 1);
  assert.equal(published.reward, 0);
  const productId = published.product.id;

  const community = await fetch(`${baseUrl}/api/community`, { headers });
  assert.equal(community.status, 200);
  const data = await community.json();
  assert.equal(data.wallet.balance, 0);
  assert.equal(data.wallet.balance, data.wallet.ledgerBalance);
  assert.equal(data.products.some((product) => product.title === title), false);
  const ownedPending = data.ownedProducts.find((product) => product.id === productId);
  assert.equal(ownedPending.status, "pending_review");
  assert.equal(ownedPending.reviewStatus, "pending_review");
  assert.equal(ownedPending.reviewVersion, 1);
  assert.equal(ownedPending.approvedVersion, 0);

  const visitorHeaders = authHeaders("预审边界访客", `review-visitor-${runId}@example.com`);
  await fetch(`${baseUrl}/api/community`, { headers: visitorHeaders });
  const [pendingPage, pendingPayment, pendingExperience, pendingLike, pendingTip, pendingComments, pendingComment] = await Promise.all([
    fetch(`${baseUrl}/product/${productId}`, { headers: { accept: "text/html" } }),
    fetch(`${baseUrl}/api/payments?productId=${productId}`, { headers: visitorHeaders }),
    fetch(`${baseUrl}/api/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "experience", productId }) }),
    fetch(`${baseUrl}/api/actions`, { method: "POST", headers: visitorHeaders, body: JSON.stringify({ action: "like", productId }) }),
    fetch(`${baseUrl}/api/actions`, { method: "POST", headers: visitorHeaders, body: JSON.stringify({ action: "tip", productId, amount: 5, idempotencyKey: `pending_tip_${runId}` }) }),
    fetch(`${baseUrl}/api/comments?targetType=product&targetRef=${productId}`),
    fetch(`${baseUrl}/api/comments`, { method: "POST", headers: visitorHeaders, body: JSON.stringify({ targetType: "product", targetRef: String(productId), content: "待审商品不应允许评论。" }) }),
  ]);
  assert.equal(pendingPage.status, 404);
  await pendingPage.arrayBuffer();
  for (const response of [pendingPayment, pendingExperience, pendingLike, pendingTip, pendingComments, pendingComment]) {
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "product_not_found" });
  }
  const visitorPendingState = await (await fetch(`${baseUrl}/api/community`, { headers: visitorHeaders })).json();
  assert.equal(visitorPendingState.wallet.balance, 0);
  assert.equal(visitorPendingState.wallet.balance, visitorPendingState.wallet.ledgerBalance);
  assert.equal(visitorPendingState.wallet.pendingBalance, 0);
  assert.equal(visitorPendingState.wallet.pendingBalance, visitorPendingState.wallet.ledgerPendingBalance);

  const deniedReview = await fetch(`${baseUrl}/api/admin/moderation`, {
    method: "PATCH",
    headers: visitorHeaders,
    body: JSON.stringify({ action: "approve_product", targetRef: String(productId), note: "无权限用户尝试批准。" }),
  });
  assert.equal(deniedReview.status, 403);
  assert.deepEqual(await deniedReview.json(), { error: "admin_forbidden" });

  await reviewProduct(productId, "approve_product", "产品说明、体验入口与访问方式均通过平台预审。");
  const duplicateDecision = await fetch(`${baseUrl}/api/admin/moderation`, {
    method: "PATCH",
    headers: authHeaders("发布审核管理员", adminEmail),
    body: JSON.stringify({ action: "reject_product", targetRef: String(productId), note: "并发后的第二个决定必须被拒绝。" }),
  });
  assert.equal(duplicateDecision.status, 409);
  assert.deepEqual(await duplicateDecision.json(), { error: "product_review_already_decided" });

  const approvedState = await (await fetch(`${baseUrl}/api/community`, { headers })).json();
  assert.equal(approvedState.products.some((product) => product.id === productId), true);
  const ownedApproved = approvedState.ownedProducts.find((product) => product.id === productId);
  assert.equal(ownedApproved.status, "published");
  assert.equal(ownedApproved.reviewStatus, "approved");
  assert.equal(ownedApproved.approvedVersion, ownedApproved.reviewVersion);
  const approvedPage = await fetch(`${baseUrl}/product/${productId}`);
  assert.equal(approvedPage.status, 200);
  await approvedPage.arrayBuffer();
  assert.equal((await fetch(`${baseUrl}/api/payments?productId=${productId}`, { headers: visitorHeaders })).status, 200);

  const visitorEmail = `review-visitor-${runId}@example.com`;
  await executeLocalD1(`UPDATE members SET joined_at = datetime('now', '-48 hours') WHERE email = '${visitorEmail}'`);
  await creditTestFruit(visitorEmail, 10, `review_replay_${runId}`);
  const idempotencyKey = `review_checkout_${runId}`;
  const checkout = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: visitorHeaders,
    body: JSON.stringify({ action: "checkout", productId, idempotencyKey }),
  });
  assert.equal(checkout.status, 200);
  const checkoutBody = await checkout.json();
  assert.equal(checkoutBody.access, true);
  assert.equal(checkoutBody.charged, true);
  await executeLocalD1(`UPDATE products SET description = description || ' 进入复审。' WHERE id = ${productId}`);
  const replayAfterReviewInvalidation = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: visitorHeaders,
    body: JSON.stringify({ action: "checkout", productId, idempotencyKey }),
  });
  assert.equal(replayAfterReviewInvalidation.status, 404);
  assert.deepEqual(await replayAfterReviewInvalidation.json(), { error: "product_not_found" });
  const visitorAfterReplay = await (await fetch(`${baseUrl}/api/community`, { headers: visitorHeaders })).json();
  assert.equal(visitorAfterReplay.wallet.balance, 5);
  assert.equal(visitorAfterReplay.wallet.balance, visitorAfterReplay.wallet.ledgerBalance);
});

test("external demo URLs cannot cross the immutable review boundary", async () => {
  const ownerEmail = `external-demo-owner-${runId}@example.com`;
  const ownerHeaders = authHeaders("外链作品作者", ownerEmail);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      title: `可变外链作品 ${runId}`,
      description: "用于验证审核通过后仍可替换内容的外部链接不会进入正式产品区。",
      category: "互动体验",
      coverTheme: "blue",
      pricingModel: "free",
      price: 0,
      demoUrl: "https://example.com/mutable-demo",
    }),
  });
  assert.equal(created.status, 201);
  const productId = (await created.json()).product.id;
  const adminHeaders = authHeaders("发布审核管理员", adminEmail);
  const approval = await fetch(`${baseUrl}/api/admin/moderation`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ action: "approve_product", targetRef: String(productId), note: "外链页面当前检查无异常。" }),
  });
  assert.equal(approval.status, 409);
  assert.deepEqual(await approval.json(), { error: "external_demo_requires_immutable_package" });

  const directApproval = await executeLocalD1(`
    INSERT INTO product_review_decisions
      (id, product_id, review_version, reviewer_email, decision, note)
    VALUES ('external-demo-bypass-${runId}', ${productId}, 1, '${adminEmail}', 'approved', '尝试绕过 API 批准外链。')
  `, false);
  assert.match(directApproval, /external_demo_requires_immutable_package/);
  const stateResponse = await fetchIdempotentWithRetry(`${baseUrl}/api/community`, { headers: ownerHeaders });
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  const product = state.ownedProducts.find((item) => item.id === productId);
  assert.equal(product.status, "pending_review");
  assert.equal(product.reviewStatus, "pending_review");
  assert.equal(product.approvedVersion, 0);
  assert.equal(state.products.some((item) => item.id === productId), false);

  await reviewProduct(productId, "reject_product", "外部链接可被原地替换，请改为站内不可变原型后重新提交。");
});

test("rejected products remain private and return the reviewer note to their owner", async () => {
  const ownerHeaders = authHeaders("预审驳回作者", `review-rejected-owner-${runId}@example.com`);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `预审驳回作品 ${runId}`, description: "用于验证驳回决定不会把商品暴露给公开访问或果子支付。", category: "互动体验", coverTheme: "coral", pricingModel: "one_time", price: 3 }),
  });
  assert.equal(created.status, 201);
  const productId = (await created.json()).product.id;
  const reviewQueue = await (await fetch(`${baseUrl}/api/admin/moderation`, { headers: authHeaders("发布审核管理员", adminEmail) })).json();
  const queuedProduct = reviewQueue.products.find((product) => product.id === productId);
  assert.equal(queuedProduct.reviewStatus, "pending_review");
  assert.equal(queuedProduct.reviewVersion, 1);
  const note = "体验地址缺少可核验内容，请补充完整演示后重新提交。";
  await reviewProduct(productId, "reject_product", note);

  const ownerState = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  const product = ownerState.ownedProducts.find((item) => item.id === productId);
  assert.equal(product.status, "rejected");
  assert.equal(product.reviewStatus, "rejected");
  assert.equal(product.approvedVersion, 0);
  assert.equal(product.reviewNote, note);
  assert.equal(ownerState.products.some((item) => item.id === productId), false);
  assert.equal((await fetch(`${baseUrl}/product/${productId}`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/payments?productId=${productId}`, { headers: ownerHeaders })).status, 404);
});

test("review invalidation during checkout rolls back the entire financial batch", async () => {
  const ownerEmail = `review-race-seller-${runId}@example.com`;
  const buyerEmail = `review-race-buyer-${runId}@example.com`;
  const ownerHeaders = authHeaders("复审竞态卖家", ownerEmail);
  const buyerHeaders = authHeaders("复审竞态买家", buyerEmail);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `复审竞态作品 ${runId}`, description: "在支付批次中途切换审核状态，验证所有财务写入整体回滚。", category: "开发工具", coverTheme: "ink", pricingModel: "one_time", price: 5 }),
  });
  const productId = (await created.json()).product.id;
  await reviewProduct(productId);
  await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  await executeLocalD1(`UPDATE members SET joined_at = datetime('now', '-48 hours') WHERE email = '${buyerEmail}'`);
  await creditTestFruit(buyerEmail, 10, `review_race_${runId}`);
  await executeLocalD1(`
    CREATE TRIGGER test_review_invalidation_before_purchase
    BEFORE INSERT ON fruit_operations
    WHEN NEW.kind = 'purchase' AND NEW.reference_type = 'product' AND NEW.reference_id = '${productId}'
    BEGIN
      UPDATE products SET status = 'pending_review', review_status = 'pending_review',
        review_version = review_version + 1, reviewed_by = NULL, reviewed_at = NULL,
        review_note = '', submitted_at = CURRENT_TIMESTAMP
      WHERE id = ${productId};
    END
  `);
  const checkout = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: buyerHeaders,
    body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `review_race_checkout_${runId}` }),
  });
  assert.equal(checkout.status, 404);
  assert.deepEqual(await checkout.json(), { error: "product_not_found" });
  await executeLocalD1(`DROP TRIGGER test_review_invalidation_before_purchase`);
  await executeLocalD1(`
    CREATE TABLE review_race_assertion (id integer);
    CREATE TRIGGER review_race_assertion_guard BEFORE INSERT ON review_race_assertion
    WHEN NOT EXISTS (
      SELECT 1 FROM products
      WHERE id = ${productId} AND status = 'published' AND review_status = 'approved'
        AND review_version = 1 AND approved_version = 1
    ) OR NOT EXISTS (
      SELECT 1 FROM wallets
      WHERE user_email = '${buyerEmail}' AND balance = 10 AND pending_balance = 0
    ) OR NOT EXISTS (
      SELECT 1 FROM wallets
      WHERE user_email = '${ownerEmail}' AND balance = 0 AND pending_balance = 0
    ) OR EXISTS (
      SELECT 1 FROM product_orders WHERE product_id = ${productId}
    ) OR EXISTS (
      SELECT 1 FROM fruit_operations
      WHERE kind = 'purchase' AND reference_type = 'product' AND reference_id = '${productId}'
    )
    BEGIN SELECT RAISE(ABORT, 'review_race_financial_batch_not_rolled_back'); END;
    INSERT INTO review_race_assertion (id) VALUES (1);
    DROP TRIGGER review_race_assertion_guard;
    DROP TABLE review_race_assertion
  `);
  const buyerState = await (await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders })).json();
  const ownerState = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(buyerState.wallet.balance, buyerState.wallet.ledgerBalance);
  assert.equal(ownerState.wallet.pendingBalance, ownerState.wallet.ledgerPendingBalance);
});

test("concurrent product review decisions produce one terminal decision", async () => {
  const ownerHeaders = authHeaders("并发预审作者", `review-race-owner-${runId}@example.com`);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `并发预审作品 ${runId}`, description: "两个审核决定同时到达时，只允许一个终态和一份版本决定。", category: "开发工具", coverTheme: "ink", pricingModel: "free", price: 0 }),
  });
  const productId = (await created.json()).product.id;
  const adminHeaders = authHeaders("发布审核管理员", adminEmail);
  await fetch(`${baseUrl}/api/admin/moderation`, { headers: adminHeaders });
  const decisions = await Promise.all([
    fetch(`${baseUrl}/api/admin/moderation`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ action: "approve_product", targetRef: String(productId), note: "并发审核中的批准决定。" }) }),
    fetch(`${baseUrl}/api/admin/moderation`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ action: "reject_product", targetRef: String(productId), note: "并发审核中的驳回决定。" }) }),
  ]);
  assert.deepEqual(decisions.map((response) => response.status).sort(), [200, 409]);
  const winningResponse = decisions.find((response) => response.status === 200);
  const losingResponse = decisions.find((response) => response.status === 409);
  const winner = await winningResponse.json();
  assert.deepEqual(await losingResponse.json(), { error: "product_review_already_decided" });

  const ownerState = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  const product = ownerState.ownedProducts.find((item) => item.id === productId);
  assert.equal(product.reviewStatus, winner.reviewStatus);
  assert.equal(product.status, winner.reviewStatus === "approved" ? "published" : "rejected");
  assert.equal(product.approvedVersion, winner.reviewStatus === "approved" ? product.reviewVersion : 0);
  assert.equal(ownerState.products.some((item) => item.id === productId), winner.reviewStatus === "approved");
});

test("concurrent identical product review decisions replay the same terminal decision", async () => {
  const ownerHeaders = authHeaders("幂等预审作者", `review-idempotent-owner-${runId}@example.com`);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `幂等预审作品 ${runId}`, description: "相同管理员决定并发到达时返回同一审核终态。", category: "开发工具", coverTheme: "ink", pricingModel: "free", price: 0 }),
  });
  const productId = (await created.json()).product.id;
  const adminHeaders = authHeaders("发布审核管理员", adminEmail);
  const payload = JSON.stringify({ action: "approve_product", targetRef: String(productId), note: "并发相同批准决定应当幂等重放。" });
  const responses = await Promise.all([
    fetch(`${baseUrl}/api/admin/moderation`, { method: "PATCH", headers: adminHeaders, body: payload }),
    fetch(`${baseUrl}/api/admin/moderation`, { method: "PATCH", headers: adminHeaders, body: payload }),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  const bodies = await Promise.all(responses.map((response) => response.json()));
  assert.equal(bodies.every((body) => body.reviewStatus === "approved"), true);
  assert.equal(bodies.filter((body) => body.replayed === true).length, 1);
  const state = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  const product = state.ownedProducts.find((item) => item.id === productId);
  assert.equal(product.status, "published");
  assert.equal(product.reviewStatus, "approved");
  assert.equal(product.approvedVersion, product.reviewVersion);
});
}
