/**
 * API integration tests (node:test) against an in-memory PostgreSQL engine (PGlite).
 * Production uses the same SQL through pg + DATABASE_URL.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "./app.js";
import db, { closeDb, startDb } from "./db.js";
import { SESSION_COOKIE, hashToken } from "./auth.js";
import { cookieFrom, latestCode, loginByEmail, registerVerified, request, uniqueEmail } from "./testSupport.js";

// 1x1 transparent PNG
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function uniqueUser() {
  return `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function registerRaw(server, overrides = {}) {
  return request(server, {
    method: "POST",
    path: "/api/auth/register",
    body: {
      username: uniqueUser(),
      email: uniqueEmail("auth"),
      password: "strong-pass-1",
      confirmPassword: "strong-pass-1",
      firstName: "קסניה",
      lastName: "כהן",
      ...overrides,
    },
  });
}

describe("auth + profile API (PostgreSQL)", () => {
  let server;

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "";
    process.env.PGLITE_DIR = "memory://";
    process.env.EMAIL_PROVIDER = "memory";
    await startDb();
    server = http.createServer(createApp());
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
  });

  after(async () => {
    await new Promise((r) => server.close(r));
    await closeDb();
  });

  it("health reports server + database connected", async () => {
    const res = await request(server, { path: "/api/health" });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { ok: true, database: "connected", ownerAssigned: false, email: "ready" });
  });

  it("unknown /api route returns JSON 404, not HTML", async () => {
    const res = await request(server, { path: "/api/does-not-exist" });
    assert.equal(res.status, 404);
    assert.equal(res.json?.success, false);
    assert.match(String(res.headers["content-type"]), /json/);
  });

  it("migrations seed services", async () => {
    const res = await request(server, { path: "/api/services" });
    assert.equal(res.status, 200);
    assert.equal(res.json.length, 8);
    assert.ok(res.json.every((s) => typeof s.id === "number" && s.name_he));
  });

  it("sign-up waits for the email code, then signs in with an httpOnly session cookie", async () => {
    const email = uniqueEmail("signup");
    const reg = await registerRaw(server, { email: `  ${email.toUpperCase()} ` });
    assert.equal(reg.status, 202);
    assert.equal(reg.json.pendingVerification, true);
    assert.equal(reg.json.email, email, "address is trimmed and lowercased");
    assert.equal(cookieFrom(reg.setCookie), null, "no session before the code");
    assert.ok(!reg.json.user);

    const code = await latestCode(email);
    const verified = await request(server, {
      method: "POST",
      path: "/api/auth/verify-email",
      body: { email, code, rememberMe: true },
    });
    assert.equal(verified.status, 200, verified.raw);
    assert.equal(verified.json.signedIn, true);
    assert.equal(verified.json.user.email, email);
    assert.equal(verified.json.user.emailVerified, true);
    assert.equal(verified.json.user.accountStatus, "active");
    assert.ok(!verified.json.user.password_hash);
    const cookie = cookieFrom(verified.setCookie);
    assert.ok(cookie);
    assert.ok(verified.setCookie.some((c) => /HttpOnly/i.test(c)));
    assert.ok(verified.setCookie.some((c) => /Max-Age=/i.test(c)));

    const me = await request(server, { path: "/api/auth/me", cookies: [cookie] });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.email, email);
    assert.equal(me.json.emailDeliveryReady, true);
  });

  it("rejects duplicate username case-insensitively", async () => {
    const { username } = await registerVerified(server);
    const res = await registerRaw(server, { username: username.toUpperCase(), firstName: "אנה", lastName: "לוי" });
    assert.equal(res.status, 409);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error?.code, "USERNAME_TAKEN");
    assert.equal(res.json.error?.message, "שם המשתמש הזה כבר בשימוש, נסי לבחור שם אחר.");
    assert.ok(!res.json.user);
    assert.equal(cookieFrom(res.setCookie), null);
  });

  it("concurrent duplicate registrations create exactly one user", async () => {
    const username = uniqueUser();
    const results = await Promise.all([registerRaw(server, { username }), registerRaw(server, { username })]);
    assert.deepEqual(results.map((r) => r.status).sort(), [202, 409]);
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM users WHERE username = $1`, [username]);
    assert.equal(rows[0].n, 1);
  });

  it("rejects weak password, mismatched confirm and a bad email", async () => {
    const weak = await registerRaw(server, { password: "short", confirmPassword: "short" });
    assert.equal(weak.status, 400);
    assert.equal(weak.json.error?.code, "VALIDATION_ERROR");

    const mismatch = await registerRaw(server, { confirmPassword: "strong-pass-2" });
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.json.error?.message, "אימות הסיסמה אינו תואם.");

    const badEmail = await registerRaw(server, { email: "not-an-email" });
    assert.equal(badEmail.status, 400);
    assert.equal(badEmail.json.error?.message, "כתובת האימייל לא נראית תקינה. כדאי לבדוק ולנסות שוב.");

    const noEmail = await registerRaw(server, { email: "" });
    assert.equal(noEmail.status, 400);
    assert.equal(noEmail.json.error?.message, "יש להזין כתובת אימייל.");
  });

  it("logs in by email, reads /me, logs out", async () => {
    const { email } = await registerVerified(server, { firstName: "נועה", lastName: "בר" });

    const login = await loginByEmail(server, ` ${email.toUpperCase()} `);
    assert.equal(login.res.status, 200);
    assert.ok(login.cookie);
    // session cookie (no remember) has no Max-Age → ends with the browser session
    assert.ok(!login.res.setCookie.some((c) => /Max-Age=/i.test(c)));

    const me = await request(server, { path: "/api/auth/me", cookies: [login.cookie] });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.firstName, "נועה");

    const logout = await request(server, { method: "POST", path: "/api/auth/logout", cookies: [login.cookie] });
    assert.equal(logout.status, 200);

    const me2 = await request(server, { path: "/api/auth/me", cookies: [login.cookie] });
    assert.equal(me2.status, 401);
  });

  it("a verified account no longer signs in by username", async () => {
    const { username } = await registerVerified(server);
    const res = await request(server, { method: "POST", path: "/api/auth/login", body: { username, password: "strong-pass-1" } });
    assert.equal(res.status, 401);
  });

  it("remember-me login issues a 30-day persistent cookie", async () => {
    const { email } = await registerVerified(server);
    const login = await loginByEmail(server, email, "strong-pass-1", { rememberMe: true });
    assert.equal(login.res.status, 200);
    const line = login.res.setCookie.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    const maxAge = Number(/Max-Age=(\d+)/i.exec(line)?.[1]);
    assert.equal(maxAge, 30 * 24 * 60 * 60);
  });

  it("rejects wrong password for an existing user", async () => {
    const { email } = await registerVerified(server);
    const res = await loginByEmail(server, email, "wrong-password");
    assert.equal(res.res.status, 401);
    assert.equal(res.res.json.error?.code, "INVALID_CREDENTIALS");
    assert.equal(res.cookie, null);
  });

  it("rejects unknown user with the same generic message", async () => {
    const res = await loginByEmail(server, "nobody-here@example.com", "wrong-password");
    assert.equal(res.res.status, 401);
    assert.equal(res.res.json.error?.message, "האימייל או הסיסמה אינם נכונים.");
  });

  it("protects profile and scopes measurements to user", async () => {
    const { id, cookie } = await registerVerified(server, { rememberMe: true });

    const denied = await request(server, { path: "/api/profile" });
    assert.equal(denied.status, 401);

    const save = await request(server, {
      method: "POST",
      path: "/api/measurements/profile",
      cookies: [cookie],
      body: {
        phone: "0501234567",
        coinId: "ils-1-shekel",
        measurements: {
          "right-thumb": {
            handId: "right",
            fingerId: "thumb",
            size: 3,
            widthMm: 12.4,
            confidence: 0.91,
            status: "confirmed",
            photoQualityScore: 88,
          },
        },
      },
    });
    assert.equal(save.status, 201);
    assert.equal(save.json.userId, id);
    assert.equal(typeof save.json.id, "number");

    const meas = await request(server, { path: "/api/profile/measurements", cookies: [cookie] });
    assert.equal(meas.status, 200);
    assert.ok(meas.json.measurement);
    assert.equal(meas.json.measurement.hands.right.fingers[0].size, 3);
    assert.equal(meas.json.measurement.hands.right.fingers[0].widthMm, 12.4);

    const byPhone = await request(server, {
      path: "/api/measurements/profile?phone=0501234567",
      cookies: [cookie],
    });
    assert.equal(byPhone.status, 200);
    assert.equal(byPhone.json.fingers.length, 1);

    const link = await request(server, { path: `/api/measurements/link/${save.json.linkToken}` });
    assert.equal(link.status, 200);
    assert.equal(link.json.profileId, save.json.id);

    const orders = await request(server, { path: "/api/profile/orders", cookies: [cookie] });
    assert.equal(orders.status, 200);
    assert.deepEqual(orders.json.orders, []);

    const ships = await request(server, { path: "/api/profile/shipments", cookies: [cookie] });
    assert.equal(ships.status, 200);
    assert.deepEqual(ships.json.shipments, []);

    const patch = await request(server, {
      method: "PATCH",
      path: "/api/profile",
      cookies: [cookie],
      body: { firstName: "דנה" },
    });
    assert.equal(patch.status, 200);
    assert.equal(patch.json.user.firstName, "דנה");
    assert.equal(patch.json.user.lastName, "כהן");
  });

  it("stores only bcrypt password hash and sha256 session token hash", async () => {
    const { username, cookie } = await registerVerified(server, { rememberMe: true });
    const rawToken = cookie.split("=")[1];
    const session = await db.query(`SELECT token_hash FROM user_sessions WHERE token_hash = $1`, [hashToken(rawToken)]);
    assert.equal(session.rows.length, 1);
    assert.notEqual(session.rows[0].token_hash, rawToken);

    const user = await db.query(`SELECT password_hash FROM users WHERE username = $1`, [username]);
    assert.ok(user.rows[0].password_hash.startsWith("$2"));
    assert.notEqual(user.rows[0].password_hash, "strong-pass-1");
  });

  it("uploads, serves and removes an avatar stored in the database", async () => {
    const { cookie } = await registerVerified(server);
    const up = await request(server, {
      method: "POST",
      path: "/api/profile/avatar",
      cookies: [cookie],
      body: { imageDataUrl: `data:image/png;base64,${TINY_PNG_BASE64}` },
    });
    assert.equal(up.status, 200);
    const url = up.json.user.avatarUrl;
    assert.match(url, /^\/api\/uploads\/avatars\/[a-f0-9]{32}\.png$/);

    const img = await request(server, { path: url });
    assert.equal(img.status, 200);
    assert.equal(img.headers["content-type"], "image/png");
    assert.deepEqual(img.buffer, Buffer.from(TINY_PNG_BASE64, "base64"));

    const del = await request(server, { method: "DELETE", path: "/api/profile/avatar", cookies: [cookie] });
    assert.equal(del.status, 200);
    assert.equal(del.json.user.avatarUrl, null);
    const gone = await request(server, { path: url });
    assert.equal(gone.status, 404);
  });

  it("rejects oversized avatar payload", async () => {
    const { cookie } = await registerVerified(server);
    const huge = "a".repeat(6 * 1024 * 1024);
    const res = await request(server, {
      method: "POST",
      path: "/api/profile/avatar",
      cookies: [cookie],
      body: { imageDataUrl: `data:image/jpeg;base64,${Buffer.from(huge).toString("base64")}` },
    });
    assert.ok(res.status === 400 || res.status === 413);
  });

  it("a booking becomes a pending request and holds the slot (phone is optional)", async () => {
    const { cookie } = await registerVerified(server);
    const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const avail = await request(server, { path: `/api/appointments/availability?date=${date}&serviceId=1` });
    assert.equal(avail.status, 200);
    assert.ok(avail.json.slots.includes("10:00"));

    const body = { clientName: "בדיקה", serviceId: 1, date, time: "10:00" };
    const anonymous = await request(server, { method: "POST", path: "/api/appointments", body });
    assert.equal(anonymous.status, 401);

    const first = await request(server, { method: "POST", path: "/api/appointments", body, cookies: [cookie] });
    assert.equal(first.status, 201, first.raw);
    assert.equal(first.json.appointment.status, "pending");
    const second = await request(server, { method: "POST", path: "/api/appointments", body, cookies: [cookie] });
    assert.equal(second.status, 409);

    const mine = await request(server, { path: "/api/appointments/mine", cookies: [cookie] });
    assert.equal(mine.status, 200);
    assert.equal(mine.json.appointments.length, 1);
    assert.equal(mine.json.appointments[0].statusHe, "ממתין לאישור");

    const byPhone = await request(server, { path: "/api/appointments?phone=0509999999" });
    assert.equal(byPhone.status, 404, "no public lookup of bookings by phone number");
  });
});
