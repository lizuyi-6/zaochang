import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HOSTING_WORKER_CAPABILITIES,
  isHostingWorkerBearer,
  isHostingWorkerCapabilityAllowed,
  isValidHostingWorkerToken,
} from "../app/api/_lib/hosting-worker-auth.ts";

test("hosting worker capability table contains exactly the four contracted routes", () => {
  assert.equal(HOSTING_WORKER_CAPABILITIES.length, 4);
  for (const route of [
    ["GET", "/api/hosting-worker/health"],
    ["POST", "/api/hosting-worker/claim"],
    ["GET", "/api/hosting-worker/jobs/1/bundle"],
    ["POST", "/api/hosting-worker/jobs/1/report"],
  ]) {
    assert.equal(isHostingWorkerCapabilityAllowed(route[0], route[1]), true);
  }
});

test("hosting worker capability matching rejects path and method variants", () => {
  for (const [method, pathname] of [
    ["GET", "/api/hosting-worker/health/"],
    ["POST", "/api/hosting-worker/claim/"],
    ["GET", "/api/hosting-worker/jobs/0/bundle"],
    ["GET", "/api/hosting-worker/jobs/-1/bundle"],
    ["GET", "/api/hosting-worker/jobs/1.5/bundle"],
    ["GET", "/api/hosting-worker/jobs/9007199254740992/bundle"],
    ["GET", "/api/hosting-worker/jobs/1/../claim"],
    ["GET", "/api/hosting-worker/jobs/%2e%2e/bundle"],
    ["GET", "/api/hosting-worker/jobs/1%2fbundle"],
    ["GET", "/api/hosting-worker/jobs/1/bundle/"],
    ["POST", "/api/hosting-worker/jobs/1/bundle"],
    ["GET", "/api/hosting-worker/jobs/1/report"],
    ["POST", "/api/hosting-worker/jobs/1/report?extra=1"],
    ["get", "/api/hosting-worker/health"],
    ["PATCH", "/api/hosting-worker/claim"],
  ]) {
    assert.equal(isHostingWorkerCapabilityAllowed(method, pathname), false, `${method} ${pathname}`);
  }
});

test("hosting worker bearer detection is limited to zch credentials", () => {
  assert.equal(isHostingWorkerBearer("Bearer zch_abc"), true);
  assert.equal(isHostingWorkerBearer("bearer ZCH_abc"), false);
  assert.equal(isHostingWorkerBearer("Bearer zc_abc"), false);
  assert.equal(isHostingWorkerBearer("Basic zch_abc"), false);
  assert.equal(isHostingWorkerBearer(null), false);
});

test("hosting worker tokens reject weak secrets and compare configured credentials", () => {
  const secret = `zch_${"a".repeat(48)}`;
  assert.equal(isValidHostingWorkerToken(secret, secret), true);
  assert.equal(isValidHostingWorkerToken(`${secret.slice(0, -1)}b`, secret), false);
  assert.equal(isValidHostingWorkerToken(secret, `zch_${"a".repeat(43)}`), false);
  assert.equal(isValidHostingWorkerToken(secret, ""), false);
  assert.equal(isValidHostingWorkerToken("zc_credential", secret), false);
});
