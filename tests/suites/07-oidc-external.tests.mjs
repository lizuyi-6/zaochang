// OIDC 提供方与外部果子 API:自 tests/rendered-html.test.mjs 保序拆分(测试体逐字未改)。
// 执行顺序由 tests/rendered-html.test.mjs 的注册顺序保证。
import { test } from "node:test";
import { createLocalJWKSet, jwtVerify } from "jose";
import assert from "node:assert/strict";
import {
  baseUrl,
  runId,
  adminEmail,
  authHeaders,
  executeLocalD1,
  creditTestFruit,
  queryLocalD1,
  reviewProduct,
} from "../harness/preview.mjs";

export function register() {
test("OIDC login and delegated fruit API require PKCE, scopes, and per-payment confirmation", async () => {
  const merchantEmail = `oidc-merchant-${runId}@example.com`;
  const merchantHeaders = authHeaders("OIDC 应用所有者", merchantEmail);
  const register = await fetch(`${baseUrl}/api/developer/clients`, {
    method: "POST",
    headers: merchantHeaders,
    body: JSON.stringify({
      name: `星桥外部平台 ${runId}`,
      description: "验证造场登录、令牌轮换和外部果子支付。",
      websiteUrl: "https://client.example/app",
      clientType: "confidential",
      redirectUris: ["https://client.example/oauth/callback", "https://client.example/payment/callback"],
      allowedScopes: "openid profile email fruit:balance fruit:pay fruit:refund",
    }),
  });
  assert.equal(register.status, 201);
  const registered = (await register.json()).client;
  assert.match(registered.clientId, /^zc_/);
  assert.match(registered.clientSecret, /^zcs_/);
  assert.equal(registered.reviewStatus, "unverified");
  assert.equal(registered.writeAccessApproved, false);

  const listed = await fetch(`${baseUrl}/api/developer/clients`, { headers: merchantHeaders });
  const listedBody = await listed.json();
  assert.equal(listedBody.clients.some((client) => client.clientId === registered.clientId), true);
  assert.equal(JSON.stringify(listedBody).includes(registered.clientSecret), false);

  const publicWrite = await fetch(`${baseUrl}/api/developer/clients`, {
    method: "POST",
    headers: merchantHeaders,
    body: JSON.stringify({ name: "不允许写权限的公开客户端", websiteUrl: "https://public.example/app", clientType: "public", redirectUris: ["https://public.example/callback"], allowedScopes: "openid fruit:pay" }),
  });
  assert.equal(publicWrite.status, 400);
  assert.deepEqual(await publicWrite.json(), { error: "public_client_write_scope_forbidden" });

  const discovery = await fetch(`${baseUrl}/.well-known/openid-configuration`);
  assert.equal(discovery.status, 200);
  const discoveryBody = await discovery.json();
  assert.equal(discoveryBody.issuer, baseUrl);
  assert.equal(discoveryBody.code_challenge_methods_supported.includes("S256"), true);
  assert.equal(discoveryBody.scopes_supported.includes("fruit:pay"), true);

  const payerEmail = `oidc-payer-${runId}@example.com`;
  const payerHeaders = authHeaders("外部平台支付用户", payerEmail);
  const verifier = `pkce_${"a".repeat(58)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = Buffer.from(digest).toString("base64url");
  const state = `state_${runId}`.replaceAll("@", "_");
  const nonce = `nonce_${runId}`.replaceAll("@", "_");
  const authorizeUrl = new URL(`${baseUrl}/oauth/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", registered.clientId);
  authorizeUrl.searchParams.set("redirect_uri", "https://client.example/oauth/callback");
  authorizeUrl.searchParams.set("scope", "openid profile email fruit:balance fruit:pay fruit:refund");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("nonce", nonce);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const blockedConsentPage = await fetch(authorizeUrl, { headers: payerHeaders });
  assert.equal(blockedConsentPage.status, 200);
  assert.match(await blockedConsentPage.text(), /果子写权限需要完成应用验证与人工审核/);
  await executeLocalD1(`UPDATE oauth_provider_clients SET review_status = 'verified', write_access_approved = 1 WHERE client_id = '${registered.clientId}'`);
  await creditTestFruit(payerEmail, 20, "oidc-payer");

  const consentPage = await fetch(authorizeUrl, { headers: payerHeaders });
  assert.equal(consentPage.status, 200);
  const consentHtml = await consentPage.text();
  assert.match(consentHtml, /每一笔果子支付仍会回到造场/);
  const requestToken = consentHtml.match(/name="request_token" value="([^"]+)"/)?.[1];
  assert.equal(typeof requestToken, "string");

  const approveAuthorization = await fetch(`${baseUrl}/api/oauth/authorize`, {
    method: "POST",
    redirect: "manual",
    headers: { ...payerHeaders, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ request_token: requestToken, decision: "allow" }),
  });
  assert.equal(approveAuthorization.status, 303);
  const authorizationRedirect = new URL(approveAuthorization.headers.get("location"));
  assert.equal(authorizationRedirect.origin, "https://client.example");
  assert.equal(authorizationRedirect.searchParams.get("state"), state);
  const authorizationCode = authorizationRedirect.searchParams.get("code");
  assert.match(authorizationCode, /^zcc_/);

  const basic = `Basic ${Buffer.from(`${registered.clientId}:${registered.clientSecret}`).toString("base64")}`;
  const tokenRequestBody = new URLSearchParams({ grant_type: "authorization_code", code: authorizationCode, redirect_uri: "https://client.example/oauth/callback", code_verifier: verifier });
  const tokenResponse = await fetch(`${baseUrl}/api/oauth/token`, { method: "POST", headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" }, body: tokenRequestBody });
  assert.equal(tokenResponse.status, 200);
  let tokens = await tokenResponse.json();
  assert.match(tokens.access_token, /^zca_/);
  assert.match(tokens.refresh_token, /^zcr_/);
  assert.equal(tokens.scope, "openid profile email fruit:balance fruit:pay fruit:refund");

  const jwks = await (await fetch(`${baseUrl}/api/oauth/jwks`)).json();
  const verifiedIdToken = await jwtVerify(tokens.id_token, createLocalJWKSet(jwks), { issuer: baseUrl, audience: registered.clientId });
  assert.equal(verifiedIdToken.payload.nonce, nonce);
  assert.equal(verifiedIdToken.payload.email, payerEmail);
  assert.match(verifiedIdToken.payload.sub, /^zcsub_/);

  const codeReplay = await fetch(`${baseUrl}/api/oauth/token`, { method: "POST", headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" }, body: tokenRequestBody });
  assert.equal(codeReplay.status, 400);
  assert.equal((await codeReplay.json()).error, "invalid_grant");
  // 审计 L3(RFC 6749 §4.1.2 SHOULD):授权码重放=码可能被窃,该码换出的令牌族
  // 必须连坐吊销——原实现只回 invalid_grant,已签发令牌继续可用。
  const stolenAccess = await fetch(`${baseUrl}/api/oauth/userinfo`, { headers: { authorization: `Bearer ${tokens.access_token}` } });
  assert.equal(stolenAccess.status, 401, "授权码重放后该码签发的 access token 必须作废");
  assert.equal((await stolenAccess.json()).error, "invalid_token");
  // 重放已烧掉本轮令牌族:再走一轮授权(consent 已在)换新令牌,供后续断言续用
  const reconsent = await fetch(authorizeUrl, { headers: payerHeaders });
  assert.equal(reconsent.status, 200);
  const reconsentToken = (await reconsent.text()).match(/name="request_token" value="([^"]+)"/)?.[1];
  assert.equal(typeof reconsentToken, "string");
  const reapprove = await fetch(`${baseUrl}/api/oauth/authorize`, {
    method: "POST",
    redirect: "manual",
    headers: { ...payerHeaders, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ request_token: reconsentToken, decision: "allow" }),
  });
  assert.equal(reapprove.status, 303);
  const reauthorizationCode = new URL(reapprove.headers.get("location")).searchParams.get("code");
  const retokenResponse = await fetch(`${baseUrl}/api/oauth/token`, {
    method: "POST",
    headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: reauthorizationCode, redirect_uri: "https://client.example/oauth/callback", code_verifier: verifier }),
  });
  assert.equal(retokenResponse.status, 200);
  tokens = await retokenResponse.json();

  const bearerHeaders = { authorization: `Bearer ${tokens.access_token}` };
  const userInfo = await fetch(`${baseUrl}/api/oauth/userinfo`, { headers: bearerHeaders });
  const userInfoBody = await userInfo.json();
  assert.equal(userInfoBody.email, payerEmail);
  assert.equal(userInfoBody.name, "外部平台支付用户");
  assert.equal(userInfoBody.sub, verifiedIdToken.payload.sub);
  const walletBefore = await fetch(`${baseUrl}/api/v1/fruit/wallet`, { headers: bearerHeaders });
  assert.equal(walletBefore.status, 200);
  assert.equal((await walletBefore.json()).wallet.balance, 20);

  const createPaymentPayload = {
    externalReference: `pro_plan_${runId}`,
    title: "专业版一次解锁",
    description: "验证创建意图时不扣果，用户确认后才发生账本变化。",
    pricingModel: "one_time",
    amount: 8,
    returnUri: "https://client.example/payment/callback",
  };
  const paymentHeaders = { ...bearerHeaders, "content-type": "application/json", "idempotency-key": `external_order_${runId}` };
  const blockedNewAccountPayment = await fetch(`${baseUrl}/api/v1/fruit/payments`, { method: "POST", headers: paymentHeaders, body: JSON.stringify(createPaymentPayload) });
  assert.equal(blockedNewAccountPayment.status, 403);
  assert.deepEqual(await blockedNewAccountPayment.json(), { error: "account_too_new_for_transfer" });
  const blockedPayerState = await (await fetch(`${baseUrl}/api/community`, { headers: payerHeaders })).json();
  const blockedMerchantState = await (await fetch(`${baseUrl}/api/community`, { headers: merchantHeaders })).json();
  assert.equal(blockedPayerState.wallet.balance, 20);
  assert.equal(blockedMerchantState.wallet.pendingBalance, 0);
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = '${payerEmail}'`);
  const createPayment = await fetch(`${baseUrl}/api/v1/fruit/payments`, { method: "POST", headers: paymentHeaders, body: JSON.stringify(createPaymentPayload) });
  assert.equal(createPayment.status, 201);
  const payment = (await createPayment.json()).payment;
  assert.equal(payment.status, "pending");
  assert.match(payment.approvalUrl, /\/oauth\/payment\/extpay_/);

  const createPaymentReplay = await fetch(`${baseUrl}/api/v1/fruit/payments`, { method: "POST", headers: paymentHeaders, body: JSON.stringify(createPaymentPayload) });
  assert.equal(createPaymentReplay.status, 200);
  assert.equal((await createPaymentReplay.json()).payment.id, payment.id);
  const payerBeforeApproval = await (await fetch(`${baseUrl}/api/community`, { headers: payerHeaders })).json();
  const merchantBeforeApproval = await (await fetch(`${baseUrl}/api/community`, { headers: merchantHeaders })).json();
  assert.equal(payerBeforeApproval.wallet.balance, 20);
  assert.equal(merchantBeforeApproval.wallet.pendingBalance, 0);

  const paymentPage = await fetch(payment.approvalUrl, { headers: payerHeaders });
  assert.equal(paymentPage.status, 200);
  const paymentHtml = await paymentPage.text();
  assert.match(paymentHtml, /创建意图时不扣果/);
  const paymentChallenge = paymentHtml.match(/name="challenge" value="([^"]+)"/)?.[1];
  assert.equal(typeof paymentChallenge, "string");
  const approvalBody = new URLSearchParams({ payment_id: payment.id, challenge: paymentChallenge, decision: "allow" });
  const approvalResponses = await Promise.all([0, 1].map(() => fetch(`${baseUrl}/api/v1/fruit/payments/approve`, {
    method: "POST",
    redirect: "manual",
    headers: { ...payerHeaders, origin: baseUrl, "content-type": "application/x-www-form-urlencoded" },
    body: approvalBody.toString(),
  })));
  assert.equal(approvalResponses.every((response) => response.status === 303), true);

  const paidQuery = await fetch(`${baseUrl}/api/v1/fruit/payments/${payment.id}`, { headers: bearerHeaders });
  assert.equal((await paidQuery.json()).payment.status, "paid");
  const payerAfterApproval = await (await fetch(`${baseUrl}/api/community`, { headers: payerHeaders })).json();
  const merchantAfterApproval = await (await fetch(`${baseUrl}/api/community`, { headers: merchantHeaders })).json();
  assert.equal(payerAfterApproval.wallet.balance, 12);
  assert.equal(payerAfterApproval.wallet.balance, payerAfterApproval.wallet.ledgerBalance);
  assert.equal(merchantAfterApproval.wallet.pendingBalance, 8);
  assert.equal(merchantAfterApproval.wallet.pendingBalance, merchantAfterApproval.wallet.ledgerPendingBalance);

  await executeLocalD1(`UPDATE wallets SET status = 'frozen' WHERE user_email = '${merchantEmail}'`);
  const refundResponses = await Promise.all([
    fetch(`${baseUrl}/api/v1/fruit/payments/${payment.id}/refund`, { method: "POST", headers: { ...bearerHeaders, "idempotency-key": `external_refund_api_${runId}` } }),
    fetch(`${baseUrl}/api/payments`, { method: "POST", headers: payerHeaders, body: JSON.stringify({ action: "external_refund", paymentId: payment.id, idempotencyKey: `external_refund_wallet_${runId}` }) }),
  ]);
  assert.equal(refundResponses.every((response) => response.status === 200), true);
  const refundBodies = await Promise.all(refundResponses.map((response) => response.json()));
  assert.deepEqual(refundBodies.map((body) => body.replayed).sort(), [false, true]);
  const payerAfterRefund = await (await fetch(`${baseUrl}/api/community`, { headers: payerHeaders })).json();
  const merchantAfterRefund = await (await fetch(`${baseUrl}/api/community`, { headers: merchantHeaders })).json();
  assert.equal(payerAfterRefund.wallet.balance, 20);
  assert.equal(payerAfterRefund.wallet.balance, payerAfterRefund.wallet.ledgerBalance);
  assert.equal(merchantAfterRefund.wallet.status, "frozen");
  assert.equal(merchantAfterRefund.wallet.pendingBalance, 0);
  assert.equal(merchantAfterRefund.wallet.pendingBalance, merchantAfterRefund.wallet.ledgerPendingBalance);
  await executeLocalD1(`UPDATE wallets SET status = 'active' WHERE user_email = '${merchantEmail}'`);

  const perUseCreate = await fetch(`${baseUrl}/api/v1/fruit/payments`, {
    method: "POST",
    headers: { ...bearerHeaders, "content-type": "application/json", "idempotency-key": `external_per_use_${runId}` },
    body: JSON.stringify({ ...createPaymentPayload, externalReference: `single_session_${runId}`, title: "单次协作会话", pricingModel: "per_use", amount: 4 }),
  });
  assert.equal(perUseCreate.status, 201);
  const perUsePayment = (await perUseCreate.json()).payment;
  const perUsePage = await fetch(perUsePayment.approvalUrl, { headers: payerHeaders });
  const perUseHtml = await perUsePage.text();
  const perUseChallenge = perUseHtml.match(/name="challenge" value="([^"]+)"/)?.[1];
  const perUseApprove = await fetch(`${baseUrl}/api/v1/fruit/payments/approve`, {
    method: "POST",
    redirect: "manual",
    headers: { ...payerHeaders, origin: baseUrl, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ payment_id: perUsePayment.id, challenge: perUseChallenge, decision: "allow" }),
  });
  assert.equal(perUseApprove.status, 303);
  const perUseRefund = await fetch(`${baseUrl}/api/v1/fruit/payments/${perUsePayment.id}/refund`, { method: "POST", headers: { ...bearerHeaders, "idempotency-key": `external_per_use_refund_${runId}` } });
  assert.equal(perUseRefund.status, 409);
  assert.deepEqual(await perUseRefund.json(), { error: "per_use_not_refundable" });
  const payerAfterPerUse = await (await fetch(`${baseUrl}/api/community`, { headers: payerHeaders })).json();
  const merchantAfterPerUse = await (await fetch(`${baseUrl}/api/community`, { headers: merchantHeaders })).json();
  assert.equal(payerAfterPerUse.wallet.balance, 16);
  assert.equal(payerAfterPerUse.wallet.balance, payerAfterPerUse.wallet.ledgerBalance);
  assert.equal(payerAfterPerUse.orders.some((order) => order.id === perUsePayment.id && order.source === "external" && order.status === "paid"), true);
  assert.equal(merchantAfterPerUse.wallet.pendingBalance, 4);
  assert.equal(merchantAfterPerUse.wallet.pendingBalance, merchantAfterPerUse.wallet.ledgerPendingBalance);

  const pendingBeforeRejection = await fetch(`${baseUrl}/api/v1/fruit/payments`, {
    method: "POST",
    headers: { ...bearerHeaders, "content-type": "application/json", "idempotency-key": `external_reject_${runId}` },
    body: JSON.stringify({ ...createPaymentPayload, externalReference: `rejected_client_${runId}`, title: "审核撤回前订单", amount: 3 }),
  });
  assert.equal(pendingBeforeRejection.status, 201);
  const rejectedPayment = (await pendingBeforeRejection.json()).payment;
  const rejectedPaymentPage = await fetch(rejectedPayment.approvalUrl, { headers: payerHeaders });
  const rejectedPaymentHtml = await rejectedPaymentPage.text();
  const rejectedPaymentChallenge = rejectedPaymentHtml.match(/name="challenge" value="([^"]+)"/)?.[1];
  assert.equal(typeof rejectedPaymentChallenge, "string");

  const rejectClient = await fetch(`${baseUrl}/api/admin/moderation`, {
    method: "PATCH",
    headers: authHeaders("发布审核管理员", adminEmail),
    body: JSON.stringify({ action: "reject_client", targetRef: registered.clientId }),
  });
  assert.equal(rejectClient.status, 200);
  assert.deepEqual(await rejectClient.json(), { updated: true });
  const rejectedClientList = await (await fetch(`${baseUrl}/api/developer/clients`, { headers: merchantHeaders })).json();
  assert.equal(rejectedClientList.clients.find((client) => client.clientId === registered.clientId).reviewStatus, "rejected");
  const rejectedBearer = await fetch(`${baseUrl}/api/v1/fruit/wallet`, { headers: bearerHeaders });
  assert.equal(rejectedBearer.status, 401);
  assert.equal((await rejectedBearer.json()).error, "invalid_token");
  const cancelledApproval = await fetch(`${baseUrl}/api/v1/fruit/payments/approve`, {
    method: "POST",
    redirect: "manual",
    headers: { ...payerHeaders, origin: baseUrl, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ payment_id: rejectedPayment.id, challenge: rejectedPaymentChallenge, decision: "allow" }),
  });
  assert.equal(cancelledApproval.status, 303);
  assert.equal(new URL(cancelledApproval.headers.get("location")).searchParams.get("payment_status"), "cancelled");
  const payerAfterRejection = await (await fetch(`${baseUrl}/api/community`, { headers: payerHeaders })).json();
  const merchantAfterRejection = await (await fetch(`${baseUrl}/api/community`, { headers: merchantHeaders })).json();
  assert.equal(payerAfterRejection.wallet.balance, 16);
  assert.equal(merchantAfterRejection.wallet.pendingBalance, 4);

  await executeLocalD1(`
    UPDATE oauth_provider_clients SET review_status = 'verified', write_access_approved = 1 WHERE client_id = '${registered.clientId}';
    UPDATE oauth_provider_access_tokens SET revoked_at = NULL WHERE client_id = '${registered.clientId}';
    UPDATE oauth_provider_refresh_tokens SET revoked_at = NULL WHERE client_id = '${registered.clientId}';
    UPDATE oauth_provider_consents SET revoked_at = NULL WHERE client_id = '${registered.clientId}' AND user_email = '${payerEmail}'
  `);

  const pendingBeforeConsentRevocation = await fetch(`${baseUrl}/api/v1/fruit/payments`, {
    method: "POST",
    headers: { ...bearerHeaders, "content-type": "application/json", "idempotency-key": `external_consent_revoke_${runId}` },
    body: JSON.stringify({ ...createPaymentPayload, externalReference: `revoked_consent_${runId}`, title: "用户撤权前订单", amount: 2 }),
  });
  assert.equal(pendingBeforeConsentRevocation.status, 201);
  const consentRevokedPayment = (await pendingBeforeConsentRevocation.json()).payment;
  assert.equal(consentRevokedPayment.status, "pending");
  const consentRevokedPaymentPage = await fetch(consentRevokedPayment.approvalUrl, { headers: payerHeaders });
  const consentRevokedPaymentHtml = await consentRevokedPaymentPage.text();
  const consentRevokedPaymentChallenge = consentRevokedPaymentHtml.match(/name="challenge" value="([^"]+)"/)?.[1];
  assert.equal(typeof consentRevokedPaymentChallenge, "string");

  const refreshBody = new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, scope: "openid" });
  const refresh = await fetch(`${baseUrl}/api/oauth/token`, { method: "POST", headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" }, body: refreshBody });
  assert.equal(refresh.status, 200);
  const refreshedTokens = await refresh.json();
  assert.match(refreshedTokens.access_token, /^zca_/);
  assert.equal(refreshedTokens.scope, "openid");
  const narrowedWallet = await fetch(`${baseUrl}/api/v1/fruit/wallet`, { headers: { authorization: `Bearer ${refreshedTokens.access_token}` } });
  assert.equal(narrowedWallet.status, 403);
  assert.equal((await narrowedWallet.json()).error, "insufficient_scope");
  const refreshReplay = await fetch(`${baseUrl}/api/oauth/token`, { method: "POST", headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" }, body: refreshBody });
  assert.equal(refreshReplay.status, 400);
  assert.equal((await refreshReplay.json()).error, "invalid_grant");
  const replacementRefresh = await fetch(`${baseUrl}/api/oauth/token`, {
    method: "POST",
    headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshedTokens.refresh_token, scope: "openid" }),
  });
  assert.equal(replacementRefresh.status, 400);
  assert.equal((await replacementRefresh.json()).error, "invalid_grant");
  const replayRevokedDescendant = await fetch(`${baseUrl}/api/oauth/userinfo`, { headers: { authorization: `Bearer ${refreshedTokens.access_token}` } });
  assert.equal(replayRevokedDescendant.status, 401);
  assert.equal((await replayRevokedDescendant.json()).error, "invalid_token");
  // 审计 L2:refresh 重放的谱系吊销必须覆盖授权码直出的首枚 access(family_id 直查;
  // 原实现按 refresh_parent_hash 反查,首枚 parent 为 NULL 漏网)。
  const firstAccessAfterRefreshReplay = await fetch(`${baseUrl}/api/oauth/userinfo`, { headers: { authorization: `Bearer ${tokens.access_token}` } });
  assert.equal(firstAccessAfterRefreshReplay.status, 401, "refresh 重放连坐必须吊销同族授权码直出的 access");
  assert.equal((await firstAccessAfterRefreshReplay.json()).error, "invalid_token");

  const consents = await fetch(`${baseUrl}/api/oauth/consents`, { headers: payerHeaders });
  assert.equal((await consents.json()).consents.some((consent) => consent.clientId === registered.clientId), true);
  const revokeConsent = await fetch(`${baseUrl}/api/oauth/consents`, { method: "DELETE", headers: payerHeaders, body: JSON.stringify({ clientId: registered.clientId }) });
  assert.equal(revokeConsent.status, 200);
  const revokedToken = await fetch(`${baseUrl}/api/oauth/userinfo`, { headers: { authorization: `Bearer ${tokens.access_token}` } });
  assert.equal(revokedToken.status, 401);
  assert.equal((await revokedToken.json()).error, "invalid_token");
  const consentRevokedApproval = await fetch(`${baseUrl}/api/v1/fruit/payments/approve`, {
    method: "POST",
    redirect: "manual",
    headers: { ...payerHeaders, origin: baseUrl, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ payment_id: consentRevokedPayment.id, challenge: consentRevokedPaymentChallenge, decision: "allow" }),
  });
  assert.equal(consentRevokedApproval.status, 303);
  assert.equal(new URL(consentRevokedApproval.headers.get("location")).searchParams.get("payment_status"), "cancelled");
  const payerAfterConsentRevocation = await (await fetch(`${baseUrl}/api/community`, { headers: payerHeaders })).json();
  const merchantAfterConsentRevocation = await (await fetch(`${baseUrl}/api/community`, { headers: merchantHeaders })).json();
  assert.equal(payerAfterConsentRevocation.wallet.balance, 16);
  assert.equal(payerAfterConsentRevocation.wallet.balance, payerAfterConsentRevocation.wallet.ledgerBalance);
  assert.equal(merchantAfterConsentRevocation.wallet.pendingBalance, 4);
  assert.equal(merchantAfterConsentRevocation.wallet.pendingBalance, merchantAfterConsentRevocation.wallet.ledgerPendingBalance);
});

test("reports require an administrator decision and hidden products leave public queries", async () => {
  const ownerEmail = `moderation-owner-${runId}@example.com`;
  const ownerHeaders = authHeaders("被举报作品作者", ownerEmail);
  const created = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: ownerHeaders,
    body: JSON.stringify({ title: `审核隐藏作品 ${runId}`, description: "用于验证举报、人工处置和公开查询过滤是一条可复核的链路。", category: "互动体验", coverTheme: "coral", pricingModel: "one_time", price: 5 }),
  });
  assert.equal(created.status, 201);
  const productId = (await created.json()).product.id;
  await reviewProduct(productId);
  const buyerEmail = `moderation-buyer-${runId}@example.com`;
  const buyerHeaders = authHeaders("被隐藏作品买家", buyerEmail);
  await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders });
  await creditTestFruit(buyerEmail, 10, "moderation-buyer");
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = '${buyerEmail}'`);
  const checkout = await fetch(`${baseUrl}/api/payments`, { method: "POST", headers: buyerHeaders, body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `moderation_checkout_${runId}` }) });
  assert.equal(checkout.status, 200);
  const checkoutBody = await checkout.json();
  assert.equal(checkoutBody.charged, true);
  assert.equal(checkoutBody.order.status, "paid");
  const ownerBeforeHide = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(ownerBeforeHide.wallet.pendingBalance, 5);
  const settledBuyerEmail = `moderation-settled-buyer-${runId}@example.com`;
  const settledBuyerHeaders = authHeaders("已结算作品买家", settledBuyerEmail);
  await fetch(`${baseUrl}/api/community`, { headers: settledBuyerHeaders });
  await creditTestFruit(settledBuyerEmail, 10, "moderation-settled-buyer");
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = '${settledBuyerEmail}'`);
  const settledCheckout = await fetch(`${baseUrl}/api/payments`, {
    method: "POST",
    headers: settledBuyerHeaders,
    body: JSON.stringify({ action: "checkout", productId, idempotencyKey: `moderation_settled_checkout_${runId}` }),
  });
  assert.equal(settledCheckout.status, 200);
  const settledCheckoutBody = await settledCheckout.json();
  assert.equal(settledCheckoutBody.order.status, "paid");
  await executeLocalD1(`UPDATE product_orders SET available_at = datetime('now', '-1 hour') WHERE id = '${settledCheckoutBody.order.id}'`);
  const ownerAfterSettlement = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(ownerAfterSettlement.wallet.balance, 5);
  assert.equal(ownerAfterSettlement.wallet.pendingBalance, 5);
  const forgedRemediation = await executeLocalD1(`
    INSERT INTO fruit_operations
      (id, kind, idempotency_key, actor_email, target_email, amount,
       reference_type, reference_id, related_operation_id, description)
    SELECT 'forged-moderation-${runId}', 'moderation_refund', 'forged-moderation-${runId}',
           seller_email, buyer_email, amount, 'order', id, purchase_operation_id, '绕过下架处置'
    FROM product_orders WHERE id = '${checkoutBody.order.id}'
  `, false);
  assert.match(forgedRemediation, /moderation_remediation_not_allowed/);
  const reporterHeaders = authHeaders("内容举报用户", `moderation-reporter-${runId}@example.com`);
  const report = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: reporterHeaders,
    body: JSON.stringify({ targetType: "product", targetRef: String(productId), reason: "fraud", details: "测试举报：请人工核查作品说明。" }),
  });
  assert.equal(report.status, 201);
  assert.deepEqual(await report.json(), { reported: true });

  const deniedQueue = await fetch(`${baseUrl}/api/admin/moderation`, { headers: reporterHeaders });
  assert.equal(deniedQueue.status, 403);
  assert.deepEqual(await deniedQueue.json(), { error: "admin_forbidden" });

  const adminHeaders = authHeaders("发布审核管理员", adminEmail);
  const queue = await fetch(`${baseUrl}/api/admin/moderation`, { headers: adminHeaders });
  assert.equal(queue.status, 200);
  const queueBody = await queue.json();
  const queuedReport = queueBody.reports.find((item) => item.targetType === "product" && item.targetRef === String(productId));
  assert.equal(typeof queuedReport?.id, "string");
  const hide = await fetch(`${baseUrl}/api/admin/moderation`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ action: "hide_reported_content", targetRef: queuedReport.id }),
  });
  assert.equal(hide.status, 200);
  assert.deepEqual(await hide.json(), {
    updated: true,
    remediation: { refundedPending: 1, compensatedSettled: 1, revokedEntitlements: 2 },
  });

  const publicState = await (await fetch(`${baseUrl}/api/community`, { headers: reporterHeaders })).json();
  assert.equal(publicState.products.some((product) => product.id === productId), false);
  const productPage = await fetch(`${baseUrl}/product/${productId}`, { headers: { accept: "text/html" } });
  assert.equal(productPage.status, 404);
  const ownerAfterHide = await (await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders })).json();
  assert.equal(ownerAfterHide.wallet.status, "review");
  assert.equal(ownerAfterHide.wallet.balance, 5);
  assert.equal(ownerAfterHide.wallet.pendingBalance, 0);
  assert.equal(ownerAfterHide.wallet.balance, ownerAfterHide.wallet.ledgerBalance);
  assert.equal(ownerAfterHide.wallet.pendingBalance, ownerAfterHide.wallet.ledgerPendingBalance);
  const pendingBuyerAfterHide = await (await fetch(`${baseUrl}/api/community`, { headers: buyerHeaders })).json();
  const settledBuyerAfterHide = await (await fetch(`${baseUrl}/api/community`, { headers: settledBuyerHeaders })).json();
  assert.equal(pendingBuyerAfterHide.wallet.balance, 10);
  assert.equal(settledBuyerAfterHide.wallet.balance, 10);
  assert.equal(pendingBuyerAfterHide.wallet.balance, pendingBuyerAfterHide.wallet.ledgerBalance);
  assert.equal(settledBuyerAfterHide.wallet.balance, settledBuyerAfterHide.wallet.ledgerBalance);
  assert.equal(pendingBuyerAfterHide.orders.some((order) => order.id === checkoutBody.order.id && order.status === "refunded"), true);
  assert.equal(settledBuyerAfterHide.orders.some((order) => order.id === settledCheckoutBody.order.id && order.status === "refunded"), true);
  await executeLocalD1(`
    CREATE TABLE moderation_remediation_assertion (id integer);
    CREATE TRIGGER moderation_remediation_assertion_guard BEFORE INSERT ON moderation_remediation_assertion
    WHEN (SELECT COUNT(*) FROM fruit_operations WHERE kind = 'moderation_refund' AND reference_id = '${checkoutBody.order.id}') <> 1
      OR (SELECT COUNT(*) FROM fruit_operations WHERE kind = 'moderation_compensation' AND reference_id = '${settledCheckoutBody.order.id}') <> 1
      OR EXISTS (SELECT 1 FROM product_entitlements WHERE product_id = ${productId} AND status = 'active')
      OR NOT EXISTS (SELECT 1 FROM products WHERE id = ${productId} AND moderation_status = 'hidden')
    BEGIN SELECT RAISE(ABORT, 'moderation_remediation_incomplete'); END;
    INSERT INTO moderation_remediation_assertion (id) VALUES (1);
    DROP TRIGGER moderation_remediation_assertion_guard;
    DROP TABLE moderation_remediation_assertion
  `);
  const reviewQueue = await (await fetch(`${baseUrl}/api/admin/moderation`, { headers: adminHeaders })).json();
  assert.equal(reviewQueue.risks.some((risk) => risk.userEmail === ownerEmail && risk.kind === "moderated_paid_product" && risk.status === "open"), true);
});

test("external payment approval challenge: stale challenge rejected, mid-window hash swap cannot strand funds", async () => {
  // 审计 F1 的两条保障:①挑战码被第二标签页换发后,旧码提交必须 403 且不动账;
  // ②"校验通过后、批次提交前"hash 被覆盖的窄窗口里,批次不得因此把钱扣了却把
  // 单子留在 pending(原缺陷:UPDATE 带 challenge 条件命中 0 行,D1 不回滚同批扣款)。
  const merchantEmail = `f1-merchant-${runId}@example.com`;
  const merchantHeaders = authHeaders("F1 商户", merchantEmail);
  await fetch(`${baseUrl}/api/community`, { headers: merchantHeaders });
  const register = await fetch(`${baseUrl}/api/developer/clients`, {
    method: "POST",
    headers: merchantHeaders,
    body: JSON.stringify({
      name: `F1 外部平台 ${runId}`,
      description: "验证支付确认挑战码的竞态语义。",
      websiteUrl: "https://f1.example/app",
      clientType: "confidential",
      redirectUris: ["https://f1.example/callback"],
      allowedScopes: "openid profile email fruit:balance fruit:pay fruit:refund",
    }),
  });
  assert.equal(register.status, 201);
  const client = (await register.json()).client;
  await executeLocalD1(`UPDATE oauth_provider_clients SET review_status = 'verified', write_access_approved = 1 WHERE client_id = '${client.clientId}'`);

  const payerEmail = `f1-payer-${runId}@example.com`;
  const payerHeaders = authHeaders("F1 买家", payerEmail);
  await fetch(`${baseUrl}/api/community`, { headers: payerHeaders });
  await creditTestFruit(payerEmail, 20, "f1-payer");
  // fruit_external_payment_guard 要求付款人账龄 ≥24h
  await executeLocalD1(`UPDATE members SET joined_at = '2020-01-01 00:00:00' WHERE email = '${payerEmail}'`);

  const seedPayment = async (suffix) => {
    const id = `extpay_f1${suffix}${runId.replaceAll("-", "")}`;
    await executeLocalD1(`
      INSERT INTO external_fruit_payments
        (id, client_id, payer_email, merchant_email, external_reference, title, description,
         pricing_model, amount, idempotency_key, return_uri, expires_at)
      VALUES ('${id}', '${client.clientId}', '${payerEmail}', '${merchantEmail}', 'f1_ref_${suffix}',
              'F1 竞态订单', '审计 F1 验证', 'one_time', 5, 'f1_key_${suffix}_${runId}',
              'https://f1.example/callback', datetime('now', '+10 minutes'))
    `);
    return id;
  };
  const approvalChallenge = async (paymentId) => {
    const page = await fetch(`${baseUrl}/oauth/payment/${paymentId}`, { headers: payerHeaders });
    assert.equal(page.status, 200);
    const challenge = (await page.text()).match(/name="challenge" value="([^"]+)"/)?.[1];
    assert.equal(typeof challenge, "string");
    return challenge;
  };
  const submitApproval = (paymentId, challenge) => fetch(`${baseUrl}/api/v1/fruit/payments/approve`, {
    method: "POST",
    redirect: "manual",
    headers: { ...payerHeaders, origin: baseUrl, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ payment_id: paymentId, challenge, decision: "allow" }).toString(),
  });

  // ── 场景 1:旧挑战码必须被拒,当前挑战码照常可付 ─────────────────────────────
  const stalePaymentId = await seedPayment("stale");
  const challenge1 = await approvalChallenge(stalePaymentId);
  const challenge2 = await approvalChallenge(stalePaymentId);
  assert.notEqual(challenge1, challenge2, "重开确认页必须换发挑战码(覆盖 hash)");

  const staleSubmit = await submitApproval(stalePaymentId, challenge1);
  assert.equal(staleSubmit.status, 403);
  assert.deepEqual(await staleSubmit.json(), { error: "invalid_approval_challenge" });
  const heldWallet = (await (await fetch(`${baseUrl}/api/community`, { headers: payerHeaders })).json()).wallet;
  assert.equal(heldWallet.balance, 20, "旧挑战码被拒不扣款");
  assert.equal(heldWallet.balance, heldWallet.ledgerBalance);
  assert.equal((await queryLocalD1(`SELECT status FROM external_fruit_payments WHERE id = '${stalePaymentId}'`))[0]?.status, "pending");

  const freshSubmit = await submitApproval(stalePaymentId, challenge2);
  assert.equal(freshSubmit.status, 303, "换发后的当前挑战码必须照常支付");
  assert.equal(new URL(freshSubmit.headers.get("location")).searchParams.get("payment_status"), "paid");

  // ── 场景 2:校验后、批次前 hash 被覆盖(窄窗口)────────────────────────────
  // 纯 HTTP 无法卡进"校验与批次之间"的窗口,按 decideExternalPayment 批次的原始语句
  // 直接执行:先覆盖 hash(模拟第二标签页),再原样跑批次序列。批次 UPDATE 已不带
  // challenge 条件——若回归带条件,单子会停在 pending 而扣款已提交(账实断裂,断言即红)。
  const racePaymentId = await seedPayment("race");
  // 打开确认页取当前挑战码(approvalChallenge 内部断言存在):此刻它是有效值,
  // 即"校验已通过"的等价物;随后的 UPDATE 才是模拟窄窗口内的第二标签页覆盖。
  await approvalChallenge(racePaymentId);
  const operationId = `external-purchase:${racePaymentId}`;
  await executeLocalD1(`
    UPDATE external_fruit_payments SET approval_challenge_hash = 'swapped-by-tab-two'
     WHERE id = '${racePaymentId}' AND payer_email = '${payerEmail}' AND status = 'pending';
    INSERT INTO fruit_operations
      (id, kind, idempotency_key, actor_email, target_email, amount, reference_type, reference_id, description)
    VALUES ('${operationId}', 'external_purchase', '${operationId}', '${payerEmail}', '${merchantEmail}', 5,
            'external_payment', '${racePaymentId}', '外部应用支付《F1 竞态订单》');
    UPDATE wallets SET balance = CASE WHEN status = 'active' THEN balance - 5 ELSE -1 END,
      lifetime_spent = lifetime_spent + 5, updated_at = CURRENT_TIMESTAMP WHERE user_email = '${payerEmail}';
    UPDATE wallets SET pending_balance = CASE WHEN status = 'active' THEN pending_balance + 5 ELSE -1 END,
      updated_at = CURRENT_TIMESTAMP WHERE user_email = '${merchantEmail}';
    INSERT INTO fruit_entries (operation_id, user_email, bucket, delta) VALUES ('${operationId}', '${payerEmail}', 'available', -5);
    INSERT INTO fruit_entries (operation_id, user_email, bucket, delta) VALUES ('${operationId}', '${merchantEmail}', 'pending', 5);
    UPDATE external_fruit_payments SET status = 'paid', purchase_operation_id = '${operationId}',
      paid_at = CURRENT_TIMESTAMP, refundable_until = datetime('now', '+10 minutes'),
      available_at = datetime('now', '+24 hours'), approval_challenge_hash = NULL
     WHERE id = '${racePaymentId}' AND status = 'pending';
    INSERT INTO transactions (user_email, delta, type, description, reference_id)
      VALUES ('${payerEmail}', -5, 'external_purchase', '通过 ${client.name} 支付《F1 竞态订单》', '${racePaymentId}');
    INSERT INTO transactions (user_email, delta, type, description, reference_id)
      VALUES ('${merchantEmail}', 0, 'external_sale_pending', '${client.name} 收入待结算 +5', '${racePaymentId}');
    INSERT INTO external_fruit_entitlements
      (client_id, payer_email, external_reference, payment_id, status, revoked_at)
    VALUES ('${client.clientId}', '${payerEmail}', 'f1_ref_race', '${racePaymentId}', 'active', NULL)
  `);

  const racedRow = await queryLocalD1(`
    SELECT status, purchase_operation_id AS purchaseOperationId
    FROM external_fruit_payments WHERE id = '${racePaymentId}'
  `);
  assert.equal(racedRow[0]?.status, "paid", "hash 被换掉的窗口里批次仍必须把单子落到 paid");
  assert.equal(racedRow[0]?.purchaseOperationId, operationId, "支付操作必须绑定到单子(可退可结算)");
  const finalPayer = (await (await fetch(`${baseUrl}/api/community`, { headers: payerHeaders })).json()).wallet;
  const finalMerchant = (await (await fetch(`${baseUrl}/api/community`, { headers: merchantHeaders })).json()).wallet;
  assert.equal(finalPayer.balance, 10, "场景 1 与场景 2 各扣 5");
  assert.equal(finalPayer.balance, finalPayer.ledgerBalance, "买家钱包与账本一致(钱没有凭空消失)");
  assert.equal(finalMerchant.pendingBalance, 10);
  assert.equal(finalMerchant.pendingBalance, finalMerchant.ledgerPendingBalance, "商户待结算与账本一致");
});

test("oauth token revocation cascades by family and PKCE accepts full unreserved charset (L4/L6)", async () => {
  const merchantEmail = `l4-merchant-${runId}@example.com`;
  const merchantHeaders = authHeaders("L4 商户", merchantEmail);
  await fetch(`${baseUrl}/api/community`, { headers: merchantHeaders });
  const register = await fetch(`${baseUrl}/api/developer/clients`, {
    method: "POST",
    headers: merchantHeaders,
    body: JSON.stringify({
      name: `L4 外部平台 ${runId}`,
      description: "验证令牌族连坐吊销与 PKCE 字符集。",
      websiteUrl: "https://l4.example/app",
      clientType: "confidential",
      redirectUris: ["https://l4.example/callback"],
      allowedScopes: "openid profile email fruit:balance",
    }),
  });
  assert.equal(register.status, 201);
  const client = (await register.json()).client;
  await executeLocalD1(`UPDATE oauth_provider_clients SET review_status = 'verified', write_access_approved = 1 WHERE client_id = '${client.clientId}'`);
  const basic = `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString("base64")}`;

  const payerEmail = `l4-payer-${runId}@example.com`;
  const payerHeaders = authHeaders("L4 用户", payerEmail);
  await fetch(`${baseUrl}/api/community`, { headers: payerHeaders });
  // L6:verifier 含 RFC 7636 unreserved 字符 `.` 与 `~`,原正则会误拒合法客户端
  const verifier = `${"a.b~c-".repeat(11)}x`;
  assert.ok(verifier.length >= 43 && /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = Buffer.from(digest).toString("base64url");
  const authorizeUrl = new URL(`${baseUrl}/oauth/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", client.clientId);
  authorizeUrl.searchParams.set("redirect_uri", "https://l4.example/callback");
  authorizeUrl.searchParams.set("scope", "openid profile email fruit:balance");
  authorizeUrl.searchParams.set("state", `l4_${runId}`.replaceAll("@", "_"));
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const consentPage = await fetch(authorizeUrl, { headers: payerHeaders });
  assert.equal(consentPage.status, 200, "含 . 与 ~ 的 PKCE verifier 必须被接受(L6)");
  const requestToken = (await consentPage.text()).match(/name="request_token" value="([^"]+)"/)?.[1];
  assert.equal(typeof requestToken, "string");
  const approve = await fetch(`${baseUrl}/api/oauth/authorize`, {
    method: "POST",
    redirect: "manual",
    headers: { ...payerHeaders, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ request_token: requestToken, decision: "allow" }),
  });
  assert.equal(approve.status, 303);
  const code = new URL(approve.headers.get("location")).searchParams.get("code");
  const tokenResponse = await fetch(`${baseUrl}/api/oauth/token`, {
    method: "POST",
    headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: "https://l4.example/callback", code_verifier: verifier }),
  });
  assert.equal(tokenResponse.status, 200);
  const tokens = await tokenResponse.json();

  const accessOk = await fetch(`${baseUrl}/api/oauth/userinfo`, { headers: { authorization: `Bearer ${tokens.access_token}` } });
  assert.equal(accessOk.status, 200, "兑换后的 access 应可用");

  // L4(RFC 7009):撤销 refresh token 必须连带吊销同族 access——原实现只按精确
  // hash 命中,refresh 被撤后族内 access 仍可用到自然过期。
  const revoke = await fetch(`${baseUrl}/api/oauth/revoke`, {
    method: "POST",
    headers: { authorization: basic, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: tokens.refresh_token }),
  });
  assert.equal(revoke.status, 200);
  const accessAfterRevoke = await fetch(`${baseUrl}/api/oauth/userinfo`, { headers: { authorization: `Bearer ${tokens.access_token}` } });
  assert.equal(accessAfterRevoke.status, 401, "撤销 refresh 后同族 access 必须一并作废");
  assert.equal((await accessAfterRevoke.json()).error, "invalid_token");
});
}
