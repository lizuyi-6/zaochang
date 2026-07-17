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
});

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
    check("oauth_provider_valid", sql`${table.provider} in ('google', 'github')`),
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
    check("session_provider_valid", sql`${table.provider} in ('google', 'github')`),
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
    check("invitation_redemptions_provider_valid", sql`${table.provider} in ('google', 'github')`),
  ],
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
    check("uploaded_files_purpose_valid", sql`${table.purpose} in ('general', 'product_cover', 'incubation_material')`),
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
