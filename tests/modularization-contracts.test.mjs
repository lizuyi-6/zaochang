// 公共模块契约测试:模块化收口后,app/lib 与 app/api/_lib 里的纯策略/判定模块
// 必须有独立于 HTTP 套件的直接契约,防止后续改动把 fail-closed 判定改回 fail-open。
// 全部在纯 Node 下运行(--experimental-strip-types,不启动 Wrangler),被测模块因此
// 必须保持零 Next/React/Cloudflare 依赖——本文件第一条用例就把"可加载"作为契约。
import assert from "node:assert/strict";
import test from "node:test";

const policy = await import("../app/lib/product-policy.ts");
const review = await import("../app/lib/review-status.ts");
const hydrate = await import("../app/lib/product-hydrate.ts");
const format = await import("../app/lib/format.ts");
const errors = await import("../app/api/_lib/errors.ts");

test("模块可加载性:纯 Node 下五个公共模块全部可 import(零框架依赖契约)", () => {
  for (const mod of [policy, review, hydrate, format, errors]) {
    assert.ok(mod && typeof mod === "object");
  }
});

// ---- product-policy ----

test("product-policy: 主题/定价白名单与 accent 映射完备", () => {
  assert.deepEqual(policy.PRODUCT_THEMES, ["coral", "mint", "blue", "yellow", "ink"]);
  assert.deepEqual(policy.PRICING_MODELS, ["free", "one_time", "per_use"]);
  assert.deepEqual(Object.keys(policy.THEME_ACCENTS).sort(), [...policy.PRODUCT_THEMES].sort());
  for (const theme of policy.PRODUCT_THEMES) {
    assert.match(policy.THEME_ACCENTS[theme], /^#[0-9a-f]{6}$/);
  }
});

test("product-policy: normalize 对非法值 fail-closed 回落 coral/free", () => {
  for (const theme of policy.PRODUCT_THEMES) assert.equal(policy.normalizeProductTheme(theme), theme);
  for (const model of policy.PRICING_MODELS) assert.equal(policy.normalizePricingModel(model), model);
  for (const junk of [undefined, null, "", "neon", "subscription", 42, {}, ["coral"]]) {
    assert.equal(policy.normalizeProductTheme(junk), "coral");
    assert.equal(policy.normalizePricingModel(junk), "free");
  }
});

test("product-policy: isCurrentApprovedProduct 严格整数版本判定", () => {
  assert.ok(policy.isCurrentApprovedProduct({ reviewStatus: "approved", approvedVersion: 2, reviewVersion: 2 }));
  // 陈旧批准(编辑触发重审后旧批准必须立即失效)
  assert.ok(!policy.isCurrentApprovedProduct({ reviewStatus: "approved", approvedVersion: 1, reviewVersion: 2 }));
  // 缺版本/null/非整数全部 fail-closed,含历史上 undefined === undefined 的 fail-open 洞
  for (const bad of [
    { reviewStatus: "approved" },
    { reviewStatus: "approved", approvedVersion: null, reviewVersion: null },
    { reviewStatus: "approved", approvedVersion: 1 },
    { reviewStatus: "approved", reviewVersion: 1 },
    { reviewStatus: "approved", approvedVersion: 1.5, reviewVersion: 1.5 },
    { reviewStatus: "approved", approvedVersion: Number.NaN, reviewVersion: Number.NaN },
    { reviewStatus: "pending_review", approvedVersion: 1, reviewVersion: 1 },
    { reviewStatus: "rejected", approvedVersion: 1, reviewVersion: 1 },
  ]) {
    assert.ok(!policy.isCurrentApprovedProduct(bad), JSON.stringify(bad));
  }
});

test("product-policy: 公开 SQL 谓词四件套齐备,别名版全部带 p. 前缀", () => {
  for (const fragment of ["status = 'published'", "moderation_status = 'visible'", "review_status = 'approved'", "approved_version = review_version"]) {
    assert.ok(policy.PUBLISHED_PRODUCT_SQL.includes(fragment), fragment);
  }
  for (const fragment of ["p.status = 'published'", "p.moderation_status = 'visible'", "p.review_status = 'approved'", "p.approved_version = p.review_version"]) {
    assert.ok(policy.PUBLISHED_PRODUCT_SQL_QUALIFIED.includes(fragment), fragment);
  }
  // 别名版不得残留未限定列(防止与调用方手写谓词漂移)
  assert.ok(!/(^|[^.])\bstatus = 'published'/.test(policy.PUBLISHED_PRODUCT_SQL_QUALIFIED.replace(/p\.status = 'published'/, "")));
});

// ---- review-status ----

test("review-status: rejected 优先,其次严格 live,其余全部 pending", () => {
  assert.equal(review.reviewDisplayState({ reviewStatus: "rejected", approvedVersion: 1, reviewVersion: 1 }), "rejected");
  assert.equal(review.reviewDisplayState({ reviewStatus: "approved", approvedVersion: 3, reviewVersion: 3 }), "live");
  assert.equal(review.reviewDisplayState({ reviewStatus: "approved", approvedVersion: 2, reviewVersion: 3 }), "pending");
  assert.equal(review.reviewDisplayState({ reviewStatus: "approved" }), "pending");
  assert.equal(review.reviewDisplayState({ reviewStatus: "pending_review", approvedVersion: 0, reviewVersion: 1 }), "pending");
});

// ---- product-hydrate ----

test("product-hydrate: 兼容 re-export surface 完整(调用方无需改 import)", () => {
  for (const key of ["PRICING_MODELS", "PRODUCT_IMAGE_FALLBACK", "PRODUCT_THEMES", "PUBLISHED_PRODUCT_SQL", "PUBLISHED_PRODUCT_SQL_QUALIFIED", "THEME_ACCENTS", "normalizePricingModel", "normalizeProductTheme"]) {
    assert.ok(key in hydrate, `缺少 re-export: ${key}`);
  }
  assert.equal(hydrate.PRODUCT_THEMES, policy.PRODUCT_THEMES);
  assert.equal(hydrate.THEME_ACCENTS, policy.THEME_ACCENTS);
});

test("product-hydrate: hydrateProductRow 的水合规则", () => {
  const product = hydrate.hydrateProductRow(
    { id: "7", ownerName: "alice", title: "T", description: "D", category: "C", coverTheme: "mint", price: "12", pricingModel: "one_time", likes: undefined, plays: null },
    { release: "2026.08", tags: ["a"] },
  );
  assert.equal(product.id, 7);
  assert.equal(product.ownerInitial, "a");
  assert.equal(product.coverTheme, "mint");
  assert.equal(product.accent, policy.THEME_ACCENTS.mint);
  assert.equal(product.pricingModel, "one_time");
  assert.equal(product.price, 12);
  assert.equal(product.likes, 0);
  assert.equal(product.image, policy.PRODUCT_IMAGE_FALLBACK);
  assert.equal(product.demoType, "prototype");
  assert.equal(product.demoUrl, null);

  // 非法主题/定价走 normalize 回落;显式 ownerInitial 与 fallbackImage 优先
  const fallback = hydrate.hydrateProductRow(
    { id: 1, ownerName: "", title: "", description: "", category: "", coverTheme: "neon", pricingModel: "subscription", imageUrl: "https://img.example/x.png" },
    { release: "r", tags: [], ownerInitial: "造", fallbackImage: "https://img.example/fallback.png" },
  );
  assert.equal(fallback.coverTheme, "coral");
  assert.equal(fallback.pricingModel, "free");
  assert.equal(fallback.ownerInitial, "造");
  assert.equal(fallback.image, "https://img.example/x.png");
});

// ---- format ----

test("format: formatZhDateTime 的 SQLite-UTC 语义与 fail-closed 回落", () => {
  // SQLite "YYYY-MM-DD HH:MM:SS" 视为 UTC,渲染为 Asia/Shanghai
  assert.equal(format.formatZhDateTime("2026-08-30 16:00:00"), "08/31 00:00");
  assert.equal(format.formatZhDateTime("2026-01-01T00:00:00Z"), "01/01 08:00");
  assert.equal(format.formatZhDateTime(""), "时间未记录");
  assert.equal(format.formatZhDateTime(null), "时间未记录");
  assert.equal(format.formatZhDateTime("not-a-date"), "not-a-date");
});

test("format: memberInitial 取首字、空名回落、统一大写", () => {
  assert.equal(format.memberInitial("alice"), "A");
  assert.equal(format.memberInitial(" 张三 "), "张");
  assert.equal(format.memberInitial(""), "造");
  assert.equal(format.memberInitial("   "), "造");
});

// ---- errors ----

test("errors: 命名 classifier 正反两向命中且互不串码", () => {
  const cases = [
    [errors.isUniqueConstraintError, "UNIQUE constraint failed: members.email", "CHECK constraint failed: x"],
    [errors.isWalletBalanceError, "CHECK constraint failed: wallet_balance_nonnegative", "UNIQUE constraint failed"],
    [errors.isWalletPendingError, "CHECK constraint failed: wallet_pending_nonnegative", "wallet_balance_nonnegative"],
    [errors.isExternalDemoImmutableError, "RAISE: external_demo_requires_immutable_package", "product_review_not_pending"],
    [errors.isProductReviewNotPendingError, "RAISE: product_review_not_pending", "invitation_not_available"],
    [errors.isModerationRemediationNotAllowedError, "moderation_remediation_not_allowed", "product_review_not_pending"],
    [errors.isInvitationRegistrationRequiredError, "oauth_registration_invitation_required", "invitation_not_available"],
    [errors.isInvitationUnavailableError, "invitation_not_available", "oauth_registration_invitation_required"],
    [errors.isProductCommentNotApprovedError, "product_comment_product_not_approved", "post_comment_post_not_visible"],
    [errors.isPostCommentNotVisibleError, "post_comment_post_not_visible", "product_comment_product_not_approved"],
    [errors.isProductLikeNotApprovedError, "product_like_product_not_approved", "product_review_not_pending"],
  ];
  for (const [classifier, hit, miss] of cases) {
    assert.ok(classifier(new Error(hit)), `${classifier.name} 应命中 ${hit}`);
    assert.ok(!classifier(new Error(miss)), `${classifier.name} 不应命中 ${miss}`);
    assert.ok(!classifier(new Error("")), `${classifier.name} 不应命中空消息`);
    assert.ok(!classifier("string-not-error"), `${classifier.name} 对非 Error 必须 false`);
    assert.ok(!classifier(null), `${classifier.name} 对 null 必须 false`);
  }
});

test("errors: jsonError 映射顺序与形状不变(auth → coded → wallet CHECK → UNIQUE → 500)", async () => {
  const read = async (res) => ({ status: res.status, body: await res.json() });

  assert.deepEqual(await read(errors.jsonError(new errors.AuthRequiredError())), { status: 401, body: { error: "auth_required" } });

  const coded = Object.assign(new Error("boom"), { code: "turnstile_invalid", status: 403 });
  assert.deepEqual(await read(errors.jsonError(coded)), { status: 403, body: { error: "turnstile_invalid" } });
  // coded error 即使消息里带约束文本也必须走自己的 code/status(顺序契约)
  const codedWithMarker = Object.assign(new Error("UNIQUE constraint failed: x"), { code: "rate_limited", status: 429 });
  assert.deepEqual(await read(errors.jsonError(codedWithMarker)), { status: 429, body: { error: "rate_limited" } });

  assert.deepEqual(await read(errors.jsonError(new Error("CHECK constraint failed: wallet_balance_nonnegative"))), { status: 409, body: { error: "insufficient_balance" } });
  assert.deepEqual(await read(errors.jsonError(new Error("CHECK constraint failed: wallet_pending_nonnegative"))), { status: 409, body: { error: "insufficient_balance" } });
  assert.deepEqual(await read(errors.jsonError(new Error("UNIQUE constraint failed: t.c"))), { status: 409, body: { error: "already_completed" } });

  // 未知错误:500 server_error,且响应体不得泄露内部 message(约束名/表结构)
  const unknown = await read(errors.jsonError(new Error("CHECK constraint failed: some_secret_table_detail")));
  assert.equal(unknown.status, 500);
  assert.deepEqual(unknown.body, { error: "server_error" });
});

// ---- docs 缓存写入口契约 ----

test("docs-cache: 全部 docs 写入口必须失效 isolate 文档缓存", async () => {
  const { readFileSync } = await import("node:fs");
  // 封面/横幅 UPDATE 曾在 41702d2 绕过失效,导致上传成功后当前 isolate 继续展示旧图。
  const cover = readFileSync(new URL("../app/api/docs/cover/route.ts", import.meta.url), "utf8");
  assert.ok(cover.includes("invalidateDocDataCache"), "/api/docs/cover 写回 docs 后必须失效文档缓存");
  // createDoc/updateDoc/deleteDoc 三处写路径各调用一次失效。
  const docs = readFileSync(new URL("../app/api/_lib/docs.ts", import.meta.url), "utf8");
  const calls = docs.match(/invalidateDocDataCache\(\);/g) ?? [];
  assert.equal(calls.length, 3, `docs.ts 应有 3 处写后失效调用,实际 ${calls.length}`);
});
