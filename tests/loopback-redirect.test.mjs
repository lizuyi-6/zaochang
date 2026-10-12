import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { loopbackRedirectAllowed, isLoopbackHttpRedirect } from "../app/api/_lib/loopback-redirect.ts";
import { canHoldEmailWhitelistRole } from "../app/api/_lib/role-eligibility.ts";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("loopback redirect policy matrix allows only dynamic authorization in production", () => {
  const matrix = [
    ["production", "developer", "authorization", false],
    ["production", "dynamic", "authorization", true],
    ["production", "developer", "payment", false],
    ["production", "dynamic", "payment", false],
    ["test", "developer", "authorization", true],
    ["test", "dynamic", "authorization", true],
    ["test", "developer", "payment", true],
    ["test", "dynamic", "payment", true],
  ];
  for (const [appEnv, registrationSource, purpose, expected] of matrix) {
    assert.equal(loopbackRedirectAllowed({ appEnv, registrationSource, purpose }), expected,
      `${appEnv}/${registrationSource}/${purpose}`);
  }
});

test("loopback host recognition is exact and HTTP-only", () => {
  assert.equal(isLoopbackHttpRedirect("http://localhost:4188/callback"), true);
  assert.equal(isLoopbackHttpRedirect("http://127.0.0.1:4188/callback"), true);
  assert.equal(isLoopbackHttpRedirect("http://[::1]:4188/callback"), true);
  assert.equal(isLoopbackHttpRedirect("https://localhost:4188/callback"), false);
  assert.equal(isLoopbackHttpRedirect("http://localhost.example/callback"), false);
  assert.equal(isLoopbackHttpRedirect("http://192.168.1.20:4188/callback"), false);
});

test("redirectRegistered uses loopback policy and external payments pass payment purpose", () => {
  const provider = source("../app/api/_lib/oauth-provider.ts");
  const registeredBody = provider.match(/async function redirectRegistered\([\s\S]*?\r?\n}\r?\n/)?.[0] ?? "";
  assert.match(registeredBody, /loopbackRedirectAllowed\(/);
  assert.match(provider, /return redirectRegistered\(clientId, redirectUri, "payment"\)/);
  assert.equal(canHoldEmailWhitelistRole({ authVia: "oauth" }), false);
});
