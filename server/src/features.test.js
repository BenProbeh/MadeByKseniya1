/**
 * Phone uniqueness, duplicate-phone notifications, user removal, customer ranking and content pages.
 * Runs against an in-memory PostgreSQL engine (PGlite), same SQL as production.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "./app.js";
import db, { closeDb, startDb } from "./db.js";
import { SESSION_COOKIE, hashPassword, publicUser } from "./auth.js";
import { ensureOwner } from "./roles.js";
import { normalizePhone } from "./phone.js";
import { computeCustomerScore, refreshCustomerScores, SCORE_WEIGHTS } from "./customerScore.js";
import { notifyDuplicatePhoneSignup } from "./notifications.js";
import { resolvePackageKey } from "./packageCatalog.js";

const PASSWORD = "strong-pass-1";
const DAY = 24 * 60 * 60 * 1000;

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
          resolve({ status: res.statusCode, setCookie: res.headers["set-cookie"] || [], json, raw });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const cookieFrom = (setCookie) => setCookie.find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.split(";")[0] || null;

let seq = 0;
function registerBody(overrides = {}) {
  seq += 1;
  return {
    username: `f_${seq}_${Date.now().toString(36)}`,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    firstName: "דנה",
    lastName: "לוי",
    phone: `055${String(seq).padStart(7, "0")}`,
    ...overrides,
  };
}

async function register(server, overrides) {
  const body = registerBody(overrides);
  const res = await request(server, { method: "POST", path: "/api/auth/register", body });
  assert.equal(res.status, 201, res.raw);
  return { id: res.json.user.id, username: body.username, cookie: cookieFrom(res.setCookie), user: res.json.user };
}

/** Accounts created straight in the database (keeps the file under the sign-up rate limit). */
async function insertUser({ username, firstName = "לקוחה", lastName = "ישנה", phone = null }) {
  const parsed = phone ? normalizePhone(phone) : null;
  const { rows } = await db.query(
    `INSERT INTO users (username, password_hash, first_name, last_name, phone_e164, phone_display)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [username, await hashPassword(PASSWORD), firstName, lastName, parsed?.e164 ?? null, parsed?.display ?? null]
  );
  return rows[0].id;
}

async function login(server, username) {
  const res = await request(server, { method: "POST", path: "/api/auth/login", body: { username, password: PASSWORD } });
  return { res, cookie: cookieFrom(res.setCookie) };
}

const userCount = async () => (await db.query(`SELECT count(*)::int AS n FROM users`)).rows[0].n;
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

describe("phones, notifications, removal, ranking, content (PostgreSQL)", () => {
  let server;
  let owner;
  let admin;
  let admin2;
  let customer;

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "";
    process.env.PGLITE_DIR = "memory://";
    await startDb();
    server = http.createServer(createApp());
    await new Promise((r) => server.listen(0, "127.0.0.1", r));

    owner = await register(server, { firstName: "Ben", lastName: "Example", phone: "050-9990001" });
    await ensureOwner(db, owner.id);
    admin = await register(server, { firstName: "מנהלת", lastName: "ראשונה", phone: "050-9990002" });
    admin2 = await register(server, { firstName: "מנהלת", lastName: "שנייה", phone: "050-9990003" });
    customer = await register(server, { firstName: "נועה", lastName: "בר", phone: "050-9990004" });
    for (const target of [admin, admin2]) {
      const res = await request(server, {
        method: "PATCH",
        path: `/api/owner/users/${target.id}/role`,
        cookies: [owner.cookie],
        body: { role: "admin" },
      });
      assert.equal(res.status, 200, res.raw);
    }
  });

  after(async () => {
    await new Promise((r) => server.close(r));
    await closeDb();
  });

  describe("phone at sign-up", () => {
    it("normalises every common Israeli format to the same E.164 number", () => {
      const inputs = ["050-1234567", "050 123 4567", "0501234567", "+972501234567", "972501234567", "+972-50-123-4567"];
      for (const input of inputs) {
        const r = normalizePhone(input);
        assert.equal(r.ok, true, input);
        assert.equal(r.e164, "+972501234567", input);
        assert.equal(r.display, "050-123-4567", input);
      }
    });

    it("registers with 050-1234567 and stores E.164 + display, unverified", async () => {
      const created = await register(server, { phone: "050-1234567", firstName: "רותם", lastName: "שמש" });
      assert.equal(created.user.phone, "050-123-4567");
      assert.equal(created.user.phoneVerified, false);
      const { rows } = await db.query(`SELECT phone_e164, phone_display, phone_verified FROM users WHERE id = $1`, [created.id]);
      assert.deepEqual(rows[0], { phone_e164: "+972501234567", phone_display: "050-123-4567", phone_verified: false });
    });

    it("rejects the same number in another format without creating or touching an account", async () => {
      const before = await userCount();
      const existing = (await db.query(`SELECT * FROM users WHERE phone_e164 = '+972501234567'`)).rows[0];

      const res = await request(server, {
        method: "POST",
        path: "/api/auth/register",
        body: registerBody({ phone: "+972501234567", firstName: "אחרת", lastName: "לגמרי" }),
      });
      assert.equal(res.status, 409);
      assert.equal(res.json.error.code, "PHONE_UNAVAILABLE");
      assert.match(res.json.error.message, /לא ניתן להשלים את ההרשמה עם מספר הטלפון הזה/);
      assert.equal(cookieFrom(res.setCookie), null);
      // Public response never reveals who owns the number.
      assert.ok(!res.raw.includes("רותם") && !res.raw.includes(existing.username) && !/"user"/.test(res.raw));

      assert.equal(await userCount(), before);
      const after = (await db.query(`SELECT * FROM users WHERE id = $1`, [existing.id])).rows[0];
      assert.deepEqual(after, existing);
    });

    it("the unique index stops a race between two sign-ups with one phone", async () => {
      const phone = "054-7770001";
      const results = await Promise.all([
        request(server, { method: "POST", path: "/api/auth/register", body: registerBody({ phone }) }),
        request(server, { method: "POST", path: "/api/auth/register", body: registerBody({ phone: "+972547770001" }) }),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      assert.equal(results.find((r) => r.status === 409).json.error.code, "PHONE_UNAVAILABLE");
      const { rows } = await db.query(`SELECT count(*)::int AS n FROM users WHERE phone_e164 = '+972547770001'`);
      assert.equal(rows[0].n, 1);
      await assert.rejects(
        db.query(`UPDATE users SET phone_e164 = '+972547770001' WHERE id = $1`, [customer.id]),
        /users_phone_e164_key|duplicate/
      );
    });

    it("rejects invalid, empty, landline and foreign numbers with friendly messages", async () => {
      const cases = [
        ["12345", /לא נראה תקין/],
        ["", /יש להזין מספר טלפון/],
        ["03-1234567", /נייד ישראלי/],
        ["+14155552671", /נייד ישראלי/],
        ["<script>", /לא נראה תקין/],
      ];
      const before = await userCount();
      for (const [phone, message] of cases) {
        const res = await request(server, { method: "POST", path: "/api/auth/register", body: registerBody({ phone }) });
        assert.equal(res.status, 400, phone);
        assert.equal(res.json.error.code, "VALIDATION_ERROR");
        assert.match(res.json.error.message, message, phone);
      }
      assert.equal(await userCount(), before);
    });

    it("existing accounts without a phone keep working and can add one in the profile", async () => {
      const username = `legacy_${Date.now().toString(36)}`;
      await insertUser({ username });
      const { res, cookie } = await login(server, username);
      assert.equal(res.status, 200);
      assert.equal(res.json.user.phone, null);

      const taken = await request(server, { method: "PATCH", path: "/api/profile/phone", cookies: [cookie], body: { phone: "050-9990001" } });
      assert.equal(taken.status, 409);
      assert.ok(!taken.raw.includes("Ben"));

      const bad = await request(server, { method: "PATCH", path: "/api/profile/phone", cookies: [cookie], body: { phone: "123" } });
      assert.equal(bad.status, 400);

      const extra = await request(server, {
        method: "PATCH",
        path: "/api/profile/phone",
        cookies: [cookie],
        body: { phone: "052-1112233", role: "owner" },
      });
      assert.equal(extra.status, 400);

      const ok = await request(server, { method: "PATCH", path: "/api/profile/phone", cookies: [cookie], body: { phone: "052-1112233" } });
      assert.equal(ok.status, 200, ok.raw);
      assert.equal(ok.json.user.phone, "052-111-2233");
      assert.equal(ok.json.user.role, "customer");
    });
  });

  describe("duplicate-phone notifications", () => {
    it("owner and admins see the attempt with only safe fields; customers can't", async () => {
      const attempt = registerBody({ phone: "050-9990004", firstName: "מירב", lastName: "כץ", password: "Secret-pass-99", confirmPassword: "Secret-pass-99" });
      const res = await request(server, { method: "POST", path: "/api/auth/register", body: attempt });
      assert.equal(res.status, 409);

      for (const viewer of [owner, admin]) {
        const list = await request(server, { path: "/api/admin/notifications", cookies: [viewer.cookie] });
        assert.equal(list.status, 200);
        const n = list.json.notifications.find((x) => x.metadata.phoneE164 === "+972509990004");
        assert.ok(n, "notification exists");
        assert.equal(n.status, "new");
        assert.equal(n.metadata.reason, "ניסיון הרשמה עם מספר טלפון שכבר קיים");
        assert.equal(n.metadata.firstName, "מירב");
        assert.equal(n.metadata.lastName, "כץ");
        assert.equal(n.metadata.username, attempt.username);
        assert.equal(n.metadata.phoneDisplay, "050-999-0004");
        assert.equal(n.relatedUser.id, customer.id);
        assert.ok(list.json.unread >= 1);
        assert.ok(!list.raw.includes("Secret-pass-99"));
        assert.ok(!/password|token|hash/i.test(list.raw));
      }

      const stored = await db.query(`SELECT metadata::text AS m FROM admin_notifications`);
      assert.ok(stored.rows.every((r) => !r.m.includes("Secret-pass-99")));

      const denied = await request(server, { path: "/api/admin/notifications", cookies: [customer.cookie] });
      assert.equal(denied.status, 403);
      const anon = await request(server, { path: "/api/admin/notifications" });
      assert.equal(anon.status, 401);
    });

    it("repeat attempts merge into one notification and a flood is capped", async () => {
      const again = await request(server, {
        method: "POST",
        path: "/api/auth/register",
        body: registerBody({ phone: "0509990004" }),
      });
      assert.equal(again.status, 409);
      const { rows } = await db.query(
        `SELECT metadata FROM admin_notifications WHERE dedupe_key = 'duplicate_phone_signup:+972509990004'`
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].metadata.attempts, 2);

      for (let i = 0; i < 40; i += 1) {
        await notifyDuplicatePhoneSignup(db, {
          firstName: "x",
          lastName: "y",
          username: `flood${i}`,
          phoneE164: `+97258${String(i).padStart(7, "0")}`,
          phoneDisplay: "",
          existingUserId: null,
        });
      }
      const created = await db.query(
        `SELECT count(*)::int AS n FROM admin_notifications WHERE created_at > now() - interval '1 hour'`
      );
      assert.equal(created.rows[0].n, 30);
    });

    it("marking as read updates status, unread count and the new-only filter", async () => {
      const list = await request(server, { path: "/api/admin/notifications?status=new", cookies: [owner.cookie] });
      const target = list.json.notifications.find((x) => x.metadata.phoneE164 === "+972509990004");
      const unreadBefore = list.json.unread;

      const denied = await request(server, { method: "PATCH", path: `/api/admin/notifications/${target.id}/read`, cookies: [customer.cookie] });
      assert.equal(denied.status, 403);

      const read = await request(server, { method: "PATCH", path: `/api/admin/notifications/${target.id}/read`, cookies: [admin.cookie] });
      assert.equal(read.status, 200);
      assert.equal(read.json.notification.status, "read");
      assert.ok(read.json.notification.readAt);
      assert.equal(read.json.unread, unreadBefore - 1);

      const onlyNew = await request(server, { path: "/api/admin/notifications?status=new", cookies: [owner.cookie] });
      assert.ok(!onlyNew.json.notifications.some((x) => x.id === target.id));
      const missing = await request(server, { method: "PATCH", path: `/api/admin/notifications/999999/read`, cookies: [owner.cookie] });
      assert.equal(missing.status, 404);
    });
  });

  describe("removing users", () => {
    let removable;
    let removable2;

    before(async () => {
      removable = await insertUser({ username: `rm_a_${Date.now().toString(36)}`, phone: "050-4440001" });
      removable2 = await insertUser({ username: `rm_b_${Date.now().toString(36)}`, phone: "050-4440002" });
      await db.query(
        `INSERT INTO orders (user_id, order_number, total_amount, status, title_he) VALUES ($1, 'MBK-RM-1', 25000, 'completed', 'סט')`,
        [removable]
      );
    });

    it("customers can't remove anyone", async () => {
      const res = await request(server, { method: "DELETE", path: `/api/admin/customers/${removable}`, cookies: [customer.cookie] });
      assert.equal(res.status, 403);
    });

    it("owner removes a customer: sessions end, login is blocked, orders stay, audit is written", async () => {
      const username = (await db.query(`SELECT username FROM users WHERE id = $1`, [removable])).rows[0].username;
      const session = await login(server, username);
      assert.equal(session.res.status, 200);

      const res = await request(server, { method: "DELETE", path: `/api/admin/customers/${removable}`, cookies: [owner.cookie] });
      assert.equal(res.status, 200, res.raw);
      assert.ok(res.json.customer.removedAt);

      const me = await request(server, { path: "/api/auth/me", cookies: [session.cookie] });
      assert.equal(me.status, 401);
      const again = await login(server, username);
      assert.equal(again.res.status, 401);
      assert.equal(again.res.json.error.code, "INVALID_CREDENTIALS");

      const orders = await db.query(`SELECT count(*)::int AS n FROM orders WHERE user_id = $1`, [removable]);
      assert.equal(orders.rows[0].n, 1);
      const row = (await db.query(`SELECT deleted_by, phone_e164 FROM users WHERE id = $1`, [removable])).rows[0];
      assert.equal(row.deleted_by, owner.id);
      assert.equal(row.phone_e164, "+972504440001");

      const audit = await db.query(`SELECT actor_user_id FROM audit_log WHERE action = 'user_removed' AND target_user_id = $1`, [removable]);
      assert.equal(audit.rows[0].actor_user_id, owner.id);

      const list = await request(server, { path: "/api/admin/customers?pageSize=50", cookies: [owner.cookie] });
      assert.ok(!list.json.customers.some((c) => c.id === removable));

      const reuse = await request(server, { method: "POST", path: "/api/auth/register", body: registerBody({ phone: "050-4440001" }) });
      assert.equal(reuse.status, 409, "phone stays reserved after removal");
    });

    it("admin removes a customer but not another admin; nobody removes the owner", async () => {
      const ok = await request(server, { method: "DELETE", path: `/api/admin/customers/${removable2}`, cookies: [admin.cookie] });
      assert.equal(ok.status, 200, ok.raw);

      const adminVsAdmin = await request(server, { method: "DELETE", path: `/api/admin/customers/${admin2.id}`, cookies: [admin.cookie] });
      assert.equal(adminVsAdmin.status, 403);

      const adminVsOwner = await request(server, { method: "DELETE", path: `/api/admin/customers/${owner.id}`, cookies: [admin.cookie] });
      assert.equal(adminVsOwner.status, 403);
      const ownerSelf = await request(server, { method: "DELETE", path: `/api/admin/customers/${owner.id}`, cookies: [owner.cookie] });
      assert.equal(ownerSelf.status, 403);
      await assert.rejects(db.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [owner.id]), /owner/);

      const detail = await request(server, { path: `/api/admin/customers/${admin2.id}`, cookies: [admin.cookie] });
      assert.equal(detail.json.permissions.canRemove, false);
      const detailOwner = await request(server, { path: `/api/admin/customers/${admin2.id}`, cookies: [owner.cookie] });
      assert.equal(detailOwner.json.permissions.canRemove, true);
    });

    it("only the owner lists removed users and restores them", async () => {
      const denied = await request(server, { path: "/api/admin/customers?status=removed", cookies: [admin.cookie] });
      assert.equal(denied.status, 403);
      const hidden = await request(server, { path: `/api/admin/customers/${removable}`, cookies: [admin.cookie] });
      assert.equal(hidden.status, 404);

      const removed = await request(server, { path: "/api/admin/customers?status=removed", cookies: [owner.cookie] });
      assert.equal(removed.status, 200);
      assert.deepEqual(removed.json.customers.map((c) => c.id).sort(), [removable, removable2].sort());

      const byAdmin = await request(server, { method: "POST", path: `/api/owner/users/${removable}/restore`, cookies: [admin.cookie] });
      assert.equal(byAdmin.status, 403);

      const restore = await request(server, { method: "POST", path: `/api/owner/users/${removable}/restore`, cookies: [owner.cookie] });
      assert.equal(restore.status, 200, restore.raw);
      assert.equal(restore.json.customer.removedAt, null);
      const username = (await db.query(`SELECT username FROM users WHERE id = $1`, [removable])).rows[0].username;
      assert.equal((await login(server, username)).res.status, 200);
      const audit = await db.query(`SELECT 1 FROM audit_log WHERE action = 'user_restored' AND target_user_id = $1`, [removable]);
      assert.equal(audit.rows.length, 1);
    });

    it("Ben Example is still the one and only owner", async () => {
      const { rows } = await db.query(`SELECT id FROM users WHERE role = 'owner'`);
      assert.deepEqual(rows.map((r) => r.id), [owner.id]);
    });
  });

  describe("customer ranking", () => {
    const now = new Date("2026-09-30T12:00:00Z");
    const at = (daysAgo) => new Date(now.getTime() - daysAgo * DAY).toISOString();

    it("no activity gives 0, low tier and no error", () => {
      const r = computeCustomerScore({ appointments: [], orders: [] }, now);
      assert.equal(r.score, 0);
      assert.equal(r.tier, "low");
      assert.equal(r.insufficientData, true);
      assert.equal(r.breakdown.length, 5);
    });

    it("weights add up to 100 and scores stay within 0-100", () => {
      const total = Object.values(SCORE_WEIGHTS).reduce((s, w) => s + w.max, 0);
      assert.equal(total, 100);
      const heavy = {
        appointments: Array.from({ length: 40 }, (_, i) => ({ status: "confirmed", kind: "build", priceIls: 340, startsAt: at(i * 3) })),
        orders: [{ status: "paid", totalAgorot: 99999999, createdAt: at(1) }],
      };
      const r = computeCustomerScore(heavy, now);
      assert.ok(r.score >= 0 && r.score <= 100);
    });

    it("a steady build every two weeks earns the full build points", () => {
      const builds = Array.from({ length: 7 }, (_, i) => ({ status: "confirmed", kind: "build", priceIls: 300, startsAt: at(1 + i * 14) }));
      const r = computeCustomerScore({ appointments: builds, orders: [] }, now);
      const part = r.breakdown.find((p) => p.key === "builds");
      assert.equal(part.points, SCORE_WEIGHTS.builds.max);
      assert.match(part.detail, /כל 14 ימים/);

      const monthly = Array.from({ length: 4 }, (_, i) => ({ status: "confirmed", kind: "build", priceIls: 300, startsAt: at(1 + i * 28) }));
      const slower = computeCustomerScore({ appointments: monthly, orders: [] }, now).breakdown.find((p) => p.key === "builds");
      assert.ok(slower.points < part.points);
    });

    it("fills and designs never count as builds", () => {
      const fills = Array.from({ length: 7 }, (_, i) => ({ status: "confirmed", kind: "fill", priceIls: 240, startsAt: at(1 + i * 14) }));
      const r = computeCustomerScore({ appointments: fills, orders: [] }, now);
      assert.equal(r.breakdown.find((p) => p.key === "builds").points, 0);
    });

    it("a cancelled booking is not counted as completed and lowers attendance", () => {
      const done = { status: "confirmed", kind: "fill", priceIls: 200, startsAt: at(5) };
      const cancelled = { status: "cancelled", kind: "build", priceIls: 340, startsAt: at(3) };
      const withCancel = computeCustomerScore({ appointments: [done, cancelled], orders: [] }, now);
      const clean = computeCustomerScore({ appointments: [done], orders: [] }, now);
      const bookings = withCancel.breakdown.find((p) => p.key === "bookings");
      assert.match(bookings.detail, /1 הושלמו · 1 בוטלו/);
      assert.ok(bookings.points < clean.breakdown.find((p) => p.key === "bookings").points);
      assert.equal(withCancel.breakdown.find((p) => p.key === "builds").points, 0);
      assert.equal(withCancel.breakdown.find((p) => p.key === "revenue").detail, "200 ₪ בסך הכול");
    });

    it("package bookings store server-side kind and price; unknown keys are ignored", async () => {
      assert.deepEqual(resolvePackageKey("bad-bitch:build:M"), { key: "bad-bitch:build:M", label: "בניות · M", kind: "build", priceIls: 300 });
      assert.equal(resolvePackageKey("bad-bitch:build:XL"), null);
      assert.equal(resolvePackageKey("javascript:alert(1)"), null);

      const services = (await request(server, { path: "/api/services" })).json;
      const base = { clientName: "נועה בר", phone: "050-999-0004", serviceId: services[0].id, time: "10:00" };
      const booked = [];
      for (let i = 0; i < 6; i += 1) {
        const res = await request(server, {
          method: "POST",
          path: "/api/appointments",
          cookies: [customer.cookie],
          body: { ...base, date: ymd(Date.now() - (2 + i * 14) * DAY), packageKey: "bad-bitch:build:L", priceIls: 1 },
        });
        assert.equal(res.status, 201, res.raw);
        booked.push(res.json);
      }
      assert.equal(booked[0].service_kind, "build");
      assert.equal(booked[0].price_ils, 340, "price comes from the catalog, not the request");
      assert.equal(booked[0].user_id, customer.id);
      assert.equal(booked[0].phone_e164, "+972509990004");

      const bogus = await request(server, {
        method: "POST",
        path: "/api/appointments",
        body: { ...base, date: ymd(Date.now() - 200 * DAY), packageKey: "fake:thing" },
      });
      assert.equal(bogus.status, 201);
      assert.equal(bogus.json.package_key, null);
      assert.equal(bogus.json.service_kind, null);

      const cancel = await request(server, { method: "PATCH", path: `/api/appointments/${booked[5].id}`, body: { status: "cancelled" } });
      assert.equal(cancel.status, 200);
    });

    it("staff list sorts and filters by score; customers never see scores", async () => {
      await refreshCustomerScores(db);
      const list = await request(server, { path: "/api/admin/customers?sort=score&pageSize=50", cookies: [owner.cookie] });
      assert.equal(list.status, 200);
      const top = list.json.customers[0];
      assert.equal(top.id, customer.id);
      assert.ok(top.score.value > 0 && top.score.value <= 100);
      assert.equal(top.score.breakdown.length, 5);
      assert.ok(list.json.customers.every((c) => c.score == null || (c.score.value >= 0 && c.score.value <= 100)));

      const byTier = await request(server, { path: `/api/admin/customers?tier=${top.score.tier}&pageSize=50`, cookies: [admin.cookie] });
      assert.ok(byTier.json.customers.every((c) => c.score.tier === top.score.tier));
      assert.ok(byTier.json.customers.some((c) => c.id === customer.id));

      const activity = await request(server, { path: "/api/admin/customers?sort=activity", cookies: [owner.cookie] });
      assert.equal(activity.status, 200);
      const badTier = await request(server, { path: "/api/admin/customers?tier=vip", cookies: [owner.cookie] });
      assert.equal(badTier.status, 400);

      const mine = await request(server, { path: "/api/auth/me", cookies: [customer.cookie] });
      const profile = await request(server, { path: "/api/profile", cookies: [customer.cookie] });
      for (const r of [mine, profile]) assert.ok(!/score|tier/i.test(r.raw));
      const denied = await request(server, { path: "/api/admin/customers", cookies: [customer.cookie] });
      assert.equal(denied.status, 403);
    });

    it("the list exposes the E.164 phone for tel: links and a friendly display", async () => {
      const detail = await request(server, { path: `/api/admin/customers/${customer.id}`, cookies: [admin.cookie] });
      assert.equal(detail.json.customer.phoneE164, "+972509990004");
      assert.equal(detail.json.customer.phone, "050-999-0004");
      assert.ok(!/password|token_hash|\$2[aby]\$/i.test(detail.raw));
    });
  });

  describe("content pages", () => {
    let pageId;

    const page = (overrides = {}) => ({
      slug: "spring-offer",
      title: "מבצע אביב",
      subtitle: "משהו קטן ומיוחד",
      eyebrow: "Spring",
      seoTitle: "מבצע אביב",
      seoDescription: "תיאור קצר",
      sections: [
        { type: "heading", data: { text: "מה מחכה לך" } },
        { type: "paragraph", data: { text: "<script>alert(1)</script>שורה ראשונה\nשורה שנייה <b onclick=x>מודגש</b>" } },
        { type: "list", data: { items: ["בנייה", "מילוי", ""], ordered: false } },
        { type: "cta", data: { label: "לקביעת תור", href: "/booking", variant: "primary" } },
      ],
      ...overrides,
    });

    it("customers and visitors can't open content management", async () => {
      assert.equal((await request(server, { path: "/api/admin/content/pages" })).status, 401);
      assert.equal((await request(server, { path: "/api/admin/content/pages", cookies: [customer.cookie] })).status, 403);
      const create = await request(server, { method: "POST", path: "/api/admin/content/pages", cookies: [customer.cookie], body: page() });
      assert.equal(create.status, 403);
    });

    it("admin creates a draft; text is stripped of HTML and scripts", async () => {
      const res = await request(server, { method: "POST", path: "/api/admin/content/pages", cookies: [admin.cookie], body: page() });
      assert.equal(res.status, 201, res.raw);
      pageId = res.json.page.id;
      assert.equal(res.json.page.status, "draft");
      assert.equal(res.json.page.createdBy.id, admin.id);
      const paragraph = res.json.page.sections[1].data.text;
      assert.ok(!/[<>]/.test(paragraph));
      assert.equal(paragraph, "alert(1)שורה ראשונה\nשורה שנייה מודגש");
      assert.deepEqual(res.json.page.sections[2].data.items, ["בנייה", "מילוי"]);
    });

    it("drafts are hidden from the site until published, then render for signed-in users", async () => {
      const hidden = await request(server, { path: "/api/content/pages/spring-offer", cookies: [customer.cookie] });
      assert.equal(hidden.status, 404);

      const publish = await request(server, { method: "POST", path: `/api/admin/content/pages/${pageId}/publish`, cookies: [owner.cookie] });
      assert.equal(publish.status, 200);
      assert.equal(publish.json.page.status, "published");

      const visible = await request(server, { path: "/api/content/pages/spring-offer", cookies: [customer.cookie] });
      assert.equal(visible.status, 200);
      assert.equal(visible.json.page.title, "מבצע אביב");
      assert.equal(visible.json.page.sections.length, 4);
      assert.ok(!("createdBy" in visible.json.page));
      assert.equal((await request(server, { path: "/api/content/pages/spring-offer" })).status, 401);
    });

    it("rejects duplicate slugs, reserved routes, unsafe links and unknown fields", async () => {
      const dup = await request(server, { method: "POST", path: "/api/admin/content/pages", cookies: [owner.cookie], body: page() });
      assert.equal(dup.status, 409);
      assert.equal(dup.json.code, "SLUG_TAKEN");

      for (const slug of ["services", "admin", "api", "login", "nail-sizing", "Bad Slug", "a"]) {
        const res = await request(server, { method: "POST", path: "/api/admin/content/pages", cookies: [owner.cookie], body: page({ slug }) });
        assert.equal(res.status, 400, slug);
      }

      const unsafe = [
        { type: "cta", data: { label: "x", href: "javascript:alert(1)" } },
        { type: "cta", data: { label: "x", href: "//evil.example" } },
        { type: "image", data: { url: "data:image/png;base64,AAAA", alt: "x" } },
        { type: "links", data: { items: [{ label: "x", href: "vbscript:msgbox" }] } },
        { type: "html", data: { html: "<iframe>" } },
      ];
      for (const section of unsafe) {
        const res = await request(server, {
          method: "POST",
          path: "/api/admin/content/pages",
          cookies: [owner.cookie],
          body: page({ slug: `unsafe-${Math.random().toString(36).slice(2, 7)}`, sections: [section] }),
        });
        assert.equal(res.status, 400, JSON.stringify(section));
      }

      const massAssign = await request(server, {
        method: "POST",
        path: "/api/admin/content/pages",
        cookies: [owner.cookie],
        body: { ...page({ slug: "sneaky" }), status: "published", createdBy: 1 },
      });
      assert.equal(massAssign.status, 400);
    });

    it("edits persist in PostgreSQL with who/when, and every action is audited", async () => {
      const edit = await request(server, {
        method: "PATCH",
        path: `/api/admin/content/pages/${pageId}`,
        cookies: [owner.cookie],
        body: {
          title: "מבצע אביב מעודכן",
          sections: [
            { type: "image", data: { url: "https://images.example.com/a.jpg", alt: "סט ורוד", caption: "" } },
            { type: "links", data: { items: [{ label: "מסלולים", href: "/services" }, { label: "וואטסאפ", href: "https://wa.me/972500000000" }] } },
          ],
        },
      });
      assert.equal(edit.status, 200, edit.raw);
      const stored = await db.query(`SELECT title, updated_by FROM content_pages WHERE id = $1`, [pageId]);
      assert.deepEqual(stored.rows[0], { title: "מבצע אביב מעודכן", updated_by: owner.id });
      const sections = await db.query(`SELECT type FROM content_page_sections WHERE page_id = $1 ORDER BY position`, [pageId]);
      assert.deepEqual(sections.rows.map((r) => r.type), ["image", "links"]);
      assert.equal(edit.json.page.updatedBy.id, owner.id);

      const dupe = await request(server, { method: "POST", path: `/api/admin/content/pages/${pageId}/duplicate`, cookies: [admin.cookie] });
      assert.equal(dupe.status, 201);
      assert.equal(dupe.json.page.slug, "spring-offer-copy");
      assert.equal(dupe.json.page.status, "draft");
      assert.equal(dupe.json.page.sections.length, 2);

      const unpublish = await request(server, { method: "POST", path: `/api/admin/content/pages/${pageId}/unpublish`, cookies: [admin.cookie] });
      assert.equal(unpublish.json.page.status, "draft");

      const actions = await db.query(`SELECT DISTINCT action FROM audit_log WHERE action LIKE 'content_page_%'`);
      assert.deepEqual(
        actions.rows.map((r) => r.action).sort(),
        ["content_page_created", "content_page_duplicated", "content_page_published", "content_page_unpublished", "content_page_updated"]
      );
    });

    it("soft delete hides the page everywhere and frees the slug", async () => {
      await request(server, { method: "POST", path: `/api/admin/content/pages/${pageId}/publish`, cookies: [owner.cookie] });
      const del = await request(server, { method: "DELETE", path: `/api/admin/content/pages/${pageId}`, cookies: [admin.cookie] });
      assert.equal(del.status, 200);
      assert.equal((await request(server, { path: "/api/content/pages/spring-offer", cookies: [customer.cookie] })).status, 404);
      const list = await request(server, { path: "/api/admin/content/pages", cookies: [owner.cookie] });
      assert.ok(!list.json.pages.some((p) => p.id === pageId));
      const row = await db.query(`SELECT deleted_at, deleted_by FROM content_pages WHERE id = $1`, [pageId]);
      assert.ok(row.rows[0].deleted_at);
      assert.equal(row.rows[0].deleted_by, admin.id);
      const audit = await db.query(`SELECT 1 FROM audit_log WHERE action = 'content_page_deleted'`);
      assert.equal(audit.rows.length, 1);

      const reuse = await request(server, { method: "POST", path: "/api/admin/content/pages", cookies: [owner.cookie], body: page() });
      assert.equal(reuse.status, 201);
    });
  });

  describe("personal site colour", () => {
    const me = async (cookie) => (await request(server, { path: "/api/auth/me", cookies: [cookie] })).json.user;
    const setTheme = (cookie, body) => request(server, { method: "PATCH", path: "/api/profile/theme", cookies: [cookie], body });
    const storedTheme = async (id) =>
      (await db.query(`SELECT theme_color, theme_palette_version FROM users WHERE id = $1`, [id])).rows[0];

    it("users start on the site default", async () => {
      const user = await me(customer.cookie);
      assert.equal(user.themeColor, null);
      assert.equal(user.themePaletteVersion, null);
    });

    it("saves a normalised base colour and returns it after re-login", async () => {
      const res = await setTheme(customer.cookie, { color: "#1E3A8A", paletteVersion: 1 });
      assert.equal(res.status, 200, res.raw);
      assert.equal(res.json.user.themeColor, "#1e3a8a");
      assert.deepEqual(await storedTheme(customer.id), { theme_color: "#1e3a8a", theme_palette_version: 1 });

      const again = await login(server, customer.username);
      assert.equal(again.res.status, 200);
      assert.equal(again.res.json.user.themeColor, "#1e3a8a");
      assert.equal((await me(again.cookie)).themeColor, "#1e3a8a");
    });

    it("rejects anything that isn't a plain hex colour and keeps the saved value", async () => {
      const bad = [
        { color: "red" },
        { color: "#12345" },
        { color: "#1234567" },
        { color: "#ggg000" },
        { color: "rgb(0,0,255)" },
        { color: "#fff;background:url(x)" },
        { color: "url(javascript:alert(1))" },
        { color: "#" + "a".repeat(500) },
        { color: 123 },
        { color: { r: 1 } },
        { color: "#112233", paletteVersion: 0 },
        { color: "#112233", paletteVersion: "1" },
        { color: "#112233", css: "body{display:none}" },
        { color: "#112233", userId: owner.id },
        {},
      ];
      for (const body of bad) {
        const res = await setTheme(customer.cookie, body);
        assert.equal(res.status, 400, JSON.stringify(body));
      }
      assert.equal((await storedTheme(customer.id)).theme_color, "#1e3a8a");
    });

    it("each user only changes their own colour", async () => {
      const res = await setTheme(owner.cookie, { color: "#7f1d1d", paletteVersion: 1 });
      assert.equal(res.status, 200);
      assert.equal((await me(owner.cookie)).themeColor, "#7f1d1d");
      assert.equal((await me(customer.cookie)).themeColor, "#1e3a8a");
      assert.equal((await me(admin.cookie)).themeColor, null);
      assert.equal((await request(server, { method: "PATCH", path: "/api/profile/theme", body: { color: "#000000" } })).status, 401);
    });

    it("null returns to the default and clears the palette version", async () => {
      const res = await setTheme(customer.cookie, { color: null });
      assert.equal(res.status, 200);
      assert.equal(res.json.user.themeColor, null);
      assert.deepEqual(await storedTheme(customer.id), { theme_color: null, theme_palette_version: null });
      assert.equal((await me(owner.cookie)).themeColor, "#7f1d1d");
    });

    it("the database refuses a malformed colour and the API never exposes one", async () => {
      await assert.rejects(db.query(`UPDATE users SET theme_color = 'blue' WHERE id = $1`, [customer.id]));
      await assert.rejects(db.query(`UPDATE users SET theme_color = '#FFFFFF' WHERE id = $1`, [customer.id]));
      assert.equal(publicUser({ id: 1, theme_color: "url(x)", theme_palette_version: 1 }).themeColor, null);
      assert.equal(publicUser({ id: 1, theme_color: "url(x)", theme_palette_version: 1 }).themePaletteVersion, null);
    });
  });
});
