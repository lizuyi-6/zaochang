import assert from "node:assert/strict";
import { test } from "node:test";
import { USER_KEY_CAPABILITIES, isUserApiKeyBearer, isUserKeyCapabilityAllowed, userApiKeyIdentity } from "../app/api/_lib/user-api-key.ts";
import { AGENT_ADMIN_CAPABILITIES, AGENT_WRITE_CAPABILITIES } from "../app/api/_lib/agent-auth.ts";

test("USER_KEY_CAPABILITIES is exactly POST /api/mcp and remains separate from agent tables", () => {
  assert.deepEqual(USER_KEY_CAPABILITIES, [{ method: "POST", pathname: "/api/mcp" }]);
  assert.notStrictEqual(USER_KEY_CAPABILITIES, AGENT_WRITE_CAPABILITIES);
  assert.notStrictEqual(USER_KEY_CAPABILITIES, AGENT_ADMIN_CAPABILITIES);
  const agentCapabilities = [...AGENT_WRITE_CAPABILITIES, ...AGENT_ADMIN_CAPABILITIES];
  for (const capability of USER_KEY_CAPABILITIES) {
    assert.equal(agentCapabilities.some((agent) => agent === capability), false);
    assert.equal(agentCapabilities.some((agent) => agent.method === capability.method && agent.pathname === capability.pathname), false);
  }
  assert.equal(isUserKeyCapabilityAllowed("POST", "/api/mcp"), true);
  assert.equal(isUserKeyCapabilityAllowed("GET", "/api/mcp"), false);
  assert.equal(isUserKeyCapabilityAllowed("POST", "/api/mcp/"), false);
  assert.equal(isUserKeyCapabilityAllowed("GET", "/api/reading-progress"), false);
});

test("API-key identities never carry the owner's admin, founder, or agent flags", () => {
  const identity = userApiKeyIdentity("release-admin@example.com", "Admin", "key-id");
  assert.equal(identity.authVia, "api_key");
  assert.equal(identity.isAdmin, false);
  assert.equal(identity.isFounder, false);
  assert.equal(identity.isAgent, false);
});

test("MCP OAuth zca_ Bearer prefix is not mistaken for a personal zc_ key", () => {
  assert.equal(isUserApiKeyBearer(`Bearer zc_${"a".repeat(43)}`), true);
  assert.equal(isUserApiKeyBearer(`Bearer zca_${"a".repeat(43)}`), false);
});
