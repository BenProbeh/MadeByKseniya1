/**
 * Auth API integration tests (node:test).
 * Uses the real SQLite file — creates unique usernames per run.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../src/app.js";
import db from "../src/db.js";
import { SESSION_COOKIE, hashToken } from "../src/auth.js";

function uniqueUser() {
  return `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = raw;
          }
          const setCookie = res.headers["set-cookie"] || [];
          resolve({ status: res.statusCode, headers: res.headers, setCookie, json, raw });
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

describe("auth + profile API", () => {
  let server;

  before(async () => {
    const app = createApp();
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
  });

  after(async () => {
    await new Promise((r) => server.close(r));
  });

  it("registers a user and sets httpOnly session cookie", async () => {
    const username = uniqueUser();
    const res = await request(server, {
      method: "POST",
      path: "/api/auth/register",
      body: {
        username,
        password: "strong-pass-1",
        confirmPassword: "strong-pass-1",
        firstName: "קסניה",
        lastName: "כהן",
        rememberMe: true,
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.user.username, username);
    assert.equal(res.json.user.firstName, "קסניה");
    assert.ok(!res.json.user.password_hash);
    assert.ok(!res.json.password);
    const cookie = cookieFrom(res.setCookie);
    assert.ok(cookie);
    assert.ok(res.setCookie.some((c) => /HttpOnly/i.test(c)));
    assert.ok(res.setCookie.some((c) => /Max-Age=/i.test(c)));
  });

  it("rejects duplicate username case-insensitively", async () => {
    const username = uniqueUser();
    await request(server, {
      method: "POST",
      path: "/api/auth/register",
      body: {
        username,
        password: "strong-pass-1",
        confirmPassword: "strong-pass-1",
        firstName: "אנה",
        lastName: "לוי",
        rememberMe: false,
      },
    });
    const res = await request(server, {
      method: "POST",
      path: "/api/auth/register",
      body: {
        username: username.toUpperCase(),
        password: "strong-pass-1",
        confirmPassword: "strong-pass-1",
        firstName: "אנה",
        lastName: "לוי",
      },
    });
    assert.equal(res.status, 409);
  });

  it("rejects weak password and mismatched confirm", async () => {
    const weak = await request(server, {
      method: "POST",
      path: "/api/auth/register",
      body: {
        username: uniqueUser(),
        password: "short",
        confirmPassword: "short",
        firstName: "אנה",
        lastName: "לוי",
      },
    });
    assert.equal(weak.status, 400);

    const mismatch = await request(server, {
      method: "POST",
      path: "/api/auth/register",
      body: {
        username: uniqueUser(),
        password: "strong-pass-1",
        confirmPassword: "strong-pass-2",
        firstName: "אנה",
        lastName: "לוי",
      },
    });
    assert.equal(mismatch.status, 400);
  });

  it("logs in, reads /me, logs out", async () => {
    const username = uniqueUser();
    await request(server, {
      method: "POST",
      path: "/api/auth/register",
      body: {
        username,
        password: "strong-pass-1",
        confirmPassword: "strong-pass-1",
        firstName: "נועה",
        lastName: "בר",
        rememberMe: false,
      },
    });

    const login = await request(server, {
      method: "POST",
      path: "/api/auth/login",
      body: { username, password: "strong-pass-1", rememberMe: false },
    });
    assert.equal(login.status, 200);
    const cookie = cookieFrom(login.setCookie);
    assert.ok(cookie);
    // session cookie (no remember) should not force long Max-Age
    assert.ok(!login.setCookie.some((c) => /Max-Age=\d{6,}/i.test(c)));

    const me = await request(server, { path: "/api/auth/me", cookies: [cookie] });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.firstName, "נועה");

    const logout = await request(server, {
      method: "POST",
      path: "/api/auth/logout",
      cookies: [cookie],
    });
    assert.equal(logout.status, 200);

    const me2 = await request(server, { path: "/api/auth/me", cookies: [cookie] });
    assert.equal(me2.status, 401);
  });

  it("rejects bad login with generic message", async () => {
    const res = await request(server, {
      method: "POST",
      path: "/api/auth/login",
      body: { username: "nobody_here_xyz", password: "wrong-password" },
    });
    assert.equal(res.status, 401);
    assert.match(res.json.error, /שם המשתמש או הסיסמה/);
  });

  it("protects profile and scopes measurements to user", async () => {
    const username = uniqueUser();
    const reg = await request(server, {
      method: "POST",
      path: "/api/auth/register",
      body: {
        username,
        password: "strong-pass-1",
        confirmPassword: "strong-pass-1",
        firstName: "דנה",
        lastName: "שמש",
        rememberMe: true,
      },
    });
    const cookie = cookieFrom(reg.setCookie);

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
            widthMm: 12,
            status: "confirmed",
            photoQualityScore: 88,
          },
        },
      },
    });
    assert.equal(save.status, 201);
    assert.equal(save.json.userId, reg.json.user.id);

    const meas = await request(server, {
      path: "/api/profile/measurements",
      cookies: [cookie],
    });
    assert.equal(meas.status, 200);
    assert.ok(meas.json.measurement);
    assert.equal(meas.json.measurement.hands.right.fingers[0].size, 3);

    const orders = await request(server, { path: "/api/profile/orders", cookies: [cookie] });
    assert.equal(orders.status, 200);
    assert.deepEqual(orders.json.orders, []);

    const ships = await request(server, { path: "/api/profile/shipments", cookies: [cookie] });
    assert.equal(ships.status, 200);
    assert.deepEqual(ships.json.shipments, []);
  });

  it("does not store password_hash in session table and stores token hash only", async () => {
    const username = uniqueUser();
    const reg = await request(server, {
      method: "POST",
      path: "/api/auth/register",
      body: {
        username,
        password: "strong-pass-1",
        confirmPassword: "strong-pass-1",
        firstName: "מיכל",
        lastName: "כהן",
        rememberMe: true,
      },
    });
    const cookiePair = cookieFrom(reg.setCookie);
    const rawToken = cookiePair.split("=")[1];
    const row = db.prepare(`SELECT token_hash FROM user_sessions WHERE token_hash = ?`).get(hashToken(rawToken));
    assert.ok(row);
    assert.notEqual(row.token_hash, rawToken);

    const user = db.prepare(`SELECT password_hash FROM users WHERE username = ?`).get(username);
    assert.ok(user.password_hash.startsWith("$2"));
    assert.notEqual(user.password_hash, "strong-pass-1");
  });

  it("rejects oversized avatar payload", async () => {
    const username = uniqueUser();
    const reg = await request(server, {
      method: "POST",
      path: "/api/auth/register",
      body: {
        username,
        password: "strong-pass-1",
        confirmPassword: "strong-pass-1",
        firstName: "יעל",
        lastName: "אור",
      },
    });
    const cookie = cookieFrom(reg.setCookie);
    const huge = "a".repeat(6 * 1024 * 1024);
    const res = await request(server, {
      method: "POST",
      path: "/api/profile/avatar",
      cookies: [cookie],
      body: { imageDataUrl: `data:image/jpeg;base64,${Buffer.from(huge).toString("base64")}` },
    });
    assert.ok(res.status === 400 || res.status === 413);
  });
});
