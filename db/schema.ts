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
  reputation: integer("reputation").notNull().default(0),
  joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const wallets = sqliteTable(
  "wallets",
  {
    userEmail: text("user_email")
      .primaryKey()
      .references(() => members.email),
    balance: integer("balance").notNull().default(120),
    lifetimeEarned: integer("lifetime_earned").notNull().default(120),
    lifetimeSpent: integer("lifetime_spent").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [check("wallet_balance_nonnegative", sql`${table.balance} >= 0`)],
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
    coverTheme: text("cover_theme").notNull().default("coral"),
    price: integer("price").notNull().default(0),
    likesCount: integer("likes_count").notNull().default(0),
    playsCount: integer("plays_count").notNull().default(0),
    status: text("status").notNull().default("published"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("products_created_at_idx").on(table.createdAt),
    index("products_owner_idx").on(table.ownerEmail),
    check("products_price_nonnegative", sql`${table.price} >= 0`),
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
    likesCount: integer("likes_count").notNull().default(0),
    commentsCount: integer("comments_count").notNull().default(0),
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
