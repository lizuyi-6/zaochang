// 果子账本·订单·点赞奖励:自 tests/rendered-html.test.mjs 保序拆分(测试体逐字未改)。
// 执行顺序由 tests/rendered-html.test.mjs 的注册顺序保证。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baseUrl,
  runId,
  authHeaders,
  executeLocalD1,
  creditTestFruit,
  reviewProduct,
} from "../harness/preview.mjs";

export function register() {
test("wallet balance constraint rejects a tip without changing either final balance", async () => {
  const ownerEmail = `owner-${runId}@example.com`;
  const ownerHeaders = authHeaders("作品主人", ownerEmail);
  const publish = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({
      title: `余额守门测试 ${runId}`,
      description: "用于验证站内支持不会把任何用户的余额扣成负数。",
      category: "开发工具",
      coverTheme: "ink",
      price: 0,
    }),
  });
  assert.equal(publish.status, 201);
  const productId = (await publish.json()).product.id;
  await reviewProduct(productId);
  const supporterHeaders = authHeaders("支持者", `supporter-${runId}@example.com`);

  const initial = await fetch(`${baseUrl}/api/community`, { headers: supporterHeaders });
  assert.equal(initial.status, 200);
  assert.equal((await initial.json()).wallet.balance, 0);
  await creditTestFruit(`supporter-${runId}@example.com`, 20, "tip-supporter");
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = 'supporter-${runId}@example.com'`);

  for (let index = 0; index < 4; index += 1) {
    const tip = await fetch(`${baseUrl}/api/actions`, {
      method: "POST",
      headers: supporterHeaders,
      body: JSON.stringify({ action: "tip", productId, amount: 5, idempotencyKey: `tip_ok_${runId}_${index}` }),
    });
    assert.equal(tip.status, 200);
  }

  const rejected = await fetch(`${baseUrl}/api/actions`, {
    method: "POST",
    headers: supporterHeaders,
    body: JSON.stringify({ action: "tip", productId, amount: 5, idempotencyKey: `tip_reject_${runId}` }),
  });
  assert.equal(rejected.status, 409);
  assert.deepEqual(await rejected.json(), { error: "insufficient_balance" });

  const after = await fetch(`${baseUrl}/api/community`, { headers: supporterHeaders });
  assert.equal(after.status, 200);
  const afterBody = await after.json();
  assert.equal(afterBody.wallet.balance, 0);
  assert.equal(afterBody.wallet.balance, afterBody.wallet.ledgerBalance);
  const ownerAfter = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerAfterBody = await ownerAfter.json();
  assert.equal(ownerAfterBody.wallet.balance, 20);
  assert.equal(ownerAfterBody.wallet.balance, ownerAfterBody.wallet.ledgerBalance);
});

test("one-time checkout is idempotent and refund restores both wallets and entitlement", async () => {
  const ownerHeaders = authHeaders("一次解锁作者", `one-time-owner-${runId}@example.com`);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `一次解锁作品 ${runId}`, description: "验证一次解锁、重复请求和退款都由同一份账本约束。", category: "互动体验", coverTheme: "coral", pricingModel: "one_time", price: 7 }),
  });
  assert.equal(created.status, 201);
  const productId = (await created.json()).product.id;
  await reviewProduct(productId);
  const buyerHeaders = authHeaders("一次解锁买家", `one-time-buyer-${runId}@example.com`);

  const before = await fetch(`${baseUrl}/api/payments?productId=${productId}`, { headers: buyerHeaders });
  const beforeBody = await before.json();
  assert.equal(beforeBody.access.allowed, false);
  assert.equal(beforeBody.wallet.balance, 0);
  const blockedYoungCheckout = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `checkout_young_${runId}` }) });
  assert.equal(blockedYoungCheckout.status, 403);
  assert.deepEqual(await blockedYoungCheckout.json(), { error: "account_too_new_for_transfer" });
  const ownerBeforeEligible = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(ownerBeforeEligible.wallet.pendingBalance, 0);
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = 'one-time-buyer-${runId}@example.com'`);
  await creditTestFruit(`one-time-buyer-${runId}@example.com`, 20, "one-time-buyer");

  const idempotencyKey = `checkout_one_${runId}`;
  const concurrent = await Promise.all([
    fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey }) }),
    fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey }) }),
  ]);
  assert.equal(concurrent.every((response) => response.status === 200), true);
  const concurrentBodies = await Promise.all(concurrent.map((response) => response.json()));
  assert.deepEqual(concurrentBodies.map((body) => body.charged).sort(), [false, true]);
  assert.equal(new Set(concurrentBodies.map((body) => body.order.id)).size, 1);
  assert.equal(concurrentBodies.every((body) => body.wallet.balance === 13), true);
  const checkoutBody = concurrentBodies.find((body) => body.charged === true);
  assert.equal(checkoutBody.access, true);
  assert.equal(checkoutBody.wallet.balance, 13);
  assert.equal(checkoutBody.order.status, "paid");

  const replay = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey }) });
  const replayBody = await replay.json();
  assert.equal(replayBody.replayed, true);
  assert.equal(replayBody.charged, false);
  assert.equal(replayBody.wallet.balance, 13);

  const entitled = await fetch(`${baseUrl}/api/payments?productId=${productId}`, { headers: buyerHeaders });
  assert.equal((await entitled.json()).access.reason, "entitled");
  const ownerPending = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerPendingBody = await ownerPending.json();
  assert.equal(ownerPendingBody.wallet.pendingBalance, 7);
  assert.equal(ownerPendingBody.wallet.pendingBalance, ownerPendingBody.wallet.ledgerPendingBalance);

  await executeLocalD1(`UPDATE wallets SET status = 'frozen' WHERE user_email = 'one-time-owner-${runId}@example.com'`);
  const refundKey = `refund_one_${runId}`;
  const refund = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "refund", orderId: checkoutBody.order.id, idempotencyKey: refundKey }) });
  assert.equal(refund.status, 200);
  const refundBody = await refund.json();
  assert.equal(refundBody.refunded, true);
  assert.equal(refundBody.wallet.balance, 20);

  const refundReplay = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "refund", orderId: checkoutBody.order.id, idempotencyKey: refundKey }) });
  assert.equal((await refundReplay.json()).replayed, true);
  const checkoutAfterRefund = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey }) });
  const checkoutAfterRefundBody = await checkoutAfterRefund.json();
  assert.equal(checkoutAfterRefundBody.access, false);
  assert.equal(checkoutAfterRefundBody.order.status, "refunded");
  const afterRefund = await fetch(`${baseUrl}/api/payments?productId=${productId}`, { headers: buyerHeaders });
  assert.equal((await afterRefund.json()).access.allowed, false);
  const ownerAfter = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerAfterBody = await ownerAfter.json();
  assert.equal(ownerAfterBody.wallet.status, "frozen");
  assert.equal(ownerAfterBody.wallet.pendingBalance, 0);
  assert.equal(ownerAfterBody.wallet.pendingBalance, ownerAfterBody.wallet.ledgerPendingBalance);
});

test("concurrent one-time orders and refunds preserve one charge and one reversal", async () => {
  const ownerHeaders = authHeaders("并发解锁作者", `concurrent-owner-${runId}@example.com`);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `并发解锁作品 ${runId}`, description: "用不同请求号并发购买与退款，验证数据库约束只允许一组余额变动。", category: "开发工具", coverTheme: "mint", pricingModel: "one_time", price: 6 }),
  });
  const productId = (await created.json()).product.id;
  await reviewProduct(productId);
  const buyerHeaders = authHeaders("并发解锁买家", `concurrent-buyer-${runId}@example.com`);
  await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = 'concurrent-buyer-${runId}@example.com'`);
  await creditTestFruit(`concurrent-buyer-${runId}@example.com`, 20, "concurrent-buyer");
  const checkoutKeys = [`checkout_race_a_${runId}`, `checkout_race_b_${runId}`];
  const checkoutResponses = await Promise.all(checkoutKeys.map((idempotencyKey) => fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: buyerHeaders,
    body: JSON.stringify({ action: "checkout", productId, idempotencyKey }),
  })));
  assert.equal(checkoutResponses.every((response) => response.status === 200), true);
  const checkoutBodies = await Promise.all(checkoutResponses.map((response) => response.json()));
  assert.deepEqual(checkoutBodies.map((body) => body.charged).sort(), [false, true]);
  assert.equal(checkoutBodies.filter((body) => body.reason === "already_owned").length, 1);
  const chargedIndex = checkoutBodies.findIndex((body) => body.charged === true);
  const chargedOrder = checkoutBodies[chargedIndex].order;
  const chargedKey = checkoutKeys[chargedIndex];

  const buyerAfterCharge = await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  const buyerAfterChargeBody = await buyerAfterCharge.json();
  assert.equal(buyerAfterChargeBody.wallet.balance, 14);
  assert.equal(buyerAfterChargeBody.wallet.balance, buyerAfterChargeBody.wallet.ledgerBalance);
  assert.equal(buyerAfterChargeBody.orders.length, 1);
  const ownerAfterCharge = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerAfterChargeBody = await ownerAfterCharge.json();
  assert.equal(ownerAfterChargeBody.wallet.pendingBalance, 6);
  assert.equal(ownerAfterChargeBody.wallet.pendingBalance, ownerAfterChargeBody.wallet.ledgerPendingBalance);

  const secondProduct = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `请求号冲突作品 ${runId}`, description: "同一请求号不能被挪用到另一件作品。", category: "开发工具", coverTheme: "ink", pricingModel: "per_use", price: 1 }),
  });
  const secondProductId = (await secondProduct.json()).product.id;
  await reviewProduct(secondProductId);
  const conflict = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId: secondProductId, idempotencyKey: chargedKey }) });
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: "idempotency_conflict" });

  const refundResponses = await Promise.all(["a", "b"].map((suffix) => fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: buyerHeaders,
    body: JSON.stringify({ action: "refund", orderId: chargedOrder.id, idempotencyKey: `refund_race_${suffix}_${runId}` }),
  })));
  assert.equal(refundResponses.every((response) => response.status === 200), true);
  const refundBodies = await Promise.all(refundResponses.map((response) => response.json()));
  assert.deepEqual(refundBodies.map((body) => body.replayed).sort(), [false, true]);
  assert.equal(refundBodies.every((body) => body.wallet.balance === 20), true);

  const buyerAfterRefund = await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  const buyerAfterRefundBody = await buyerAfterRefund.json();
  assert.equal(buyerAfterRefundBody.wallet.balance, 20);
  assert.equal(buyerAfterRefundBody.wallet.balance, buyerAfterRefundBody.wallet.ledgerBalance);
  const ownerAfterRefund = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerAfterRefundBody = await ownerAfterRefund.json();
  assert.equal(ownerAfterRefundBody.wallet.pendingBalance, 0);
  assert.equal(ownerAfterRefundBody.wallet.pendingBalance, ownerAfterRefundBody.wallet.ledgerPendingBalance);
});

test("per-use checkout charges each distinct entry, replays safely, and rejects refund", async () => {
  const ownerHeaders = authHeaders("按次作者", `per-use-owner-${runId}@example.com`);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `按次体验作品 ${runId}`, description: "验证每次体验分别结算，同时网络重放不会重复扣款。", category: "声音影像", coverTheme: "blue", pricingModel: "per_use", price: 4 }),
  });
  const productId = (await created.json()).product.id;
  await reviewProduct(productId);
  const buyerHeaders = authHeaders("按次买家", `per-use-buyer-${runId}@example.com`);
  await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = 'per-use-buyer-${runId}@example.com'`);
  await creditTestFruit(`per-use-buyer-${runId}@example.com`, 20, "per-use-buyer");
  const firstKey = `checkout_use_a_${runId}`;
  const first = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey: firstKey }) });
  const firstBody = await first.json();
  assert.equal(firstBody.wallet.balance, 16);
  const firstReplay = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey: firstKey }) });
  assert.equal((await firstReplay.json()).wallet.balance, 16);
  const second = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `checkout_use_b_${runId}` }) });
  const secondBody = await second.json();
  assert.equal(secondBody.wallet.balance, 12);

  const refreshed = await fetch(`${baseUrl}/api/payments?productId=${productId}`, { headers: buyerHeaders });
  assert.deepEqual((await refreshed.json()).access, { allowed: false, reason: "payment_required" });
  const refund = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "refund", orderId: firstBody.order.id, idempotencyKey: `refund_use_${runId}` }) });
  assert.equal(refund.status, 409);
  assert.deepEqual(await refund.json(), { error: "per_use_not_refundable" });

  const buyerState = await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  const buyerStateBody = await buyerState.json();
  assert.equal(buyerStateBody.wallet.balance, 12);
  assert.equal(buyerStateBody.wallet.balance, buyerStateBody.wallet.ledgerBalance);
  const ownerState = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerStateBody = await ownerState.json();
  assert.equal(ownerStateBody.wallet.pendingBalance, 8);
  assert.equal(ownerStateBody.wallet.pendingBalance, ownerStateBody.wallet.ledgerPendingBalance);
  await executeLocalD1(`UPDATE product_orders SET available_at = '2020-01-01 00:00:00' WHERE seller_email = 'per-use-owner-${runId}@example.com' AND status = 'paid'`);
  const settled = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const settledBody = await settled.json();
  assert.equal(settledBody.wallet.pendingBalance, 0);
  assert.equal(settledBody.wallet.balance, 8);
  assert.equal(settledBody.wallet.balance, settledBody.wallet.ledgerBalance);
  assert.equal(settledBody.wallet.pendingBalance, settledBody.wallet.ledgerPendingBalance);
});

test("insufficient checkout leaves buyer, seller, order, and ledger unchanged", async () => {
  const ownerHeaders = authHeaders("高价作品作者", `expensive-owner-${runId}@example.com`);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `高价边界作品 ${runId}`, description: "验证余额不足时交易整体回滚，不会给卖家产生待结算收入。", category: "开发工具", coverTheme: "ink", pricingModel: "one_time", price: 21 }),
  });
  const productId = (await created.json()).product.id;
  await reviewProduct(productId);
  const buyerHeaders = authHeaders("余额不足买家", `poor-buyer-${runId}@example.com`);
  await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = 'poor-buyer-${runId}@example.com'`);
  const rejected = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `checkout_poor_${runId}` }) });
  assert.equal(rejected.status, 409);
  assert.deepEqual(await rejected.json(), { error: "insufficient_balance" });
  const buyer = await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  const buyerBody = await buyer.json();
  assert.equal(buyerBody.wallet.balance, 0);
  assert.equal(buyerBody.orders.length, 0);
  assert.equal(buyerBody.wallet.balance, buyerBody.wallet.ledgerBalance);
  const owner = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerBody = await owner.json();
  assert.equal(ownerBody.wallet.pendingBalance, 0);
  assert.equal(ownerBody.wallet.pendingBalance, ownerBody.wallet.ledgerPendingBalance);
});

test("wallet ledger drift blocks purchase and places the wallet under review", async () => {
  const ownerHeaders = authHeaders("账本漂移作品主人", `drift-owner-${runId}@example.com`);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `账本漂移守门作品 ${runId}`, description: "物化余额与不可变账本不一致时，交易必须在扣果前被阻止。", category: "开发工具", coverTheme: "ink", pricingModel: "one_time", price: 5 }),
  });
  assert.equal(created.status, 201);
  const productId = (await created.json()).product.id;
  await reviewProduct(productId);
  const buyerEmail = `drift-buyer-${runId}@example.com`;
  const buyerHeaders = authHeaders("账本漂移买家", buyerEmail);
  await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  await creditTestFruit(buyerEmail, 20, "drift-buyer");
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = '${buyerEmail}'`);
  await executeLocalD1(`UPDATE wallets SET balance = 19 WHERE user_email = '${buyerEmail}'`);

  const rejected = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: buyerHeaders,
    body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `checkout_drift_${runId}` }),
  });
  assert.equal(rejected.status, 423);
  assert.deepEqual(await rejected.json(), { error: "wallet_ledger_mismatch" });

  const buyerState = await (await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders })).json();
  assert.equal(buyerState.wallet.status, "review");
  assert.equal(buyerState.wallet.balance, 19);
  assert.equal(buyerState.wallet.ledgerBalance, 20);
  assert.equal(buyerState.orders.length, 0);
  const ownerState = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(ownerState.wallet.pendingBalance, 0);
  assert.equal(ownerState.wallet.pendingBalance, ownerState.wallet.ledgerPendingBalance);
});

test("fruit cannot be claimed or topped up through the legacy action", async () => {
  const headers = authHeaders("无充值用户", `no-topup-${runId}@example.com`);
  const before = await fetch(`${baseUrl}/api/community`, { headers });
  assert.equal((await before.json()).wallet.balance, 0);
  const claim = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers, body: JSON.stringify({ action: "check_in" }) });
  assert.equal(claim.status, 410);
  assert.deepEqual(await claim.json(), { error: "daily_claim_removed", earningPath: "qualified_product_likes" });
  const topup = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers, body: JSON.stringify({ action: "topup", amount: 999, idempotencyKey: `topup_${runId}` }) });
  assert.equal(topup.status, 400);
  assert.deepEqual(await topup.json(), { error: "invalid_payment_action" });
  const after = await fetch(`${baseUrl}/api/community`, { headers });
  const afterBody = await after.json();
  assert.equal(afterBody.wallet.balance, 0);
  assert.equal(afterBody.wallet.balance, afterBody.wallet.ledgerBalance);
});

test("qualified likes mint once while new, self, repeated, and rapid likes are suppressed", async () => {
  const ownerEmail = `reward-owner-${runId}@example.com`;
  const ownerHeaders = authHeaders("点赞奖励作者", ownerEmail);
  const createdIds = [];
  for (let index = 0; index < 7; index += 1) {
    const created = await fetch(`${baseUrl}/api/products`, { method: "POST", headers: ownerHeaders, body: JSON.stringify({ title: `点赞奖励作品 ${index} ${runId}`, description: "用于验证唯一点赞奖励、账号年龄和快速连赞抑制规则。", category: "互动体验", coverTheme: "yellow", pricingModel: "free", price: 0 }) });
    createdIds.push((await created.json()).product.id);
  }
  for (const productId of createdIds) await reviewProduct(productId);

  const newHeaders = authHeaders("新账号点赞者", `new-liker-${runId}@example.com`);
  const newLike = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: newHeaders, body: JSON.stringify({ action: "like", productId: createdIds[0] }) });
  assert.equal((await newLike.json()).reward.reason, "account_too_new");

  const likerEmail = `mature-liker-${runId}@example.com`;
  const likerHeaders = authHeaders("成熟点赞者", likerEmail);
  await fetch(`${baseUrl}/api/community`, { headers: likerHeaders });
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = '${likerEmail}'`);

  const likeResponses = await Promise.all(createdIds.map((productId) => fetch(`${baseUrl}/api/actions`, { method: "POST", headers: likerHeaders, body: JSON.stringify({ action: "like", productId }) })));
  const likeBodies = await Promise.all(likeResponses.map((response) => response.json()));
  const rewards = likeBodies.map((body) => body.reward);
  assert.equal(rewards.filter((reward) => reward.granted === true && reward.amount === 1).length, 6);
  assert.equal(rewards.filter((reward) => reward.reason === "velocity_limit").length, 1);

  const ownerPendingBeforeUnlike = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(ownerPendingBeforeUnlike.wallet.balance, 0);
  assert.equal(ownerPendingBeforeUnlike.wallet.pendingBalance, 6);
  assert.equal(ownerPendingBeforeUnlike.wallet.pendingBalance, ownerPendingBeforeUnlike.wallet.ledgerPendingBalance);

  const grantedProductId = createdIds[rewards.findIndex((reward) => reward.granted === true)];
  assert.equal(Number.isInteger(grantedProductId), true);
  const unlikeResponses = await Promise.all([0, 1].map(() => fetch(`${baseUrl}/api/actions`, { method: "POST", headers: likerHeaders, body: JSON.stringify({ action: "like", productId: grantedProductId }) })));
  const unlikeBodies = await Promise.all(unlikeResponses.map((response) => response.json()));
  assert.equal(unlikeBodies.some((body) => body.reward?.reversed === true), true);
  const ownerAfterUnlike = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(ownerAfterUnlike.wallet.balance, 0);
  assert.equal(ownerAfterUnlike.wallet.pendingBalance, 5);
  assert.equal(ownerAfterUnlike.wallet.pendingBalance, ownerAfterUnlike.wallet.ledgerPendingBalance);

  let likerState = await (await fetch(`${baseUrl}/api/community`, { headers: likerHeaders })).json();
  let userStillLikes = likerState.productLikes.some((item) => item.productId === grantedProductId);
  let publicProduct = likerState.products.find((item) => item.id === grantedProductId);
  assert.equal(publicProduct.likes, userStillLikes ? 2 : 1);
  if (userStillLikes) {
    await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: likerHeaders, body: JSON.stringify({ action: "like", productId: grantedProductId }) });
  }
  likerState = await (await fetch(`${baseUrl}/api/community`, { headers: likerHeaders })).json();
  userStillLikes = likerState.productLikes.some((item) => item.productId === grantedProductId);
  publicProduct = likerState.products.find((item) => item.id === grantedProductId);
  assert.equal(userStillLikes, false);
  assert.equal(publicProduct.likes, 1);

  const relike = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: likerHeaders, body: JSON.stringify({ action: "like", productId: grantedProductId }) });
  assert.equal((await relike.json()).reward.reason, "already_processed");
  const selfLike = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: ownerHeaders, body: JSON.stringify({ action: "like", productId: createdIds[0] }) });
  assert.equal((await selfLike.json()).reward.reason, "self_like");

  const ownerState = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerBody = await ownerState.json();
  assert.equal(ownerBody.wallet.balance, 0);
  assert.equal(ownerBody.wallet.pendingBalance, 5);
  assert.equal(ownerBody.wallet.balance, ownerBody.wallet.ledgerBalance);
  assert.equal(ownerBody.wallet.pendingBalance, ownerBody.wallet.ledgerPendingBalance);

  await executeLocalD1(`UPDATE fruit_reward_events SET created_at = datetime('now', '-25 hours') WHERE recipient_email = '${ownerEmail}' AND status = 'granted'`);
  const settledOwner = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(settledOwner.wallet.balance, 5);
  assert.equal(settledOwner.wallet.pendingBalance, 0);
  assert.equal(settledOwner.wallet.balance, settledOwner.wallet.ledgerBalance);
  assert.equal(settledOwner.wallet.pendingBalance, settledOwner.wallet.ledgerPendingBalance);
});

test("daily like issuance caps both the actor and the receiving creator", async () => {
  const ownerEmail = `cap-owner-${runId}@example.com`;
  const ownerHeaders = authHeaders("奖励上限作者", ownerEmail);
  const productIds = [];
  for (let index = 0; index < 10; index += 1) {
    const created = await fetch(`${baseUrl}/api/products`, { method: "POST", headers: ownerHeaders, body: JSON.stringify({ title: `奖励上限作品 ${index} ${runId}`, description: "用于验证点赞发行的每日硬上限。", category: "互动体验", coverTheme: "yellow", pricingModel: "free", price: 0 }) });
    assert.equal(created.status, 201);
    productIds.push((await created.json()).product.id);
  }
  const publishRateLimited = await fetch(`${baseUrl}/api/products`, { method: "POST", headers: ownerHeaders, body: JSON.stringify({ title: `超出发布上限作品 ${runId}`, description: "同一账号在固定窗口内的第十一次发布必须被限流。", category: "互动体验", coverTheme: "yellow", pricingModel: "free", price: 0 }) });
  assert.equal(publishRateLimited.status, 429);
  assert.deepEqual(await publishRateLimited.json(), { error: "rate_limit_exceeded" });
  const auxiliaryOwnerHeaders = authHeaders("奖励上限辅助作者", `cap-aux-owner-${runId}@example.com`);
  let auxiliaryProduct;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    auxiliaryProduct = await fetch(`${baseUrl}/api/products`, { method: "POST", headers: auxiliaryOwnerHeaders, body: JSON.stringify({ title: `奖励上限辅助作品 ${runId}`, description: "提供第十一次独立点赞目标，不消耗主要作者的发布限额。", category: "互动体验", coverTheme: "mint", pricingModel: "free", price: 0 }) });
    if (auxiliaryProduct.status !== 503) break;
    await auxiliaryProduct.text();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal(auxiliaryProduct.status, 201);
  productIds.push((await auxiliaryProduct.json()).product.id);
  for (const productId of productIds) await reviewProduct(productId);

  const actorEmail = `cap-actor-${runId}@example.com`;
  const actorHeaders = authHeaders("每日上限点赞者", actorEmail);
  await fetch(`${baseUrl}/api/community`, { headers: actorHeaders });
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = '${actorEmail}'`);
  for (let index = 0; index < 10; index += 1) {
    const like = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: actorHeaders, body: JSON.stringify({ action: "like", productId: productIds[index] }) });
    assert.equal((await like.json()).reward.granted, true);
    await executeLocalD1(`UPDATE fruit_reward_events SET created_at = datetime('now', '-2 minutes') WHERE actor_email = '${actorEmail}'`);
  }
  const actorLimited = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: actorHeaders, body: JSON.stringify({ action: "like", productId: productIds[10] }) });
  assert.equal((await actorLimited.json()).reward.reason, "actor_daily_limit");

  const recipientActorEmails = Array.from({ length: 11 }, (_, index) => `recipient-cap-${index}-${runId}@example.com`);
  const recipientActorHeaders = recipientActorEmails.map((email, index) => authHeaders(`收款上限点赞者 ${index}`, email));
  await Promise.all(recipientActorHeaders.map((headers) => fetch(`${baseUrl}/api/community`, { headers })));
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email LIKE 'recipient-cap-%-${runId}@example.com'`);
  for (let index = 0; index < 10; index += 1) {
    const like = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: recipientActorHeaders[index], body: JSON.stringify({ action: "like", productId: productIds[0] }) });
    assert.equal((await like.json()).reward.granted, true);
  }
  const recipientLimited = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: recipientActorHeaders[10], body: JSON.stringify({ action: "like", productId: productIds[0] }) });
  assert.equal((await recipientLimited.json()).reward.reason, "recipient_daily_limit");

  const ownerState = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  const ownerBody = await ownerState.json();
  assert.equal(ownerBody.wallet.balance, 0);
  assert.equal(ownerBody.wallet.pendingBalance, 20);
  assert.equal(ownerBody.wallet.balance, ownerBody.wallet.ledgerBalance);
  assert.equal(ownerBody.wallet.pendingBalance, ownerBody.wallet.ledgerPendingBalance);
});

test("fruit ledger rejects mutation instead of rewriting history", async () => {
  const email = `ledger-mutation-${runId}@example.com`;
  await fetch(`${baseUrl}/api/community`, { headers: authHeaders("账本防篡改用户", email) });
  const operationId = await creditTestFruit(email, 3, "ledger-mutation");
  const output = await executeLocalD1(`UPDATE fruit_entries SET delta = 999 WHERE operation_id = '${operationId}'`, false);
  assert.match(output, /fruit_entries_immutable/);
});
}
