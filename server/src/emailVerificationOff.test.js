/**
 * EMAIL_VERIFICATION=off: the app works with no email provider — sign-up, sign-in and booking — and turning
 * the switch off again restores the normal verified-email requirement.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "./app.js";
import db, { closeDb, startDb } from "./db.js";
import { cookieFrom, request, uniqueEmail } from "./testSupport.js";

const PASSWORD = "no-mail-pass-1";

function nextMondayAtLeast(daysAhead) {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe("sign-up and booking without email (EMAIL_VERIFICATION=off)", () => {
  let server;

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "";
    process.env.PGLITE_DIR = "memory://";
    process.env.EMAIL_PROVIDER = "off";
    process.env.EMAIL_VERIFICATION = "off";
    await startDb();
    server = http.createServer(createApp());
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
  });

  after(async () => {
    delete process.env.EMAIL_VERIFICATION;
    await new Promise((r) => server.close(r));
    await closeDb();
  });

  it("creates an active account, signs in, and books — with no email provider", async () => {
    const email = uniqueEmail("nomail");
    const reg = await request(server, {
      method: "POST",
      path: "/api/auth/register",
      body: { firstName: "מאיה", lastName: "בלי־מייל", email, password: PASSWORD },
    });
    assert.equal(reg.status, 201, reg.raw);
    assert.equal(reg.json.user.emailVerified, false);
    const cookie = cookieFrom(reg.setCookie);
    assert.ok(cookie, "signed in by a session cookie");

    const stored = await db.query(`SELECT account_status, email_verified, password_hash FROM users WHERE email_normalized = $1`, [email]);
    assert.equal(stored.rows[0].account_status, "active");
    assert.equal(stored.rows[0].email_verified, false);
    assert.match(stored.rows[0].password_hash, /^\$2[aby]\$/, "password stored only as a bcrypt hash");

    const me = await request(server, { path: "/api/auth/me", cookies: [cookie] });
    assert.equal(me.json.emailVerificationRequired, false);

    const login = await request(server, { method: "POST", path: "/api/auth/login", body: { email, password: PASSWORD } });
    assert.equal(login.status, 200);

    const booked = await request(server, {
      method: "POST",
      path: "/api/appointments",
      cookies: [cookie],
      body: { clientName: "מאיה", serviceId: 1, date: nextMondayAtLeast(10), time: "13:00", requestKey: `nomail-${Date.now()}` },
    });
    assert.equal(booked.status, 201, booked.raw);
    assert.equal(booked.json.appointment.status, "pending");
    const row = await db.query(`SELECT email FROM appointments WHERE id = $1`, [booked.json.appointment.id]);
    assert.equal(row.rows[0].email, null, "an unverified address is never copied onto the booking");
  });

  it("refuses a second account for the same email", async () => {
    const email = uniqueEmail("twice");
    const body = { firstName: "רון", lastName: "כפול", email, password: PASSWORD };
    assert.equal((await request(server, { method: "POST", path: "/api/auth/register", body })).status, 201);
    const again = await request(server, { method: "POST", path: "/api/auth/register", body });
    assert.equal(again.status, 409);
    assert.equal(again.json.error.code ?? again.json.code, "EMAIL_TAKEN");
  });

  it("without the switch, sign-up says email is unavailable instead of pretending", async () => {
    delete process.env.EMAIL_VERIFICATION;
    const res = await request(server, {
      method: "POST",
      path: "/api/auth/register",
      body: { firstName: "טל", lastName: "בדיקה", email: uniqueEmail("blocked"), password: PASSWORD },
    });
    assert.equal(res.status, 503);
    process.env.EMAIL_VERIFICATION = "off";
  });
});
