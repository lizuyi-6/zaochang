import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  baseUrl,
  executeLocalD1,
  identityHeaders,
  onePixelPng,
  queryLocalD1,
  queryLocalR2Keys,
  runId,
  setUploadScannerBusyResponses,
  uploadScannerRequestCount,
} from "../harness/preview.mjs";

const quoteSql = (value) => `'${String(value).replaceAll("'", "''")}'`;

// 全站上传桶(upload-global,120 次/小时)是跨用例共享的真实计数:把它钉到上限再断言拒绝之后,
// 必须还原,否则同一小时窗口内后面所有套件(MCP OAuth、托管…)的上传都会被 429 误伤。
// 返回还原函数:原先没有行就删除,有行就恢复原计数。
async function pinGlobalUploadBucket() {
  const bucket = `upload-global:${createHash("sha256").update("upload-global:all").digest("hex")}`;
  const windowStart = Math.floor(Math.floor(Date.now() / 1000) / 3600) * 3600;
  const previous = await queryLocalD1(
    `SELECT request_count AS count FROM api_rate_limits WHERE bucket = ${quoteSql(bucket)} AND window_start = ${windowStart}`,
  );
  await executeLocalD1(
    `INSERT INTO api_rate_limits (bucket, window_start, request_count, updated_at)
     VALUES (${quoteSql(bucket)}, ${windowStart}, 120, CURRENT_TIMESTAMP)
     ON CONFLICT(bucket, window_start) DO UPDATE SET request_count = 120, updated_at = CURRENT_TIMESTAMP`,
  );
  return async () => {
    if (previous.length === 0) {
      await executeLocalD1(`DELETE FROM api_rate_limits WHERE bucket = ${quoteSql(bucket)} AND window_start = ${windowStart}`);
    } else {
      await executeLocalD1(`UPDATE api_rate_limits SET request_count = ${Number(previous[0].count)} WHERE bucket = ${quoteSql(bucket)} AND window_start = ${windowStart}`);
    }
  };
}

function uploadForm(filename) {
  const form = new FormData();
  form.append("file", new Blob([onePixelPng], { type: "image/png" }), filename);
  form.append("visibility", "private");
  form.append("purpose", "general");
  return form;
}

async function uploadAs(email, filename) {
  return fetch(`${baseUrl}/api/uploads`, {
    method: "POST",
    headers: { ...identityHeaders("Scanner capacity test", email), origin: baseUrl },
    body: uploadForm(filename),
  });
}

export function register() {
  test("scanner capacity: two busy responses retry and the third valid verdict stores clean", async () => {
    const email = `scanner-retry-clean-${runId}@example.com`;
    const filename = "busy-then-clean.png";
    const beforeCalls = uploadScannerRequestCount;
    setUploadScannerBusyResponses(2);
    let response;
    try {
      response = await uploadAs(email, filename);
    } finally {
      setUploadScannerBusyResponses(0);
    }

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.scanStatus, "clean");
    const rows = await queryLocalD1(
      `SELECT scan_status, quarantine_key FROM uploaded_files
       WHERE owner_email = ${quoteSql(email)} AND original_name = ${quoteSql(filename)}`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].scan_status, "clean");
    assert.equal(rows[0].quarantine_key, null);
    assert.equal(uploadScannerRequestCount - beforeCalls, 3);
  });

  test("scanner capacity: exhausted busy retries leave an error row and no upload objects", async () => {
    const email = `scanner-retry-busy-${runId}@example.com`;
    const filename = "busy-until-budget.png";
    const beforeCalls = uploadScannerRequestCount;
    setUploadScannerBusyResponses(4);
    let response;
    try {
      response = await uploadAs(email, filename);
    } finally {
      setUploadScannerBusyResponses(0);
    }

    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "upload_scanner_unavailable");
    const rows = await queryLocalD1(
      `SELECT key, scan_status, quarantine_key FROM uploaded_files
       WHERE owner_email = ${quoteSql(email)} AND original_name = ${quoteSql(filename)}`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].scan_status, "error");
    assert.equal(rows[0].quarantine_key, null);
    assert.equal(uploadScannerRequestCount - beforeCalls, 4);
    const uuid = rows[0].key.slice(0, rows[0].key.lastIndexOf("."));
    const r2Objects = await queryLocalR2Keys();
    assert.equal(r2Objects.includes(rows[0].key), false, "failed upload has no formal R2 object");
    assert.equal(r2Objects.includes(`quarantine/${uuid}`), false, "failed upload has no quarantine R2 object");
    // The row is not readable through the public upload route after fail-closed cleanup.
    const unavailable = await fetch(`${baseUrl}/api/uploads/${encodeURIComponent(rows[0].key)}`, {
      headers: identityHeaders("Scanner capacity test", email),
    });
    assert.equal(unavailable.status, 404);
  });

  test("scanner capacity: a non-busy 503 after busy is not retried", async () => {
    const email = `scanner-retry-scan-failed-${runId}@example.com`;
    const filename = "busy-then-scan-failed.png";
    const beforeCalls = uploadScannerRequestCount;
    setUploadScannerBusyResponses(1, "scan_failed");
    let response;
    try {
      response = await uploadAs(email, filename);
    } finally {
      setUploadScannerBusyResponses(0);
    }

    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "upload_scanner_unavailable");
    assert.equal(uploadScannerRequestCount - beforeCalls, 2);
    const rows = await queryLocalD1(
      `SELECT scan_status, quarantine_key FROM uploaded_files
       WHERE owner_email = ${quoteSql(email)} AND original_name = ${quoteSql(filename)}`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].scan_status, "error");
    assert.equal(rows[0].quarantine_key, null);
  });

  test("scanner capacity: global hourly cap rejects before upload row or scanner side effect", async (t) => {
    const email = `upload-global-cap-${runId}@example.com`;
    t.after(await pinGlobalUploadBucket());
    const beforeRows = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM uploaded_files WHERE owner_email = ${quoteSql(email)}`,
    );
    const beforeCalls = uploadScannerRequestCount;
    const beforeR2Keys = await queryLocalR2Keys();

    const response = await uploadAs(email, "global-cap.png");
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error, "upload_capacity_exceeded");
    assert.match(response.headers.get("retry-after") ?? "", /^[1-9]\d*$/);
    const afterRows = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM uploaded_files WHERE owner_email = ${quoteSql(email)}`,
    );
    assert.equal(afterRows[0].count, beforeRows[0].count);
    assert.equal(uploadScannerRequestCount, beforeCalls);
    assert.deepEqual(await queryLocalR2Keys(), beforeR2Keys);
  });

  test("scanner capacity: MCP upload reports capacity refusal as a readable isError result", async (t) => {
    const email = `upload-global-mcp-cap-${runId}@example.com`;
    const login = await fetch(`${baseUrl}/api/auth/dev-login?email=${encodeURIComponent(email)}`, {
      headers: { origin: baseUrl },
      redirect: "manual",
    });
    assert.equal(login.status, 307);
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    assert.match(cookie ?? "", /^zaochang_session=/);
    const keyResponse = await fetch(`${baseUrl}/api/api-keys`, {
      method: "POST",
      headers: { cookie, origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify({ name: "global capacity test", expires_in_days: 30 }),
    });
    assert.equal(keyResponse.status, 201);
    const { token } = await keyResponse.json();

    t.after(await pinGlobalUploadBucket());
    const beforeRows = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM uploaded_files WHERE owner_email = ${quoteSql(email)}`,
    );
    const beforeCalls = uploadScannerRequestCount;
    const beforeR2Keys = await queryLocalR2Keys();
    const rpcResponse = await fetch(`${baseUrl}/api/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, origin: baseUrl, "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "upload_cover",
          arguments: { filename: "mcp-global-cap.png", mime_type: "image/png", data_base64: onePixelPng.toString("base64") },
        },
      }),
    });
    assert.equal(rpcResponse.status, 429);
    assert.match(rpcResponse.headers.get("retry-after") ?? "", /^[1-9]\d*$/);
    const rpcBody = await rpcResponse.json();
    assert.equal(rpcBody.result.isError, true);
    assert.equal(rpcBody.result.structuredContent.error, "upload_capacity_exceeded");
    assert.match(rpcBody.result.content[0].text, /upload_capacity_exceeded/);
    const afterRows = await queryLocalD1(
      `SELECT COUNT(*) AS count FROM uploaded_files WHERE owner_email = ${quoteSql(email)}`,
    );
    assert.equal(afterRows[0].count, beforeRows[0].count);
    assert.equal(uploadScannerRequestCount, beforeCalls);
    assert.deepEqual(await queryLocalR2Keys(), beforeR2Keys);
  });
}
