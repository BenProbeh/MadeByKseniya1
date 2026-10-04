/**
 * Email identity: sign-up with a one-time email code, login by email, password reset by email, accounts from
 * before email sign-in, and migration 008 on existing data. Emails go to the in-memory provider.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "./app.js";
import db, { closeDb, startDb } from "./db.js";
import { hashPassword } from "./auth.js";
import { CODE_PURPOSES, issueCode } from "./emailCodes.js";
import { emailSettings, emailTestOutbox, sendEmail, settleEmailJobs } from "./email/mailer.js";
import { migrations } from "./migrations.js";
import {
  DEFAULT_PASSWORD,
  cookieFrom,
  emailsTo,
  latestCode,
  loginByEmail,
  registerVerified,
  request,
  uniqueEmail,
} from "./testSupport.js";

const VERIFY_SUBJECT = "קוד האימות שלך ל־MadeByKseniya";
const RESET_SUBJECT = "קוד לאיפוס הסיסמה שלך";
const RESET_SENT = "אם קיים חשבון עם כתובת האימייל הזאת, שלחתי אליו קוד לאיפוס הסיסמה.";

let counter = 0;
const uniqueUsername = () => `ev_${Date.now().toString(36)}_${(counter += 1)}`;

const servers = [];
async function startServer() {
  const server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return server;
}

function register(server, overrides = {}) {
  return request(server, {
    method: "POST",
    path: "/api/auth/register",
    body: {
      username: uniqueUsername(),
      email: uniqueEmail("ev"),
      password: DEFAULT_PASSWORD,
      confirmPassword: DEFAULT_PASSWORD,
      firstName: "מאיה",
      lastName: "לוי",
      ...overrides,
    },
  });
}

const verify = (server, email, code, extra = {}) =>
  request(server, { method: "POST", path: "/api/auth/verify-email", body: { email, code, ...extra } });

const wrongCodeFor = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

async function insertLegacyUser({ role = "customer" } = {}) {
  const username = uniqueUsername();
  const { rows } = await db.query(
    `INSERT INTO users (username, password_hash, first_name, last_name, role, avatar_url, account_status)
     VALUES ($1, $2, 'ותיקה', 'מהאתר', $3, '/api/uploads/avatars/legacy.png', 'active') RETURNING id`,
    [username, await hashPassword(DEFAULT_PASSWORD), role]
  );
  return { id: rows[0].id, username };
}

describe("email sign-up, verification and password reset (PostgreSQL)", () => {
  let server;

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "";
    process.env.PGLITE_DIR = "memory://";
    process.env.EMAIL_PROVIDER = "memory";
    process.env.APP_PUBLIC_URL = "https://made-by-kseniya.example";
    await startDb();
    server = await startServer();
  });

  after(async () => {
    await settleEmailJobs();
    for (const s of servers) await new Promise((r) => s.close(r));
    await closeDb();
  });

  it("sends the verification email with the exact wording, a large code and a plain-text version", async () => {
    const email = uniqueEmail("wording");
    const reg = await register(server, { email, firstName: "מאיה" });
    assert.equal(reg.status, 202);
    const [message] = await emailsTo(email);
    assert.equal(message.subject, VERIFY_SUBJECT);
    const code = /\b(\d{6})\b/.exec(message.text)[1];
    assert.ok(
      message.text.startsWith(
        `היי מאיה,\n\nכיף שהצטרפת אליי.\nזה קוד האימות שלך:\n\n${code}\n\nהקוד תקף ל־10 דקות.\nאם לא ביקשת ליצור חשבון, אפשר להתעלם מהמייל הזה.`
      ),
      message.text
    );
    assert.match(message.html, /dir="rtl"/);
    assert.match(message.html, /Secular One/);
    assert.ok(message.html.includes(code));
    assert.match(message.html, new RegExp(`font-size:\\s*(3[2-9]|4\\d)px[^>]*>\\s*${code}`), "the code is shown large");
    assert.ok(!/<script/i.test(message.html), "no JavaScript in emails");
    for (const [, style] of message.html.matchAll(/style="([^"]*)"/g)) {
      assert.ok(!/:\s*$/.test(style) && !/font-family:\s*$/.test(style), `style attribute cut short: ${style.slice(-40)}`);
    }
    assert.ok(!/style="[^"]*font-family:\s*"/.test(message.html), "font names inside style attributes use single quotes");

    const stored = await db.query(
      `SELECT c.code_hash, d.status, d.provider_message_id FROM email_codes c
         JOIN email_deliveries d ON d.recipient_email = c.email_normalized
        WHERE c.email_normalized = $1`,
      [email]
    );
    assert.equal(stored.rows.length, 1);
    assert.ok(!stored.rows[0].code_hash.includes(code), "only a hash of the code is stored");
    assert.equal(stored.rows[0].status, "sent");
    assert.ok(stored.rows[0].provider_message_id);
  });

  it("login is blocked until the email is verified, then works with email + password", async () => {
    const email = uniqueEmail("blocked");
    await register(server, { email });
    const early = await loginByEmail(server, email);
    assert.equal(early.res.status, 403);
    assert.equal(early.res.json.error.code, "EMAIL_NOT_VERIFIED");
    assert.equal(early.res.json.email, email);
    assert.equal(early.cookie, null);

    const wrongPassword = await loginByEmail(server, email, "not-the-password");
    assert.equal(wrongPassword.res.status, 401, "the pending state is only revealed after the right password");

    const code = await latestCode(email);
    assert.equal((await verify(server, email, code)).status, 200);
    const later = await loginByEmail(server, email);
    assert.equal(later.res.status, 200);
    assert.ok(later.cookie);
  });

  it("wrong, expired and reused codes are rejected", async () => {
    const email = uniqueEmail("codes");
    await register(server, { email });
    const code = await latestCode(email);

    const wrong = await verify(server, email, wrongCodeFor(code));
    assert.equal(wrong.status, 400);
    assert.equal(wrong.json.error.code, "INVALID_CODE");
    assert.equal(wrong.json.attemptsLeft, 4);

    await db.query(`UPDATE email_codes SET expires_at = now() - interval '1 minute' WHERE email_normalized = $1`, [email]);
    const expired = await verify(server, email, code);
    assert.equal(expired.status, 400, "an expired code no longer works");

    const { rows } = await db.query(`SELECT id FROM users WHERE email_normalized = $1`, [email]);
    const fresh = await issueCode({ userId: rows[0].id, purpose: CODE_PURPOSES.VERIFY_EMAIL, email });
    const ok = await verify(server, email, fresh);
    assert.equal(ok.status, 200);
    const reused = await verify(server, email, fresh);
    assert.equal(reused.status, 400, "a used code can't be used again");
    const status = await db.query(`SELECT account_status, email_verified FROM users WHERE id = $1`, [rows[0].id]);
    assert.deepEqual(status.rows[0], { account_status: "active", email_verified: true });
  });

  it("a new code invalidates the previous one", async () => {
    const email = uniqueEmail("rotate");
    await register(server, { email });
    const first = await latestCode(email);
    const { rows } = await db.query(`SELECT id FROM users WHERE email_normalized = $1`, [email]);
    const second = await issueCode({ userId: rows[0].id, purpose: CODE_PURPOSES.VERIFY_EMAIL, email });
    if (second === first) return; // one-in-a-million identical draw
    assert.equal((await verify(server, email, first)).status, 400);
    assert.equal((await verify(server, email, second)).status, 200);
  });

  it("five wrong attempts burn the code and lock the address", async () => {
    const other = await startServer();
    const email = uniqueEmail("lock");
    await register(other, { email });
    const code = await latestCode(email);
    const wrong = wrongCodeFor(code);
    for (let i = 1; i <= 4; i += 1) {
      const res = await verify(other, email, wrong);
      assert.equal(res.status, 400);
      assert.equal(res.json.attemptsLeft, 5 - i);
    }
    const fifth = await verify(other, email, wrong);
    assert.equal(fifth.status, 429);
    assert.equal(fifth.json.error.code, "CODE_LOCKED");
    const burned = await db.query(`SELECT attempt_count, invalidated_at FROM email_codes WHERE email_normalized = $1`, [email]);
    assert.equal(burned.rows[0].attempt_count, 5);
    assert.ok(burned.rows[0].invalidated_at, "the code itself is dead after 5 attempts");
    assert.equal((await verify(other, email, code)).status, 429);
  });

  it("resending is limited and answers the same for addresses without an account", async () => {
    const other = await startServer();
    const email = uniqueEmail("resend");
    await register(other, { email });
    const tooSoon = await request(other, { method: "POST", path: "/api/auth/verify-email/resend", body: { email } });
    assert.equal(tooSoon.status, 429);
    assert.equal(tooSoon.json.error.code, "RESEND_TOO_SOON");
    assert.ok(tooSoon.json.retryAfterSeconds > 0 && tooSoon.json.retryAfterSeconds <= 60);

    const unknown = uniqueEmail("nobody");
    const res = await request(other, { method: "POST", path: "/api/auth/verify-email/resend", body: { email: unknown } });
    assert.equal(res.status, 202);
    assert.equal(res.json.message, "שלחתי קוד אימות לכתובת האימייל שלך. הקוד תקף ל־10 דקות.");
    assert.equal((await emailsTo(unknown)).length, 0);
  });

  it("one account per email address, whatever the letter case, without revealing it", async () => {
    const owner = await registerVerified(server, { firstName: "בעלת" });
    const before = emailTestOutbox.length;
    const attempt = await register(await startServer(), { email: owner.email.toUpperCase() });
    assert.equal(attempt.status, 202, "same answer as a new address");
    assert.equal(attempt.json.pendingVerification, true);
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM users WHERE lower(email_normalized) = $1`, [owner.email]);
    assert.equal(rows[0].n, 1);
    const sent = (await emailsTo(owner.email)).slice(-1)[0];
    assert.ok(emailTestOutbox.length > before);
    assert.equal(sent.subject, "ניסיון להשתמש בכתובת האימייל שלך");
    assert.ok(!/\b\d{6}\b/.test(sent.text), "no code goes out for an address that already has an account");

    await assert.rejects(
      db.query(
        `INSERT INTO users (username, password_hash, first_name, last_name, email, email_normalized, account_status)
         VALUES ($1, 'x', 'א', 'ב', $2, $2, 'active')`,
        [uniqueUsername(), owner.email]
      ),
      (err) => err.code === "23505"
    );
  });

  it("signing up again with an unverified address updates that sign-up instead of adding a user", async () => {
    const email = uniqueEmail("again");
    const first = await register(await startServer(), { email, username: uniqueUsername() });
    assert.equal(first.status, 202);
    const secondName = uniqueUsername();
    const second = await register(await startServer(), { email, username: secondName, firstName: "שנייה" });
    assert.equal(second.status, 202);
    const { rows } = await db.query(`SELECT username, first_name FROM users WHERE email_normalized = $1`, [email]);
    assert.deepEqual(rows, [{ username: secondName, first_name: "שנייה" }]);
  });

  it("a code for one purpose never works for the other", async () => {
    const user = await registerVerified(server);
    const req = await request(server, { method: "POST", path: "/api/auth/password-reset/request", body: { email: user.email } });
    assert.equal(req.status, 200);
    const resetCode = await latestCode(user.email, RESET_SUBJECT);
    assert.equal((await verify(server, user.email, resetCode)).status, 400, "reset code is not a verification code");

    const pendingEmail = uniqueEmail("purpose");
    await register(server, { email: pendingEmail });
    const verifyCode = await latestCode(pendingEmail);
    const asReset = await request(server, {
      method: "POST",
      path: "/api/auth/password-reset/verify",
      body: { email: pendingEmail, code: verifyCode },
    });
    assert.equal(asReset.status, 400, "verification code is not a reset code");
  });

  it("forgot password: same answer for every address; the password changes only after a valid code", async () => {
    const other = await startServer();
    const user = await registerVerified(other, { firstName: "רוני" });
    const unknown = uniqueEmail("ghost");

    const forUnknown = await request(other, { method: "POST", path: "/api/auth/password-reset/request", body: { email: unknown } });
    const forUser = await request(other, { method: "POST", path: "/api/auth/password-reset/request", body: { email: user.email } });
    assert.equal(forUnknown.status, 200);
    assert.equal(forUser.status, 200);
    assert.equal(forUnknown.json.message, RESET_SENT);
    assert.deepEqual(forUnknown.json, forUser.json);
    assert.equal((await emailsTo(unknown)).length, 0);

    const resetMail = (await emailsTo(user.email)).filter((m) => m.subject === RESET_SUBJECT).at(-1);
    const code = /\b(\d{6})\b/.exec(resetMail.text)[1];
    assert.ok(
      resetMail.text.startsWith(
        `היי רוני,\n\nקיבלתי בקשה לשינוי הסיסמה שלך.\n\nקוד האימות שלך הוא:\n\n${code}\n\nהקוד תקף ל־10 דקות.\nאם לא ביקשת לשנות את הסיסמה, אפשר להתעלם מהמייל הזה.`
      ),
      resetMail.text
    );

    const bogus = await request(other, {
      method: "POST",
      path: "/api/auth/password-reset/complete",
      body: { resetToken: "x".repeat(43), newPassword: "brand-new-pass-1", confirmPassword: "brand-new-pass-1" },
    });
    assert.equal(bogus.status, 400);
    const wrong = await request(other, { method: "POST", path: "/api/auth/password-reset/verify", body: { email: user.email, code: wrongCodeFor(code) } });
    assert.equal(wrong.status, 400);
    assert.equal((await loginByEmail(other, user.email)).res.status, 200, "password unchanged so far");

    const verified = await request(other, { method: "POST", path: "/api/auth/password-reset/verify", body: { email: user.email, code } });
    assert.equal(verified.status, 200);
    const resetToken = verified.json.resetToken;
    const done = await request(other, {
      method: "POST",
      path: "/api/auth/password-reset/complete",
      body: { resetToken, newPassword: "brand-new-pass-1", confirmPassword: "brand-new-pass-1" },
    });
    assert.equal(done.status, 200);
    assert.equal(done.json.email, user.email);

    assert.equal((await request(other, { path: "/api/auth/me", cookies: [user.cookie] })).status, 401, "sessions are revoked");
    assert.equal((await loginByEmail(other, user.email)).res.status, 401, "old password no longer works");
    assert.equal((await loginByEmail(other, user.email, "brand-new-pass-1")).res.status, 200);

    const again = await request(other, {
      method: "POST",
      path: "/api/auth/password-reset/complete",
      body: { resetToken, newPassword: "another-pass-22", confirmPassword: "another-pass-22" },
    });
    assert.equal(again.status, 400, "the reset token works once");
    const codeAgain = await request(other, { method: "POST", path: "/api/auth/password-reset/verify", body: { email: user.email, code } });
    assert.equal(codeAgain.status, 400, "the reset code works once");
  });

  it("accounts from before email sign-in keep their data and add a verified address once", async () => {
    const legacy = await insertLegacyUser({ role: "admin" });
    const login = await request(server, {
      method: "POST",
      path: "/api/auth/login",
      body: { username: legacy.username, password: DEFAULT_PASSWORD },
    });
    assert.equal(login.status, 200, login.raw);
    const cookie = cookieFrom(login.setCookie);
    assert.equal(login.json.user.email, null);
    assert.equal(login.json.user.emailVerified, false);

    const date = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const booking = await request(server, {
      method: "POST",
      path: "/api/appointments",
      cookies: [cookie],
      body: { clientName: "ותיקה מהאתר", serviceId: 1, date, time: "11:00" },
    });
    assert.equal(booking.status, 403);
    assert.equal(booking.json.code, "EMAIL_NOT_VERIFIED");

    const email = uniqueEmail("legacy");
    const start = await request(server, { method: "POST", path: "/api/profile/email", cookies: [cookie], body: { email } });
    assert.equal(start.status, 202, start.raw);
    const code = await latestCode(email);

    const stranger = await registerVerified(server);
    const stolen = await request(server, {
      method: "POST",
      path: "/api/profile/email/verify",
      cookies: [stranger.cookie],
      body: { email, code },
    });
    assert.equal(stolen.status, 400, "the code only links the address to the account that asked for it");

    const linked = await request(server, { method: "POST", path: "/api/profile/email/verify", cookies: [cookie], body: { email, code } });
    assert.equal(linked.status, 200, linked.raw);
    assert.equal(linked.json.user.email, email);
    assert.equal(linked.json.user.emailVerified, true);
    assert.equal(linked.json.user.role, "admin", "role unchanged");
    assert.equal(linked.json.user.avatarUrl, "/api/uploads/avatars/legacy.png", "avatar unchanged");

    const byUsername = await request(server, {
      method: "POST",
      path: "/api/auth/login",
      body: { username: legacy.username, password: DEFAULT_PASSWORD },
    });
    assert.equal(byUsername.status, 401, "after linking, sign-in is by email");
    assert.equal((await loginByEmail(server, email)).res.status, 200);
  });

  it("when email is off, sign-up and reset say so and nothing is marked sent", async () => {
    process.env.EMAIL_PROVIDER = "off";
    try {
      const reg = await register(server);
      assert.equal(reg.status, 503);
      assert.equal(reg.json.error.code, "EMAIL_UNAVAILABLE");
      const reset = await request(server, { method: "POST", path: "/api/auth/password-reset/request", body: { email: uniqueEmail("off") } });
      assert.equal(reset.status, 503);
      const health = await request(server, { path: "/api/health" });
      assert.equal(health.json.mailProvider, "off");
      assert.equal(health.json.configured, false);

      const to = uniqueEmail("record");
      const result = await sendEmail({ type: "test", to, subject: "s", html: "<p>h</p>", text: "t" });
      assert.deepEqual(result, { ok: false, reason: "not_configured" });
      const { rows } = await db.query(`SELECT status, error_code FROM email_deliveries WHERE recipient_email = $1`, [to]);
      assert.deepEqual(rows, [{ status: "failed", error_code: "not_configured" }]);
    } finally {
      process.env.EMAIL_PROVIDER = "memory";
    }
  });

  it("codes, reset tokens and keys never reach the logs", async () => {
    const lines = [];
    const original = { log: console.log, error: console.error, warn: console.warn };
    for (const level of Object.keys(original)) console[level] = (...args) => lines.push(args.join(" "));
    let code;
    let resetToken;
    try {
      const other = await startServer();
      const user = await registerVerified(other);
      code = (await emailsTo(user.email)).find((m) => m.subject === VERIFY_SUBJECT).text.match(/\b(\d{6})\b/)[1];
      await request(other, { method: "POST", path: "/api/auth/password-reset/request", body: { email: user.email } });
      const resetCode = await latestCode(user.email, RESET_SUBJECT);
      const verified = await request(other, { method: "POST", path: "/api/auth/password-reset/verify", body: { email: user.email, code: resetCode } });
      resetToken = verified.json.resetToken;
      code = `${code}|${resetCode}`;
    } finally {
      Object.assign(console, original);
    }
    const logText = lines.join("\n");
    for (const secret of code.split("|")) assert.ok(!logText.includes(secret), "no code in logs");
    assert.ok(!logText.includes(resetToken), "no reset token in logs");
    assert.ok(!/@example\.com/.test(logText.replace(/\w\*\*\*@example\.com/g, "")), "addresses are masked");
  });

  it("the sender is always MadeByKseniya, never a provider or technical name", () => {
    const saved = { ...process.env };
    try {
      process.env.RESEND_API_KEY = "re_test_value";
      process.env.RESEND_FROM_EMAIL = "hello@madebykseniya.co.il";
      process.env.RESEND_FROM_NAME = "MadeByKseniya";
      assert.equal(emailSettings().from, "MadeByKseniya <hello@madebykseniya.co.il>");
      process.env.RESEND_FROM_NAME = "Resend";
      assert.equal(emailSettings().from, "MadeByKseniya <hello@madebykseniya.co.il>");
      process.env.RESEND_FROM_NAME = "railway-noreply";
      assert.equal(emailSettings().from, "MadeByKseniya <hello@madebykseniya.co.il>");
      delete process.env.RESEND_FROM_NAME;
      assert.equal(emailSettings().from, "MadeByKseniya <hello@madebykseniya.co.il>");
    } finally {
      for (const key of ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "RESEND_FROM_NAME"]) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  });
});

describe("migration 008 on existing data", () => {
  it("keeps every user, role, avatar, phone and booking, and doesn't mark anyone verified", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite();
    await pg.waitReady;
    const upTo = (id) => migrations.slice(0, migrations.findIndex((m) => m.id === id));
    for (const m of upTo("008_email_identity")) await pg.exec(m.sql);

    await pg.query(
      `INSERT INTO users (username, password_hash, first_name, last_name, role, avatar_url, phone_e164, phone_display)
       VALUES ('benexample', '$2b$hash', 'Ben', 'Example', 'owner', '/api/uploads/avatars/dog.png', '+972501112222', '050-111-2222'),
              ('customer1', '$2b$hash', 'לקוחה', 'ותיקה', 'customer', NULL, NULL, NULL)`
    );
    await pg.query(
      `INSERT INTO appointments (client_name, phone, service_id, date, time, user_id, status, duration_min, starts_at, ends_at)
       VALUES ('לקוחה ותיקה', '0501234567', 1, '2030-01-01', '10:00', 2, 'confirmed', 60,
               '2030-01-01 08:00:00+00', '2030-01-01 09:00:00+00')`
    );
    const before = await pg.query(`SELECT id, username, role, avatar_url, phone_e164, password_hash FROM users ORDER BY id`);

    await pg.exec(migrations.find((m) => m.id === "008_email_identity").sql);

    const after = await pg.query(
      `SELECT id, username, role, avatar_url, phone_e164, password_hash, email, email_verified, account_status FROM users ORDER BY id`
    );
    assert.equal(after.rows.length, 2);
    after.rows.forEach((row, i) => {
      const { email, email_verified, account_status, ...rest } = row;
      assert.deepEqual(rest, before.rows[i]);
      assert.equal(email, null);
      assert.equal(email_verified, false, "nobody is auto-verified");
      assert.equal(account_status, "active", "existing accounts keep signing in");
    });
    const appt = await pg.query(`SELECT status, phone FROM appointments`);
    assert.deepEqual(appt.rows, [{ status: "confirmed", phone: "0501234567" }]);

    const pending = await pg.query(`SELECT column_default FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'account_status'`);
    assert.match(pending.rows[0].column_default, /pending_verification/);
    await pg.close();
  });
});
