import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { buildZip, entry } from "../helpers/zip-builder.mjs";
import {
  adminEmail,
  baseUrl,
  executeLocalD1,
  hostingDeployerToken,
  queryLocalD1,
  runId,
} from "../harness/preview.mjs";

const cookies = new Map();
let adminCookiePromise;
const quoteSql = (value) => `'${String(value).replaceAll("'", "''")}'`;
const cleanZip = () => buildZip([entry("index.html", { data: "<html><body>hosting test</body></html>" })]);
const cookieHeaders = (cookie, extra = {}) => ({ cookie, origin: baseUrl, ...extra });

function sessionCookie(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];
  return values.find((value) => value.startsWith("zaochang_session="))?.split(";")[0] ?? null;
}

async function login(email) {
  if (cookies.has(email)) return cookies.get(email);
  const response = await fetch(`${baseUrl}/api/auth/dev-login?email=${encodeURIComponent(email)}`, {
    headers: { origin: baseUrl },
    redirect: "manual",
  });
  assert.equal(response.status, 307, "integration login must create a session cookie");
  const cookie = sessionCookie(response);
  assert.ok(cookie, "dev-login response must include zaochang_session");
  cookies.set(email, cookie);
  return cookie;
}

async function adminCookie() {
  adminCookiePromise ??= login(adminEmail);
  return adminCookiePromise;
}

async function createMember(email = `hosting-${runId}-${crypto.randomUUID()}@example.com`) {
  return { email, cookie: await login(email) };
}

async function createProduct(cookie, title = `托管作品 ${runId}`, overrides = {}) {
  const response = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: cookieHeaders(cookie, { "content-type": "application/json" }),
    body: JSON.stringify({
      title,
      description: "这是用于静态托管集成测试的产品说明，足够描述作品用途。",
      category: "开发工具",
      pricingModel: "free",
      ...overrides,
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  assert.equal(Number.isSafeInteger(Number(body.product.id)), true);
  return Number(body.product.id);
}

async function grantMember(email, maxSites = 3, note = "hosting integration grant") {
  const response = await fetch(`${baseUrl}/api/admin/hosting-grants`, {
    method: "POST",
    headers: cookieHeaders(await adminCookie(), { "content-type": "application/json" }),
    body: JSON.stringify({ email, maxSites, note }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.grant.memberEmail, email);
  assert.equal(body.grant.maxSites, maxSites);
  return body.grant;
}

async function submitBundle(cookie, productId, bytes = cleanZip()) {
  const form = new FormData();
  form.set("productId", String(productId));
  form.set("file", new File([bytes], "site.zip", { type: "application/zip" }));
  return fetch(`${baseUrl}/api/hosting/bundles`, {
    method: "POST",
    headers: { cookie, origin: baseUrl },
    body: form,
  });
}

async function moderate(action, productId, note = "审核托管作品的审核意见。") {
  return fetch(`${baseUrl}/api/admin/moderation`, {
    method: "PATCH",
    headers: cookieHeaders(await adminCookie(), { "content-type": "application/json" }),
    body: JSON.stringify({ action, targetRef: String(productId), note }),
  });
}

async function workerClaim(token = hostingDeployerToken) {
  return fetch(`${baseUrl}/api/hosting-worker/claim`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ worker: "hosting-test-worker" }),
  });
}

async function workerReport(id, lease, body, token = hostingDeployerToken) {
  return fetch(`${baseUrl}/api/hosting-worker/jobs/${id}/report`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-hosting-lease": lease,
    },
    body: JSON.stringify(body),
  });
}

async function reportStaged(job) {
  const response = await workerReport(job.id, job.lease, {
    outcome: "staged",
    siteId: `site-${job.id}`,
    versionId: `version-${job.id}`,
    previewUrl: `https://p-${"a".repeat(32)}.preview.stepcloud.com`,
    previewExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 - 60_000).toISOString(),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.ok, true);
}

async function productDb(productId) {
  const rows = await queryLocalD1(
    `SELECT id, status, review_status, review_version, approved_version, hosting_revision
     FROM products WHERE id = ${Number(productId)}`,
  );
  assert.equal(rows.length, 1);
  return rows[0];
}

async function hostingDb(hostingId) {
  const rows = await queryLocalD1(
    `SELECT id, product_id, state, desired, attempts, site_id, version_id,
            failure_code, failure_detail, live_url, approved_version, hosting_revision,
            lease_token_hash, lease_expires_at
     FROM product_hostings WHERE id = ${Number(hostingId)}`,
  );
  assert.equal(rows.length, 1);
  return rows[0];
}

async function uploadCounts(email) {
  const rows = await queryLocalD1(
    `SELECT COUNT(*) AS count FROM uploaded_files
     WHERE owner_email = ${quoteSql(email)} AND purpose = 'hosting_bundle'`,
  );
  return Number(rows[0].count);
}

async function hostingCount(productId) {
  const rows = await queryLocalD1(`SELECT COUNT(*) AS count FROM product_hostings WHERE product_id = ${Number(productId)}`);
  return Number(rows[0].count);
}

async function hostingStatus(cookie, productId) {
  const response = await fetch(`${baseUrl}/api/hosting/products/${productId}`, { headers: { cookie } });
  return { response, body: await response.json() };
}

async function createPersonalKey(cookie) {
  const response = await fetch(`${baseUrl}/api/api-keys`, {
    method: "POST",
    headers: cookieHeaders(cookie, { "content-type": "application/json" }),
    body: JSON.stringify({ name: "hosting test key", expires_in_days: 30 }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return body.token;
}

async function mcpTool(token, name, args) {
  return fetch(`${baseUrl}/api/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      origin: baseUrl,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 71,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
}

async function mcpUpdate(token, productId, title) {
  return mcpTool(token, "update_product", { id: productId, title });
}

export function register() {
  test("hosting grants enforce admission, revocation, quota, and demo URL exclusion", async () => {
    const owner = await createMember(`hosting-grant-${runId}@example.com`);
    const firstProduct = await createProduct(owner.cookie, `grant-${runId}`);
    const missingBefore = await productDb(firstProduct);
    const missing = await submitBundle(owner.cookie, firstProduct);
    const missingBody = await missing.json();
    assert.equal(missing.status, 403);
    assert.equal(missingBody.error, "hosting_not_granted");
    assert.equal(await hostingCount(firstProduct), 0);
    assert.equal(await uploadCounts(owner.email), 0);
    const missingAfter = await productDb(firstProduct);
    assert.equal(missingAfter.review_version, missingBefore.review_version);
    assert.equal(missingAfter.hosting_revision, 0);

    await grantMember(owner.email, 1);
    const grantStatus = await fetch(`${baseUrl}/api/hosting/grant`, { headers: { cookie: owner.cookie } });
    const grantStatusBody = await grantStatus.json();
    assert.equal(grantStatus.status, 200);
    assert.equal(grantStatusBody.granted, true);
    assert.equal(grantStatusBody.maxSites, 1);
    assert.equal(grantStatusBody.usedSites, 0);
    const accepted = await submitBundle(owner.cookie, firstProduct);
    const acceptedBody = await accepted.json();
    assert.equal(accepted.status, 201);
    assert.equal(acceptedBody.hosting.state, "queued");
    assert.equal(acceptedBody.hosting.desired, "staged");
    const grantStatusAfterUpload = await (await fetch(`${baseUrl}/api/hosting/grant`, { headers: { cookie: owner.cookie } })).json();
    assert.equal(grantStatusAfterUpload.usedSites, 1);
    const adminGrantsResponse = await fetch(`${baseUrl}/api/admin/hosting-grants`, { headers: { cookie: await adminCookie() } });
    const adminGrantsBody = await adminGrantsResponse.json();
    assert.equal(adminGrantsResponse.status, 200);
    const listedGrant = adminGrantsBody.grants.find((item) => item.memberEmail === owner.email);
    assert.equal(listedGrant.maxSites, 1);
    assert.equal(listedGrant.usedSites, 1);

    const secondProduct = await createProduct(owner.cookie, `quota-${runId}`);
    const quotaBefore = await productDb(secondProduct);
    const quota = await submitBundle(owner.cookie, secondProduct);
    const quotaBody = await quota.json();
    assert.equal(quota.status, 409);
    assert.equal(quotaBody.error, "hosting_quota_exceeded");
    assert.equal(await hostingCount(secondProduct), 0);
    const quotaAfter = await productDb(secondProduct);
    assert.equal(quotaAfter.review_version, quotaBefore.review_version);
    assert.equal(quotaAfter.hosting_revision, 0);

    const revoked = await fetch(`${baseUrl}/api/admin/hosting-grants`, {
      method: "DELETE",
      headers: cookieHeaders(await adminCookie(), { "content-type": "application/json" }),
      body: JSON.stringify({ email: owner.email }),
    });
    const revokedBody = await revoked.json();
    assert.equal(revoked.status, 200);
    assert.equal(revokedBody.ok, true);
    assert.equal(revokedBody.removedHostings, 1);
    const grantStatusAfterRevoke = await (await fetch(`${baseUrl}/api/hosting/grant`, { headers: { cookie: owner.cookie } })).json();
    assert.equal(grantStatusAfterRevoke.granted, false);
    assert.equal(grantStatusAfterRevoke.maxSites, 0);
    assert.equal(grantStatusAfterRevoke.usedSites, 0);
    const afterRevoke = await submitBundle(owner.cookie, secondProduct);
    const afterRevokeBody = await afterRevoke.json();
    assert.equal(afterRevoke.status, 403);
    assert.equal(afterRevokeBody.error, "hosting_not_granted");
    assert.equal(await hostingCount(secondProduct), 0);

    const demoOwner = await createMember(`hosting-demo-${runId}@example.com`);
    await grantMember(demoOwner.email, 3);
    const demoProduct = await createProduct(demoOwner.cookie, `demo-${runId}`, { demoUrl: "https://demo.example/site" });
    const demoBefore = await productDb(demoProduct);
    const conflict = await submitBundle(demoOwner.cookie, demoProduct);
    const conflictBody = await conflict.json();
    assert.equal(conflict.status, 409);
    assert.equal(conflictBody.error, "hosting_demo_url_conflict");
    assert.equal(await hostingCount(demoProduct), 0);
    const demoAfter = await productDb(demoProduct);
    assert.equal(demoAfter.review_version, demoBefore.review_version);
  });

  test("hosting bundle validation rejects forbidden extensions, traversal, and missing root index before upload", async () => {
    const owner = await createMember(`hosting-invalid-${runId}@example.com`);
    await grantMember(owner.email, 5);
    const productId = await createProduct(owner.cookie, `invalid-${runId}`);
    const expected = [
      { bytes: buildZip([entry("index.html"), entry("evil.php")]), code: "bundle_extension_forbidden" },
      { bytes: buildZip([entry("index.html"), entry("../escape.js")]), code: "bundle_path_invalid" },
      { bytes: buildZip([entry("assets/app.js")]), code: "bundle_missing_index" },
    ];
    const before = await productDb(productId);
    const filesBefore = await uploadCounts(owner.email);
    for (const item of expected) {
      const response = await submitBundle(owner.cookie, productId, item.bytes);
      const body = await response.json();
      assert.equal(response.status, 400);
      assert.equal(body.error, item.code);
      assert.equal(await hostingCount(productId), 0);
    }
    const after = await productDb(productId);
    assert.equal(after.review_version, before.review_version);
    assert.equal(after.hosting_revision, 0);
    assert.equal(await uploadCounts(owner.email), filesBefore);

    const genericForm = new FormData();
    genericForm.set("file", new File([cleanZip()], "site.zip", { type: "application/zip" }));
    genericForm.set("visibility", "private");
    genericForm.set("purpose", "general");
    const generic = await fetch(`${baseUrl}/api/uploads`, {
      method: "POST",
      headers: { cookie: owner.cookie, origin: baseUrl },
      body: genericForm,
    });
    const genericBody = await generic.json();
    assert.equal(generic.status, 400);
    assert.equal(genericBody.error, "invalid_upload_type");
    assert.equal(await uploadCounts(owner.email), filesBefore);
  });

  test("hosting batch failure keeps the clean uploaded object but rolls back product and hosting rows", async () => {
    const owner = await createMember(`hosting-batch-failure-${runId}@example.com`);
    await grantMember(owner.email, 3);
    const productId = await createProduct(owner.cookie, `batch-failure-${runId}`);
    const before = await productDb(productId);
    const uploadsBefore = await uploadCounts(owner.email);
    await executeLocalD1(`
      DROP TRIGGER IF EXISTS test_hosting_insert_abort;
      CREATE TRIGGER test_hosting_insert_abort BEFORE INSERT ON product_hostings
      WHEN NEW.product_id = ${productId}
      BEGIN SELECT RAISE(ABORT, 'test_hosting_batch_abort'); END;
    `);
    let response;
    try {
      response = await submitBundle(owner.cookie, productId);
    } finally {
      await executeLocalD1("DROP TRIGGER IF EXISTS test_hosting_insert_abort");
    }
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.equal(body.error, "server_error");
    assert.equal(JSON.stringify(body).includes("test_hosting_batch_abort"), false);
    assert.equal(await hostingCount(productId), 0);
    assert.equal(await uploadCounts(owner.email), uploadsBefore + 1);
    const after = await productDb(productId);
    assert.equal(after.review_version, before.review_version);
    assert.equal(after.hosting_revision, 0);
    const orphan = await queryLocalD1(
      `SELECT key, sha256, scan_status FROM uploaded_files WHERE owner_email = ${quoteSql(owner.email)}
       AND purpose = 'hosting_bundle' ORDER BY created_at DESC LIMIT 1`,
    );
    assert.equal(orphan.length, 1);
    assert.equal(orphan[0].scan_status, "clean");
    const storedObject = await fetch(`${baseUrl}/api/uploads/${encodeURIComponent(orphan[0].key)}`, {
      headers: { cookie: owner.cookie },
    });
    const storedBytes = new Uint8Array(await storedObject.arrayBuffer());
    assert.equal(storedObject.status, 200);
    assert.equal(storedObject.headers.get("content-type"), "application/zip");
    assert.equal(createHash("sha256").update(storedBytes).digest("hex"), orphan[0].sha256);
  });

  test("hosting submission member bucket stops the sixth upload before storage and DB mutation", async () => {
    const owner = await createMember(`hosting-submit-rate-${runId}@example.com`);
    await grantMember(owner.email, 1);
    const productId = await createProduct(owner.cookie, `submit-rate-${runId}`);
    for (let index = 0; index < 5; index += 1) {
      const response = await submitBundle(owner.cookie, productId);
      const body = await response.json();
      assert.equal(response.status, 201);
      assert.equal(body.hosting.state, "queued");
    }
    const before = await productDb(productId);
    const uploadsBefore = await uploadCounts(owner.email);
    const rowsBefore = await hostingCount(productId);
    const limited = await submitBundle(owner.cookie, productId);
    const limitedBody = await limited.json();
    assert.equal(limited.status, 429);
    assert.equal(limitedBody.error, "rate_limit_exceeded");
    assert.equal(await hostingCount(productId), rowsBefore);
    assert.equal(await uploadCounts(owner.email), uploadsBefore);
    const after = await productDb(productId);
    assert.equal(after.review_version, before.review_version);
    assert.equal(after.hosting_revision, before.hosting_revision);
  });

  test("hosting upload tokens enforce the three-token member limit", async () => {
    const owner = await createMember(`hosting-token-limit-${runId}@example.com`);
    await grantMember(owner.email, 3);
    const productId = await createProduct(owner.cookie, `token-limit-${runId}`);
    for (let index = 0; index < 3; index += 1) {
      const response = await fetch(`${baseUrl}/api/hosting/upload-tokens`, {
        method: "POST",
        headers: cookieHeaders(owner.cookie, { "content-type": "application/json" }),
        body: JSON.stringify({ productId }),
      });
      const body = await response.json();
      assert.equal(response.status, 201);
      assert.equal(body.maxBytes, 10 * 1024 * 1024);
    }
    const rejected = await fetch(`${baseUrl}/api/hosting/upload-tokens`, {
      method: "POST",
      headers: cookieHeaders(owner.cookie, { "content-type": "application/json" }),
      body: JSON.stringify({ productId }),
    });
    const rejectedBody = await rejected.json();
    assert.equal(rejected.status, 409);
    assert.equal(rejectedBody.error, "hosting_token_limit");
    const tokens = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM hosting_upload_tokens WHERE member_email = ${quoteSql(owner.email)} AND used_at IS NULL`,
    );
    assert.equal(tokens[0].count, 3);
    assert.equal(await hostingCount(productId), 0);
  });

  test("hosting scan refusals leave an approved product and its review revision unchanged", async () => {
    const owner = await createMember(`hosting-approved-fail-${runId}@example.com`);
    await grantMember(owner.email, 5);
    const admin = await adminCookie();
    for (const [label, bytes, code, scanStatus] of [
      ["infected", buildZip([entry("index.html", { data: "EICAR-STANDARD-ANTIVIRUS-TEST-FILE" })]), "malware_detected", "infected"],
      ["scanner-down", buildZip([entry("index.html", { data: "SCANNER-UNAVAILABLE-TEST" })]), "upload_scanner_unavailable", "error"],
    ]) {
      const productId = await createProduct(owner.cookie, `${label}-${runId}`);
      const approval = await moderate("approve_product", productId, "测试批准无托管产品。 ");
      assert.equal(approval.status, 200);
      const before = await productDb(productId);
      assert.equal(before.review_status, "approved");
      const response = await submitBundle(owner.cookie, productId, bytes);
      const body = await response.json();
      assert.equal(response.status, label === "infected" ? 422 : 503);
      assert.equal(body.error, code);
      assert.equal(await hostingCount(productId), 0);
      const after = await productDb(productId);
      assert.equal(after.status, "published");
      assert.equal(after.review_status, "approved");
      assert.equal(after.review_version, before.review_version);
      assert.equal(after.approved_version, before.approved_version);
      assert.equal(after.hosting_revision, 0);
      const uploads = await queryLocalD1(
        `SELECT scan_status FROM uploaded_files WHERE owner_email = ${quoteSql(owner.email)}
         AND purpose = 'hosting_bundle' ORDER BY created_at DESC LIMIT 1`,
      );
      assert.equal(uploads[0].scan_status, scanStatus);
    }
    assert.equal(typeof admin, "string");
  });

  test("hosting deploy, approval, public view, material re-review, and package replacement follow the contract", async () => {
    const owner = await createMember(`hosting-flow-${runId}@example.com`);
    await grantMember(owner.email, 5);
    const admin = await adminCookie();
    const productId = await createProduct(owner.cookie, `flow-${runId}`);
    const uploaded = await submitBundle(owner.cookie, productId);
    const uploadedBody = await uploaded.json();
    assert.equal(uploaded.status, 201);
    const firstHostingId = Number(uploadedBody.hosting.id);
    const submittedProduct = await productDb(productId);
    assert.equal(submittedProduct.status, "pending_review");
    assert.equal(submittedProduct.review_status, "pending_review");
    assert.equal(submittedProduct.review_version, 2);
    assert.equal(submittedProduct.hosting_revision, 1);
    const queued = await hostingDb(firstHostingId);
    assert.equal(queued.state, "queued");
    assert.equal(queued.desired, "staged");

    const deployResponse = await workerClaim();
    const deployBody = await deployResponse.json();
    assert.equal(deployResponse.status, 200);
    assert.equal(deployBody.job.action, "deploy");
    assert.equal(deployBody.job.id, firstHostingId);
    assert.equal(deployBody.job.productId, productId);
    const bundleResponse = await fetch(`${baseUrl}/api/hosting-worker/jobs/${firstHostingId}/bundle`, {
      headers: { authorization: `Bearer ${hostingDeployerToken}`, "x-hosting-lease": deployBody.job.lease },
    });
    const bundleBytes = new Uint8Array(await bundleResponse.arrayBuffer());
    assert.equal(bundleResponse.status, 200);
    assert.equal(bundleResponse.headers.get("content-type"), "application/zip");
    assert.equal(bundleResponse.headers.get("cache-control"), "no-store");
    assert.equal(bundleResponse.headers.get("x-bundle-sha256"), createHash("sha256").update(bundleBytes).digest("hex"));
    const invalidPreview = await workerReport(firstHostingId, deployBody.job.lease, {
      outcome: "staged",
      siteId: "invalid-site",
      versionId: "invalid-version",
      previewUrl: "https://preview.attacker.example",
      previewExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const invalidPreviewBody = await invalidPreview.json();
    assert.equal(invalidPreview.status, 400);
    assert.equal(invalidPreviewBody.error, "invalid_report");
    const stillDeploying = await hostingDb(firstHostingId);
    assert.equal(stillDeploying.state, "deploying");
    assert.equal(stillDeploying.site_id, null);
    await reportStaged(deployBody.job);
    const staged = await hostingDb(firstHostingId);
    assert.equal(staged.state, "staged");
    const moderationQueueResponse = await fetch(`${baseUrl}/api/admin/moderation`, { headers: { cookie: admin } });
    const moderationQueue = await moderationQueueResponse.json();
    assert.equal(moderationQueueResponse.status, 200);
    const reviewItem = moderationQueue.products.find((item) => item.id === productId);
    assert.equal(reviewItem.hosting.id, firstHostingId);
    assert.equal(reviewItem.hosting.state, "staged");
    assert.equal(reviewItem.hosting.desired, "staged");

    // 以本地 D1 临时构造一次不可能由正常 API 产生的 promoting/desired=live 状态,
    // 复核 Worker 上报仍被 I3 拦住,并回到 staged 等待审核;随后恢复 0032 守卫。
    const guardRows = await queryLocalD1(
      `SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'product_hostings_desired_transition_guard'`,
    );
    assert.equal(guardRows.length, 1);
    const desiredGuardSql = guardRows[0].sql;
    const unapprovedLease = "R".repeat(43);
    const unapprovedLeaseHash = createHash("sha256").update(unapprovedLease).digest("hex");
    await executeLocalD1(`
      DROP TRIGGER product_hostings_desired_transition_guard;
      UPDATE product_hostings SET desired = 'live', state = 'promoting',
        lease_token_hash = '${unapprovedLeaseHash}', lease_expires_at = datetime('now', '+4 minutes')
       WHERE id = ${firstHostingId};
      ${desiredGuardSql};
    `);
    const unapprovedLive = await workerReport(firstHostingId, unapprovedLease, {
      outcome: "live",
      liveUrl: "https://test-site.page.stepcloud.com",
    });
    const unapprovedLiveBody = await unapprovedLive.json();
    assert.equal(unapprovedLive.status, 409);
    assert.equal(unapprovedLiveBody.error, "hosting_live_requires_approval");
    const blockedLive = await hostingDb(firstHostingId);
    assert.equal(blockedLive.state, "staged");
    assert.equal(blockedLive.desired, "live");
    assert.equal(blockedLive.failure_code, "internal");
    assert.equal(blockedLive.live_url, null);

    const firstApproval = await moderate("approve_product", productId, "暂存包和产品内容已核验。 ");
    assert.equal(firstApproval.status, 200);
    const approved = await productDb(productId);
    assert.equal(approved.status, "published");
    assert.equal(approved.review_status, "approved");
    const promotion = await workerClaim();
    const promotionBody = await promotion.json();
    assert.equal(promotionBody.job.action, "promote");
    const invalidLive = await workerReport(firstHostingId, promotionBody.job.lease, {
      outcome: "live",
      liveUrl: "https://untrusted.example",
    });
    const invalidLiveBody = await invalidLive.json();
    assert.equal(invalidLive.status, 400);
    assert.equal(invalidLiveBody.error, "invalid_report");
    const stillPromoting = await hostingDb(firstHostingId);
    assert.equal(stillPromoting.state, "promoting");
    assert.equal(stillPromoting.live_url, null);
    const liveReport = await workerReport(firstHostingId, promotionBody.job.lease, {
      outcome: "live",
      liveUrl: "https://flow-live.page.stepcloud.com",
    });
    const liveReportBody = await liveReport.json();
    assert.equal(liveReport.status, 200);
    assert.equal(liveReportBody.ok, true);
    const statusAfterLive = await hostingStatus(owner.cookie, productId);
    assert.equal(statusAfterLive.response.status, 200);
    assert.equal(statusAfterLive.body.hosting.state, "live");
    assert.equal(statusAfterLive.body.hosting.hostedUrl, "https://flow-live.page.stepcloud.com");
    const publicState = await (await fetch(`${baseUrl}/api/community`)).json();
    const publicProduct = publicState.products.find((item) => item.id === productId);
    assert.equal(publicProduct.hostedUrl, "https://flow-live.page.stepcloud.com");

    const apiKey = await createPersonalKey(owner.cookie);
    const listedProductsResponse = await mcpTool(apiKey, "list_my_products", {});
    const listedProductsBody = await listedProductsResponse.json();
    assert.equal(listedProductsResponse.status, 200);
    const listedProduct = listedProductsBody.result.structuredContent.products.find((item) => item.id === productId);
    assert.equal(listedProduct.hostedUrl, "https://flow-live.page.stepcloud.com");
    const getProductResponse = await mcpTool(apiKey, "get_product", { id: productId });
    const getProductBody = await getProductResponse.json();
    assert.equal(getProductResponse.status, 200);
    assert.equal(getProductBody.result.structuredContent.product.hostedUrl, "https://flow-live.page.stepcloud.com");
    const edited = await mcpUpdate(apiKey, productId, `updated-${runId}`);
    const editedBody = await edited.json();
    assert.equal(edited.status, 200);
    assert.equal(editedBody.result.isError, undefined);
    const statusAfterEdit = await hostingStatus(owner.cookie, productId);
    assert.equal(statusAfterEdit.body.hosting.state, "live");
    assert.equal(statusAfterEdit.body.hosting.hostedUrl, null);
    const editedProduct = await productDb(productId);
    assert.equal(editedProduct.status, "pending_review");
    assert.equal(editedProduct.review_status, "pending_review");
    const secondApproval = await moderate("approve_product", productId, "仅产品文案变化，仍复核原托管包。 ");
    assert.equal(secondApproval.status, 200);
    const statusAfterSecondApproval = await hostingStatus(owner.cookie, productId);
    assert.equal(statusAfterSecondApproval.body.hosting.state, "live");
    assert.equal(statusAfterSecondApproval.body.hosting.hostedUrl, "https://flow-live.page.stepcloud.com");
    const liveRow = await hostingDb(firstHostingId);
    assert.equal(liveRow.approved_version, (await productDb(productId)).approved_version);

    const replacement = await submitBundle(owner.cookie, productId);
    const replacementBody = await replacement.json();
    assert.equal(replacement.status, 201);
    const secondHostingId = Number(replacementBody.hosting.id);
    const replacedOld = await hostingDb(firstHostingId);
    assert.equal(replacedOld.desired, "removed");
    const statusAfterReplacement = await hostingStatus(owner.cookie, productId);
    assert.equal(statusAfterReplacement.body.hosting.id, secondHostingId);
    assert.equal(statusAfterReplacement.body.hosting.hostedUrl, null);

    const earlyApproval = await moderate("approve_product", productId, "新包尚未暂存，不得批准。 ");
    const earlyApprovalBody = await earlyApproval.json();
    assert.equal(earlyApproval.status, 409);
    assert.equal(earlyApprovalBody.error, "hosting_not_staged");
    const stillPending = await productDb(productId);
    assert.equal(stillPending.status, "pending_review");
    assert.equal(stillPending.review_status, "pending_review");

    const removeOld = await workerClaim();
    const removeOldBody = await removeOld.json();
    assert.equal(removeOldBody.job.action, "remove");
    assert.equal(removeOldBody.job.id, firstHostingId);
    const oldRemoved = await workerReport(firstHostingId, removeOldBody.job.lease, { outcome: "removed" });
    const oldRemovedBody = await oldRemoved.json();
    assert.equal(oldRemoved.status, 200);
    assert.equal(oldRemovedBody.ok, true);

    const secondDeploy = await workerClaim();
    const secondDeployBody = await secondDeploy.json();
    assert.equal(secondDeployBody.job.action, "deploy");
    assert.equal(secondDeployBody.job.id, secondHostingId);
    await reportStaged(secondDeployBody.job);
    const finalApproval = await moderate("approve_product", productId, "新上传包已暂存并完成审核。 ");
    assert.equal(finalApproval.status, 200);
    const secondPromotion = await workerClaim();
    const secondPromotionBody = await secondPromotion.json();
    assert.equal(secondPromotionBody.job.action, "promote");
    const secondLive = await workerReport(secondHostingId, secondPromotionBody.job.lease, {
      outcome: "live",
      liveUrl: "https://replacement-live.page.stepcloud.com",
    });
    assert.equal(secondLive.status, 200);
    const finalStatus = await hostingStatus(owner.cookie, productId);
    assert.equal(finalStatus.body.hosting.hostedUrl, "https://replacement-live.page.stepcloud.com");
    assert.equal(typeof admin, "string");
  });

  test("hosting superseded promotions become removal work and expired uncertain deploys never redeploy", async () => {
    const owner = await createMember(`hosting-superseded-${runId}@example.com`);
    await grantMember(owner.email, 5);

    const supersededProduct = await createProduct(owner.cookie, `superseded-${runId}`);
    const supersededUpload = await submitBundle(owner.cookie, supersededProduct);
    const supersededUploadBody = await supersededUpload.json();
    const supersededId = Number(supersededUploadBody.hosting.id);
    const deploy = await (await workerClaim()).json();
    assert.equal(deploy.job.action, "deploy");
    assert.equal(deploy.job.id, supersededId);
    await reportStaged(deploy.job);
    const approval = await moderate("approve_product", supersededProduct, "暂存包已核验并批准。 ");
    assert.equal(approval.status, 200);
    const promote = await (await workerClaim()).json();
    assert.equal(promote.job.action, "promote");
    assert.equal(promote.job.id, supersededId);
    const removedDuringPromotion = await fetch(`${baseUrl}/api/hosting/products/${supersededProduct}`, {
      method: "DELETE",
      headers: cookieHeaders(owner.cookie),
    });
    const removedDuringPromotionBody = await removedDuringPromotion.json();
    assert.equal(removedDuringPromotion.status, 200);
    assert.equal(removedDuringPromotionBody.ok, true);
    const supersededReport = await workerReport(supersededId, promote.job.lease, {
      outcome: "live",
      liveUrl: "https://superseded.page.stepcloud.com",
    });
    const supersededReportBody = await supersededReport.json();
    assert.equal(supersededReport.status, 200);
    assert.equal(supersededReportBody.applied, "staged");
    const stagedForRemoval = await hostingDb(supersededId);
    assert.equal(stagedForRemoval.state, "staged");
    assert.equal(stagedForRemoval.desired, "removed");
    assert.equal(stagedForRemoval.failure_code, "internal");
    assert.equal(stagedForRemoval.failure_detail, "promote superseded");
    const remove = await (await workerClaim()).json();
    assert.equal(remove.job.action, "remove");
    assert.equal(remove.job.id, supersededId);
    assert.equal(remove.job.siteId, `site-${supersededId}`);
    const removeReport = await workerReport(supersededId, remove.job.lease, { outcome: "removed" });
    assert.equal(removeReport.status, 200);
    const removedRow = await hostingDb(supersededId);
    assert.equal(removedRow.state, "removed");
    assert.equal(removedRow.live_url, null);

    const uncertainProduct = await createProduct(owner.cookie, `uncertain-deploy-${runId}`);
    const uncertainUpload = await submitBundle(owner.cookie, uncertainProduct);
    const uncertainUploadBody = await uncertainUpload.json();
    const uncertainId = Number(uncertainUploadBody.hosting.id);
    const uncertainDeploy = await (await workerClaim()).json();
    assert.equal(uncertainDeploy.job.action, "deploy");
    assert.equal(uncertainDeploy.job.id, uncertainId);
    const removalRequest = await fetch(`${baseUrl}/api/hosting/products/${uncertainProduct}`, {
      method: "DELETE",
      headers: cookieHeaders(owner.cookie),
    });
    assert.equal(removalRequest.status, 200);
    await executeLocalD1(`UPDATE product_hostings SET lease_expires_at = datetime('now', '-1 second') WHERE id = ${uncertainId}`);
    const noUnsafeRedeploy = await (await workerClaim()).json();
    assert.equal(noUnsafeRedeploy.job, null);
    const uncertainRow = await hostingDb(uncertainId);
    assert.equal(uncertainRow.state, "failed");
    assert.equal(uncertainRow.desired, "removed");
    assert.equal(uncertainRow.site_id, null);
    assert.equal(uncertainRow.failure_code, "ambiguous");
    assert.match(uncertainRow.failure_detail, /manual reconciliation required/);

    const expiredPromotionProduct = await createProduct(owner.cookie, `expired-promotion-${runId}`);
    const expiredPromotionUpload = await submitBundle(owner.cookie, expiredPromotionProduct);
    const expiredPromotionBody = await expiredPromotionUpload.json();
    const expiredPromotionId = Number(expiredPromotionBody.hosting.id);
    const expiredDeploy = await (await workerClaim()).json();
    assert.equal(expiredDeploy.job.id, expiredPromotionId);
    await reportStaged(expiredDeploy.job);
    const expiredApproval = await moderate("approve_product", expiredPromotionProduct, "暂存包已核验并批准。 ");
    assert.equal(expiredApproval.status, 200);
    const expiredPromote = await (await workerClaim()).json();
    assert.equal(expiredPromote.job.action, "promote");
    const expiredRemovalRequest = await fetch(`${baseUrl}/api/hosting/products/${expiredPromotionProduct}`, {
      method: "DELETE",
      headers: cookieHeaders(owner.cookie),
    });
    assert.equal(expiredRemovalRequest.status, 200);
    await executeLocalD1(`UPDATE product_hostings SET lease_expires_at = datetime('now', '-1 second') WHERE id = ${expiredPromotionId}`);
    const expiredRemove = await (await workerClaim()).json();
    assert.equal(expiredRemove.job.action, "remove");
    assert.equal(expiredRemove.job.id, expiredPromotionId);
    assert.equal(expiredRemove.job.siteId, `site-${expiredPromotionId}`);
    const expiredRemovedReport = await workerReport(expiredPromotionId, expiredRemove.job.lease, { outcome: "removed" });
    assert.equal(expiredRemovedReport.status, 200);
    const expiredRemovedRow = await hostingDb(expiredPromotionId);
    assert.equal(expiredRemovedRow.state, "removed");
    assert.equal(expiredRemovedRow.desired, "removed");
  });

  test("hosting external-demo approval, rejection cleanup, and moderator removal enqueue removal", async () => {
    const owner = await createMember(`hosting-review-actions-${runId}@example.com`);
    await grantMember(owner.email, 5);
    const demoProduct = await createProduct(owner.cookie, `external-${runId}`, { demoUrl: "https://demo.example/replaceable" });
    const demoApproval = await moderate("approve_product", demoProduct, "审核外链演示地址。 ");
    const demoApprovalBody = await demoApproval.json();
    assert.equal(demoApproval.status, 409);
    assert.equal(demoApprovalBody.error, "external_demo_requires_immutable_package");
    const demoState = await productDb(demoProduct);
    assert.equal(demoState.review_status, "pending_review");

    const rejectedProduct = await createProduct(owner.cookie, `reject-${runId}`);
    const submitted = await submitBundle(owner.cookie, rejectedProduct);
    const submittedBody = await submitted.json();
    assert.equal(submitted.status, 201);
    const hostingId = Number(submittedBody.hosting.id);
    const rejected = await moderate("reject_product", rejectedProduct, "产品内容仍需修改后再行上线。 ");
    assert.equal(rejected.status, 200);
    const rejectedHosting = await hostingDb(hostingId);
    assert.equal(rejectedHosting.desired, "removed");
    assert.equal(rejectedHosting.state, "queued");

    const liveProduct = await createProduct(owner.cookie, `moderated-remove-${runId}`);
    const liveUpload = await submitBundle(owner.cookie, liveProduct);
    const liveUploadBody = await liveUpload.json();
    const liveId = Number(liveUploadBody.hosting.id);
    const deploy = await (await workerClaim()).json();
    assert.equal(deploy.job.id, liveId);
    await reportStaged(deploy.job);
    assert.equal((await (await moderate("approve_product", liveProduct)).json()).updated, true);
    const promote = await (await workerClaim()).json();
    assert.equal(promote.job.action, "promote");
    const liveResponse = await workerReport(liveId, promote.job.lease, {
      outcome: "live",
      liveUrl: "https://moderated-remove.page.stepcloud.com",
    });
    assert.equal(liveResponse.status, 200);
    const agentRemoval = await fetch(`${baseUrl}/api/admin/moderation`, {
      method: "PATCH",
      headers: {
        authorization: "Bearer test-agent-key",
        origin: baseUrl,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "remove_hosting", targetRef: String(liveProduct), note: "agent removal must be denied" }),
    });
    const agentRemovalBody = await agentRemoval.json();
    assert.equal(agentRemoval.status, 403);
    assert.equal(agentRemovalBody.error, "admin_forbidden");
    const retainedAfterAgent = await hostingDb(liveId);
    assert.equal(retainedAfterAgent.desired, "live");
    assert.equal(retainedAfterAgent.state, "live");
    const removeResponse = await moderate("remove_hosting", liveProduct, "平台审核要求撤下托管站点。 ");
    assert.equal(removeResponse.status, 200);
    const removalRow = await hostingDb(liveId);
    assert.equal(removalRow.desired, "removed");
    assert.equal(removalRow.state, "removing");
    const removeJob = await (await workerClaim()).json();
    assert.equal(removeJob.job.action, "remove");
    assert.equal(removeJob.job.id, liveId);
    const removed = await workerReport(liveId, removeJob.job.lease, { outcome: "removed" });
    assert.equal(removed.status, 200);
    const finalRow = await hostingDb(liveId);
    assert.equal(finalRow.state, "removed");
    assert.equal(finalRow.live_url, null);

    const revokedProduct = await createProduct(owner.cookie, `grant-revoke-live-${runId}`);
    const revokedUpload = await submitBundle(owner.cookie, revokedProduct);
    const revokedUploadBody = await revokedUpload.json();
    const revokedHostingId = Number(revokedUploadBody.hosting.id);
    const revokedDeploy = await (await workerClaim()).json();
    assert.equal(revokedDeploy.job.id, revokedHostingId);
    await reportStaged(revokedDeploy.job);
    const revokedApproval = await moderate("approve_product", revokedProduct, "暂存包已核验并批准。 ");
    assert.equal(revokedApproval.status, 200);
    const revokedPromote = await (await workerClaim()).json();
    const revokedLive = await workerReport(revokedHostingId, revokedPromote.job.lease, {
      outcome: "live",
      liveUrl: "https://grant-revoke.page.stepcloud.com",
    });
    assert.equal(revokedLive.status, 200);
    const revokeGrant = await fetch(`${baseUrl}/api/admin/hosting-grants`, {
      method: "DELETE",
      headers: cookieHeaders(await adminCookie(), { "content-type": "application/json" }),
      body: JSON.stringify({ email: owner.email }),
    });
    const revokeGrantBody = await revokeGrant.json();
    assert.equal(revokeGrant.status, 200);
    assert.equal(revokeGrantBody.removedHostings, 1);
    const revokeRow = await hostingDb(revokedHostingId);
    assert.equal(revokeRow.desired, "removed");
    assert.equal(revokeRow.state, "removing");
    const revokeJob = await (await workerClaim()).json();
    assert.equal(revokeJob.job.action, "remove");
    assert.equal(revokeJob.job.id, revokedHostingId);
    const revokeReport = await workerReport(revokedHostingId, revokeJob.job.lease, { outcome: "removed" });
    assert.equal(revokeReport.status, 200);
    const revokeFinal = await hostingDb(revokedHostingId);
    assert.equal(revokeFinal.state, "removed");
    assert.equal(revokeFinal.live_url, null);
  });

  test("hosting upload tokens are one-use, bound to their owner, and unusable after expiry", async () => {
    const owner = await createMember(`hosting-token-owner-${runId}@example.com`);
    await grantMember(owner.email, 5);
    const productId = await createProduct(owner.cookie, `token-${runId}`);
    const issued = await fetch(`${baseUrl}/api/hosting/upload-tokens`, {
      method: "POST",
      headers: cookieHeaders(owner.cookie, { "content-type": "application/json" }),
      body: JSON.stringify({ productId }),
    });
    const tokenInfo = await issued.json();
    assert.equal(issued.status, 201);
    assert.equal(tokenInfo.url, `/api/hosting/bundles/${tokenInfo.token}`);
    assert.equal(tokenInfo.maxBytes, 10 * 1024 * 1024);
    const tokenHash = createHash("sha256").update(tokenInfo.token).digest("hex");
    const tokenRow = await queryLocalD1(
      `SELECT token_hash, used_at FROM hosting_upload_tokens WHERE product_id = ${productId} AND member_email = ${quoteSql(owner.email)}`,
    );
    assert.equal(tokenRow.length, 1);
    assert.equal(tokenRow[0].token_hash, tokenHash);
    assert.notEqual(tokenRow[0].token_hash, tokenInfo.token);
    assert.equal(tokenRow[0].used_at, null);
    const bytes = cleanZip();
    const put = await fetch(`${baseUrl}${tokenInfo.url}`, {
      method: "PUT",
      headers: { "content-type": "application/zip" },
      body: bytes,
    });
    const putBody = await put.json();
    assert.equal(put.status, 201);
    assert.equal(putBody.hosting.state, "queued");
    assert.equal(putBody.hosting.desired, "staged");
    const consumedToken = await queryLocalD1(
      `SELECT used_at FROM hosting_upload_tokens WHERE token_hash = ${quoteSql(tokenHash)}`,
    );
    assert.equal(typeof consumedToken[0].used_at, "string");
    const replay = await fetch(`${baseUrl}${tokenInfo.url}`, {
      method: "PUT",
      headers: { "content-type": "application/zip" },
      body: bytes,
    });
    const replayBody = await replay.json();
    assert.equal(replay.status, 401);
    assert.equal(replayBody.error, "invalid_upload_token");
    assert.equal(await hostingCount(productId), 1);

    const other = await createMember(`hosting-token-other-${runId}@example.com`);
    await grantMember(other.email, 3);
    const otherProduct = await createProduct(other.cookie, `other-token-${runId}`);
    const deniedIssue = await fetch(`${baseUrl}/api/hosting/upload-tokens`, {
      method: "POST",
      headers: cookieHeaders(owner.cookie, { "content-type": "application/json" }),
      body: JSON.stringify({ productId: otherProduct }),
    });
    const deniedIssueBody = await deniedIssue.json();
    assert.equal(deniedIssue.status, 403);
    assert.equal(deniedIssueBody.error, "hosting_owner_mismatch");
    const foreignProductTokens = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM hosting_upload_tokens WHERE product_id = ${otherProduct}`,
    );
    assert.equal(Number(foreignProductTokens[0].count), 0);
    const hostingsBeforeCookie = await hostingCount(productId);
    const cookieWithoutToken = await fetch(`${baseUrl}/api/hosting/bundles/${"A".repeat(43)}`, {
      method: "PUT",
      headers: { cookie: owner.cookie, "content-type": "application/zip" },
      body: bytes,
    });
    const cookieWithoutTokenBody = await cookieWithoutToken.json();
    assert.equal(cookieWithoutToken.status, 401);
    assert.equal(cookieWithoutTokenBody.error, "invalid_upload_token");
    assert.equal(await hostingCount(productId), hostingsBeforeCookie);

    const expiredToken = `T${"b".repeat(42)}`;
    const expiredHash = createHash("sha256").update(expiredToken).digest("hex");
    await executeLocalD1(`
      INSERT INTO hosting_upload_tokens (token_hash, member_email, product_id, expires_at)
      VALUES (${quoteSql(expiredHash)}, ${quoteSql(owner.email)}, ${productId}, datetime('now', '-1 minute'))
    `);
    const expiredPut = await fetch(`${baseUrl}/api/hosting/bundles/${expiredToken}`, {
      method: "PUT",
      headers: { "content-type": "application/zip" },
      body: bytes,
    });
    const expiredBody = await expiredPut.json();
    assert.equal(expiredPut.status, 401);
    assert.equal(expiredBody.error, "invalid_upload_token");
    const expiredRow = await queryLocalD1(`SELECT used_at FROM hosting_upload_tokens WHERE token_hash = ${quoteSql(expiredHash)}`);
    assert.equal(expiredRow[0].used_at, null);
  });

  test("hosting upload token concurrency consumes once and creates at most one hosting row", async () => {
    const owner = await createMember(`hosting-token-race-${runId}@example.com`);
    await grantMember(owner.email, 3);
    const productId = await createProduct(owner.cookie, `token-race-${runId}`);
    const issued = await fetch(`${baseUrl}/api/hosting/upload-tokens`, {
      method: "POST",
      headers: cookieHeaders(owner.cookie, { "content-type": "application/json" }),
      body: JSON.stringify({ productId }),
    });
    const tokenInfo = await issued.json();
    assert.equal(issued.status, 201);
    const bytes = cleanZip();
    const results = await Promise.all([1, 2].map(() => fetch(`${baseUrl}${tokenInfo.url}`, {
      method: "PUT",
      headers: { "content-type": "application/zip" },
      body: bytes,
    })));
    const bodies = await Promise.all(results.map((response) => response.json()));
    const statuses = results.map((response) => response.status).sort((a, b) => a - b);
    assert.equal(statuses[0], 201);
    assert.equal(statuses[1], 401);
    assert.equal(bodies.filter((body) => body.hosting?.state === "queued").length, 1);
    assert.equal(bodies.filter((body) => body.error === "invalid_upload_token").length, 1);
    assert.equal(await hostingCount(productId), 1);
  });

  test("hosting worker entry gate rejects wrong identities and scopes before route handling", async () => {
    const owner = await createMember(`hosting-gate-${runId}@example.com`);
    const validCookie = owner.cookie;
    const attemptsBefore = await queryLocalD1(
      "SELECT COALESCE(SUM(attempts), 0) AS attempts FROM product_hostings",
    );
    const wrongToken = await fetch(`${baseUrl}/api/hosting-worker/health`, {
      headers: { authorization: "Bearer zch_not-the-configured-token" },
    });
    const wrongTokenBody = await wrongToken.json();
    assert.equal(wrongToken.status, 401);
    assert.equal(wrongTokenBody.error, "invalid_hosting_token");
    assert.equal(wrongToken.headers.get("cache-control"), "no-store");

    const outOfScope = await fetch(`${baseUrl}/api/products`, {
      method: "POST",
      headers: { authorization: `Bearer ${hostingDeployerToken}`, "content-type": "application/json" },
      body: JSON.stringify({ title: `blocked-gate-${runId}`, description: "blocked", category: "开发工具" }),
    });
    const outOfScopeBody = await outOfScope.json();
    assert.equal(outOfScope.status, 403);
    assert.equal(outOfScopeBody.error, "hosting_worker_scope_forbidden");
    const blockedProduct = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM products WHERE title = ${quoteSql(`blocked-gate-${runId}`)}`,
    );
    assert.equal(Number(blockedProduct[0].count), 0);

    const queryVariant = await fetch(`${baseUrl}/api/hosting-worker/health?unexpected=1`, {
      headers: { authorization: `Bearer ${hostingDeployerToken}` },
    });
    const queryVariantBody = await queryVariant.json();
    assert.equal(queryVariant.status, 403);
    assert.equal(queryVariantBody.error, "hosting_worker_scope_forbidden");

    const health = await fetch(`${baseUrl}/api/hosting-worker/health`, { headers: { cookie: validCookie } });
    const healthBody = await health.json();
    assert.equal(health.status, 401);
    assert.equal(healthBody.error, "invalid_hosting_token");
    const userKeyOnWorker = await fetch(`${baseUrl}/api/hosting-worker/health`, {
      headers: { authorization: "Bearer zc_not-a-hosting-worker-key" },
    });
    const userKeyBody = await userKeyOnWorker.json();
    assert.equal(userKeyOnWorker.status, 401);
    assert.equal(userKeyBody.error, "invalid_hosting_token");
    const adminOnWorker = await fetch(`${baseUrl}/api/hosting-worker/health`, { headers: { cookie: await adminCookie() } });
    const adminBody = await adminOnWorker.json();
    assert.equal(adminOnWorker.status, 401);
    assert.equal(adminBody.error, "invalid_hosting_token");
    const goodHealth = await fetch(`${baseUrl}/api/hosting-worker/health`, {
      headers: { authorization: `Bearer ${hostingDeployerToken}` },
    });
    const goodHealthBody = await goodHealth.json();
    assert.equal(goodHealth.status, 200);
    assert.equal(goodHealthBody.ok, true);
    assert.equal(goodHealth.headers.get("cache-control"), "no-store");
    const attemptsAfter = await queryLocalD1(
      "SELECT COALESCE(SUM(attempts), 0) AS attempts FROM product_hostings",
    );
    assert.equal(Number(attemptsAfter[0].attempts), Number(attemptsBefore[0].attempts));
  });

  test("hosting leases expire safely, old leases fail, reports replay, and exhausted attempts stop", async () => {
    const owner = await createMember(`hosting-lease-${runId}@example.com`);
    await grantMember(owner.email, 5);
    const productId = await createProduct(owner.cookie, `lease-${runId}`);
    const submitted = await submitBundle(owner.cookie, productId);
    const submittedBody = await submitted.json();
    const id = Number(submittedBody.hosting.id);
    const firstClaim = await (await workerClaim()).json();
    assert.equal(firstClaim.job.action, "deploy");
    const firstLeaseRow = await hostingDb(id);
    assert.equal(firstLeaseRow.lease_token_hash, createHash("sha256").update(firstClaim.job.lease).digest("hex"));
    assert.notEqual(firstLeaseRow.lease_token_hash, firstClaim.job.lease);
    await executeLocalD1(
      `UPDATE product_hostings SET lease_expires_at = datetime('now', '-1 second') WHERE id = ${id}`,
    );
    const secondClaim = await (await workerClaim()).json();
    assert.equal(secondClaim.job.action, "deploy");
    assert.equal(secondClaim.job.id, id);
    assert.notEqual(secondClaim.job.lease, firstClaim.job.lease);
    const currentLeaseRow = await hostingDb(id);
    assert.equal(currentLeaseRow.lease_token_hash, createHash("sha256").update(secondClaim.job.lease).digest("hex"));
    const stale = await workerReport(id, firstClaim.job.lease, {
      outcome: "staged",
      siteId: "stale-site",
      versionId: "stale-version",
      previewUrl: `https://p-${"c".repeat(32)}.preview.stepcloud.com`,
      previewExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const staleBody = await stale.json();
    assert.equal(stale.status, 409);
    assert.equal(staleBody.error, "lease_mismatch");
    const stillDeploying = await hostingDb(id);
    assert.equal(stillDeploying.state, "deploying");
    assert.equal(stillDeploying.attempts, 2);

    const stagedReport = {
      outcome: "staged",
      siteId: "current-site",
      versionId: "current-version",
      previewUrl: `https://p-${"d".repeat(32)}.preview.stepcloud.com`,
      previewExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 - 60_000).toISOString(),
    };
    const applied = await workerReport(id, secondClaim.job.lease, stagedReport);
    const appliedBody = await applied.json();
    assert.equal(applied.status, 200);
    assert.equal(appliedBody.ok, true);
    const replay = await workerReport(id, secondClaim.job.lease, stagedReport);
    const replayBody = await replay.json();
    assert.equal(replay.status, 200);
    assert.equal(replayBody.replayed, true);
    const stagedRow = await hostingDb(id);
    assert.equal(stagedRow.state, "staged");
    assert.equal(stagedRow.site_id, "current-site");

    const exhaustedProduct = await createProduct(owner.cookie, `attempt-limit-${runId}`);
    const exhaustedUpload = await submitBundle(owner.cookie, exhaustedProduct);
    const exhaustedUploadBody = await exhaustedUpload.json();
    const exhaustedId = Number(exhaustedUploadBody.hosting.id);
    await executeLocalD1(`UPDATE product_hostings SET attempts = 6 WHERE id = ${exhaustedId}`);
    const exhaustedClaim = await (await workerClaim()).json();
    assert.equal(exhaustedClaim.job, null);
    const exhaustedRow = await hostingDb(exhaustedId);
    assert.equal(exhaustedRow.state, "failed");
    assert.equal(exhaustedRow.failure_code, "internal");
    assert.match(exhaustedRow.failure_detail, /attempt limit/);
  });

  test("hosting status hides another member's product and member removal clears its public URL", async () => {
    const owner = await createMember(`hosting-status-owner-${runId}@example.com`);
    const outsider = await createMember(`hosting-status-outsider-${runId}@example.com`);
    await grantMember(owner.email, 3);
    const productId = await createProduct(owner.cookie, `status-${runId}`);
    const submitted = await submitBundle(owner.cookie, productId);
    const submittedBody = await submitted.json();
    const id = Number(submittedBody.hosting.id);
    const otherStatus = await hostingStatus(outsider.cookie, productId);
    assert.equal(otherStatus.response.status, 404);
    assert.equal(otherStatus.body.error, "product_not_found");
    const ownerStatus = await hostingStatus(owner.cookie, productId);
    assert.equal(ownerStatus.response.status, 200);
    assert.equal(ownerStatus.body.hosting.id, id);
    const removed = await fetch(`${baseUrl}/api/hosting/products/${productId}`, {
      method: "DELETE",
      headers: cookieHeaders(owner.cookie),
    });
    const removedBody = await removed.json();
    assert.equal(removed.status, 200);
    assert.equal(removedBody.ok, true);
    const row = await hostingDb(id);
    assert.equal(row.desired, "removed");
    assert.equal(row.state, "removed");
    const finalStatus = await hostingStatus(owner.cookie, productId);
    assert.equal(finalStatus.body.hosting, null);
  });
}
