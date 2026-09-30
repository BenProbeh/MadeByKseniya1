/**
 * Owner bootstrap by username: promotes the single existing matching account, never creates users.
 * Runs against an in-memory PostgreSQL engine (PGlite), same SQL as production.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "./app.js";
import db, { closeDb, startDb } from "./db.js";
import { SESSION_COOKIE } from "./auth.js";
import { ensureOwner } from "./roles.js";
import { config } from "./config.js";

const PASSWORD = "strong-pass-1";
const AVATAR = "/api/uploads/avatars/0123456789abcdef0123456789abcdef.png";

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
          resolve({ status: res.statusCode, setCookie: res.headers["set-cookie"] || [], json: raw ? JSON.parse(raw) : null, raw });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function register(server, { username, firstName, lastName }) {
  const res = await request(server, {
    method: "POST",
    path: "/api/auth/register",
    body: { username, password: PASSWORD, confirmPassword: PASSWORD, firstName, lastName },
  });
  assert.equal(res.status, 201, res.raw);
  const line = res.setCookie.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return { id: res.json.user.id, cookie: line.split(";")[0] };
}

const FUTURE = "2999-01-01T00:00:00Z";
const bootstrap = (createdBefore = FUTURE) =>
  ensureOwner(db, null, { bootstrapUsername: config.ownerBootstrapUsername, createdBefore });

async function snapshotUser(id) {
  const { rows } = await db.query(
    `SELECT username, first_name, last_name, avatar_url, password_hash, created_at FROM users WHERE id = $1`,
    [id]
  );
  return rows[0];
}

describe("owner bootstrap by username (PostgreSQL)", () => {
  let server;
  let ben;
  let other;

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "";
    process.env.PGLITE_DIR = "memory://";
    delete process.env.OWNER_USER_ID;
    delete process.env.OWNER_USERNAME;
    await startDb();
    server = http.createServer(createApp());
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
  });

  after(async () => {
    await new Promise((r) => server.close(r));
    await closeDb();
  });

  it("defaults to the benexample account", () => {
    assert.equal(config.ownerBootstrapUsername, "benexample");
  });

  it("does nothing and creates nobody when no account matches", async () => {
    await register(server, { username: "dana", firstName: "Dana", lastName: "Levi" });
    const result = await bootstrap();
    assert.equal(result.status, "not_found");
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM users`);
    assert.equal(rows[0].n, 1);
  });

  it("requires the matching account to have a profile picture", async () => {
    ben = await register(server, { username: "Ben Example", firstName: "Ben", lastName: "Example" });
    const result = await bootstrap();
    assert.equal(result.status, "unverified");
    await db.query(`UPDATE users SET avatar_url = $1 WHERE id = $2`, [AVATAR, ben.id]);
  });

  it("ignores accounts created after the bootstrap cutoff", async () => {
    const result = await bootstrap("2000-01-01T00:00:00Z");
    assert.equal(result.status, "not_found");
  });

  it("refuses to guess when another account could be the owner", async () => {
    other = await register(server, { username: "ben_ex", firstName: "Ben", lastName: "Example" });
    const result = await bootstrap();
    assert.equal(result.status, "ambiguous");
    assert.deepEqual(result.candidates, [ben.id, other.id]);
    const owners = await db.query(`SELECT id FROM users WHERE role = 'owner'`);
    assert.equal(owners.rows.length, 0);
    await db.query(`UPDATE users SET first_name = 'Benny', last_name = 'Cohen' WHERE id = $1`, [other.id]);
  });

  it("promotes only the role of the single existing match and keeps everything else", async () => {
    const before = await snapshotUser(ben.id);
    const countBefore = (await db.query(`SELECT count(*)::int AS n FROM users`)).rows[0].n;

    const result = await bootstrap();
    assert.equal(result.status, "assigned");
    assert.equal(result.ownerId, ben.id);
    assert.equal(result.previousRole, "customer");

    assert.deepEqual(await snapshotUser(ben.id), before);
    assert.equal(before.username, "benexample");
    assert.equal(before.avatar_url, AVATAR);
    const countAfter = (await db.query(`SELECT count(*)::int AS n FROM users`)).rows[0].n;
    assert.equal(countAfter, countBefore);

    const roles = await db.query(`SELECT id, role FROM users ORDER BY id`);
    assert.deepEqual(
      roles.rows.filter((r) => r.role === "owner").map((r) => r.id),
      [ben.id]
    );
    assert.ok(roles.rows.filter((r) => r.id !== ben.id).every((r) => r.role === "customer"));

    const audit = await db.query(`SELECT target_user_id, details FROM audit_log WHERE action = 'owner_assigned'`);
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].target_user_id, ben.id);
    assert.equal(audit.rows[0].details.source, "username_bootstrap");
    assert.equal(audit.rows[0].details.previousRole, "customer");
  });

  it("existing session sees the owner role at once and the admin area opens", async () => {
    const me = await request(server, { path: "/api/auth/me", cookies: [ben.cookie] });
    assert.equal(me.json.user.role, "owner");
    const list = await request(server, { path: "/api/admin/customers", cookies: [ben.cookie] });
    assert.equal(list.status, 200);
    const health = await request(server, { path: "/api/health" });
    assert.equal(health.json.ownerAssigned, true);
  });

  it("re-running is a no-op and never moves ownership", async () => {
    await db.query(`UPDATE users SET first_name = 'Ben', last_name = 'Example' WHERE id = $1`, [other.id]);
    const again = await bootstrap();
    assert.equal(again.status, "exists");
    assert.equal(again.ownerId, ben.id);
    const byId = await ensureOwner(db, other.id);
    assert.equal(byId.status, "exists");
    const audit = await db.query(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'owner_assigned'`);
    assert.equal(audit.rows[0].n, 1);
  });
});
