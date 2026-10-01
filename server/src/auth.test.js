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

// 1x1 transparent PNG
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function uniqueUser() {
  return `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

let phoneCounter = 0;
function uniquePhone() {
  phoneCounter += 1;
  return `052${String(phoneCounter).padStart(7, "0")}`;
}

function request(server, { method = "GET", path = "/", body, cookies = [], headers = {} }) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body != null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: "127.0.0.1",
        port: addr.port,
        method,
        path,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...(cookies.length ? { Cookie: cookies.join("; ") } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          const raw = buffer.toString("utf8");
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = raw;
          }
          const setCookie = res.headers["set-cookie"] || [];
          resolve({ status: res.statusCode, headers: res.headers, setCookie, json, raw, buffer });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function cookieFrom(setCookie) {
  const line = setCookie.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!line) return null;
  return line.split(";")[0];
}

async function register(server, overrides = {}) {
  const username = overrides.username || uniqueUser();
  const res = await request(server, {
    method: "POST",
    path: "/api/auth/register",
    body: {
      username,
      password: "strong-pass-1",
      confirmPassword: "strong-pass-1",
      firstName: "קסניה",
      lastName: "כהן",
      phone: uniquePhone(),
      rememberMe: false,
      ...overrides,
    },
  });
  return { username, res, cookie: cookieFrom(res.setCookie) };
}

describe("auth + profile API (PostgreSQL)", () => {
  let server;

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "";
    process.env.PGLITE_DIR = "memory://";
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
    assert.deepEqual(res.json, { ok: true, database: "connected", ownerAssigned: false, sms: res.json.sms });
    assert.ok(["ready", "paused", "incomplete", "off"].includes(res.json.sms));
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

  it("registers a user and sets httpOnly session cookie", async () => {
    const { username, res, cookie } = await register(server, { rememberMe: true });
    assert.equal(res.status, 201);
    assert.equal(res.json.success, true);
    assert.equal(res.json.user.username, username);
    assert.equal(res.json.user.firstName, "קסניה");
    assert.equal(res.json.user.lastName, "כהן");
    assert.ok(!res.json.user.password_hash);
    assert.ok(!res.json.password);
    assert.ok(cookie);
    assert.ok(res.setCookie.some((c) => /HttpOnly/i.test(c)));
    assert.ok(res.setCookie.some((c) => /Max-Age=/i.test(c)));

    // auto-login: the cookie from registration authenticates immediately
    const me = await request(server, { path: "/api/auth/me", cookies: [cookie] });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.username, username);
  });

  it("rejects duplicate username case-insensitively", async () => {
    const { username } = await register(server);
    const res = await request(server, {
      method: "POST",
      path: "/api/auth/register",
      body: {
        username: username.toUpperCase(),
        password: "strong-pass-1",
        confirmPassword: "strong-pass-1",
        firstName: "אנה",
        lastName: "לוי",
        phone: uniquePhone(),
      },
    });
    assert.equal(res.status, 409);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error?.code, "USERNAME_TAKEN");
    assert.equal(res.json.error?.message, "שם המשתמש הזה כבר בשימוש, נסי לבחור שם אחר.");
    assert.ok(!res.json.user);
    assert.equal(cookieFrom(res.setCookie), null);
  });

  it("concurrent duplicate registrations create exactly one user", async () => {
    const username = uniqueUser();
    const results = await Promise.all([register(server, { username }), register(server, { username })]);
    const statuses = results.map((r) => r.res.status).sort();
    assert.deepEqual(statuses, [201, 409]);
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM users WHERE username = $1`, [username]);
    assert.equal(rows[0].n, 1);
  });

  it("rejects weak password and mismatched confirm", async () => {
    const weak = await register(server, { password: "short", confirmPassword: "short" });
    assert.equal(weak.res.status, 400);
    assert.equal(weak.res.json.error?.code, "VALIDATION_ERROR");

    const mismatch = await register(server, { confirmPassword: "strong-pass-2" });
    assert.equal(mismatch.res.status, 400);
    assert.equal(mismatch.res.json.error?.message, "אימות הסיסמה אינו תואם.");
  });

  it("logs in, reads /me, logs out", async () => {
    const { username } = await register(server, { firstName: "נועה", lastName: "בר" });

    const login = await request(server, {
      method: "POST",
      path: "/api/auth/login",
      body: { username, password: "strong-pass-1", rememberMe: false },
    });
    assert.equal(login.status, 200);
    const cookie = cookieFrom(login.setCookie);
    assert.ok(cookie);
    // session cookie (no remember) has no Max-Age → ends with the browser session
    assert.ok(!login.setCookie.some((c) => /Max-Age=/i.test(c)));

    const me = await request(server, { path: "/api/auth/me", cookies: [cookie] });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.firstName, "נועה");

    const logout = await request(server, { method: "POST", path: "/api/auth/logout", cookies: [cookie] });
    assert.equal(logout.status, 200);

    const me2 = await request(server, { path: "/api/auth/me", cookies: [cookie] });
    assert.equal(me2.status, 401);
  });

  it("remember-me login issues a 30-day persistent cookie", async () => {
    const { username } = await register(server);
    const login = await request(server, {
      method: "POST",
      path: "/api/auth/login",
      body: { username, password: "strong-pass-1", rememberMe: true },
    });
    assert.equal(login.status, 200);
    const line = login.setCookie.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    const maxAge = Number(/Max-Age=(\d+)/i.exec(line)?.[1]);
    assert.equal(maxAge, 30 * 24 * 60 * 60);
  });

  it("rejects wrong password for an existing user", async () => {
    const { username } = await register(server);
    const res = await request(server, {
      method: "POST",
      path: "/api/auth/login",
      body: { username, password: "wrong-password" },
    });
    assert.equal(res.status, 401);
    assert.equal(res.json.error?.code, "INVALID_CREDENTIALS");
    assert.equal(cookieFrom(res.setCookie), null);
  });

  it("rejects unknown user with generic message", async () => {
    const res = await request(server, {
      method: "POST",
      path: "/api/auth/login",
      body: { username: "nobody_here_xyz", password: "wrong-password" },
    });
    assert.equal(res.status, 401);
    assert.equal(res.json.error?.message || res.json.errorMessage, "שם המשתמש או הסיסמה אינם נכונים");
  });

  it("protects profile and scopes measurements to user", async () => {
    const { res: reg, cookie } = await register(server, { rememberMe: true });

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
    assert.equal(save.json.userId, reg.json.user.id);
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
    const { username, cookie } = await register(server, { rememberMe: true });
    const rawToken = cookie.split("=")[1];
    const session = await db.query(`SELECT token_hash FROM user_sessions WHERE token_hash = $1`, [
      hashToken(rawToken),
    ]);
    assert.equal(session.rows.length, 1);
    assert.notEqual(session.rows[0].token_hash, rawToken);

    const user = await db.query(`SELECT password_hash FROM users WHERE username = $1`, [username]);
    assert.ok(user.rows[0].password_hash.startsWith("$2"));
    assert.notEqual(user.rows[0].password_hash, "strong-pass-1");
  });

  it("uploads, serves and removes an avatar stored in the database", async () => {
    const { cookie } = await register(server);
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
    const { cookie } = await register(server);
    const huge = "a".repeat(6 * 1024 * 1024);
    const res = await request(server, {
      method: "POST",
      path: "/api/profile/avatar",
      cookies: [cookie],
      body: { imageDataUrl: `data:image/jpeg;base64,${Buffer.from(huge).toString("base64")}` },
    });
    assert.ok(res.status === 400 || res.status === 413);
  });

  it("books an appointment and blocks the same slot", async () => {
    const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const avail = await request(server, { path: `/api/appointments/availability?date=${date}&serviceId=1` });
    assert.equal(avail.status, 200);
    assert.ok(avail.json.slots.includes("10:00"));

    const body = { clientName: "בדיקה", phone: "0509999999", serviceId: 1, date, time: "10:00" };
    const first = await request(server, { method: "POST", path: "/api/appointments", body });
    assert.equal(first.status, 201);
    const second = await request(server, { method: "POST", path: "/api/appointments", body });
    assert.equal(second.status, 409);

    const mine = await request(server, { path: "/api/appointments?phone=0509999999" });
    assert.equal(mine.status, 200);
    assert.equal(mine.json.length, 1);
  });
});
