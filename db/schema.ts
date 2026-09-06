import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const members = sqliteTable("members", {
  email: text("email").primaryKey(),
  displayName: text("display_name").notNull(),
  bio: text("bio").notNull().default("正在把一个想法变成作品。"),
  location: text("location").notNull().default("杭州"),
  website: text("website").notNull().default(""),
  reputation: integer("reputation").notNull().default(0),
  joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  // 会员号:展示用数字身份(如 #0001)。可空——回填覆盖全部历史行,
  // 新成员由 trigger members_assign_member_number 自动赋 MAX+1,
  // UNIQUE 索引兜底。应用层不应直接写入此列。
  memberNumber: integer("member_number"),
}, (table) => [
  uniqueIndex("members_member_number_idx").on(table.memberNumber),
]);

export const oauthAccounts = sqliteTable(
  "oauth_accounts",
  {
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    email: text("email").notNull().references(() => members.email),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
    index("oauth_accounts_email_idx").on(table.email),
    check("oauth_provider_valid", sql`${table.provider} in ('google', 'github', 'email')`),
  ],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userEmail: text("user_email").notNull().references(() => members.email),
    provider: text("provider").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("auth_sessions_expiry_idx").on(table.expiresAt),
    check("session_provider_valid", sql`${table.provider} in ('google', 'github', 'email')`),
  ],
);

export const invitationCodes = sqliteTable(
  "invitation_codes",
  {
    id: text("id").primaryKey(),
    codeHash: text("code_hash").notNull().unique(),
    label: text("label").notNull().default(""),
    maxUses: integer("max_uses").notNull().default(1),
    usesCount: integer("uses_count").notNull().default(0),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastUsedAt: text("last_used_at"),
  },
  (table) => [
    index("invitation_codes_status_idx").on(table.revokedAt, table.expiresAt),
    check("invitation_codes_max_uses_valid", sql`${table.maxUses} between 1 and 25`),
    check("invitation_codes_uses_valid", sql`${table.usesCount} between 0 and ${table.maxUses}`),
  ],
);

export const invitationRedemptions = sqliteTable(
  "invitation_redemptions",
  {
    id: text("id").primaryKey(),
    invitationId: text("invitation_id")
      .notNull()
      .references(() => invitationCodes.id),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    userEmail: text("user_email")
      .notNull()
      .references(() => members.email),
    redeemedAt: text("redeemed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("invitation_redemptions_account_idx").on(table.provider, table.providerAccountId),
    index("invitation_redemptions_invitation_idx").on(table.invitationId, table.redeemedAt),
    check("invitation_redemptions_provider_valid", sql`${table.provider} in ('google', 'github', 'email')`),
  ],
);

// 邮箱验证码登录:一次发码请求一行,验证码只存 SHA-256 哈希,10 分钟过期,
// 错误尝试累计 5 次锁定,验证成功原子置 consumed_at。email 不设外键——验证码
// 在成员存在之前就要能发(新用户首登);邀请码哈希随行携带,verify 时交给
// ensureEmailUser 的原子批次消费(与 OAuth 注册共用 oauth_registration_invitation_guard
// 触发器门槛)。request_ip_hash 只用于事后审计,不用于判定。
export const emailLoginCodes = sqliteTable(
  "email_login_codes",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    invitationHash: text("invitation_hash"),
    requestIpHash: text("request_ip_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("email_login_codes_email_idx").on(table.email, table.createdAt)],
);

export const wallets = sqliteTable(
  "wallets",
  {
    userEmail: text("user_email")
      .primaryKey()
      .references(() => members.email),
    balance: integer("balance").notNull().default(0),
    pendingBalance: integer("pending_balance").notNull().default(0),
    lifetimeEarned: integer("lifetime_earned").notNull().default(0),
    lifetimeSpent: integer("lifetime_spent").notNull().default(0),
    status: text("status").notNull().default("active"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check("wallet_balance_nonnegative", sql`${table.balance} >= 0`),
    check("wallet_pending_nonnegative", sql`${table.pendingBalance} >= 0`),
    check("wallet_status_valid", sql`${table.status} in ('active', 'review', 'frozen')`),
  ],
);

export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerEmail: text("owner_email")
      .notNull()
      .references(() => members.email),
    ownerName: text("owner_name").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    demoType: text("demo_type").notNull().default("prototype"),
    demoUrl: text("demo_url"),
    imageUrl: text("image_url"),
    coverTheme: text("cover_theme").notNull().default("coral"),
    price: integer("price").notNull().default(0),
    pricingModel: text("pricing_model").notNull().default("free"),
    likesCount: integer("likes_count").notNull().default(0),
    playsCount: integer("plays_count").notNull().default(0),
    status: text("status").notNull().default("pending_review"),
    moderationStatus: text("moderation_status").notNull().default("visible"),
    reviewStatus: text("review_status").notNull().default("pending_review"),
    reviewVersion: integer("review_version").notNull().default(1),
    approvedVersion: integer("approved_version").notNull().default(0),
    reviewedBy: text("reviewed_by").references(() => members.email),
    reviewedAt: text("reviewed_at"),
    reviewNote: text("review_note").notNull().default(""),
    submittedAt: text("submitted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("products_created_at_idx").on(table.createdAt),
    index("products_owner_idx").on(table.ownerEmail),
    index("products_review_queue_idx").on(table.reviewStatus, table.submittedAt),
    check("products_price_nonnegative", sql`${table.price} >= 0`),
    check("products_pricing_model_valid", sql`${table.pricingModel} in ('free', 'one_time', 'per_use')`),
    check("products_review_status_valid", sql`${table.reviewStatus} in ('pending_review', 'approved', 'rejected')`),
    check("products_review_versions_valid", sql`${table.reviewVersion} >= 1 and ${table.approvedVersion} >= 0 and ${table.approvedVersion} <= ${table.reviewVersion}`),
  ],
);

export const productReviewDecisions = sqliteTable(
  "product_review_decisions",
  {
    id: text("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    reviewVersion: integer("review_version").notNull(),
    reviewerEmail: text("reviewer_email")
      .notNull()
      .references(() => members.email),
    decision: text("decision").notNull(),
    note: text("note").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("product_review_decisions_version_idx").on(table.productId, table.reviewVersion),
    index("product_review_decisions_reviewer_idx").on(table.reviewerEmail, table.createdAt),
    check("product_review_decision_valid", sql`${table.decision} in ('approved', 'rejected')`),
  ],
);

export const fruitOperations = sqliteTable(
  "fruit_operations",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("posted"),
    idempotencyKey: text("idempotency_key").notNull(),
    actorEmail: text("actor_email").references(() => members.email),
    targetEmail: text("target_email").references(() => members.email),
    amount: integer("amount").notNull(),
    referenceType: text("reference_type").notNull(),
    referenceId: text("reference_id").notNull(),
    relatedOperationId: text("related_operation_id"),
    description: text("description").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("fruit_operations_idempotency_idx").on(table.idempotencyKey),
    uniqueIndex("fruit_operations_refund_once_idx")
      .on(table.relatedOperationId)
      .where(sql`${table.kind} = 'refund'`),
    uniqueIndex("fruit_operations_external_refund_once_idx")
      .on(table.relatedOperationId)
      .where(sql`${table.kind} = 'external_refund'`),
    index("fruit_operations_actor_idx").on(table.actorEmail, table.createdAt),
    index("fruit_operations_target_idx").on(table.targetEmail, table.createdAt),
    check("fruit_operations_amount_positive", sql`${table.amount} > 0`),
    check("fruit_operations_status_valid", sql`${table.status} in ('posted', 'reversed')`),
  ],
);

export const fruitEntries = sqliteTable(
  "fruit_entries",
  {
    operationId: text("operation_id")
      .notNull()
      .references(() => fruitOperations.id),
    userEmail: text("user_email")
      .notNull()
      .references(() => members.email),
    bucket: text("bucket").notNull(),
    delta: integer("delta").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.operationId, table.userEmail, table.bucket] }),
    index("fruit_entries_user_idx").on(table.userEmail, table.createdAt),
    check("fruit_entries_bucket_valid", sql`${table.bucket} in ('available', 'pending')`),
    check("fruit_entries_delta_nonzero", sql`${table.delta} <> 0`),
  ],
);

export const productOrders = sqliteTable(
  "product_orders",
  {
    id: text("id").primaryKey(),
    buyerEmail: text("buyer_email")
      .notNull()
      .references(() => members.email),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    sellerEmail: text("seller_email")
      .notNull()
      .references(() => members.email),
    pricingModel: text("pricing_model").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").notNull().default("paid"),
    idempotencyKey: text("idempotency_key").notNull(),
    purchaseOperationId: text("purchase_operation_id")
      .notNull()
      .references(() => fruitOperations.id),
    refundOperationId: text("refund_operation_id").references(() => fruitOperations.id),
    purchasedAt: text("purchased_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    refundableUntil: text("refundable_until"),
    availableAt: text("available_at").notNull(),
    settledAt: text("settled_at"),
    refundedAt: text("refunded_at"),
  },
  (table) => [
    uniqueIndex("product_orders_idempotency_idx").on(table.buyerEmail, table.idempotencyKey),
    index("product_orders_buyer_idx").on(table.buyerEmail, table.purchasedAt),
    index("product_orders_seller_idx").on(table.sellerEmail, table.status, table.availableAt),
    check("product_orders_amount_positive", sql`${table.amount} > 0`),
    check("product_orders_pricing_valid", sql`${table.pricingModel} in ('one_time', 'per_use')`),
    check("product_orders_status_valid", sql`${table.status} in ('paid', 'settled', 'refunded')`),
  ],
);

export const productEntitlements = sqliteTable(
  "product_entitlements",
  {
    buyerEmail: text("buyer_email")
      .notNull()
      .references(() => members.email),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    orderId: text("order_id")
      .notNull()
      .references(() => productOrders.id),
    status: text("status").notNull().default("active"),
    grantedAt: text("granted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    primaryKey({ columns: [table.buyerEmail, table.productId] }),
    check("product_entitlements_status_valid", sql`${table.status} in ('active', 'revoked')`),
  ],
);

export const fruitRewardEvents = sqliteTable(
  "fruit_reward_events",
  {
    id: text("id").primaryKey(),
    recipientEmail: text("recipient_email")
      .notNull()
      .references(() => members.email),
    actorEmail: text("actor_email")
      .notNull()
      .references(() => members.email),
    kind: text("kind").notNull(),
    targetType: text("target_type").notNull(),
    targetRef: text("target_ref").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").notNull(),
    reason: text("reason").notNull(),
    operationId: text("operation_id").references(() => fruitOperations.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("fruit_reward_once_idx").on(table.actorEmail, table.kind, table.targetType, table.targetRef),
    index("fruit_reward_actor_day_idx").on(table.actorEmail, table.createdAt),
    index("fruit_reward_recipient_day_idx").on(table.recipientEmail, table.createdAt),
    check("fruit_reward_amount_nonnegative", sql`${table.amount} >= 0`),
    check("fruit_reward_status_valid", sql`${table.status} in ('granted', 'suppressed')`),
  ],
);

export const fruitRiskEvents = sqliteTable(
  "fruit_risk_events",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email")
      .notNull()
      .references(() => members.email),
    kind: text("kind").notNull(),
    severity: text("severity").notNull(),
    evidence: text("evidence").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    index("fruit_risk_user_idx").on(table.userEmail, table.status, table.createdAt),
    check("fruit_risk_severity_valid", sql`${table.severity} in ('low', 'medium', 'high')`),
    check("fruit_risk_status_valid", sql`${table.status} in ('open', 'resolved', 'dismissed')`),
  ],
);

export const oauthProviderClients = sqliteTable(
  "oauth_provider_clients",
  {
    clientId: text("client_id").primaryKey(),
    ownerEmail: text("owner_email").notNull().references(() => members.email),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    websiteUrl: text("website_url").notNull(),
    clientType: text("client_type").notNull(),
    clientSecretHash: text("client_secret_hash"),
    allowedScopes: text("allowed_scopes").notNull(),
    status: text("status").notNull().default("active"),
    reviewStatus: text("review_status").notNull().default("unverified"),
    writeAccessApproved: integer("write_access_approved").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("oauth_provider_clients_owner_idx").on(table.ownerEmail, table.createdAt),
    check("oauth_provider_clients_type_valid", sql`${table.clientType} in ('public', 'confidential')`),
    check("oauth_provider_clients_status_valid", sql`${table.status} in ('active', 'revoked')`),
    check("oauth_provider_clients_review_valid", sql`${table.reviewStatus} in ('unverified', 'verified', 'rejected')`),
    check("oauth_provider_clients_write_approval_valid", sql`${table.writeAccessApproved} in (0, 1)`),
  ],
);

export const oauthProviderRedirectUris = sqliteTable(
  "oauth_provider_redirect_uris",
  {
    clientId: text("client_id").notNull().references(() => oauthProviderClients.clientId),
    redirectUri: text("redirect_uri").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.clientId, table.redirectUri] })],
);

export const oauthProviderAuthorizationRequests = sqliteTable(
  "oauth_provider_authorization_requests",
  {
    requestHash: text("request_hash").primaryKey(),
    clientId: text("client_id").notNull().references(() => oauthProviderClients.clientId),
    userEmail: text("user_email").notNull().references(() => members.email),
    redirectUri: text("redirect_uri").notNull(),
    scope: text("scope").notNull(),
    state: text("state").notNull(),
    nonce: text("nonce"),
    codeChallenge: text("code_challenge").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("oauth_provider_requests_expiry_idx").on(table.expiresAt)],
);

export const oauthProviderAuthorizationCodes = sqliteTable(
  "oauth_provider_authorization_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    requestHash: text("request_hash").notNull().references(() => oauthProviderAuthorizationRequests.requestHash),
    clientId: text("client_id").notNull().references(() => oauthProviderClients.clientId),
    userEmail: text("user_email").notNull().references(() => members.email),
    redirectUri: text("redirect_uri").notNull(),
    scope: text("scope").notNull(),
    nonce: text("nonce"),
    codeChallenge: text("code_challenge").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("oauth_provider_codes_request_idx").on(table.requestHash),
    index("oauth_provider_codes_expiry_idx").on(table.expiresAt),
  ],
);

export const oauthProviderAccessTokens = sqliteTable(
  "oauth_provider_access_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    clientId: text("client_id").notNull().references(() => oauthProviderClients.clientId),
    userEmail: text("user_email").notNull().references(() => members.email),
    scope: text("scope").notNull(),
    authorizationCodeHash: text("authorization_code_hash").references(() => oauthProviderAuthorizationCodes.codeHash),
    refreshParentHash: text("refresh_parent_hash"),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("oauth_provider_access_code_once_idx").on(table.authorizationCodeHash),
    uniqueIndex("oauth_provider_access_refresh_once_idx").on(table.refreshParentHash),
    index("oauth_provider_access_lookup_idx").on(table.clientId, table.userEmail, table.expiresAt),
  ],
);

export const oauthProviderRefreshTokens = sqliteTable(
  "oauth_provider_refresh_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    clientId: text("client_id").notNull().references(() => oauthProviderClients.clientId),
    userEmail: text("user_email").notNull().references(() => members.email),
    scope: text("scope").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    replacedByHash: text("replaced_by_hash"),
    familyId: text("family_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("oauth_provider_refresh_lookup_idx").on(table.clientId, table.userEmail, table.expiresAt),
    index("oauth_provider_refresh_family_idx").on(table.familyId),
  ],
);

export const oauthProviderConsents = sqliteTable(
  "oauth_provider_consents",
  {
    clientId: text("client_id").notNull().references(() => oauthProviderClients.clientId),
    userEmail: text("user_email").notNull().references(() => members.email),
    scope: text("scope").notNull(),
    grantedAt: text("granted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    revokedAt: text("revoked_at"),
  },
  (table) => [primaryKey({ columns: [table.clientId, table.userEmail] })],
);

export const oauthProviderSubjects = sqliteTable(
  "oauth_provider_subjects",
  {
    clientId: text("client_id").notNull().references(() => oauthProviderClients.clientId),
    userEmail: text("user_email").notNull().references(() => members.email),
    subject: text("subject").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.clientId, table.userEmail] }),
    uniqueIndex("oauth_provider_subject_unique_idx").on(table.subject),
  ],
);

export const oauthProviderSigningKeys = sqliteTable(
  "oauth_provider_signing_keys",
  {
    kid: text("kid").primaryKey(),
    algorithm: text("algorithm").notNull().default("ES256"),
    privateJwk: text("private_jwk").notNull(),
    publicJwk: text("public_jwk").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("oauth_provider_one_active_key_idx")
      .on(table.status)
      .where(sql`${table.status} = 'active'`),
    check("oauth_provider_key_status_valid", sql`${table.status} in ('active', 'retired')`),
  ],
);

export const externalFruitPayments = sqliteTable(
  "external_fruit_payments",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().references(() => oauthProviderClients.clientId),
    payerEmail: text("payer_email").notNull().references(() => members.email),
    merchantEmail: text("merchant_email").notNull().references(() => members.email),
    externalReference: text("external_reference").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    pricingModel: text("pricing_model").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    returnUri: text("return_uri").notNull(),
    purchaseOperationId: text("purchase_operation_id").references(() => fruitOperations.id),
    refundOperationId: text("refund_operation_id").references(() => fruitOperations.id),
    approvalChallengeHash: text("approval_challenge_hash"),
    expiresAt: text("expires_at").notNull(),
    refundableUntil: text("refundable_until"),
    availableAt: text("available_at"),
    paidAt: text("paid_at"),
    settledAt: text("settled_at"),
    refundedAt: text("refunded_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("external_fruit_payments_idempotency_idx").on(table.clientId, table.payerEmail, table.idempotencyKey),
    index("external_fruit_payments_client_idx").on(table.clientId, table.createdAt),
    index("external_fruit_payments_merchant_idx").on(table.merchantEmail, table.status, table.availableAt),
    check("external_fruit_payments_amount_valid", sql`${table.amount} between 1 and 99`),
    check("external_fruit_payments_pricing_valid", sql`${table.pricingModel} in ('one_time', 'per_use')`),
    check("external_fruit_payments_status_valid", sql`${table.status} in ('pending', 'paid', 'settled', 'refunded', 'cancelled', 'expired')`),
  ],
);

export const externalFruitEntitlements = sqliteTable(
  "external_fruit_entitlements",
  {
    clientId: text("client_id").notNull().references(() => oauthProviderClients.clientId),
    payerEmail: text("payer_email").notNull().references(() => members.email),
    externalReference: text("external_reference").notNull(),
    paymentId: text("payment_id").notNull().references(() => externalFruitPayments.id),
    status: text("status").notNull().default("active"),
    grantedAt: text("granted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    primaryKey({ columns: [table.clientId, table.payerEmail, table.externalReference] }),
    check("external_fruit_entitlements_status_valid", sql`${table.status} in ('active', 'revoked')`),
  ],
);

export const posts = sqliteTable(
  "posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerEmail: text("owner_email")
      .notNull()
      .references(() => members.email),
    ownerName: text("owner_name").notNull(),
    content: text("content").notNull(),
    productId: integer("product_id").references(() => products.id),
    linkedProductRef: text("linked_product_ref"),
    imageUrl: text("image_url"),
    postType: text("post_type").notNull().default("记录"),
    likesCount: integer("likes_count").notNull().default(0),
    commentsCount: integer("comments_count").notNull().default(0),
    moderationStatus: text("moderation_status").notNull().default("visible"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("posts_created_at_idx").on(table.createdAt)],
);

export const productLikes = sqliteTable(
  "product_likes",
  {
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    userEmail: text("user_email")
      .notNull()
      .references(() => members.email),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.productId, table.userEmail] })],
);

export const dailyClaims = sqliteTable(
  "daily_claims",
  {
    userEmail: text("user_email")
      .notNull()
      .references(() => members.email),
    claimDate: text("claim_date").notNull(),
    amount: integer("amount").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.userEmail, table.claimDate] })],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userEmail: text("user_email")
      .notNull()
      .references(() => members.email),
    delta: integer("delta").notNull(),
    type: text("type").notNull(),
    description: text("description").notNull(),
    referenceId: text("reference_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("transactions_user_idx").on(table.userEmail, table.createdAt),
    uniqueIndex("transactions_once_idx").on(
      table.userEmail,
      table.type,
      table.referenceId,
    ),
  ],
);

export const communityActions = sqliteTable(
  "community_actions",
  {
    userEmail: text("user_email")
      .notNull()
      .references(() => members.email),
    kind: text("kind").notNull(),
    targetRef: text("target_ref").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.userEmail, table.kind, table.targetRef] })],
);

export const collections = sqliteTable(
  "collections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userEmail: text("user_email")
      .notNull()
      .references(() => members.email),
    name: text("name").notNull(),
    color: text("color").notNull().default("coral"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("collections_user_idx").on(table.userEmail, table.createdAt)],
);

export const collectionItems = sqliteTable(
  "collection_items",
  {
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id),
    productRef: text("product_ref").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.collectionId, table.productRef] })],
);

export const comments = sqliteTable(
  "comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userEmail: text("user_email")
      .notNull()
      .references(() => members.email),
    ownerName: text("owner_name").notNull(),
    targetType: text("target_type").notNull(),
    targetRef: text("target_ref").notNull(),
    content: text("content").notNull(),
    moderationStatus: text("moderation_status").notNull().default("visible"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("comments_target_idx").on(table.targetType, table.targetRef, table.createdAt)],
);

export const incubationProjects = sqliteTable(
  "incubation_projects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userEmail: text("user_email")
      .notNull()
      .references(() => members.email),
    name: text("name").notNull(),
    projectType: text("project_type").notNull(),
    oneLiner: text("one_liner").notNull(),
    problem: text("problem").notNull(),
    progress: text("progress").notNull(),
    team: text("team").notNull(),
    need: text("need").notNull(),
    contact: text("contact").notNull(),
    status: text("status").notNull().default("资料审核"),
    currentTask: text("current_task").notNull().default("等待造场完成资料审核"),
    assignedOwner: text("assigned_owner"),
    nextAction: text("next_action").notNull().default("等待造场完成资料审核"),
    waitingReason: text("waiting_reason").notNull().default("申请已进入资料审核队列"),
    progressPercent: integer("progress_percent").notNull().default(12),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("incubation_projects_user_idx").on(table.userEmail, table.updatedAt)],
);

export const projectMaterials = sqliteTable(
  "project_materials",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id")
      .notNull()
      .references(() => incubationProjects.id),
    userEmail: text("user_email")
      .notNull()
      .references(() => members.email),
    name: text("name").notNull(),
    url: text("url").notNull(),
    kind: text("kind").notNull().default("FILE"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("project_materials_project_idx").on(table.projectId, table.createdAt)],
);

export const uploadedFiles = sqliteTable(
  "uploaded_files",
  {
    key: text("key").primaryKey(),
    ownerEmail: text("owner_email")
      .notNull()
      .references(() => members.email),
    originalName: text("original_name").notNull(),
    mediaType: text("media_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    visibility: text("visibility").notNull(),
    purpose: text("purpose").notNull(),
    sha256: text("sha256").notNull(),
    scanStatus: text("scan_status").notNull().default("pending"),
    scanEngine: text("scan_engine"),
    scanSignature: text("scan_signature"),
    quarantineKey: text("quarantine_key"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    scannedAt: text("scanned_at"),
  },
  (table) => [
    index("uploaded_files_owner_idx").on(table.ownerEmail, table.createdAt),
    index("uploaded_files_scan_status_idx").on(table.scanStatus, table.createdAt),
    check("uploaded_files_size_valid", sql`${table.byteSize} between 1 and 10485760`),
    check("uploaded_files_visibility_valid", sql`${table.visibility} in ('public', 'private')`),
    check("uploaded_files_purpose_valid", sql`${table.purpose} in ('general', 'product_cover', 'incubation_material', 'book_cover')`),
    check("uploaded_files_scan_status_valid", sql`${table.scanStatus} in ('pending', 'clean', 'infected', 'error')`),
  ],
);

export const incubationFeedback = sqliteTable(
  "incubation_feedback",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id").notNull().references(() => incubationProjects.id),
    authorEmail: text("author_email").notNull(),
    kind: text("kind").notNull().default("note"),
    content: text("content").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("incubation_feedback_project_idx").on(table.projectId, table.createdAt)],
);

export const apiRateLimits = sqliteTable(
  "api_rate_limits",
  {
    bucket: text("bucket").notNull(),
    windowStart: integer("window_start").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.bucket, table.windowStart] })],
);

export const contentReports = sqliteTable(
  "content_reports",
  {
    id: text("id").primaryKey(),
    reporterEmail: text("reporter_email").notNull().references(() => members.email),
    targetType: text("target_type").notNull(),
    targetRef: text("target_ref").notNull(),
    reason: text("reason").notNull(),
    details: text("details").notNull().default(""),
    status: text("status").notNull().default("pending"),
    resolution: text("resolution"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    uniqueIndex("content_reports_reporter_target_idx").on(table.reporterEmail, table.targetType, table.targetRef),
    index("content_reports_status_idx").on(table.status, table.createdAt),
  ],
);

export const adminAuditEvents = sqliteTable(
  "admin_audit_events",
  {
    id: text("id").primaryKey(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetRef: text("target_ref").notNull(),
    detail: text("detail").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("admin_audit_created_idx").on(table.createdAt)],
);

export const docs = sqliteTable(
  "docs",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    parentId: text("parent_id"),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull().default(""),
    visibility: text("visibility").notNull().default("private"),
    authorEmail: text("author_email")
      .notNull()
      .references(() => members.email),
    sortOrder: integer("sort_order").notNull().default(0),
    // 书架:一本书 = 一棵以 is_book=1 行为根的文档树,章节靠 parent_id 挂在其下。
    // is_book 缺省 0(普通文档),不放宽任何可见性/权限语义——纯展示性标记,非安全集合。
    isBook: integer("is_book").notNull().default(0),
    coverHue: integer("cover_hue").notNull().default(210),
    summary: text("summary").notNull().default(""),
    // 封面图片地址(/api/uploads/<key>),指向经 ClamAV 扫描 clean 的上传对象;
    // 空串 = 无封面,前端回退为 coverHue 渐变色。纯展示字段,不影响可见性/权限。
    coverImage: text("cover_image").notNull().default(""),
    // 横版横幅图(封面页顶部展示);与竖版 coverImage(书架卡片)并存。同样指向扫描 clean 的上传对象。
    bannerImage: text("banner_image").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("docs_parent_slug_idx").on(table.parentId, table.slug),
    index("docs_parent_sort_idx").on(table.parentId, table.sortOrder),
    index("docs_author_idx").on(table.authorEmail, table.updatedAt),
    index("docs_book_idx").on(table.isBook, table.sortOrder),
    check("docs_visibility_valid", sql`${table.visibility} in ('public', 'members', 'private')`),
  ],
);

// 阅读进度:每用户每书一条恢复点(章节 + 段落序号)。段落级精度靠客户端
// ReadingProgressTracker 给正文顶层块打 data-pp 序号后上报,跨设备同步。
// last_chapter_id 是否真为 book_id 的后代由 API 层验证(此处不加 DB 约束,
// 避免迁移期/脏数据阻塞写入);可见性同样由 API 层 fail-closed 把关。
export const readingProgress = sqliteTable(
  "reading_progress",
  {
    userEmail: text("user_email").notNull().references(() => members.email),
    bookId: text("book_id").notNull().references(() => docs.id),
    lastChapterId: text("last_chapter_id").notNull().references(() => docs.id),
    lastParagraph: integer("last_paragraph").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.userEmail, table.bookId] }),
    index("reading_progress_user_updated_idx").on(table.userEmail, table.updatedAt),
  ],
);

// ── Hyperknow Agent(1:1 复刻 agent.hyperknow.io 的学习 Agent)───────────────
// 三张表的归属列统一 FK → members.email(替代原复刻项目 store.json 的无归属
// 单文件库);越权由 API 层 fail-closed 404 把关,不依赖 DB 触发器(无资金语义,
// 无不可变账本需求)。
// 学习对话:每会话一行,history_json 存完整 [{role, content}] 轮次(与原版
// store.json 的 conversations 桶同构);列表/详情由 API 层按 user_email 隔离。
export const hkConversations = sqliteTable(
  "hk_conversations",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull().references(() => members.email),
    title: text("title").notNull(),
    starred: integer("starred").notNull().default(0),
    historyJson: text("history_json").notNull().default("[]"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("hk_conversations_user_updated_idx").on(table.userEmail, table.updatedAt)],
);

// 生成的课程蓝图(原 courses 桶):course_json 存完整三级结构(Unit → Lecture →
// Session,含 courseUuid);市场列表只出本人的课程,样例课程是代码内静态数据。
export const hkCourses = sqliteTable(
  "hk_courses",
  {
    uuid: text("uuid").primaryKey(),
    userEmail: text("user_email").notNull().references(() => members.email),
    title: text("title").notNull().default(""),
    courseJson: text("course_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("hk_courses_user_created_idx").on(table.userEmail, table.createdAt)],
);

// 白板讲座会话(原版存 WS 连接内存,Workers 无长连接 → 落库供举手插话端点
// 跨请求取回计划并做归属校验;板书播放节奏由客户端驱动,服务端无状态)。
export const hkWhiteboardSessions = sqliteTable("hk_whiteboard_sessions", {
  id: text("id").primaryKey(),
  userEmail: text("user_email").notNull().references(() => members.email),
  topic: text("topic").notNull(),
  planJson: text("plan_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
