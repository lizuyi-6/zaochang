import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const source = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
const panel = source("app/hosting/hosting-panel.tsx");
const admin = source("app/admin/admin-console.tsx");
const adminConfirm = source("app/admin/confirm-dialog.tsx");
const adminApi = source("app/admin/admin-api.ts");
const adminReview = source("app/admin/sections/review.tsx");
const adminHostingGrants = source("app/admin/sections/hosting-grants.tsx");
const productPage = source("app/product/[slug]/page.tsx");
const productExperience = source("app/product/[slug]/product-experience.tsx");
const profile = source("app/profile/page.tsx");
const createFlow = source("app/studio/new/create-product-flow.tsx");
const css = source("app/globals.css");
const hostingCopy = source("app/hosting/hosting-copy.ts");

test("托管查询 helper 只通过发布视图读取链接并检查 SQL 别名", () => {
  const helper = source("app/api/_lib/hosting-sql.ts");
  assert.match(helper, /if \(!\/\^\[a-z_\]\[a-z0-9_\]\*\$\/i\.test\(alias\)\) throw new Error\("invalid_sql_alias"\)/);
  assert.match(helper, /return `\(SELECT live_url FROM product_hosted_urls WHERE product_id = \$\{alias\}\.id\) AS hostedUrl`/);
  assert.doesNotMatch(panel, /live_url|liveUrl/);
  assert.doesNotMatch(admin + adminReview, /live_url|liveUrl/);
  assert.doesNotMatch(productExperience, /live_url|liveUrl/);
});

test("成员面板拒绝未授权上传并校验 ZIP 文件名与体积", () => {
  assert.match(panel, /if \(grant\?\.granted === false\) \{\s*return <p className="hosting-panel-invitation">静态托管目前仅对受邀成员开放<\/p>;/);
  assert.match(panel, /if \(!file\.name\.toLowerCase\(\)\.endsWith\("\.zip"\)\)/);
  assert.match(panel, /if \(file\.size > maxBundleBytes\)/);
  assert.match(panel, /const maxBundleBytes = 10 \* 1024 \* 1024/);
  assert.match(panel, /form\.set\("productId", String\(productId\)\)/);
  assert.match(panel, /form\.set\("file", selectedFile\)/);
  assert.match(panel, /fetch\("\/api\/hosting\/bundles", \{ method: "POST", body: form \}\)/);
});

test("成员面板读取双方约定的授权/状态接口，并按 hosting 嵌套字段解析", () => {
  assert.match(panel, /fetch\("\/api\/hosting\/grant", \{ cache: "no-store", signal: controller\.signal \}\)/);
  assert.match(panel, /fetch\(`\/api\/hosting\/products\/\$\{productId\}`, \{ cache: "no-store", signal: controller\.signal \}\)/);
  assert.match(panel, /type HostingStatusResponse = \{ reviewVersion: number; approvedVersion: number; hosting: HostingRecord \| null \}/);
  assert.match(panel, /typeof productPayload\.reviewVersion !== "number" \|\| typeof productPayload\.approvedVersion !== "number" \|\| !\("hosting" in productPayload\)/);
  assert.match(panel, /const nextHosting = productPayload\.hosting as HostingRecord \| null/);
});

test("成员面板只为非终态安排轮询并清除未触发的定时器", () => {
  assert.match(panel, /function shouldPollHosting\(hosting: HostingRecord \| null\): hosting is HostingRecord \{[\s\S]*if \(hosting\.desired === "removed"\) return hosting\.state !== "removed";[\s\S]*return !\["live", "removed", "failed"\]\.includes\(hosting\.state\);/);
  assert.match(panel, /if \(shouldPollHosting\(nextHosting\)\) \{\s*timer = window\.setTimeout\(\(\) => \{ void load\(false\); \}, 5000\);/);
  assert.match(panel, /return \(\) => \{[\s\S]*if \(timer !== undefined\) window\.clearTimeout\(timer\);/);
});

test("成员面板只在待审核/上线中展示审核预览链接，上线后以正式链接取代", () => {
  assert.match(panel, /\{hosting\.previewUrl && \(hosting\.state === "staged" \|\| hosting\.state === "promoting"\) && <div className="hosting-panel-preview"><a href=\{hosting\.previewUrl\}/);
  // 正式链接不依赖预览链接是否出现
  assert.match(panel, /\{hostedUrl && <a className="hosting-panel-live-link"/);
});

test("产品页按 p 别名查询视图，页面只使用返回的 hostedUrl", () => {
  assert.match(productPage, /hostedUrlSelect\("p"\)/);
  assert.match(productPage, /FROM products p WHERE p\.id = \? AND \$\{PUBLISHED_PRODUCT_SQL_QUALIFIED\}/);
  assert.doesNotMatch(productPage, /product_hostings|live_url|liveUrl/);
  assert.match(productPage, /hostedUrl: typeof row\.hostedUrl === "string" \? row\.hostedUrl : null/);
});

test("产品页托管链接只接受 HTTPS 且主机后缀正确，并带安全 rel", () => {
  assert.match(productExperience, /url\.protocol !== "https:" \|\| !url\.hostname\.endsWith\("\.page\.stepcloud\.com"\)/);
  assert.match(productExperience, /\{hostedUrl && <div className="product-hosted-site"><a href=\{hostedUrl\} target="_blank" rel="noopener noreferrer nofollow">访问托管站点/);
  assert.match(productExperience, /该站点由作者托管在第三方平台，造场不运行其代码/);
});

test("管理员批准保留外链限制，并要求托管 state 为 staged 或 live", () => {
  assert.match(adminApi, /export function approvalBlockReason\(hosting: AdminHosting \| null\): string \{\s*if \(!hosting \|\| hosting\.state === "staged" \|\| hosting\.state === "live"\) return ""/);
  assert.match(adminReview, /disabled=\{hasExternalDemo \|\| hasExternalImage \|\| Boolean\(hostingReason\) \|\| noteTooShort/);
  assert.match(adminApi, /"托管部署失败"/);
  assert.match(adminApi, /"托管包尚未部署完成"/);
  assert.match(adminReview, /hasExternalDemo \|\| hasExternalImage \? "外链不可批准"/);
});

test("移除托管复用审核备注并发送契约要求的三个字段", () => {
  assert.match(admin, /reviewProduct = useCallback\(\(action: "approve_product" \| "reject_product" \| "remove_hosting"/);
  assert.match(admin, /targetRef: String\(product\.id\), note: reason/);
  assert.match(admin, /action === "remove_hosting" \? "已提交托管站点移除请求，并写入审计记录。"/);
});

test("授权区使用约定路由与字段，并在撤销前说明站点影响", () => {
  assert.match(admin, /adminRequest<\{ grants: HostingGrant\[\] \}>\("\/api\/admin\/hosting-grants"/);
  assert.match(admin, /runMutation\("hosting-grant", "托管授权未保存", "\/api\/admin\/hosting-grants", \{ \.\.\.hostingGrantDraft, email: hostingGrantDraft\.email\.trim\(\) \}, "托管授权已保存。", "POST"\)/);
  assert.match(admin, /hosting-revoke:\$\{grant\.memberEmail\}[\s\S]*email: grant\.memberEmail, reason[\s\S]*"DELETE"/);
  assert.match(adminHostingGrants, /撤销授权也会提交移除该会员托管站点的请求/);
  assert.match(admin, /section === "hosting"/);
});

test("常见包错误有可操作中文，ambiguous 明确要求人工核对", () => {
  assert.match(hostingCopy, /bundle_missing_index: "压缩包根目录必须有 index\.html。"/);
  assert.match(hostingCopy, /bundle_extension_forbidden: "包含不允许的文件类型\(如 \.php\/\.sh\/\.exe\)，请移除后重试。"/);
  assert.match(hostingCopy, /ambiguous: "需要人工核对，已通知管理员。"/);
  assert.match(panel, /unknownIssueCode && <small>错误码：\{unknownIssueCode\}<\/small>/);
});

test("预览说明链接持有者可访问，移除请求验证 DELETE 返回字段", () => {
  assert.match(panel, /预览链接持有者可访问，仅用于你和审核员审阅；到期自动失效。/);
  assert.match(panel, /fetch\(`\/api\/hosting\/products\/\$\{productId\}`, \{ method: "DELETE" \}\)/);
  assert.match(panel, /if \(!payload\?\.ok\) throw new Error\("invalid_remove_response"\)/);
});

test("个人主页只查询当前成员的项目，并在每个项目卡片挂载面板", () => {
  assert.match(profile, /SELECT id, title, status,[\s\S]*FROM products WHERE owner_email = \?/);
  assert.match(profile, /<HostingPanel productId=\{Number\(project\.id\)\} productTitle=\{String\(project\.title\)\} \/>/);
  assert.match(profile, /const isPublished = project\.status === "published"[\s\S]*project\.approvedVersion === project\.reviewVersion/);
});

test("创建成功态从创建响应取项目 ID 并提供内联托管入口", () => {
  assert.match(createFlow, /const result = await response\.json\(\)\.catch\(\(\) => null\) as \{ product\?: \{ id\?: unknown \} \} \| null/);
  assert.match(createFlow, /Number\.isSafeInteger\(result\?\.product\?\.id\)\) setCreatedProductId/);
  assert.match(createFlow, /<HostingPanel productId=\{createdProductId\} productTitle=\{title\} \/>/);
});

test("新样式在 900px 与窄屏规则下允许收缩和换行", () => {
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*\.profile-owned-projects, \.profile-project-card, \.hosting-panel \{ max-width: 100%; \}/);
  assert.match(css, /\.profile-project-card \{[^}]*min-width: 0/);
  assert.match(css, /\.admin-hosting-grant-form, \.admin-invitation-form \{[^}]*min-width: 0/);
  assert.match(css, /\.admin-product-hosting code \{[^}]*overflow-wrap: anywhere/);
});

test("管理台桌面侧栏与移动横向标签切换，页面裁切横向溢出", () => {
  assert.match(css, /\.admin-console \{[^}]*overflow-x: clip/);
  assert.match(css, /\.admin-sidebar \{[^}]*position: sticky/);
  assert.match(css, /@media \(max-width: 899px\) \{[\s\S]*?\.admin-sidebar \{[^}]*display: flex;[^}]*overflow-x: auto;[^}]*position: static/);
  assert.match(css, /@media \(max-width: 768px\) \{[\s\S]*?\.admin-sidebar \{[^}]*margin-inline/);
  assert.match(admin, /data-section=\{id\}/);
});

test("破坏性操作确认框提供焦点管理、Esc 关闭和必填理由", () => {
  assert.match(adminConfirm, /role="dialog" aria-modal="true"/);
  assert.match(adminConfirm, /previousFocus\.current\?\.focus\(\)/);
  assert.match(adminConfirm, /event\.key === "Escape"/);
  assert.match(adminConfirm, /event\.key !== "Tab"/);
  assert.match(adminConfirm, /reason\.trim\(\)\.length >= 4/);
  assert.match(admin, /const resolveRisk =[\s\S]*?setConfirmRequest\(/);
  assert.match(admin, /submit: async \(reason\) => \{ await runModeration\(action, risk\.id, reason\); \}/);
});
