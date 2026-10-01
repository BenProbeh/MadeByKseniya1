/**
 * "Forgot password" by SMS: request -> verify -> complete, and every abuse case around it.
 * Runs against an in-memory PostgreSQL engine (PGlite) with the in-memory SMS provider.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "./app.js";
import db, { closeDb, startDb } from "./db.js";
import { SESSION_COOKIE, hashPassword } from "./auth.js";
import { normalizePhone } from "./phone.js";
import { activeSmsProvider, sendSms, smsTestOutbox } from "./sms.js";
import {
  MAX_CODE_ATTEMPTS,
  generateResetCode,
  hashResetCode,
  resetCodeMatches,
  settleResetDispatches,
} from "./passwordReset.js";
import { RESET_MESSAGES } from "./routes/passwordReset.js";

const OLD_PASSWORD = "old-pass-123";
const NEW_PASSWORD = "new-pass-456";
const servers = [];
let server;

function request(srv, { method = "POST", path, body, cookies = [] }) {
  return new Promise((resolve, reject) => {
    const payload = body != null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: "127.0.0.1",
        port: srv.address().port,
        method,
        path,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...(cookies.length ? { Cookie: cookies.join("; ") } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = raw;
          }
          resolve({ status: res.statusCode, setCookie: res.headers["set-cookie"] || [], json, raw });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function startServer() {
  const srv = http.createServer(createApp());
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  servers.push(srv);
  return srv;
}

let seq = 0;
async function createUser({ phone } = {}) {
  seq += 1;
  const number = phone || `052-7${String(seq).padStart(6, "0")}`;
  const parsed = normalizePhone(number);
  const username = `reset_${seq}_${Date.now().toString(36)}`;
  const { rows } = await db.query(
    `INSERT INTO users (username, password_hash, first_name, last_name, phone_e164, phone_display)
     VALUES ($1, $2, 'דנה', 'לוי', $3, $4) RETURNING id`,
    [username, await hashPassword(OLD_PASSWORD), parsed.e164, parsed.display]
  );
  return { id: rows[0].id, username, phone: number, e164: parsed.e164 };
}

const freshPhone = () => {
  seq += 1;
  return `054-6${String(seq).padStart(6, "0")}`;
};

async function requestCode(srv, phone) {
  const res = await request(srv, { path: "/api/auth/password-reset/request", body: { phone } });
  await settleResetDispatches();
  return res;
}

const smsFor = (e164) => smsTestOutbox.filter((m) => m.to === e164);
const lastCodeFor = (e164) => smsFor(e164).at(-1)?.body.match(/הוא (\d{6})/)?.[1] ?? null;
const verify = (srv, phone, code) => request(srv, { path: "/api/auth/password-reset/verify", body: { phone, code } });
const complete = (srv, resetToken, newPassword = NEW_PASSWORD, confirmPassword = newPassword) =>
  request(srv, { path: "/api/auth/password-reset/complete", body: { resetToken, newPassword, confirmPassword } });
const login = (srv, username, password) =>
  request(srv, { path: "/api/auth/login", body: { username, password, rememberMe: true } });
const cookieFrom = (setCookie) => setCookie.find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.split(";")[0] || null;
const wrongCode = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

async function tokenFor(srv, user) {
  await requestCode(srv, user.phone);
  const res = await verify(srv, user.phone, lastCodeFor(user.e164));
  assert.equal(res.status, 200, res.raw);
  return res.json.resetToken;
}

describe("forgot password by SMS", () => {
  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "";
    process.env.PGLITE_DIR = "memory://";
    process.env.SMS_PROVIDER = "memory";
    await startDb();
    server = await startServer();
  });

  after(async () => {
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
    await closeDb();
  });

  beforeEach(() => {
    process.env.SMS_PROVIDER = "memory";
  });

  it("codes are 6 random digits from the CSPRNG and only their scrypt hash is comparable", async () => {
    const codes = new Set(Array.from({ length: 200 }, generateResetCode));
    for (const code of codes) assert.match(code, /^\d{6}$/);
    assert.ok(codes.size > 190, "codes repeat far too often");
    const hash = await hashResetCode("123456");
    assert.match(hash, /^scrypt\$/);
    assert.ok(!hash.includes("123456"));
    assert.notEqual(hash, await hashResetCode("123456"), "every hash has its own salt");
    assert.equal(await resetCodeMatches("123456", hash), true);
    assert.equal(await resetCodeMatches("123457", hash), false);
  });

  it("the full flow: SMS code -> new password; old password and every old session stop working", async () => {
    const srv = await startServer();
    const user = await createUser();
    const before = await login(srv, user.username, OLD_PASSWORD);
    const oldCookie = cookieFrom(before.setCookie);
    assert.ok(oldCookie);

    const sent = await requestCode(srv, user.phone);
    assert.equal(sent.status, 200);
    assert.deepEqual(sent.json, {
      success: true,
      message: RESET_MESSAGES.sent,
      resendAfterSeconds: 60,
      expiresInSeconds: 600,
    });
    const messages = smsFor(user.e164);
    assert.equal(messages.length, 1);
    const code = lastCodeFor(user.e164);
    assert.match(code, /^\d{6}$/);
    assert.match(messages[0].body, /^MadeByKseniya: קוד האימות שלך לשינוי הסיסמה הוא \d{6}\. הקוד תקף ל־10 דקות\./);

    const stored = await db.query(`SELECT code_hash, expires_at - created_at AS ttl FROM password_resets WHERE user_id = $1`, [user.id]);
    assert.equal(stored.rows.length, 1);
    assert.ok(!stored.rows[0].code_hash.includes(code), "the raw code is never stored");

    const verified = await verify(srv, user.phone, code);
    assert.equal(verified.status, 200);
    assert.match(verified.json.resetToken, /^[a-f0-9]{64}$/);
    assert.ok(!verified.raw.includes(code), "the code is never echoed back");

    const done = await complete(srv, verified.json.resetToken);
    assert.equal(done.status, 200, done.raw);
    assert.equal(done.json.message, "הסיסמה עודכנה בהצלחה. אפשר להתחבר עם הסיסמה החדשה.");
    assert.equal(done.json.username, user.username);

    const row = await db.query(`SELECT password_hash FROM users WHERE id = $1`, [user.id]);
    assert.match(row.rows[0].password_hash, /^\$2[aby]\$/);
    assert.ok(!row.rows[0].password_hash.includes(NEW_PASSWORD));
    assert.equal((await login(srv, user.username, OLD_PASSWORD)).status, 401);
    assert.equal((await login(srv, user.username, NEW_PASSWORD)).status, 200);
    const me = await request(srv, { method: "GET", path: "/api/auth/me", cookies: [oldCookie] });
    assert.equal(me.status, 401, "sessions from before the reset are signed out");

    const audit = await db.query(
      `SELECT action, actor_user_id, details FROM audit_log WHERE target_user_id = $1 ORDER BY id`,
      [user.id]
    );
    assert.deepEqual(
      audit.rows.map((r) => r.action),
      ["password_reset_requested", "password_reset_completed"]
    );
    for (const r of audit.rows) assert.deepEqual(r.details, { channel: "sms" });
  });

  it("every format of the same number reaches the same account; invalid numbers are refused", async () => {
    const user = await createUser({ phone: "050-7771234" });
    for (const format of ["0507771234", "+972 50-777-1234", "972507771234", "(050) 777 1234"]) {
      assert.equal(normalizePhone(format).e164, user.e164, format);
    }
    const srv = await startServer();
    await requestCode(srv, "+972-50-777-1234");
    assert.equal(smsFor(user.e164).length, 1);

    const before = smsTestOutbox.length;
    for (const bad of ["", "123", "abc", "03-1234567", "+14155550100", "050-12345", 501234567, null]) {
      const res = await request(srv, { path: "/api/auth/password-reset/request", body: { phone: bad } });
      assert.equal(res.status, 400, String(bad));
      assert.equal(res.json.error.code, "VALIDATION_ERROR");
    }
    await settleResetDispatches();
    assert.equal(smsTestOutbox.length, before);
  });

  it("a number without an account gets exactly the same answer, and nothing is sent or stored", async () => {
    const srv = await startServer();
    const user = await createUser();
    const stranger = freshPhone();
    const known = await requestCode(srv, user.phone);
    const unknown = await requestCode(srv, stranger);
    assert.equal(unknown.status, known.status);
    assert.deepEqual(unknown.json, known.json);
    assert.equal(smsFor(normalizePhone(stranger).e164).length, 0);
    const rows = await db.query(`SELECT 1 FROM password_resets WHERE phone_e164 = $1`, [normalizePhone(stranger).e164]);
    assert.equal(rows.rows.length, 0);

    const wrongKnown = await verify(srv, user.phone, wrongCode(lastCodeFor(user.e164)));
    const wrongUnknown = await verify(srv, stranger, "123456");
    assert.equal(wrongUnknown.status, wrongKnown.status);
    assert.deepEqual(wrongUnknown.json, wrongKnown.json);
  });

  it("a removed account gets no code", async () => {
    const user = await createUser();
    await db.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [user.id]);
    const res = await requestCode(await startServer(), user.phone);
    assert.equal(res.status, 200);
    assert.equal(smsFor(user.e164).length, 0);
  });

  it("wrong codes are refused with the attempts left; the right code still works afterwards", async () => {
    const srv = await startServer();
    const user = await createUser();
    await requestCode(srv, user.phone);
    const code = lastCodeFor(user.e164);
    const wrong = await verify(srv, user.phone, wrongCode(code));
    assert.equal(wrong.status, 400);
    assert.equal(wrong.json.error.code, "INVALID_CODE");
    assert.equal(wrong.json.attemptsLeft, MAX_CODE_ATTEMPTS - 1);
    for (const bad of ["12345", "1234567", "abcdef", "", 123456]) {
      assert.equal((await verify(srv, user.phone, bad)).json.error.code, "VALIDATION_ERROR", String(bad));
    }
    assert.equal((await verify(srv, user.phone, code)).status, 200);
  });

  it("an expired code is refused", async () => {
    const srv = await startServer();
    const user = await createUser();
    await requestCode(srv, user.phone);
    await db.query(`UPDATE password_resets SET expires_at = now() - interval '1 second' WHERE user_id = $1`, [user.id]);
    const res = await verify(srv, user.phone, lastCodeFor(user.e164));
    assert.equal(res.status, 400);
    assert.equal(res.json.error.code, "INVALID_CODE");
  });

  it("a code works once and a reset token works once (no replay)", async () => {
    const srv = await startServer();
    const user = await createUser();
    await requestCode(srv, user.phone);
    const code = lastCodeFor(user.e164);
    const first = await verify(srv, user.phone, code);
    assert.equal(first.status, 200);
    assert.equal((await verify(srv, user.phone, code)).json.error.code, "INVALID_CODE");
    assert.equal((await complete(srv, first.json.resetToken)).status, 200);
    const again = await complete(srv, first.json.resetToken, "another-pass-789");
    assert.equal(again.status, 400);
    assert.equal(again.json.error.code, "RESET_EXPIRED");
    assert.equal((await login(srv, user.username, "another-pass-789")).status, 401);
  });

  it("a new code retires the previous one", async () => {
    const user = await createUser();
    await requestCode(await startServer(), user.phone);
    const firstCode = lastCodeFor(user.e164);
    const srv = await startServer();
    await requestCode(srv, user.phone);
    const secondCode = lastCodeFor(user.e164);
    assert.equal(smsFor(user.e164).length, 2);
    if (firstCode !== secondCode) {
      assert.equal((await verify(srv, user.phone, firstCode)).json.error.code, "INVALID_CODE");
    }
    assert.equal((await verify(srv, user.phone, secondCode)).status, 200);
    const live = await db.query(
      `SELECT count(*)::int AS n FROM password_resets WHERE user_id = $1 AND invalidated_at IS NULL`,
      [user.id]
    );
    assert.equal(live.rows[0].n, 1);
  });

  it(`locks verification after ${MAX_CODE_ATTEMPTS} wrong codes, even for the right code`, async () => {
    const srv = await startServer();
    const user = await createUser();
    await requestCode(srv, user.phone);
    const code = lastCodeFor(user.e164);
    const results = [];
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i += 1) results.push(await verify(srv, user.phone, wrongCode(code)));
    assert.deepEqual(
      results.map((r) => r.status),
      [400, 400, 400, 400, 429]
    );
    assert.equal(results.at(-1).json.error.code, "CODE_LOCKED");
    const locked = await verify(srv, user.phone, code);
    assert.equal(locked.status, 429);
    assert.ok(locked.json.retryAfterSeconds > 0);
    const row = await db.query(`SELECT attempt_count, invalidated_at FROM password_resets WHERE user_id = $1`, [user.id]);
    assert.equal(row.rows[0].attempt_count, MAX_CODE_ATTEMPTS);
    assert.ok(row.rows[0].invalidated_at, "the code itself is burned too");
  });

  it("resending waits for the cooldown, the same way for every number", async () => {
    const srv = await startServer();
    const user = await createUser();
    const stranger = freshPhone();
    for (const phone of [user.phone, stranger]) {
      assert.equal((await requestCode(srv, phone)).status, 200);
      const again = await requestCode(srv, phone);
      assert.equal(again.status, 429);
      assert.equal(again.json.error.code, "RESEND_TOO_SOON");
      assert.ok(again.json.retryAfterSeconds > 0 && again.json.retryAfterSeconds <= 60);
    }
    assert.equal(smsFor(user.e164).length, 1);
  });

  it("limits requests per IP", async () => {
    const srv = await startServer();
    const statuses = [];
    for (let i = 0; i < 11; i += 1) statuses.push((await requestCode(srv, freshPhone())).status);
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(200));
    assert.equal(statuses[10], 429);
  });

  it("limits codes per account per hour, even across server restarts", async () => {
    const user = await createUser();
    for (let i = 0; i < 6; i += 1) await requestCode(await startServer(), user.phone);
    assert.equal(smsFor(user.e164).length, 5);
  });

  it("a code only works for the number it was sent to, and only while that number is on the account", async () => {
    const srv = await startServer();
    const a = await createUser();
    const b = await createUser();
    await requestCode(srv, a.phone);
    const code = lastCodeFor(a.e164);
    assert.equal((await verify(srv, b.phone, code)).json.error.code, "INVALID_CODE");
    await db.query(`UPDATE users SET phone_e164 = $1 WHERE id = $2`, [normalizePhone(freshPhone()).e164, a.id]);
    assert.equal((await verify(srv, a.phone, code)).json.error.code, "INVALID_CODE");
  });

  it("the password can't change before the code is verified, and mismatched passwords are refused", async () => {
    const srv = await startServer();
    const forged = await complete(srv, "a".repeat(64));
    assert.equal(forged.json.error.code, "RESET_EXPIRED");
    assert.equal((await complete(srv, "not-a-token")).json.error.code, "RESET_EXPIRED");

    const user = await createUser();
    const token = await tokenFor(srv, user);
    const mismatch = await complete(srv, token, NEW_PASSWORD, "something-else");
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.json.error.code, "VALIDATION_ERROR");
    assert.equal((await complete(srv, token, "short")).json.error.code, "VALIDATION_ERROR");
    assert.equal((await login(srv, user.username, OLD_PASSWORD)).status, 200, "nothing changed yet");
    assert.equal((await complete(srv, token)).status, 200, "the token survives a refused attempt");
  });

  it("a verified token expires after 15 minutes", async () => {
    const srv = await startServer();
    const user = await createUser();
    const token = await tokenFor(srv, user);
    await db.query(`UPDATE password_resets SET reset_expires_at = now() - interval '1 second' WHERE user_id = $1`, [user.id]);
    assert.equal((await complete(srv, token)).json.error.code, "RESET_EXPIRED");
    assert.equal((await login(srv, user.username, OLD_PASSWORD)).status, 200);
  });

  it("two simultaneous completions with one token: exactly one wins", async () => {
    const srv = await startServer();
    const user = await createUser();
    const token = await tokenFor(srv, user);
    const results = await Promise.all([complete(srv, token, "first-pass-111"), complete(srv, token, "second-pass-222")]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
    const winner = results[0].status === 200 ? "first-pass-111" : "second-pass-222";
    assert.equal((await login(srv, user.username, winner)).status, 200);
  });

  it("codes never appear in logs or API responses", async () => {
    const srv = await startServer();
    const user = await createUser();
    const lines = [];
    const original = { log: console.log, warn: console.warn, error: console.error };
    for (const level of Object.keys(original)) console[level] = (...args) => lines.push(args.join(" "));
    try {
      const sent = await requestCode(srv, user.phone);
      const code = lastCodeFor(user.e164);
      const wrong = await verify(srv, user.phone, wrongCode(code));
      const right = await verify(srv, user.phone, code);
      const done = await complete(srv, right.json.resetToken);
      for (const res of [sent, wrong, right, done]) assert.ok(!res.raw.includes(code));
      assert.ok(!lines.some((l) => l.includes(code)), "a code was logged");
    } finally {
      Object.assign(console, original);
    }
  });

  it("with no SMS provider the page says so for every number, and production never uses a test provider", async () => {
    const srv = await startServer();
    const user = await createUser();
    delete process.env.SMS_PROVIDER;
    const a = await requestCode(srv, user.phone);
    const b = await requestCode(srv, freshPhone());
    assert.equal(a.status, 503);
    assert.deepEqual(a.json, b.json);
    assert.equal(a.json.error.code, "SMS_UNAVAILABLE");
    assert.equal(smsFor(user.e164).length, 0);

    process.env.NODE_ENV = "production";
    try {
      for (const name of ["memory", "console", "fake"]) {
        process.env.SMS_PROVIDER = name;
        assert.equal(activeSmsProvider(), null, name);
      }
      process.env.SMS_PROVIDER = "twilio";
      assert.equal(activeSmsProvider(), null, "twilio without credentials is off");
      process.env.TWILIO_ACCOUNT_SID = "ACtest";
      process.env.TWILIO_AUTH_TOKEN = "token";
      process.env.TWILIO_FROM = "MadeByKsen";
      assert.equal(activeSmsProvider(), "twilio");
    } finally {
      process.env.NODE_ENV = "test";
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_FROM;
    }
  });

  it("the Twilio provider sends the right request and reports refusals without the message", async () => {
    process.env.SMS_PROVIDER = "twilio";
    process.env.TWILIO_ACCOUNT_SID = "ACtest123";
    process.env.TWILIO_AUTH_TOKEN = "secret-token";
    process.env.TWILIO_FROM = "MadeByKsen";
    const realFetch = globalThis.fetch;
    const calls = [];
    try {
      globalThis.fetch = async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ sid: "SM123" }), { status: 201 });
      };
      const ok = await sendSms("+972501234567", "קוד 123456");
      assert.deepEqual(ok, { provider: "twilio", id: "SM123" });
      assert.equal(calls[0].url, "https://api.twilio.com/2010-04-01/Accounts/ACtest123/Messages.json");
      assert.equal(calls[0].init.headers.Authorization, `Basic ${Buffer.from("ACtest123:secret-token").toString("base64")}`);
      const form = new URLSearchParams(calls[0].init.body.toString());
      assert.deepEqual(Object.fromEntries(form), { To: "+972501234567", Body: "קוד 123456", From: "MadeByKsen" });

      globalThis.fetch = async () => new Response(JSON.stringify({ code: 21211, message: "bad To" }), { status: 400 });
      await assert.rejects(sendSms("+972501234567", "קוד 123456"), (err) => {
        assert.equal(err.code, "SMS_SEND_FAILED");
        assert.ok(!err.message.includes("123456"));
        assert.match(err.message, /21211/);
        return true;
      });
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_FROM;
      process.env.SMS_PROVIDER = "memory";
    }
  });
});
