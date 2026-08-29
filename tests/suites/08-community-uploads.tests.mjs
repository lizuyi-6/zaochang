// 社区状态·上传·通知:自 tests/rendered-html.test.mjs 保序拆分(测试体逐字未改)。
// 执行顺序由 tests/rendered-html.test.mjs 的注册顺序保证。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baseUrl,
  runId,
  adminEmail,
  onePixelPng,
  authHeaders,
  executeLocalD1,
  reviewProduct,
} from "../harness/preview.mjs";

export function register() {
test("persists profile, collections, comments, and incubation state", async () => {
  const email = `member-features-${runId}@example.com`;
  const headers = authHeaders("功能验收用户", email);

  const profile = await fetch(`${baseUrl}/api/actions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "update_profile", bio: "持续发布小而明确的产品实验。", location: "杭州", website: "https://example.com" }),
  });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).profile.bio, "持续发布小而明确的产品实验。");

  const createdCollection = await fetch(`${baseUrl}/api/actions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "create_collection", name: "反复体验", color: "blue" }),
  });
  assert.equal(createdCollection.status, 201);
  const collectionId = (await createdCollection.json()).collection.id;
  assert.equal(Number.isInteger(collectionId), true);

  const saved = await fetch(`${baseUrl}/api/actions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "add_to_collection", collectionId, productRef: "mori" }),
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { saved: true, added: true, collectionId });

  const comment = await fetch(`${baseUrl}/api/comments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ targetType: "product", targetRef: "mori", content: "希望下一版开放环境声分轨控制。" }),
  });
  assert.equal(comment.status, 201);
  assert.equal((await comment.json()).comment.content, "希望下一版开放环境声分轨控制。");

  const comments = await fetch(`${baseUrl}/api/comments?targetType=product&targetRef=mori`, { headers });
  assert.equal(comments.status, 200);
  assert.equal((await comments.json()).comments.some((item) => item.content === "希望下一版开放环境声分轨控制。"), true);

  const incubation = await fetch(`${baseUrl}/api/incubation`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "星桥协作台", projectType: "AI 产品", oneLiner: "让小团队不增加会议也能形成可追踪的产品共识。", problem: "产品决策散落在聊天与会议里，后续很难找到依据。", progress: "已有可演示原型", team: "2-5 人团队", need: "产品定位与用户验证", contact: "hello@example.com" }),
  });
  assert.equal(incubation.status, 201);
  const incubationBody = await incubation.json();
  assert.equal(incubationBody.project.name, "星桥协作台");
  assert.equal(incubationBody.project.status, "资料审核");

  const uploadHeaders = { ...headers };
  delete uploadHeaders["content-type"];
  const materialForm = new FormData();
  materialForm.set("file", new File(["target users"], "personas.txt", { type: "text/plain" }));
  materialForm.set("visibility", "private");
  materialForm.set("purpose", "incubation_material");
  const materialUpload = await fetch(`${baseUrl}/api/uploads`, { method: "POST", headers: uploadHeaders, body: materialForm });
  assert.equal(materialUpload.status, 201);
  const materialUrl = (await materialUpload.json()).url;
  const material = await fetch(`${baseUrl}/api/incubation`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "add_material", projectId: incubationBody.project.id, name: "目标用户画像.txt", url: materialUrl, kind: "FILE" }),
  });
  assert.equal(material.status, 201);
  const incubationState = await fetch(`${baseUrl}/api/incubation`, { headers });
  assert.equal(incubationState.status, 200);
  const refreshedProject = (await incubationState.json()).project;
  assert.equal(refreshedProject.status, "资料审核");
  assert.equal(refreshedProject.currentTask, "等待造场核对新增资料");

  const deniedAdminQueue = await fetch(`${baseUrl}/api/admin/incubation`, { headers });
  assert.equal(deniedAdminQueue.status, 403);
  assert.deepEqual(await deniedAdminQueue.json(), { error: "admin_forbidden" });

  const adminHeaders = authHeaders("发布审核管理员", adminEmail);
  const adminQueue = await fetch(`${baseUrl}/api/admin/incubation`, { headers: adminHeaders });
  assert.equal(adminQueue.status, 200);
  const adminQueueBody = await adminQueue.json();
  assert.equal(adminQueueBody.projects.some((project) => project.id === incubationBody.project.id && project.status === "资料审核"), true);
  const adminUpdate = await fetch(`${baseUrl}/api/admin/incubation`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({
      projectId: incubationBody.project.id,
      status: "项目评估",
      currentTask: "补充目标用户访谈证据",
      assignedOwner: "造场产品组",
      nextAction: "上传三份匿名访谈摘要",
      waitingReason: "评估需要可复核的目标用户证据",
      progressPercent: 35,
      feedback: "请去除受访者身份信息后再上传。",
    }),
  });
  assert.equal(adminUpdate.status, 200);
  assert.deepEqual(await adminUpdate.json(), { updated: true });

  const updatedIncubation = await (await fetch(`${baseUrl}/api/incubation`, { headers })).json();
  assert.equal(updatedIncubation.project.status, "项目评估");
  assert.equal(updatedIncubation.project.currentTask, "补充目标用户访谈证据");
  assert.equal(updatedIncubation.project.progressPercent, 35);
  assert.equal(updatedIncubation.feedback.some((item) => item.content === "请去除受访者身份信息后再上传。"), true);

  const state = await fetch(`${baseUrl}/api/community`, { headers });
  assert.equal(state.status, 200);
  const body = await state.json();
  assert.equal(body.profile.location, "杭州");
  assert.equal(body.collections.some((item) => item.id === collectionId && item.itemCount === 1), true);
  assert.equal(body.collectionItems.some((item) => item.collectionId === collectionId && item.productRef === "mori"), true);
});

test("enforces upload visibility and ownership", async () => {
  const ownerEmail = `upload-owner-${runId}@example.com`;
  const ownerHeaders = authHeaders("上传所有者", ownerEmail);
  delete ownerHeaders["content-type"];

  const privateForm = new FormData();
  privateForm.set("file", new File(["private project material"], "evidence.txt", { type: "text/plain" }));
  privateForm.set("visibility", "private");
  const privateUpload = await fetch(`${baseUrl}/api/uploads`, { method: "POST", headers: ownerHeaders, body: privateForm });
  assert.equal(privateUpload.status, 201);
  const privateBody = await privateUpload.json();
  assert.equal(privateBody.visibility, "private");
  assert.equal(privateBody.scanStatus, "clean");

  const ownerDownload = await fetch(`${baseUrl}${privateBody.url}`, { headers: ownerHeaders });
  assert.equal(ownerDownload.status, 200);
  assert.equal(await ownerDownload.text(), "private project material");

  const anonymousDownload = await fetch(`${baseUrl}${privateBody.url}`);
  assert.equal(anonymousDownload.status, 403);

  const otherHeaders = authHeaders("其他用户", `upload-other-${runId}@example.com`);
  const otherDownload = await fetch(`${baseUrl}${privateBody.url}`, { headers: otherHeaders });
  assert.equal(otherDownload.status, 403);
  const adminPrivateDownload = await fetch(`${baseUrl}${privateBody.url}`, { headers: authHeaders("发布审核管理员", adminEmail) });
  assert.equal(adminPrivateDownload.status, 403);

  const otherProjectResponse = await fetch(`${baseUrl}/api/incubation`, { method: "POST", headers: otherHeaders, body: JSON.stringify({ name: "越权资料项目", projectType: "开发者项目", oneLiner: "验证其他用户不能把不属于自己的私有文件挂进项目。", problem: "对象链接可能被复制，但所有权不能随链接转移。", progress: "安全验证", team: "个人项目", need: "技术架构与开发", contact: "security@example.com" }) });
  assert.equal(otherProjectResponse.status, 201);
  const otherProjectId = (await otherProjectResponse.json()).project.id;
  const stolenMaterial = await fetch(`${baseUrl}/api/incubation`, { method: "POST", headers: otherHeaders, body: JSON.stringify({ action: "add_material", projectId: otherProjectId, name: "不属于我的资料.txt", url: privateBody.url, kind: "FILE" }) });
  assert.equal(stolenMaterial.status, 403);
  assert.deepEqual(await stolenMaterial.json(), { error: "material_not_owned" });

  const publicForm = new FormData();
  publicForm.set("file", new File(["public cover image"], "cover.txt", { type: "text/plain" }));
  publicForm.set("visibility", "public");
  const publicUpload = await fetch(`${baseUrl}/api/uploads`, { method: "POST", headers: ownerHeaders, body: publicForm });
  assert.equal(publicUpload.status, 201);
  const publicBody = await publicUpload.json();
  assert.equal(publicBody.visibility, "public");
  assert.equal(publicBody.scanStatus, "clean");
  const publicDownload = await fetch(`${baseUrl}${publicBody.url}`);
  assert.equal(publicDownload.status, 200);
  assert.match(publicDownload.headers.get("content-disposition") ?? "", /^attachment;/);
  assert.equal(publicDownload.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await publicDownload.text(), "public cover image");
  const rewrittenScanState = await executeLocalD1(
    `UPDATE uploaded_files SET scan_status = 'error' WHERE key = '${publicBody.key}'`,
    false,
  );
  assert.match(rewrittenScanState, /uploaded_file_scan_state_immutable/);
  const directCleanInsert = await executeLocalD1(
    `INSERT INTO uploaded_files
      (key, owner_email, original_name, media_type, byte_size, visibility, purpose, sha256, scan_status)
     VALUES ('direct-clean-${runId}.txt', '${ownerEmail}', 'direct.txt', 'text/plain', 1, 'private', 'general',
             'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'clean')`,
    false,
  );
  assert.match(directCleanInsert, /uploaded_file_must_start_pending/);

  const missingVisibilityForm = new FormData();
  missingVisibilityForm.set("file", new File(["missing visibility"], "unknown.txt", { type: "text/plain" }));
  const missingVisibility = await fetch(`${baseUrl}/api/uploads`, { method: "POST", headers: ownerHeaders, body: missingVisibilityForm });
  assert.equal(missingVisibility.status, 400);
  assert.deepEqual(await missingVisibility.json(), { error: "invalid_visibility" });

  const publishWithCover = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: { ...ownerHeaders, "content-type": "application/json" },
    body: JSON.stringify({ title: `公开封面作品 ${runId}`, description: "验证上传后的站内封面地址可以直接进入真实发布流程。", category: "互动体验", coverTheme: "blue", imageUrl: publicBody.url, price: 0 }),
  });
  assert.equal(publishWithCover.status, 400);
  assert.deepEqual(await publishWithCover.json(), { error: "invalid_product_cover" });

  const spoofedImageForm = new FormData();
  spoofedImageForm.set("file", new File(["not a png"], "spoofed.png", { type: "image/png" }));
  spoofedImageForm.set("visibility", "private");
  spoofedImageForm.set("purpose", "product_cover");
  const spoofedImage = await fetch(`${baseUrl}/api/uploads`, { method: "POST", headers: ownerHeaders, body: spoofedImageForm });
  assert.equal(spoofedImage.status, 400);
  assert.deepEqual(await spoofedImage.json(), { error: "upload_content_type_mismatch" });

  const infectedForm = new FormData();
  infectedForm.set("file", new File(["X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"], `eicar-${runId}.txt`, { type: "text/plain" }));
  infectedForm.set("visibility", "private");
  const infectedUpload = await fetch(`${baseUrl}/api/uploads`, { method: "POST", headers: ownerHeaders, body: infectedForm });
  assert.equal(infectedUpload.status, 422);
  assert.deepEqual(await infectedUpload.json(), { error: "malware_detected" });

  const unavailableForm = new FormData();
  unavailableForm.set("file", new File(["SCANNER-UNAVAILABLE-TEST"], `scanner-error-${runId}.txt`, { type: "text/plain" }));
  unavailableForm.set("visibility", "private");
  const unavailableUpload = await fetch(`${baseUrl}/api/uploads`, { method: "POST", headers: ownerHeaders, body: unavailableForm });
  assert.equal(unavailableUpload.status, 503);
  assert.deepEqual(await unavailableUpload.json(), { error: "upload_scanner_unavailable" });
  await executeLocalD1(`
    CREATE TABLE upload_scan_assertion (id integer);
    CREATE TRIGGER upload_scan_assertion_guard BEFORE INSERT ON upload_scan_assertion
    WHEN NOT EXISTS (
      SELECT 1 FROM uploaded_files
      WHERE owner_email = '${ownerEmail}' AND original_name = 'eicar-${runId}.txt'
        AND scan_status = 'infected' AND scan_signature = 'Eicar-Test-Signature'
    ) OR NOT EXISTS (
      SELECT 1 FROM uploaded_files
      WHERE owner_email = '${ownerEmail}' AND original_name = 'scanner-error-${runId}.txt'
        AND scan_status = 'error' AND quarantine_key IS NULL
    ) BEGIN SELECT RAISE(ABORT, 'upload_scan_state_invalid'); END;
    INSERT INTO upload_scan_assertion (id) VALUES (1);
    DROP TRIGGER upload_scan_assertion_guard;
    DROP TABLE upload_scan_assertion
  `);

  const coverForm = new FormData();
  coverForm.set("file", new File([onePixelPng], "review-cover.png", { type: "image/png" }));
  coverForm.set("visibility", "private");
  coverForm.set("purpose", "product_cover");
  const coverUpload = await fetch(`${baseUrl}/api/uploads`, { method: "POST", headers: ownerHeaders, body: coverForm });
  assert.equal(coverUpload.status, 201);
  const coverBody = await coverUpload.json();
  assert.equal(coverBody.visibility, "private");
  assert.equal(coverBody.purpose, "product_cover");
  assert.equal((await fetch(`${baseUrl}${coverBody.url}`)).status, 403);
  assert.equal((await fetch(`${baseUrl}${coverBody.url}`, { headers: authHeaders("发布审核管理员", adminEmail) })).status, 403);

  const stolenCover = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: otherHeaders,
    body: JSON.stringify({ title: `越权封面作品 ${runId}`, description: "其他用户不能把不属于自己的待审封面挂到商品。", category: "互动体验", coverTheme: "blue", imageUrl: coverBody.url, price: 0 }),
  });
  assert.equal(stolenCover.status, 403);
  assert.deepEqual(await stolenCover.json(), { error: "product_cover_not_owned" });

  const pendingCoverProduct = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: { ...ownerHeaders, "content-type": "application/json" },
    body: JSON.stringify({ title: `待审封面作品 ${runId}`, description: "验证商品封面在平台批准前保持私有，批准后才对公众开放。", category: "互动体验", coverTheme: "blue", imageUrl: coverBody.url, price: 0 }),
  });
  assert.equal(pendingCoverProduct.status, 201);
  const pendingCoverProductBody = await pendingCoverProduct.json();
  assert.equal(pendingCoverProductBody.product.imageUrl, coverBody.url);
  assert.equal(pendingCoverProductBody.product.reviewStatus, "pending_review");
  assert.equal((await fetch(`${baseUrl}${coverBody.url}`)).status, 403);
  assert.equal((await fetch(`${baseUrl}${coverBody.url}`, { headers: authHeaders("发布审核管理员", adminEmail) })).status, 200);
  await reviewProduct(pendingCoverProductBody.product.id);
  const approvedCover = await fetch(`${baseUrl}${coverBody.url}`);
  assert.equal(approvedCover.status, 200);
  assert.equal(approvedCover.headers.get("cache-control"), "no-store");
  assert.equal(approvedCover.headers.get("content-type"), "image/png");
  assert.equal(Buffer.from(await approvedCover.arrayBuffer()).equals(onePixelPng), true);
});

test("generates account notifications and persists read state", async () => {
  const ownerHeaders = authHeaders("通知作品主人", `notify-owner-${runId}@example.com`);
  const publish = await fetch(`${baseUrl}/api/products`, { method: "POST", headers: ownerHeaders, body: JSON.stringify({ title: `通知测试作品 ${runId}`, description: "用于验证真实互动可以进入账号通知中心并保存已读状态。", category: "开发工具", coverTheme: "ink", price: 0 }) });
  assert.equal(publish.status, 201);
  const productId = (await publish.json()).product.id;
  await reviewProduct(productId);
  const visitorHeaders = authHeaders("通知体验者", `notify-visitor-${runId}@example.com`);
  const like = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: visitorHeaders, body: JSON.stringify({ action: "like", productId }) });
  assert.equal(like.status, 200);
  const ownerState = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  assert.equal(ownerState.status, 200);
  const notification = (await ownerState.json()).notifications.find((item) => item.id === `like:${productId}:notify-visitor-${runId}@example.com`);
  assert.equal(notification.type, "互动");
  const mark = await fetch(`${baseUrl}/api/actions`, { method: "POST", headers: ownerHeaders, body: JSON.stringify({ action: "mark_notifications_read", targetRefs: [notification.id] }) });
  assert.equal(mark.status, 200);
  assert.deepEqual((await mark.json()).read, [notification.id]);
  const refreshed = await fetch(`${baseUrl}/api/community`, { headers: ownerHeaders });
  assert.equal((await refreshed.json()).actions.some((item) => item.kind === "read_notification" && item.targetRef === notification.id), true);
});
}
