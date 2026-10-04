// Passkey 端到端集成:用最小 CBOR 编码 + WebCrypto ES256 造出真实 fmt='none' 的
// 注册/认证响应,全程 HTTP 打活服务器(127.0.0.1:4179,rpId 即 IP 本身)——挑战
// 签发/原子消费/origin 校验/会话签发/凭据管理全链路,服务端零 mock。
// 纯逻辑与源码契约在 tests/passkey-core.test.mjs。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { baseUrl, runId, authHeaders, queryLocalD1 } from "../harness/preview.mjs";

const ORIGIN = baseUrl;
const RP_ID = "127.0.0.1";
const CHALLENGE_COOKIE = "zaochang_passkey_challenge";

// ---- 最小 CBOR(仅编码 fixture 需要的子集) ----

function cborHead(major, length) {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 0x100) return Buffer.from([(major << 5) | 24, length]);
  const head = Buffer.alloc(3);
  head[0] = (major << 5) | 25;
  head.writeUInt16BE(length, 1);
  return head;
}

function cborInt(value) {
  return value >= 0 ? cborHead(0, value) : cborHead(1, -value - 1);
}

const cborBytes = (buf) => Buffer.concat([cborHead(2, buf.length), buf]);
const cborText = (text) => Buffer.concat([cborHead(3, Buffer.byteLength(text)), Buffer.from(text)]);
const EMPTY_MAP = Symbol("cbor empty map");

function cborMap(pairs) {
  const body = pairs.map(([key, value]) => Buffer.concat([
    typeof key === "string" ? cborText(key) : cborInt(key),
    value === EMPTY_MAP ? cborHead(5, 0)
      : typeof value === "number" ? cborInt(value)
        : typeof value === "string" ? cborText(value)
          : cborBytes(value),
  ]));
  return Buffer.concat([cborHead(5, pairs.length), ...body]);
}

// ---- base64url / 哈希 ----

const bytesToB64u = (bytes) => Buffer.from(bytes).toString("base64url");
const b64uToBytes = (text) => new Uint8Array(Buffer.from(text, "base64url"));
const sha256 = (data) => createHash("sha256").update(data).digest();

// ---- 模拟认证器:一把 ES256 钥匙 ----

async function makeAuthenticator() {
  const keyPair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);
  const coseKey = cborMap([[1, 2], [3, -7], [-1, 1], [-2, b64uToBytes(jwk.x)], [-3, b64uToBytes(jwk.y)]]);
  const credentialId = bytesToB64u(webcrypto.getRandomValues(new Uint8Array(32)));
  return { keyPair, coseKey, credentialId };
}

function buildAuthData(flags, counter, attested = null) {
  const head = Buffer.alloc(37);
  // 注意 hash.copy(target) 的 target 参数已被 Node 移除,必须先 digest() 拿 Buffer 再 copy。
  sha256(RP_ID).copy(head, 0);
  head[32] = flags;
  head.writeUInt32BE(counter, 33);
  return attested ? Buffer.concat([head, attested]) : head;
}

async function buildRegistration({ challenge, origin, auth }) {
  const clientData = JSON.stringify({ type: "webauthn.create", challenge, origin, crossOrigin: false });
  const credIdBuf = Buffer.from(auth.credentialId, "base64url");
  const credLen = Buffer.alloc(2);
  credLen.writeUInt16BE(credIdBuf.length);
  const authData = buildAuthData(0x45, 0, Buffer.concat([Buffer.alloc(16), credLen, credIdBuf, auth.coseKey]));
  const attestationObject = cborMap([["fmt", "none"], ["attStmt", EMPTY_MAP], ["authData", authData]]);
  const spki = await webcrypto.subtle.exportKey("spki", auth.keyPair.publicKey);
  return {
    id: auth.credentialId,
    rawId: auth.credentialId,
    type: "public-key",
    clientExtensionResults: {},
    response: {
      clientDataJSON: bytesToB64u(clientData),
      attestationObject: bytesToB64u(attestationObject),
      transports: ["internal"],
      publicKeyAlgorithm: -7,
      publicKey: bytesToB64u(spki),
    },
  };
}

// Node webcrypto 输出 raw r||s(P1363);SimpleWebAuthn v14 期望浏览器实际送出的
// DER/ASN.1 编码(SEQUENCE { r INTEGER, s INTEGER })并在验签前自行解包。
function rawToDerSignature(raw) {
  const asInt = (bytes) => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start += 1;
    let value = bytes.subarray(start);
    if (value[0] & 0x80) value = Buffer.concat([Buffer.from([0]), value]);
    return Buffer.concat([Buffer.from([0x02, value.length]), value]);
  };
  const body = Buffer.concat([asInt(raw.subarray(0, 32)), asInt(raw.subarray(32))]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

async function buildAssertion({ challenge, origin, auth, counter, userHandle }) {
  const clientData = JSON.stringify({ type: "webauthn.get", challenge, origin, crossOrigin: false });
  const authData = buildAuthData(0x05, counter);
  // WebAuthn 签名对象 = authenticatorData || sha256(clientDataJSON)(authData 在前)。
  const signature = await webcrypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    auth.keyPair.privateKey,
    Buffer.concat([authData, sha256(clientData)]),
  );
  return {
    id: auth.credentialId,
    rawId: auth.credentialId,
    type: "public-key",
    clientExtensionResults: {},
    response: {
      clientDataJSON: bytesToB64u(clientData),
      authenticatorData: bytesToB64u(authData),
      signature: bytesToB64u(rawToDerSignature(Buffer.from(signature))),
      userHandle,
    },
  };
}

function challengeCookieOf(response) {
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith(`${CHALLENGE_COOKIE}=`));
  return cookie ? cookie.split(";")[0] : null;
}

async function postJson(path, { headers = {}, cookie, body }) {
  return await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
    body: JSON.stringify(body ?? {}),
  });
}

export function register() {
  // 全套流程共享:一个成员、一把钥匙。rendered-html 总入口 concurrency:false,顺序即依赖。
  const email = `passkey-${runId}@example.com`;
  const memberHeaders = authHeaders("通行密钥用户", email);
  let auth = null;
  let userHandle = null;

  async function freshRegisterChallenge() {
    const res = await postJson("/api/auth/passkey/register/options", { headers: memberHeaders });
    assert.equal(res.status, 200);
    return { options: await res.json(), cookie: challengeCookieOf(res) };
  }

  async function freshLoginChallenge(body = {}) {
    const res = await postJson("/api/auth/passkey/login/options", { body });
    assert.equal(res.status, 200);
    return { options: await res.json(), cookie: challengeCookieOf(res) };
  }

  test("register options:未登录 401;已登录签发挑战(cookie + DB 行,rp 锁定 127.0.0.1)", async () => {
    const anon = await postJson("/api/auth/passkey/register/options", {});
    assert.equal(anon.status, 401);
    assert.deepEqual(await anon.json(), { error: "auth_required" });

    const { options, cookie } = await freshRegisterChallenge();
    assert.equal(options.rp.id, RP_ID);
    assert.equal(options.user.name, email);
    assert.equal(options.attestation, "none");
    assert.equal(options.authenticatorSelection.residentKey, "preferred");
    assert.ok(!(options.excludeCredentials?.length), "新成员没有已注册凭据");
    // 注意:全局 userHandle 不在这里取——成员无凭据时每次 options 都生成新 handle,
    // 真正落库的是注册测试实际使用的那次 options 的值。

    assert.ok(cookie?.startsWith(`${CHALLENGE_COOKIE}=`), "挑战必须落 HttpOnly cookie");
    const pending = await queryLocalD1(
      `SELECT COUNT(*) AS n FROM webauthn_challenges WHERE consumed_at IS NULL AND purpose = 'register'`,
    );
    assert.ok(pending[0].n >= 1, "挑战哈希必须落库(服务端原子消费的前提)");
  });

  test("register:合法 fmt=none attestation 入库,响应不外泄公钥/userHandle", async () => {
    auth = await makeAuthenticator();
    const { options, cookie } = await freshRegisterChallenge();
    const credential = await buildRegistration({ challenge: options.challenge, origin: ORIGIN, auth });
    const res = await postJson("/api/auth/passkey/register", {
      headers: memberHeaders, cookie, body: { credential, name: "  测试钥匙  " },
    });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.status, "ok");
    assert.equal(body.credential_id, auth.credentialId);
    assert.equal(body.name, "测试钥匙", "名字必须归一化(去首尾空白)");
    assert.equal(Object.hasOwn(body, "public_key"), false);
    assert.equal(Object.hasOwn(body, "user_handle"), false);

    const rows = await queryLocalD1(
      `SELECT email, user_handle, device_type, backed_up, counter FROM webauthn_credentials WHERE email = '${email}'`,
    );
    assert.equal(rows.length, 1);
    userHandle = rows[0].user_handle;
    assert.equal(userHandle, options.user.id, "落库 handle 必须等于本次 options 签发值");
    assert.equal(rows[0].device_type, "singleDevice");
  });

  test("register:无 cookie/坏挑战/坏 origin/login 挑战冒充注册,一律拒", async () => {
    const noCookie = await postJson("/api/auth/passkey/register", {
      headers: memberHeaders, body: { credential: { id: "x" } },
    });
    assert.equal(noCookie.status, 400);
    assert.equal((await noCookie.json()).error, "challenge_invalid");

    const badChallengeSource = await freshRegisterChallenge();
    const badChallenge = await buildRegistration({ challenge: "cGFsbGFy", origin: ORIGIN, auth: await makeAuthenticator() });
    const wrongChallenge = await postJson("/api/auth/passkey/register", {
      headers: memberHeaders, cookie: badChallengeSource.cookie, body: { credential: badChallenge },
    });
    assert.equal(wrongChallenge.status, 400);
    assert.equal((await wrongChallenge.json()).error, "verification_failed");

    const evilSource = await freshRegisterChallenge();
    const evilOrigin = await buildRegistration({ challenge: evilSource.options.challenge, origin: "https://evil.example", auth: await makeAuthenticator() });
    const wrongOrigin = await postJson("/api/auth/passkey/register", {
      headers: memberHeaders, cookie: evilSource.cookie, body: { credential: evilOrigin },
    });
    assert.equal(wrongOrigin.status, 400);
    assert.equal((await wrongOrigin.json()).error, "verification_failed");

    // login purpose 的挑战没有 user_handle,不得用于注册(purpose 隔离)。
    const loginSource = await freshLoginChallenge();
    const loginPurpose = await buildRegistration({ challenge: loginSource.options.challenge, origin: ORIGIN, auth: await makeAuthenticator() });
    const wrongPurpose = await postJson("/api/auth/passkey/register", {
      headers: memberHeaders, cookie: loginSource.cookie, body: { credential: loginPurpose },
    });
    assert.equal(wrongPurpose.status, 400);
    assert.equal((await wrongPurpose.json()).error, "challenge_invalid");
  });

  test("register:同钥匙换新挑战撞主键 409;真重放(同 cookie 同断言)过不了消费闸", async () => {
    const duplicateSource = await freshRegisterChallenge();
    const duplicate = await buildRegistration({ challenge: duplicateSource.options.challenge, origin: ORIGIN, auth });
    const dupRes = await postJson("/api/auth/passkey/register", {
      headers: memberHeaders, cookie: duplicateSource.cookie, body: { credential: duplicate },
    });
    assert.equal(dupRes.status, 409);
    assert.equal((await dupRes.json()).error, "credential_exists");

    const replayRes = await postJson("/api/auth/passkey/register", {
      headers: memberHeaders, cookie: duplicateSource.cookie, body: { credential: duplicate },
    });
    assert.equal(replayRes.status, 400);
    assert.equal((await replayRes.json()).error, "challenge_invalid");
  });

  test("credentials:列表/改名/越权零变化", async () => {
    const list = await fetch(`${baseUrl}/api/auth/passkey/credentials`, { headers: memberHeaders });
    assert.equal(list.status, 200);
    const listed = await list.json();
    assert.equal(listed.credentials.length, 1);
    assert.equal(listed.credentials[0].name, "测试钥匙");
    assert.equal(listed.credentials[0].credential_id, auth.credentialId);
    assert.equal(Object.hasOwn(listed.credentials[0], "public_key"), false);

    const renamed = await postJson("/api/auth/passkey/credentials/rename", {
      headers: memberHeaders, body: { credential_id: auth.credentialId, name: "我的笔记本" },
    });
    assert.equal(renamed.status, 200);
    assert.equal((await renamed.json()).name, "我的笔记本");

    const otherHeaders = authHeaders("旁观者", `passkey-other-${runId}@example.com`);
    const foreignRename = await postJson("/api/auth/passkey/credentials/rename", {
      headers: otherHeaders, body: { credential_id: auth.credentialId, name: "劫持" },
    });
    assert.equal(foreignRename.status, 404);
    const foreignDelete = await postJson("/api/auth/passkey/credentials/delete", {
      headers: otherHeaders, body: { credential_id: auth.credentialId },
    });
    assert.equal(foreignDelete.status, 404);
    const after = await queryLocalD1(`SELECT name FROM webauthn_credentials WHERE credential_id = '${auth.credentialId}'`);
    assert.equal(after[0].name, "我的笔记本", "越权操作不得改行");
  });

  test("login:合法断言(counter 0→1)签发 passkey 会话,与主站会话同权", async () => {
    const { options, cookie } = await freshLoginChallenge();
    assert.equal(options.rpId, RP_ID);
    const credential = await buildAssertion({ challenge: options.challenge, origin: ORIGIN, auth, counter: 1, userHandle });
    const res = await postJson("/api/auth/passkey/login", {
      cookie, body: { credential, return_to: "/wallet" },
    });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.status, "ok");
    assert.equal(body.return_to, "/wallet");
    const sessionCookie = res.headers.getSetCookie().find((value) => value.startsWith("zaochang_session="));
    assert.ok(sessionCookie, "必须签发与 GitHub/邮箱码同权的会话 cookie");

    const provider = await queryLocalD1(`SELECT provider FROM auth_sessions ORDER BY created_at DESC LIMIT 1`);
    assert.equal(provider[0].provider, "passkey");

    // 会话可用性:拿 passkey 会话访问 requireMember 端点。
    const session = sessionCookie.split(";")[0];
    const probe = await fetch(`${baseUrl}/api/auth/passkey/credentials`, { headers: { cookie: session } });
    assert.equal(probe.status, 200);
    assert.equal((await probe.json()).credentials.length, 1);

    const counterRow = await queryLocalD1(`SELECT counter, last_used_at FROM webauthn_credentials WHERE credential_id = '${auth.credentialId}'`);
    assert.equal(counterRow[0].counter, 1, "counter 必须回写");
    assert.ok(counterRow[0].last_used_at, "last_used_at 必须回写");
  });

  test("login:挑战重放/旧断言配新挑战/坏签名/未知凭据,全拒且同错误码", async () => {
    const firstSource = await freshLoginChallenge();
    const credential = await buildAssertion({ challenge: firstSource.options.challenge, origin: ORIGIN, auth, counter: 2, userHandle });
    const first = await postJson("/api/auth/passkey/login", { cookie: firstSource.cookie, body: { credential } });
    assert.equal(first.status, 200, "counter=2 > 1 应通过");

    // 完全重放:同 cookie 同断言二次提交 → 消费闸。
    const replay = await postJson("/api/auth/passkey/login", { cookie: firstSource.cookie, body: { credential } });
    assert.equal(replay.status, 400);
    assert.equal((await replay.json()).error, "challenge_invalid");

    // 旧断言配新挑战:消费成功但 expectedChallenge 不匹配。
    const staleSource = await freshLoginChallenge();
    const stale = await postJson("/api/auth/passkey/login", { cookie: staleSource.cookie, body: { credential } });
    assert.equal(stale.status, 400);
    assert.equal((await stale.json()).error, "passkey_invalid");

    // 篡改签名。
    const tamperSource = await freshLoginChallenge();
    const fresh = await buildAssertion({ challenge: tamperSource.options.challenge, origin: ORIGIN, auth, counter: 3, userHandle });
    const sigBytes = Buffer.from(fresh.response.signature, "base64url");
    sigBytes[0] ^= 0xff;
    fresh.response.signature = bytesToB64u(sigBytes);
    const badSignature = await postJson("/api/auth/passkey/login", { cookie: tamperSource.cookie, body: { credential: fresh } });
    assert.equal(badSignature.status, 400);
    assert.equal((await badSignature.json()).error, "passkey_invalid");

    // 未知凭据(错误码与验证失败一致,不泄露存在性)。
    const strangerAuth = await makeAuthenticator();
    const strangerSource = await freshLoginChallenge();
    const stranger = await buildAssertion({ challenge: strangerSource.options.challenge, origin: ORIGIN, auth: strangerAuth, counter: 0, userHandle });
    const strangerRes = await postJson("/api/auth/passkey/login", { cookie: strangerSource.cookie, body: { credential: stranger } });
    assert.equal(strangerRes.status, 400);
    assert.equal((await strangerRes.json()).error, "passkey_invalid");
  });

  test("login options 带 email:收敛 allowCredentials;不存在邮箱不泄露;counter 不倒退", async () => {
    const scoped = await freshLoginChallenge({ email });
    assert.deepEqual((scoped.options.allowCredentials ?? []).map((item) => item.id), [auth.credentialId]);

    const stranger = await freshLoginChallenge({ email: `nobody-${runId}@example.com` });
    assert.deepEqual(stranger.options.allowCredentials ?? [], [], "不存在的邮箱回落 discoverable,不泄露存在性");

    const counter = await queryLocalD1(`SELECT counter FROM webauthn_credentials WHERE credential_id = '${auth.credentialId}'`);
    assert.equal(counter[0].counter, 2);
  });

  test("delete:删自己的凭据后登录失败", async () => {
    const removed = await postJson("/api/auth/passkey/credentials/delete", {
      headers: memberHeaders, body: { credential_id: auth.credentialId },
    });
    assert.equal(removed.status, 200);

    const { options, cookie } = await freshLoginChallenge();
    const credential = await buildAssertion({ challenge: options.challenge, origin: ORIGIN, auth, counter: 4, userHandle });
    const res = await postJson("/api/auth/passkey/login", { cookie, body: { credential } });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "passkey_invalid", "已删除凭据不得再登录");
  });
}
