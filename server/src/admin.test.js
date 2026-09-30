/**
 * Roles, admin customers API, owner role changes, password change and sign-up stats.
 * Runs against an in-memory PostgreSQL engine (PGlite), same SQL as production.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "./app.js";
import db, { closeDb, startDb } from "./db.js";
import { SESSION_COOKIE } from "./auth.js";
import { ensureOwner } from "./roles.js";
import { computeCustomerStats } from "./adminService.js";
import { config } from "./config.js";

const PASSWORD = "strong-pass-1";

function request(server, { method = "GET", path = "/", body, cookies = [] }) {
  return new Promise((resolve, reject) => {
    const payload = body != null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: "127.0.0.1",
        port: server.address().port,
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
          resolve({ status: res.statusCode, headers: res.headers, setCookie: res.headers["set-cookie"] || [], json, raw });
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
  return line ? line.split(";")[0] : null;
}

let counter = 0;
async function register(server, overrides = {}) {
  counter += 1;
  const username = overrides.username || `adm_${Date.now().toString(36)}_${counter}`;
  const res = await request(server, {
    method: "POST",
    path: "/api/auth/register",
    body: {
      username,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      firstName: overrides.firstName || "לקוחה",
      lastName: overrides.lastName || "בדיקה",
      rememberMe: Boolean(overrides.rememberMe),
    },
  });
  assert.equal(res.status, 201, res.raw);
  return { id: res.json.user.id, username, cookie: cookieFrom(res.setCookie) };
}

function assertNoSecrets(value) {
  const text = JSON.stringify(value);
  assert.ok(!/password|token_hash|\$2[aby]\$/i.test(text), "response must not expose password hashes or tokens");
}

describe("roles + admin API (PostgreSQL)", () => {
  let server;
  let owner;
  let admin;
  let customer;

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "";
    process.env.PGLITE_DIR = "memory://";
    await startDb();
    server = http.createServer(createApp());
    await new Promise((r) => server.listen(0, "127.0.0.1", r));

    owner = await register(server, { firstName: "בן", lastName: "בעלים" });
    admin = await register(server, { firstName: "מנהלת", lastName: "עתידית" });
    customer = await register(server, { firstName: "דנה", lastName: "לוי" });
  });

  after(async () => {
    await new Promise((r) => server.close(r));
    await closeDb();
  });

  it("parses OWNER_USER_ID as a numeric id only", () => {
    const previous = process.env.OWNER_USER_ID;
    process.env.OWNER_USER_ID = "42";
    assert.equal(config.ownerUserId, 42);
    process.env.OWNER_USER_ID = "Ben Example";
    assert.equal(config.ownerUserId, null);
    if (previous === undefined) delete process.env.OWNER_USER_ID;
    else process.env.OWNER_USER_ID = previous;
  });

  it("new users default to the customer role", async () => {
    const me = await request(server, { path: "/api/auth/me", cookies: [customer.cookie] });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.role, "customer");
  });

  it("assigns the owner once by id and never creates a second owner", async () => {
    const missing = await ensureOwner(db, 999999);
    assert.equal(missing.status, "missing");

    const assigned = await ensureOwner(db, owner.id);
    assert.equal(assigned.status, "assigned");

    const again = await ensureOwner(db, customer.id);
    assert.equal(again.status, "exists");
    assert.equal(again.ownerId, owner.id);

    const { rows } = await db.query(`SELECT id FROM users WHERE role = 'owner'`);
    assert.deepEqual(rows.map((r) => r.id), [owner.id]);

    const audit = await db.query(`SELECT action, target_user_id FROM audit_log WHERE action = 'owner_assigned'`);
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].target_user_id, owner.id);

    const me = await request(server, { path: "/api/auth/me", cookies: [owner.cookie] });
    assert.equal(me.json.user.role, "owner");
  });

  it("database blocks a second owner, demoting the owner and deleting the owner", async () => {
    await assert.rejects(db.query(`UPDATE users SET role = 'owner' WHERE id = $1`, [customer.id]));
    await assert.rejects(db.query(`UPDATE users SET role = 'customer' WHERE id = $1`, [owner.id]));
    await assert.rejects(db.query(`DELETE FROM users WHERE id = $1`, [owner.id]));
    await assert.rejects(db.query(`UPDATE users SET role = 'superuser' WHERE id = $1`, [customer.id]));
    const { rows } = await db.query(`SELECT role FROM users WHERE id = $1`, [owner.id]);
    assert.equal(rows[0].role, "owner");
  });

  it("admin endpoints: 401 without login, 403 for customers", async () => {
    for (const path of ["/api/admin/customers", `/api/admin/customers/${owner.id}`, "/api/admin/customer-stats"]) {
      const anon = await request(server, { path });
      assert.equal(anon.status, 401, path);
      assert.equal(anon.json.code, "UNAUTHENTICATED");

      const forbidden = await request(server, { path, cookies: [customer.cookie] });
      assert.equal(forbidden.status, 403, path);
      assert.equal(forbidden.json.code, "FORBIDDEN");
      assert.equal(typeof forbidden.json.error, "string");
      assert.equal(forbidden.headers["cache-control"], "no-store");
    }
  });

  it("only the owner may change roles", async () => {
    const byCustomer = await request(server, {
      method: "PATCH",
      path: `/api/owner/users/${admin.id}/role`,
      cookies: [customer.cookie],
      body: { role: "admin" },
    });
    assert.equal(byCustomer.status, 403);

    const anon = await request(server, { method: "PATCH", path: `/api/owner/users/${admin.id}/role`, body: { role: "admin" } });
    assert.equal(anon.status, 401);
  });

  it("owner role endpoint validates input and protects the owner", async () => {
    const cases = [
      [{ role: "owner" }, 400],
      [{ role: "superuser" }, 400],
      [{ role: "admin", username: "hacker" }, 400],
      [{}, 400],
    ];
    for (const [body, status] of cases) {
      const res = await request(server, {
        method: "PATCH",
        path: `/api/owner/users/${admin.id}/role`,
        cookies: [owner.cookie],
        body,
      });
      assert.equal(res.status, status, JSON.stringify(body));
    }

    const self = await request(server, {
      method: "PATCH",
      path: `/api/owner/users/${owner.id}/role`,
      cookies: [owner.cookie],
      body: { role: "customer" },
    });
    assert.equal(self.status, 403);

    const missing = await request(server, {
      method: "PATCH",
      path: "/api/owner/users/999999/role",
      cookies: [owner.cookie],
      body: { role: "admin" },
    });
    assert.equal(missing.status, 404);

    const badId = await request(server, {
      method: "PATCH",
      path: "/api/owner/users/abc/role",
      cookies: [owner.cookie],
      body: { role: "admin" },
    });
    assert.equal(badId.status, 400);
  });

  it("owner grants admin; admin sees customers without secrets but cannot grant roles", async () => {
    const grant = await request(server, {
      method: "PATCH",
      path: `/api/owner/users/${admin.id}/role`,
      cookies: [owner.cookie],
      body: { role: "admin" },
    });
    assert.equal(grant.status, 200, grant.raw);
    assert.equal(grant.json.customer.role, "admin");
    assert.equal(grant.json.changed, true);

    const audit = await db.query(
      `SELECT actor_user_id, action, details FROM audit_log WHERE target_user_id = $1 ORDER BY id DESC LIMIT 1`,
      [admin.id]
    );
    assert.equal(audit.rows[0].actor_user_id, owner.id);
    assert.equal(audit.rows[0].action, "admin_granted");
    assert.equal(audit.rows[0].details.to, "admin");

    const updated = await db.query(`SELECT role_updated_by FROM users WHERE id = $1`, [admin.id]);
    assert.equal(updated.rows[0].role_updated_by, owner.id);

    const list = await request(server, { path: "/api/admin/customers", cookies: [admin.cookie] });
    assert.equal(list.status, 200);
    assert.equal(list.headers["cache-control"], "no-store");
    assert.equal(list.json.total, 3);
    assert.equal(list.json.totals.owner, 1);
    assert.equal(list.json.totals.admin, 1);
    assertNoSecrets(list.json);

    const detail = await request(server, { path: `/api/admin/customers/${customer.id}`, cookies: [admin.cookie] });
    assert.equal(detail.status, 200);
    assert.equal(detail.json.customer.username, customer.username);
    assert.equal(detail.json.permissions.canManageRole, false);
    assert.deepEqual(detail.json.orders, []);
    assertNoSecrets(detail.json);

    const ownerView = await request(server, { path: `/api/admin/customers/${customer.id}`, cookies: [owner.cookie] });
    assert.equal(ownerView.json.permissions.canManageRole, true);

    const ownerSelf = await request(server, { path: `/api/admin/customers/${owner.id}`, cookies: [owner.cookie] });
    assert.equal(ownerSelf.json.permissions.canManageRole, false);

    const missing = await request(server, { path: "/api/admin/customers/999999", cookies: [admin.cookie] });
    assert.equal(missing.status, 404);

    const adminGrant = await request(server, {
      method: "PATCH",
      path: `/api/owner/users/${customer.id}/role`,
      cookies: [admin.cookie],
      body: { role: "admin" },
    });
    assert.equal(adminGrant.status, 403);

    const adminTouchOwner = await request(server, {
      method: "PATCH",
      path: `/api/owner/users/${owner.id}/role`,
      cookies: [admin.cookie],
      body: { role: "customer" },
    });
    assert.equal(adminTouchOwner.status, 403);
  });

  it("revoked admin is blocked on the very next request with the same session", async () => {
    const revoke = await request(server, {
      method: "PATCH",
      path: `/api/owner/users/${admin.id}/role`,
      cookies: [owner.cookie],
      body: { role: "customer" },
    });
    assert.equal(revoke.status, 200);
    assert.equal(revoke.json.customer.role, "customer");

    const audit = await db.query(
      `SELECT action FROM audit_log WHERE target_user_id = $1 ORDER BY id DESC LIMIT 1`,
      [admin.id]
    );
    assert.equal(audit.rows[0].action, "admin_revoked");

    const blocked = await request(server, { path: "/api/admin/customers", cookies: [admin.cookie] });
    assert.equal(blocked.status, 403);
  });

  it("customers list supports search, role filter, sort and pagination", async () => {
    const searchRes = await request(server, {
      path: `/api/admin/customers?search=${encodeURIComponent("דנה")}`,
      cookies: [owner.cookie],
    });
    assert.equal(searchRes.status, 200);
    assert.deepEqual(searchRes.json.customers.map((c) => c.id), [customer.id]);

    const byUsername = await request(server, {
      path: `/api/admin/customers?search=${encodeURIComponent(owner.username.toUpperCase())}`,
      cookies: [owner.cookie],
    });
    assert.deepEqual(byUsername.json.customers.map((c) => c.id), [owner.id]);

    const wildcard = await request(server, { path: "/api/admin/customers?search=%25", cookies: [owner.cookie] });
    assert.equal(wildcard.json.total, 0);

    const owners = await request(server, { path: "/api/admin/customers?role=owner", cookies: [owner.cookie] });
    assert.deepEqual(owners.json.customers.map((c) => c.id), [owner.id]);

    const newest = await request(server, { path: "/api/admin/customers?sort=newest", cookies: [owner.cookie] });
    const oldest = await request(server, { path: "/api/admin/customers?sort=oldest", cookies: [owner.cookie] });
    assert.equal(newest.json.customers[0].id, customer.id);
    assert.equal(oldest.json.customers[0].id, owner.id);

    const paged = await request(server, { path: "/api/admin/customers?page=2&pageSize=2", cookies: [owner.cookie] });
    assert.equal(paged.json.customers.length, 1);
    assert.equal(paged.json.totalPages, 2);

    for (const q of ["role=root", "sort=name", "page=0", "pageSize=500", `search=${"a".repeat(101)}`]) {
      const bad = await request(server, { path: `/api/admin/customers?${q}`, cookies: [owner.cookie] });
      assert.equal(bad.status, 400, q);
    }
  });

  it("change password: validates, rotates sessions and keeps the new password", async () => {
    const user = await register(server, { rememberMe: true });
    const otherLogin = await request(server, {
      method: "POST",
      path: "/api/auth/login",
      body: { username: user.username, password: PASSWORD },
    });
    const otherDevice = cookieFrom(otherLogin.setCookie);

    const anon = await request(server, { method: "POST", path: "/api/auth/change-password", body: {} });
    assert.equal(anon.status, 401);

    const wrong = await request(server, {
      method: "POST",
      path: "/api/auth/change-password",
      cookies: [user.cookie],
      body: { currentPassword: "not-my-pass", newPassword: "brand-new-pass", confirmPassword: "brand-new-pass" },
    });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.json.error.code, "INVALID_CURRENT_PASSWORD");

    const mismatch = await request(server, {
      method: "POST",
      path: "/api/auth/change-password",
      cookies: [user.cookie],
      body: { currentPassword: PASSWORD, newPassword: "brand-new-pass", confirmPassword: "brand-new-pas" },
    });
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.json.error.code, "VALIDATION_ERROR");

    const short = await request(server, {
      method: "POST",
      path: "/api/auth/change-password",
      cookies: [user.cookie],
      body: { currentPassword: PASSWORD, newPassword: "short", confirmPassword: "short" },
    });
    assert.equal(short.status, 400);

    const ok = await request(server, {
      method: "POST",
      path: "/api/auth/change-password",
      cookies: [user.cookie],
      body: { currentPassword: PASSWORD, newPassword: "brand-new-pass", confirmPassword: "brand-new-pass" },
    });
    assert.equal(ok.status, 200, ok.raw);
    const freshCookie = cookieFrom(ok.setCookie);
    assert.ok(freshCookie);
    assert.ok(ok.setCookie.some((c) => /Max-Age=/i.test(c)), "remember-me is preserved");
    assertNoSecrets(ok.json);

    const oldSession = await request(server, { path: "/api/auth/me", cookies: [user.cookie] });
    assert.equal(oldSession.status, 401);
    const otherSession = await request(server, { path: "/api/auth/me", cookies: [otherDevice] });
    assert.equal(otherSession.status, 401);
    const fresh = await request(server, { path: "/api/auth/me", cookies: [freshCookie] });
    assert.equal(fresh.status, 200);

    const oldLogin = await request(server, {
      method: "POST",
      path: "/api/auth/login",
      body: { username: user.username, password: PASSWORD },
    });
    assert.equal(oldLogin.status, 401);
    const newLogin = await request(server, {
      method: "POST",
      path: "/api/auth/login",
      body: { username: user.username, password: "brand-new-pass" },
    });
    assert.equal(newLogin.status, 200);

    const audit = await db.query(`SELECT action FROM audit_log WHERE target_user_id = $1`, [user.id]);
    assert.ok(audit.rows.some((r) => r.action === "password_changed"));
  });

  it("admin cannot change another user's password through the API", async () => {
    const res = await request(server, {
      method: "POST",
      path: "/api/auth/change-password",
      cookies: [owner.cookie],
      body: { userId: customer.id, currentPassword: "x", newPassword: "brand-new-pass", confirmPassword: "brand-new-pass" },
    });
    assert.equal(res.status, 400);
    const login = await request(server, {
      method: "POST",
      path: "/api/auth/login",
      body: { username: customer.username, password: PASSWORD },
    });
    assert.equal(login.status, 200);
  });

  it("sign-up stats use Asia/Jerusalem day and Sunday-based weeks", async () => {
    const seeded = [
      ["st_a", "2030-01-09T08:00:00+02:00"],
      ["st_b", "2030-01-09T00:30:00+02:00"],
      ["st_c", "2030-01-06T00:10:00+02:00"],
      ["st_d", "2030-01-05T23:50:00+02:00"],
      ["st_e", "2029-12-30T00:05:00+02:00"],
      ["st_f", "2029-12-29T23:00:00+02:00"],
      ["st_g", "2030-01-09T12:00:00+02:00"],
      ["st_h", "2031-06-15T00:00:30+03:00"],
    ];
    for (const [username, createdAt] of seeded) {
      await db.query(
        `INSERT INTO users (username, password_hash, first_name, last_name, created_at) VALUES ($1, 'x', 'סטט', 'בדיקה', $2)`,
        [username, createdAt]
      );
    }

    try {
      const baseline = await db.query(`SELECT count(*)::int AS n FROM users WHERE created_at < '2029-01-01'`);
      const stats = await computeCustomerStats("2030-01-09T10:00:00+02:00");
      assert.equal(stats.timezone, "Asia/Jerusalem");
      assert.equal(stats.totals.today, 2);
      assert.equal(stats.totals.last7Days, 4);
      assert.equal(stats.totals.all, baseline.rows[0].n + 6);
      assert.equal(stats.week.current.startDate, "2030-01-06");
      assert.equal(stats.week.current.count, 3);
      assert.equal(stats.week.previous.startDate, "2029-12-30");
      assert.equal(stats.week.previous.endDate, "2030-01-05");
      assert.equal(stats.week.previous.count, 2);
      assert.equal(stats.week.change, 1);
      assert.equal(stats.week.changePercent, 50);
      assert.deepEqual(stats.week.busiestDay, { date: "2030-01-09", count: 2 });
      assert.deepEqual(stats.recentSignups.slice(0, 2).map((u) => u.username), ["st_a", "st_b"]);
      assertNoSecrets(stats);

      const zero = await computeCustomerStats("2031-06-15T12:00:00+03:00");
      assert.equal(zero.week.current.startDate, "2031-06-15");
      assert.equal(zero.week.current.count, 1);
      assert.equal(zero.week.previous.count, 0);
      assert.equal(zero.week.change, 1);
      assert.equal(zero.week.changePercent, null);

      const api = await request(server, { path: "/api/admin/customer-stats", cookies: [owner.cookie] });
      assert.equal(api.status, 200);
      assert.equal(typeof api.json.stats.totals.all, "number");
      assert.ok(Number.isFinite(api.json.stats.week.change));
    } finally {
      await db.query(`DELETE FROM users WHERE username LIKE 'st\\_%'`);
    }
  });
});
