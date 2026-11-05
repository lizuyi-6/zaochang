// 发信轮换策略的纯逻辑契约:池构造、失败归类、冷却排序。
// 这些函数不碰 D1 与网络,所以能直接单测;执行层见 app/api/_lib/mail-rotation.ts。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAILBOX_COOLDOWN_MS,
  classifySmtpFailure,
  isBlockingErrorCode,
  mailboxPool,
  orderMailboxes,
  shouldTryNextMailbox,
} from "../app/api/_lib/mail-rotation-policy.ts";

test("邮箱池:品牌发件箱在前、通用发件箱兜底,缺配置的不进池", () => {
  const pool = mailboxPool({
    AETHERGUARD_MAIL_HOST: "smtp.exmail.qq.com",
    AETHERGUARD_MAIL_USER: "AetherGuard@qiongyutech.com",
    AETHERGUARD_MAIL_PASS: "p1",
    MAIL_HOST_SMTP: "smtp.exmail.qq.com",
    MAIL_USER: "noreply@qiongyutech.com",
    MAIL_PASS: "p2",
  });
  assert.deepEqual(pool.map((m) => m.id), ["aetherguard", "zaochang"]);
  assert.equal(pool[0].user, "AetherGuard@qiongyutech.com");
});

test("邮箱池:两组 secret 指向同一邮箱时只留一个(不重复撞同一个 535)", () => {
  const pool = mailboxPool({
    AETHERGUARD_MAIL_HOST: "smtp.exmail.qq.com",
    AETHERGUARD_MAIL_USER: "Same@qiongyutech.com",
    AETHERGUARD_MAIL_PASS: "p",
    MAIL_HOST_SMTP: "smtp.exmail.qq.com",
    MAIL_USER: "same@qiongyutech.com",
    MAIL_PASS: "p",
  });
  assert.equal(pool.length, 1);
  assert.equal(pool[0].id, "aetherguard");
});

test("邮箱池:一个都没配齐时返回空池(调用方据此报 mail_not_configured)", () => {
  assert.deepEqual(mailboxPool({}), []);
  assert.deepEqual(mailboxPool({ AETHERGUARD_MAIL_USER: "a@b.c" }), []);
});

test("失败归类:535/534 认证被拒 → auth_blocked,值得换池", () => {
  const failure = classifySmtpFailure(new Error("smtp_auth_pass_535: 535 Error: authentication failed, system busy"));
  assert.equal(failure.kind, "auth_blocked");
  assert.equal(failure.code, "smtp_auth_pass_535");
  assert.equal(shouldTryNextMailbox(failure), true);
  assert.equal(classifySmtpFailure(new Error("smtp_auth_user_534: 534 too weak")).kind, "auth_blocked");
});

test("失败归类:限流码 → rate_limited,也值得换池", () => {
  const failure = classifySmtpFailure(new Error("smtp_mail_from_450: 450 too many connections"));
  assert.equal(failure.kind, "rate_limited");
  assert.equal(shouldTryNextMailbox(failure), true);
});

test("失败归类:收件人被拒 550 不换池(换发件箱也救不回来)", () => {
  const failure = classifySmtpFailure(new Error("smtp_rcpt_to_550: 550 mailbox not found"));
  assert.equal(failure.kind, "recipient_rejected");
  assert.equal(shouldTryNextMailbox(failure), false);
});

test("失败归类:未识别失败按 transient 处理,同样不换池", () => {
  const failure = classifySmtpFailure(new Error("smtp_eof"));
  assert.equal(failure.kind, "transient");
  assert.equal(shouldTryNextMailbox(failure), false);
  assert.equal(classifySmtpFailure("not an error").kind, "transient");
});

test("冷却判定:认证/限流类 error_code 才算被风控", () => {
  assert.equal(isBlockingErrorCode("smtp_auth_pass_535"), true);
  assert.equal(isBlockingErrorCode("smtp_mail_from_450"), true);
  assert.equal(isBlockingErrorCode("smtp_rcpt_to_550"), false);
  assert.equal(isBlockingErrorCode("auth_blocked"), true);
  assert.equal(isBlockingErrorCode(""), false);
});

test("发送顺序:未冷却的优先,冷却中的垫底(全冷却也不至于一封不发)", () => {
  const pool = mailboxPool({
    AETHERGUARD_MAIL_HOST: "h",
    AETHERGUARD_MAIL_USER: "a@x.com",
    AETHERGUARD_MAIL_PASS: "p",
    MAIL_HOST_SMTP: "h",
    MAIL_USER: "b@x.com",
    MAIL_PASS: "p",
  });
  assert.deepEqual(orderMailboxes(pool, new Set()).map((m) => m.id), ["aetherguard", "zaochang"]);
  assert.deepEqual(orderMailboxes(pool, new Set(["aetherguard"])).map((m) => m.id), ["zaochang", "aetherguard"]);
  assert.deepEqual(orderMailboxes(pool, new Set(["aetherguard", "zaochang"])).map((m) => m.id), ["aetherguard", "zaochang"]);
});

test("冷却期是 30 分钟(足够跨过腾讯风控的短时窗口,又不至于整天空转)", () => {
  assert.equal(MAILBOX_COOLDOWN_MS, 30 * 60 * 1000);
});