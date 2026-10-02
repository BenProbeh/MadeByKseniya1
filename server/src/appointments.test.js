/**
 * Booking requests: pending -> confirmed/rejected/cancelled, staff-only decisions, slot states,
 * double-booking protection (server + database) and the 007 migration on legacy rows.
 * Runs against an in-memory PostgreSQL engine (PGlite), same SQL as production.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "./app.js";
import db, { closeDb, startDb } from "./db.js";
import { SESSION_COOKIE, hashPassword } from "./auth.js";
import { ensureOwner } from "./roles.js";
import { migrations } from "./migrations.js";
import { createAppointmentRequest, getAvailability, israelNow } from "./appointmentsService.js";

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
/** Account created in the database, then signed in through the real login endpoint. */
async function createUser(server, { role = "customer", firstName = "לקוחה", lastName = "בדיקה" } = {}) {
  seq += 1;
  const username = `appt_${seq}_${Date.now().toString(36)}`;
  const phone = `+97253${String(seq).padStart(7, "0")}`;
  const { rows } = await db.query(
    `INSERT INTO users (username, password_hash, first_name, last_name, phone_e164, phone_display)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [username, await hashPassword(PASSWORD), firstName, lastName, phone, `053-${String(seq).padStart(7, "0")}`]
  );
  const id = rows[0].id;
  if (role === "owner") await ensureOwner(db, id);
  if (role === "admin") await db.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [id]);
  const login = await request(server, { method: "POST", path: "/api/auth/login", body: { username, password: PASSWORD } });
  assert.equal(login.status, 200, login.raw);
  return { id, username, cookie: cookieFrom(login.setCookie) };
}

/** Israel calendar date `days` from today. */
const dayFromNow = (days) => {
  const today = israelNow().date;
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

const SERVICE_60 = 1; // מניקור ג'ל, 60 minutes
const SERVICE_90 = 2; // בניה בתבנית, 90 minutes

function book(server, user, { date, time, serviceId = SERVICE_60, ...extra }) {
  return request(server, {
    method: "POST",
    path: "/api/appointments",
    cookies: user ? [user.cookie] : [],
    body: { clientName: "נועה בר", phone: "050-1234567", serviceId, date, time, ...extra },
  });
}

async function stateOf(server, date, time, serviceId = SERVICE_60) {
  const res = await request(server, { path: `/api/appointments/availability?date=${date}&serviceId=${serviceId}` });
  assert.equal(res.status, 200);
  return res.json.times.find((t) => t.time === time)?.state;
}

describe("booking requests (PostgreSQL)", () => {
  let server;
  let owner;
  let admin;
  let alice;
  let bella;

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "";
    process.env.PGLITE_DIR = "memory://";
    await startDb();
    server = http.createServer(createApp());
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    owner = await createUser(server, { role: "owner", firstName: "קסניה", lastName: "בעלים" });
    admin = await createUser(server, { role: "admin", firstName: "מנהלת", lastName: "מורשית" });
    alice = await createUser(server, { firstName: "אליס", lastName: "כהן" });
    bella = await createUser(server, { firstName: "בלה", lastName: "לוי" });
  });

  after(async () => {
    await new Promise((r) => server.close(r));
    await closeDb();
  });

  it("a request is pending, greys out every overlapping start for everyone, and exposes no personal data", async () => {
    const date = dayFromNow(10);
    assert.equal(await stateOf(server, date, "10:00"), "free");

    const res = await book(server, alice, { date, time: "10:00", notes: "סוד אישי" });
    assert.equal(res.status, 201, res.raw);
    assert.equal(res.json.appointment.status, "pending");
    assert.equal(res.json.appointment.statusHe, "ממתין לאישור");

    // 60-minute request at 10:00: a 60-minute start at 10:30 would overlap it, 11:00 would not.
    assert.equal(await stateOf(server, date, "10:00"), "pending");
    assert.equal(await stateOf(server, date, "10:30"), "pending");
    assert.equal(await stateOf(server, date, "11:00"), "free");
    // A 90-minute service starting at 09:00 would run into it as well.
    assert.equal(await stateOf(server, date, "09:00", SERVICE_90), "pending");

    const avail = await request(server, { path: `/api/appointments/availability?date=${date}&serviceId=1` });
    assert.ok(!avail.json.slots.includes("10:00"));
    assert.ok(!/נועה|050|סוד|אליס|מניקור/.test(avail.raw), "public availability carries no names, phones, services or notes");
    assert.deepEqual(Object.keys(avail.json.times[0]).sort(), ["state", "time"]);

    const other = await book(server, bella, { date, time: "10:00" });
    assert.equal(other.status, 409);
    assert.equal(other.json.code, "SLOT_TAKEN");
    const overlapping = await book(server, bella, { date, time: "10:30" });
    assert.equal(overlapping.status, 409);
  });

  it("only the owner or an admin can decide; customers are refused by the API", async () => {
    const date = dayFromNow(11);
    const res = await book(server, alice, { date, time: "12:00" });
    const id = res.json.appointment.id;

    for (const path of [`/api/admin/appointments/${id}/confirm`, `/api/admin/appointments/${id}/reject`]) {
      assert.equal((await request(server, { method: "POST", path, cookies: [alice.cookie] })).status, 403);
      assert.equal((await request(server, { method: "POST", path })).status, 401);
    }
    const patch = await request(server, {
      method: "PATCH",
      path: `/api/appointments/${id}`,
      cookies: [alice.cookie],
      body: { status: "confirmed" },
    });
    assert.equal(patch.status, 403);
    assert.equal((await request(server, { path: "/api/admin/appointments", cookies: [alice.cookie] })).status, 403);
    assert.equal((await db.query(`SELECT status FROM appointments WHERE id = $1`, [id])).rows[0].status, "pending");
  });

  it("the owner sees the full request, confirms it once, and the slot turns booked for everyone", async () => {
    const date = dayFromNow(12);
    const res = await book(server, bella, { date, time: "14:00", notes: "אורך בינוני", packageKey: "bad-bitch:build:M" });
    const id = res.json.appointment.id;

    const notifications = await request(server, { path: "/api/admin/notifications?status=new", cookies: [owner.cookie] });
    const note = notifications.json.notifications.find((n) => n.metadata.appointmentId === id);
    assert.ok(note, "staff get an in-app notification");
    assert.equal(note.type, "appointment_request");
    assert.equal(note.metadata.time, "14:00");
    assert.equal(note.metadata.serviceLabel, "בניות · M");
    assert.ok(!/password|token|hash/i.test(JSON.stringify(note)));

    const list = await request(server, { path: "/api/admin/appointments?status=pending", cookies: [owner.cookie] });
    assert.equal(list.status, 200);
    const item = list.json.appointments.find((a) => a.id === id);
    assert.equal(item.firstName, "בלה");
    assert.equal(item.lastName, "לוי");
    assert.equal(item.phone, "050-123-4567");
    assert.equal(item.date, date);
    assert.equal(item.time, "14:00");
    assert.equal(item.serviceLabel, "בניות · M");
    assert.equal(item.priceIls, 300);
    assert.equal(item.notes, "אורך בינוני");
    assert.ok(item.createdAt);
    assert.deepEqual(item.allowedActions, ["confirmed", "rejected", "cancelled"]);

    const confirm = await request(server, { method: "POST", path: `/api/admin/appointments/${id}/confirm`, cookies: [owner.cookie] });
    assert.equal(confirm.status, 200, confirm.raw);
    assert.equal(confirm.json.appointment.status, "confirmed");
    assert.equal(confirm.json.appointment.statusChangedBy.id, owner.id);
    assert.ok(confirm.json.appointment.statusChangedAt);

    assert.equal(await stateOf(server, date, "14:00"), "booked");
    const again = await request(server, { method: "POST", path: `/api/admin/appointments/${id}/confirm`, cookies: [admin.cookie] });
    assert.equal(again.status, 409);
    assert.equal(again.json.code, "ALREADY_HANDLED");
    const rejectAfter = await request(server, { method: "POST", path: `/api/admin/appointments/${id}/reject`, cookies: [owner.cookie] });
    assert.equal(rejectAfter.status, 409);

    const audit = await db.query(`SELECT actor_user_id, action, details FROM audit_log WHERE action = 'appointment_confirmed'`);
    assert.ok(audit.rows.some((r) => r.actor_user_id === owner.id && r.details.appointmentId === id));
    const readNote = await db.query(`SELECT status, read_by FROM admin_notifications WHERE id = $1`, [note.id]);
    assert.deepEqual(readNote.rows[0], { status: "read", read_by: owner.id });

    const mine = await request(server, { path: "/api/appointments/mine", cookies: [bella.cookie] });
    assert.equal(mine.json.appointments.find((a) => a.id === id).statusHe, "התור אושר");
  });

  it("an admin can confirm; rejecting or cancelling frees the slot again", async () => {
    const date = dayFromNow(13);
    const first = await book(server, alice, { date, time: "09:00" });
    const confirm = await request(server, {
      method: "POST",
      path: `/api/admin/appointments/${first.json.appointment.id}/confirm`,
      cookies: [admin.cookie],
    });
    assert.equal(confirm.status, 200);
    assert.equal(await stateOf(server, date, "09:00"), "booked");

    const cancel = await request(server, {
      method: "POST",
      path: `/api/admin/appointments/${first.json.appointment.id}/cancel`,
      cookies: [admin.cookie],
    });
    assert.equal(cancel.status, 200);
    assert.equal(await stateOf(server, date, "09:00"), "free");
    const cancelAgain = await request(server, {
      method: "POST",
      path: `/api/admin/appointments/${first.json.appointment.id}/cancel`,
      cookies: [owner.cookie],
    });
    assert.equal(cancelAgain.status, 409);

    const second = await book(server, bella, { date, time: "16:00" });
    assert.equal(await stateOf(server, date, "16:00"), "pending");
    const reject = await request(server, {
      method: "PATCH",
      path: `/api/admin/appointments/${second.json.appointment.id}/status`,
      cookies: [owner.cookie],
      body: { status: "rejected" },
    });
    assert.equal(reject.status, 200);
    assert.equal(await stateOf(server, date, "16:00"), "free");
    const mine = await request(server, { path: "/api/appointments/mine", cookies: [bella.cookie] });
    assert.equal(mine.json.appointments.find((a) => a.id === second.json.appointment.id).statusHe, "הבקשה לא אושרה");

    // The freed slot can be requested again, by anyone.
    assert.equal((await book(server, alice, { date, time: "16:00" })).status, 201);
  });

  it("simultaneous requests for the same or overlapping time create exactly one booking", async () => {
    const date = dayFromNow(14);
    const racers = await Promise.all(Array.from({ length: 6 }, (_, i) => createUser(server, { firstName: `רצה${i}` })));
    const results = await Promise.all(
      racers.map((user, i) => book(server, user, { date, time: i % 2 ? "11:30" : "11:00" }))
    );
    const created = results.filter((r) => r.status === 201);
    assert.equal(created.length, 1, results.map((r) => r.status).join(","));
    assert.ok(results.every((r) => r.status === 201 || r.status === 409));
    const active = await db.query(
      `SELECT count(*)::int AS n FROM appointments WHERE date = $1 AND status IN ('pending', 'confirmed')`,
      [date]
    );
    assert.equal(active.rows[0].n, 1);
  });

  it("the same form submission twice is one request; past or off-grid times are refused", async () => {
    const date = dayFromNow(15);
    const key = "req-1234567890abcdef";
    const [a, b] = await Promise.all([
      book(server, bella, { date, time: "13:00", requestKey: key }),
      book(server, bella, { date, time: "13:00", requestKey: key }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 201]);
    assert.equal(a.json.appointment.id, b.json.appointment.id);

    const yesterday = await book(server, bella, { date: dayFromNow(-1), time: "13:00" });
    assert.equal(yesterday.status, 400);
    const offGrid = await book(server, bella, { date, time: "13:15" });
    assert.equal(offGrid.status, 400);
    const badDate = await book(server, bella, { date: "2026-02-30", time: "13:00" });
    assert.equal(badDate.status, 400);
    const pastAvailability = await request(server, { path: `/api/appointments/availability?date=${dayFromNow(-1)}&serviceId=1` });
    assert.deepEqual(pastAvailability.json.times, []);
  });

  it("one customer can hold at most three pending requests", async () => {
    const carol = await createUser(server, { firstName: "קרול" });
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await book(server, carol, { date: dayFromNow(20 + i), time: "17:00" })).status, 201);
    }
    const fourth = await book(server, carol, { date: dayFromNow(24), time: "17:00" });
    assert.equal(fourth.status, 409);
    assert.equal(fourth.json.code, "TOO_MANY_PENDING");
  });

  it("customers only ever see their own requests", async () => {
    const mine = await request(server, { path: "/api/appointments/mine", cookies: [alice.cookie] });
    const ids = mine.json.appointments.map((a) => a.id);
    const theirs = await db.query(`SELECT id FROM appointments WHERE user_id IS DISTINCT FROM $1`, [alice.id]);
    assert.ok(theirs.rows.every((r) => !ids.includes(r.id)));
    assert.ok(mine.json.appointments.every((a) => !("phone" in a) && !("notes" in a)));
    assert.equal((await request(server, { path: "/api/appointments/mine" })).status, 401);
  });

  it("the database itself refuses an overlapping active booking", async () => {
    const date = dayFromNow(30);
    const erin = await createUser(server, { firstName: "ארין" });
    assert.equal((await book(server, erin, { date, time: "15:00" })).status, 201);
    await assert.rejects(
      db.query(
        `INSERT INTO appointments (client_name, phone, service_id, date, time, status, duration_min, starts_at, ends_at)
         VALUES ('x', '0500000000', 1, $1, '15:30', 'confirmed', 60,
                 ($1 || ' 15:30')::timestamp AT TIME ZONE 'Asia/Jerusalem',
                 ($1 || ' 16:30')::timestamp AT TIME ZONE 'Asia/Jerusalem')`,
        [date]
      ),
      (err) => err.code === "23P01"
    );
    // A rejected or cancelled row never blocks anything.
    await db.query(
      `INSERT INTO appointments (client_name, phone, service_id, date, time, status, duration_min, starts_at, ends_at)
       VALUES ('x', '0500000000', 1, $1, '15:00', 'rejected', 60,
               ($1 || ' 15:00')::timestamp AT TIME ZONE 'Asia/Jerusalem',
               ($1 || ' 16:00')::timestamp AT TIME ZONE 'Asia/Jerusalem')`,
      [date]
    );
  });

  it("stores exact Israel-time instants across the daylight-saving change", async () => {
    const now = new Date("2026-10-01T06:00:00Z");
    const dave = await createUser(server, { firstName: "דבי" });
    const summer = await createAppointmentRequest(
      { clientName: "דבי", phone: "0501112233", serviceId: SERVICE_60, date: "2026-10-20", time: "10:00" },
      { userId: dave.id, now }
    );
    const winter = await createAppointmentRequest(
      { clientName: "דבי", phone: "0501112233", serviceId: SERVICE_60, date: "2026-10-27", time: "10:00" },
      { userId: dave.id, now }
    );
    const rows = await db.query(
      `SELECT id, starts_at, ends_at FROM appointments WHERE id = ANY($1::int[]) ORDER BY id`,
      [[summer.appointment.id, winter.appointment.id]]
    );
    assert.equal(new Date(rows.rows[0].starts_at).toISOString(), "2026-10-20T07:00:00.000Z");
    assert.equal(new Date(rows.rows[1].starts_at).toISOString(), "2026-10-27T08:00:00.000Z");
    assert.equal(new Date(rows.rows[1].ends_at).toISOString(), "2026-10-27T09:00:00.000Z");

    const availability = await getAvailability("2026-10-27", SERVICE_60, { now });
    assert.equal(availability.times.find((t) => t.time === "10:00").state, "pending");
  });
});

describe("migration 007 on legacy bookings", () => {
  it("keeps every row, normalises statuses, backfills times and tolerates old overlaps", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite();
    try {
      for (const m of migrations.filter((x) => x.id < "007")) await pg.exec(m.sql);
      await pg.exec(`
        INSERT INTO appointments (client_name, phone, service_id, date, time, status) VALUES
          ('legacy ok', '0501', 1, '2026-12-01', '10:00', 'confirmed'),
          ('legacy overlap', '0502', 1, '2026-12-01', '10:30', 'confirmed'),
          ('legacy cancelled', '0503', 1, '2026-12-01', '10:00', 'cancelled'),
          ('legacy odd status', '0504', 1, '2026-12-02', '10:00', ' Confirmed '),
          ('legacy junk status', '0505', 1, '2026-12-03', '10:00', 'whatever'),
          ('legacy bad date', '0506', 1, '2026-02-30', '10:00', 'confirmed'),
          ('legacy text date', '0507', 1, 'next week', 'soon', 'confirmed');
      `);
      const before = (await pg.query(`SELECT count(*)::int AS n FROM appointments`)).rows[0].n;
      await pg.exec(migrations.find((x) => x.id === "007_appointment_requests").sql);

      const rows = (await pg.query(`SELECT client_name, status, starts_at, ends_at, overlap_exempt FROM appointments ORDER BY id`)).rows;
      assert.equal(rows.length, before, "no booking is deleted");
      const by = Object.fromEntries(rows.map((r) => [r.client_name, r]));
      assert.equal(by["legacy ok"].status, "confirmed");
      assert.equal(new Date(by["legacy ok"].starts_at).toISOString(), "2026-12-01T08:00:00.000Z");
      assert.equal(new Date(by["legacy ok"].ends_at).toISOString(), "2026-12-01T09:00:00.000Z");
      assert.equal(by["legacy overlap"].overlap_exempt, true);
      assert.equal(by["legacy ok"].overlap_exempt, false);
      assert.equal(by["legacy cancelled"].status, "cancelled");
      assert.equal(by["legacy odd status"].status, "confirmed");
      assert.equal(by["legacy junk status"].status, "confirmed");
      assert.equal(by["legacy bad date"].starts_at, null);
      assert.equal(by["legacy text date"].starts_at, null);

      const fresh = await pg.query(`INSERT INTO appointments (client_name, phone, service_id, date, time) VALUES ('new', '0508', 1, '2026-12-05', '10:00') RETURNING status`);
      assert.equal(fresh.rows[0].status, "pending");
      await assert.rejects(pg.query(`UPDATE appointments SET status = 'maybe' WHERE client_name = 'new'`));
    } finally {
      await pg.close();
    }
  });
});
