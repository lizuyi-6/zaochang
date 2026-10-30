// 账户申请 + 邀请码邮件模板 · 纯逻辑契约(无 Wrangler):校验规则、模板渲染/转义/
// 链接不带码、预览占位码不可能是真码、与邮箱登录同一邮箱形状、迁移落位。
// 发码批次 SQL 的并发前提:node:sqlite + 全量生产迁移,直接构造「两个请求都读到待审、
// 一个先提交」的时序(集成预览会把并发请求串行化,第二个请求在读取阶段就 409,测不到批次层)。
// 端到端行为(发码→发信→注册、失败撤销)在 tests/suites/20-account-applications.tests.mjs。
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  APPROVE_CLAIM_SQL,
  APPROVE_INSERT_INVITATION_SQL,
  ISSUE_AUDIT_SQL,
  MAIL_FAILED_REVOKE_SQL,
  REJECT_AUDIT_SQL,
  REJECT_SQL,
  RESEND_CLAIM_SQL,
  RESEND_INSERT_INVITATION_SQL,
  RESEND_REVOKE_OLD_SQL,
} from "../app/api/_lib/account-application-sql.ts";
import {
  APPLICATION_EMAIL_PATTERN,
  normalizeApplicationInput,
  normalizeApplicationLink,
  normalizeInviteDays,
} from "../app/api/_lib/account-application-rules.ts";
import {
  INVITATION_EMAIL_SUBJECT,
  INVITATION_PREVIEW_CODE,
  formatBeijingTime,
  invitationEmail,
} from "../app/api/_lib/invite-mail.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("申请校验:合法输入规整(邮箱小写、称呼压空白、intro 保留换行)", () => {
  const result = normalizeApplicationInput({
    name: "  小\t张  ",
    email: "  Someone@Example.COM ",
    intro: "第一行\r\n第二行：想发布作品",
    link: " https://example.com/a ",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { name: "小 张", email: "someone@example.com", intro: "第一行\n第二行：想发布作品", link: "https://example.com/a" });
  assert.deepEqual(normalizeApplicationInput({ name: "a", email: "a@b.co", intro: "1234567890" }), {
    ok: true, value: { name: "a", email: "a@b.co", intro: "1234567890", link: "" },
  });
});

test("申请校验:每个字段的拒绝分支都给稳定错误码", () => {
  const base = { name: "小张", email: "a@b.co", intro: "想在造场发布作品。。" };
  for (const [patch, error] of [
    [{ name: "" }, "invalid_name"],
    [{ name: "长".repeat(41) }, "invalid_name"],
    [{ name: 42 }, "invalid_name"],
    [{ email: "a@b" }, "invalid_email"],
    [{ email: "a b@c.co" }, "invalid_email"],
    [{ intro: "短短短短短短短短短" }, "invalid_intro"],
    [{ intro: "长".repeat(1001) }, "invalid_intro"],
    [{ link: "javascript:alert(1)" }, "invalid_link"],
    [{ link: "data:text/html,x" }, "invalid_link"],
    [{ link: "ftp://example.com" }, "invalid_link"],
    [{ link: "https://u:p@example.com" }, "invalid_link"],
    [{ link: `https://example.com/${"a".repeat(300)}` }, "invalid_link"],
    [{ link: 7 }, "invalid_link"],
  ]) {
    assert.deepEqual(normalizeApplicationInput({ ...base, ...patch }), { ok: false, error }, JSON.stringify(patch));
  }
  assert.deepEqual(normalizeApplicationInput(null), { ok: false, error: "invalid_request" });
  assert.equal(normalizeApplicationLink(undefined), "");
  assert.equal(normalizeApplicationLink("   "), "");
});

test("邀请码有效天数:缺省 14,越界/小数直接拒绝而不是静默夹逼", () => {
  assert.equal(normalizeInviteDays(undefined), 14);
  assert.equal(normalizeInviteDays(""), 14);
  assert.equal(normalizeInviteDays(1), 1);
  assert.equal(normalizeInviteDays("90"), 90);
  for (const value of [0, 91, 1.5, -3, "abc", Number.NaN]) {
    assert.equal(normalizeInviteDays(value), null, String(value));
  }
});

test("申请邮箱形状与邮箱验证码登录完全一致(这里能过、那里不过会导致拿码注册不了)", () => {
  const source = read("../app/api/_lib/email-codes.ts");
  const literal = source.match(/const EMAIL_PATTERN = (\/.+\/);/)?.[1];
  assert.ok(literal, "email-codes.ts 必须保留 EMAIL_PATTERN 字面量");
  assert.equal(APPLICATION_EMAIL_PATTERN.toString(), literal);
});

test("模板:码同现于 text/html、称呼与邮箱转义、任何链接都不带码", () => {
  const code = "ZC-ABCDEFGHJKLMNPQR";
  const mail = invitationEmail({
    name: `<img src=x onerror="alert(1)">`,
    email: "a&b@example.com",
    code,
    expiresAt: "2026-11-13 10:30:00",
    signinUrl: "https://aetherstudio.top/signin",
  });
  assert.equal(mail.subject, INVITATION_EMAIL_SUBJECT);
  assert.ok(mail.text.includes(code));
  assert.ok(mail.html.includes(code));
  assert.ok(!mail.html.includes("<img"), "称呼必须转义");
  assert.ok(mail.html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert.ok(mail.html.includes("a&amp;b@example.com"));
  const hrefs = [...mail.html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
  assert.deepEqual(hrefs, ["https://aetherstudio.top/signin"]);
  assert.ok(!mail.text.split("\n").some((line) => line.includes("http") && line.includes(code)), "纯文本里的链接行也不得带码");
  assert.ok(mail.text.includes("2026年11月13日 18:30（北京时间）"));
  assert.ok(mail.html.includes("2026年11月13日 18:30（北京时间）"));
});

test("模板:空称呼兜底、北京时间跨日、无法解析的时间原样返回", () => {
  const mail = invitationEmail({ name: "   ", email: "a@b.co", code: "ZC-X", expiresAt: "x", signinUrl: "https://aetherstudio.top/signin" });
  assert.ok(mail.text.startsWith("你好："));
  assert.equal(formatBeijingTime("2026-12-31 20:05:00"), "2027年1月1日 04:05");
  assert.equal(formatBeijingTime("garbage"), "garbage");
});

test("预览占位码:与真码同形,但含真码字母表之外的字符,永远不可能命中一张真码", () => {
  const source = read("../app/api/_lib/invitations.ts");
  const alphabet = source.match(/const alphabet = "([A-Z0-9]+)";/)?.[1];
  assert.ok(alphabet, "generateInvitationCode 的字母表必须是可读字面量");
  assert.match(INVITATION_PREVIEW_CODE, /^ZC-.{16}$/);
  const outside = [...INVITATION_PREVIEW_CODE.slice(3)].filter((char) => !alphabet.includes(char));
  assert.ok(outside.length > 0, `占位码 ${INVITATION_PREVIEW_CODE} 必须含字母表外字符`);
});

test("迁移 0042:一邮箱一条待审、通过必挂码、未通过无投递状态,三条不变量落在 DB 层", () => {
  const sql = read("../drizzle/0042_account_applications.sql");
  assert.match(sql, /CREATE UNIQUE INDEX `account_applications_one_pending_idx` ON `account_applications` \(`email`\) WHERE "account_applications"\."status" = 'pending'/);
  assert.match(sql, /CHECK\(\("account_applications"\."status" = 'approved'\) = \("account_applications"\."invitation_id" IS NOT NULL\)\)/);
  assert.match(sql, /CHECK\("account_applications"\."status" = 'approved' OR "account_applications"\."mail_status" = 'none'\)/);
  assert.match(sql, /FOREIGN KEY \(`invitation_id`\) REFERENCES `invitation_codes`\(`id`\)/);
  const harness = read("./harness/preview.mjs");
  assert.ok(harness.includes('"0042_account_applications.sql"'), "集成 harness 必须应用 0042");
  const journal = JSON.parse(read("../drizzle/meta/_journal.json")).entries;
  const index = journal.findIndex((entry) => entry.tag === "0042_account_applications");
  assert.equal(journal[index - 1]?.tag, "0041_hk_feedback");
  assert.ok(journal[index].when > journal[index - 1].when);
  const previous = JSON.parse(read("../drizzle/meta/0041_snapshot.json"));
  const current = JSON.parse(read("../drizzle/meta/0042_snapshot.json"));
  assert.equal(current.prevId, previous.id, "0042 快照必须接在 0041 之后");
});

test("发码路径源码契约:明文不进响应/审计、发信失败撤销、公开提交不发信", () => {
  const src = read("../app/api/_lib/account-applications.ts");
  const submit = src.slice(src.indexOf("export async function submitApplication"), src.indexOf("// ———— 管理台读侧"));
  assert.doesNotMatch(submit, /sendEmail\(/, "公开提交不得外发任何邮件");
  assert.match(submit, /assertSameOrigin\(request\)/);
  assert.match(submit, /ON CONFLICT DO NOTHING/);
  const issue = src.slice(src.indexOf("async function issueInvitation"), src.indexOf("async function rejectApplication"));
  assert.match(issue, /if \(!emailSendConfigured\(\)\) return Response\.json\(\{ error: "email_not_configured" \}, \{ status: 503 \}\);[\s\S]*db\.batch\(statements\)/, "发信通道检查必须先于任何写入");
  assert.match(issue, /if \(!sent\.ok\) \{\s*await db\.batch\(\[\s*db\.prepare\(MAIL_FAILED_REVOKE_SQL\)\.bind\(invitationId\),/, "发信失败必须撤销刚生成的码");
  assert.match(MAIL_FAILED_REVOKE_SQL, /^UPDATE invitation_codes SET revoked_at = COALESCE\(revoked_at, CURRENT_TIMESTAMP\) WHERE id = \? AND uses_count = 0$/);
  for (const block of issue.match(/Response\.json\(\{[\s\S]*?\}\)/g) ?? []) {
    // 裸标识符 code 才是明文;sent.code 是发信错误码,codeHash 是哈希。
    assert.doesNotMatch(block, /(?<![.\w])code(?!\w)/, `响应不得携带邀请码明文:${block}`);
  }
  assert.doesNotMatch(src, /auditDetail = `[^`]*\$\{code\}/, "审计详情不得拼入明文");
});

// ———— 发码批次:node:sqlite + 全量生产迁移 ————

function migratedDb() {
  const dir = new URL("../drizzle/", import.meta.url);
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const name of readdirSync(fileURLToPath(dir)).filter((file) => file.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(name, dir), "utf8");
    for (const statement of source.split(/--> statement-breakpoint/g)) {
      if (statement.trim()) db.exec(statement);
    }
  }
  db.exec("PRAGMA foreign_keys=ON");
  return db;
}

// 模拟 D1 db.batch:一个事务内顺序执行,返回每条语句的 changes。
function batch(db, steps) {
  db.exec("BEGIN");
  try {
    const changes = steps.map(([sql, ...binds]) => Number(db.prepare(sql).run(...binds).changes));
    db.exec("COMMIT");
    return changes;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

const EXPIRES = "2099-01-01 00:00:00";
const approveSteps = (appId, invitationId, admin) => [
  [APPROVE_INSERT_INVITATION_SQL, invitationId, `hash-${invitationId}`, "账户申请 test", EXPIRES, admin, appId],
  [APPROVE_CLAIM_SQL, invitationId, admin, "", appId, invitationId],
  [ISSUE_AUDIT_SQL, `audit-${invitationId}`, admin, "account_application.approve", appId, "detail", appId, invitationId],
];
const resendSteps = (appId, oldId, invitationId, admin) => [
  [RESEND_REVOKE_OLD_SQL, oldId, appId, oldId],
  [RESEND_INSERT_INVITATION_SQL, invitationId, `hash-${invitationId}`, "账户申请 test", EXPIRES, admin, appId, oldId],
  [RESEND_CLAIM_SQL, invitationId, appId, oldId, invitationId],
  [ISSUE_AUDIT_SQL, `audit-${invitationId}`, admin, "account_application.resend", appId, "detail", appId, invitationId],
];
const count = (db, sql, ...binds) => Number(db.prepare(sql).get(...binds).n);

function seedApplication(db, id = "apply:1", email = "a@example.com") {
  db.prepare(`INSERT INTO account_applications (id, email, name, intro) VALUES (?, ?, '申请人', '想在造场发布作品。')`).run(id, email);
  return id;
}

test("批次 SQL:两个请求都读到待审,先提交者生效,落败批次每条语句 0 行(无第二张码、无假审计)", () => {
  const db = migratedDb();
  const appId = seedApplication(db);
  assert.deepEqual(batch(db, approveSteps(appId, "invite:A", "admin1@example.com")), [1, 1, 1]);
  // 第二个管理员此前读到的仍是 pending:按同一批次执行,前提已不成立。
  assert.deepEqual(batch(db, approveSteps(appId, "invite:B", "admin2@example.com")), [0, 0, 0]);
  assert.equal(count(db, `SELECT COUNT(*) AS n FROM invitation_codes WHERE id IN ('invite:A', 'invite:B')`), 1);
  assert.equal(db.prepare(`SELECT invitation_id AS id, decided_by AS by FROM account_applications WHERE id = ?`).get(appId).id, "invite:A");
  assert.equal(count(db, `SELECT COUNT(*) AS n FROM admin_audit_events WHERE target_ref = ?`, appId), 1);
  db.close();
});

test("批次 SQL:两次重发都基于同一张旧码,只有先提交者换码;旧码被撤、只剩一张有效码", () => {
  const db = migratedDb();
  const appId = seedApplication(db);
  batch(db, approveSteps(appId, "invite:A", "admin@example.com"));
  assert.deepEqual(batch(db, resendSteps(appId, "invite:A", "invite:B", "admin@example.com")), [1, 1, 1, 1]);
  assert.deepEqual(batch(db, resendSteps(appId, "invite:A", "invite:C", "admin@example.com")), [0, 0, 0, 0]);
  const codes = db.prepare(`SELECT id, revoked_at AS revokedAt FROM invitation_codes WHERE id LIKE 'invite:%' ORDER BY id`).all();
  assert.deepEqual(codes.map((row) => [row.id, row.revokedAt !== null]), [["invite:A", true], ["invite:B", false]]);
  db.close();
});

test("批次 SQL:旧码已被注册消费后,重发整批不生效(不撤已用码、不发新码)", () => {
  const db = migratedDb();
  const appId = seedApplication(db);
  batch(db, approveSteps(appId, "invite:A", "admin@example.com"));
  db.prepare(`UPDATE invitation_codes SET uses_count = 1 WHERE id = 'invite:A'`).run();
  assert.deepEqual(batch(db, resendSteps(appId, "invite:A", "invite:B", "admin@example.com")), [0, 0, 0, 0]);
  assert.equal(db.prepare(`SELECT revoked_at AS r FROM invitation_codes WHERE id = 'invite:A'`).get().r, null);
  // 发信失败的撤销语句同样不碰已用码。
  assert.equal(Number(db.prepare(MAIL_FAILED_REVOKE_SQL).run("invite:A").changes), 0);
  db.close();
});

test("批次 SQL:拒绝双击只生效一次、只留一条审计;拒绝后不可再通过", () => {
  const db = migratedDb();
  const appId = seedApplication(db);
  const rejectSteps = (auditId) => [
    [REJECT_AUDIT_SQL, auditId, "admin@example.com", appId, "note", appId],
    [REJECT_SQL, "admin@example.com", "note", appId],
  ];
  assert.deepEqual(batch(db, rejectSteps("audit-1")), [1, 1]);
  assert.deepEqual(batch(db, rejectSteps("audit-2")), [0, 0], "同一管理员双击的第二次不得补写审计");
  assert.equal(count(db, `SELECT COUNT(*) AS n FROM admin_audit_events WHERE target_ref = ?`, appId), 1);
  assert.deepEqual(batch(db, approveSteps(appId, "invite:A", "admin@example.com")), [0, 0, 0]);
  db.close();
});

test("DB 不变量:一邮箱一条待审;通过必挂码;未通过不得有投递状态", () => {
  const db = migratedDb();
  seedApplication(db, "apply:1", "dup@example.com");
  assert.throws(() => seedApplication(db, "apply:2", "dup@example.com"), /UNIQUE constraint failed/);
  db.prepare(`UPDATE account_applications SET status = 'rejected' WHERE id = 'apply:1'`).run();
  seedApplication(db, "apply:3", "dup@example.com");
  assert.throws(() => db.prepare(`UPDATE account_applications SET status = 'approved' WHERE id = 'apply:3'`).run(), /CHECK constraint failed/);
  assert.throws(() => db.prepare(`UPDATE account_applications SET mail_status = 'sent' WHERE id = 'apply:3'`).run(), /CHECK constraint failed/);
  assert.throws(() => db.prepare(`UPDATE account_applications SET invitation_id = 'invite:none' WHERE id = 'apply:3'`).run(), /CHECK constraint failed|FOREIGN KEY constraint failed/);
  db.close();
});
