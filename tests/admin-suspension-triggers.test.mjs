// 纯 Node SQLite 回归:直接套用空库迁移并验证封禁触发器,不经过 Worker。
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const migrationsDir = new URL("../drizzle/", import.meta.url);

function applyMigrations(db) {
  const names = readdirSync(fileURLToPath(migrationsDir))
    .filter((name) => name.endsWith(".sql") && !name.startsWith("_"))
    .sort();
  for (const name of names) {
    const source = readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
    for (const [index, statement] of source.split(/--> statement-breakpoint/g).entries()) {
      if (!statement.trim()) continue;
      try {
        db.exec(statement);
      } catch (error) {
        throw new Error(`${name} statement ${index + 1}: ${error.message}`, { cause: error });
      }
    }
  }
}

function addClient(db, email) {
  db.prepare(`INSERT INTO oauth_provider_clients
    (client_id, owner_email, name, website_url, client_type, allowed_scopes)
    VALUES (?, ?, 'Suspension test client', 'https://client.example', 'public', 'mcp:projects')`)
    .run(`client:${email}`, email);
  db.prepare(`INSERT INTO oauth_provider_authorization_requests
    (request_hash, client_id, user_email, redirect_uri, scope, state, code_challenge, expires_at)
    VALUES (?, ?, ?, 'https://client.example/callback', 'mcp:projects', 'state', 'challenge', datetime('now', '+5 minutes'))`)
    .run(`request:${email}`, `client:${email}`, email);
}

test("member suspension triggers block direct credential inserts and allow active members", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    applyMigrations(db);
    db.prepare("INSERT INTO members (email, display_name) VALUES (?, ?)").run("active@example.com", "Active");
    db.prepare("INSERT INTO members (email, display_name) VALUES (?, ?)").run("suspended@example.com", "Suspended");
    db.prepare("UPDATE members SET suspended_at = CURRENT_TIMESTAMP WHERE email = ?").run("suspended@example.com");
    addClient(db, "active@example.com");
    addClient(db, "suspended@example.com");

    const suspendedEmail = "suspended@example.com";
    assert.throws(() => db.prepare(`INSERT INTO auth_sessions (token_hash, user_email, provider, expires_at)
      VALUES ('suspended-session', ?, 'email', datetime('now', '+1 day'))`).run(suspendedEmail), /member_suspended/);
    assert.throws(() => db.prepare(`INSERT INTO api_keys (id, member_email, name, prefix, token_hash, expires_at)
      VALUES ('suspended-key', ?, 'key', 'zc_test', 'hash-suspended', datetime('now', '+1 day'))`).run(suspendedEmail), /member_suspended/);
    assert.throws(() => db.prepare(`INSERT INTO oauth_provider_access_tokens
      (token_hash, client_id, user_email, scope, expires_at)
      VALUES ('suspended-access', ?, ?, 'mcp:projects', datetime('now', '+1 day'))`)
      .run(`client:${suspendedEmail}`, suspendedEmail), /member_suspended/);
    assert.throws(() => db.prepare(`INSERT INTO oauth_provider_refresh_tokens
      (token_hash, client_id, user_email, scope, family_id, expires_at)
      VALUES ('suspended-refresh', ?, ?, 'mcp:projects', 'family', datetime('now', '+1 day'))`)
      .run(`client:${suspendedEmail}`, suspendedEmail), /member_suspended/);
    assert.throws(() => db.prepare(`INSERT INTO oauth_provider_authorization_codes
      (code_hash, request_hash, client_id, user_email, redirect_uri, scope, code_challenge, expires_at)
      VALUES ('suspended-code', ?, ?, ?, 'https://client.example/callback', 'mcp:projects', 'challenge', datetime('now', '+1 day'))`)
      .run(`request:${suspendedEmail}`, `client:${suspendedEmail}`, suspendedEmail), /member_suspended/);

    const activeEmail = "active@example.com";
    db.prepare(`INSERT INTO auth_sessions (token_hash, user_email, provider, expires_at)
      VALUES ('active-session', ?, 'email', datetime('now', '+1 day'))`).run(activeEmail);
    db.prepare(`INSERT INTO api_keys (id, member_email, name, prefix, token_hash, expires_at)
      VALUES ('active-key', ?, 'key', 'zc_test', 'hash-active', datetime('now', '+1 day'))`).run(activeEmail);
    db.prepare(`INSERT INTO oauth_provider_access_tokens
      (token_hash, client_id, user_email, scope, expires_at)
      VALUES ('active-access', ?, ?, 'mcp:projects', datetime('now', '+1 day'))`)
      .run(`client:${activeEmail}`, activeEmail);
    db.prepare(`INSERT INTO oauth_provider_refresh_tokens
      (token_hash, client_id, user_email, scope, family_id, expires_at)
      VALUES ('active-refresh', ?, ?, 'mcp:projects', 'family', datetime('now', '+1 day'))`)
      .run(`client:${activeEmail}`, activeEmail);
    db.prepare(`INSERT INTO oauth_provider_authorization_codes
      (code_hash, request_hash, client_id, user_email, redirect_uri, scope, code_challenge, expires_at)
      VALUES ('active-code', ?, ?, ?, 'https://client.example/callback', 'mcp:projects', 'challenge', datetime('now', '+1 day'))`)
      .run(`request:${activeEmail}`, `client:${activeEmail}`, activeEmail);

    assert.notEqual(db.prepare(`SELECT suspended_at FROM members WHERE email = ?`).get(suspendedEmail).suspended_at, null);
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM auth_sessions WHERE user_email = ?`).get(suspendedEmail).count, 0);
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM api_keys WHERE member_email = ?`).get(suspendedEmail).count, 0);
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM oauth_provider_access_tokens WHERE user_email = ?`).get(suspendedEmail).count, 0);
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM oauth_provider_refresh_tokens WHERE user_email = ?`).get(suspendedEmail).count, 0);
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM oauth_provider_authorization_codes WHERE user_email = ?`).get(suspendedEmail).count, 0);
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM auth_sessions WHERE user_email = ?`).get(activeEmail).count, 1);
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM api_keys WHERE member_email = ?`).get(activeEmail).count, 1);
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM oauth_provider_access_tokens WHERE user_email = ?`).get(activeEmail).count, 1);
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM oauth_provider_refresh_tokens WHERE user_email = ?`).get(activeEmail).count, 1);
    assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM oauth_provider_authorization_codes WHERE user_email = ?`).get(activeEmail).count, 1);
  } finally {
    db.close();
  }
});
