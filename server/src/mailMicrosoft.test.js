/**
 * Outlook sending through Microsoft Graph: owner-only OAuth connection, encrypted refresh token, MIME (Hebrew +
 * plain text), token refresh/rotation, and the owner's test email. Microsoft is replaced by a fake; no network.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { createApp } from "./app.js";
import db, { closeDb, startDb } from "./db.js";
import { sendEmail, settleEmailJobs } from "./email/mailer.js";
import {
  buildMimeMessage,
  encodeHeaderWord,
  openSecret,
  resetMicrosoftStateForTests,
  sealSecret,
  setMicrosoftHttpForTests,
} from "./email/microsoft.js";
import { registerVerified, request, uniqueEmail, DEFAULT_PASSWORD } from "./testSupport.js";

const CLIENT_ID = "11111111-2222-4333-8444-555555555555";
const CLIENT_SECRET = "fake-client-secret-value-for-tests";
const FROM = "madebykseniya@outlook.com";
const TEST_SUBJECT = "בדיקת מערכת המיילים של MadeByKseniya";

/** A fake Microsoft identity platform + Graph that records every call. */
function createFakeMicrosoft() {
  const fake = {
    calls: [],
    sent: [],
    tokenCount: 0,
    meAddress: FROM,
    displayName: "MadeByKseniya",
    grantedScope: "openid profile email https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read",
    refreshError: null,
    sendStatuses: [],
    issuedAccess: new Set(),
    currentRefresh: null,
  };
  const json = (status, data, headers = {}) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
  const issue = () => {
    fake.tokenCount += 1;
    const access = `fake-access-token-${fake.tokenCount}`;
    fake.currentRefresh = `fake-refresh-token-${fake.tokenCount}`;
    fake.issuedAccess.add(access);
    return { token_type: "Bearer", access_token: access, refresh_token: fake.currentRefresh, scope: fake.grantedScope, expires_in: 3600 };
  };
  fake.fetch = async (url, init = {}) => {
    const u = new URL(url);
    fake.calls.push({ url: u, init });
    if (u.hostname === "login.microsoftonline.com" && u.pathname === "/consumers/oauth2/v2.0/token") {
      const body = new URLSearchParams(init.body);
      if (body.get("client_id") !== CLIENT_ID || body.get("client_secret") !== CLIENT_SECRET) {
        return json(401, { error: "invalid_client" });
      }
      if (body.get("grant_type") === "authorization_code") {
        if (body.get("code") !== "good-code") return json(400, { error: "invalid_grant" });
        fake.lastVerifier = body.get("code_verifier");
        fake.lastRedirect = body.get("redirect_uri");
        return json(200, issue());
      }
      if (body.get("grant_type") === "refresh_token") {
        if (fake.refreshError) return json(400, { error: fake.refreshError });
        if (body.get("refresh_token") !== fake.currentRefresh) return json(400, { error: "invalid_grant" });
        return json(200, issue());
      }
      return json(400, { error: "unsupported_grant_type" });
    }
    if (u.hostname === "graph.microsoft.com") {
      const token = String(init.headers?.Authorization || "").replace(/^Bearer /, "");
      if (!fake.issuedAccess.has(token)) return json(401, { error: { code: "InvalidAuthenticationToken" } });
      if (u.pathname === "/v1.0/me") return json(200, { displayName: fake.displayName, mail: fake.meAddress, userPrincipalName: fake.meAddress });
      if (u.pathname === "/v1.0/me/sendMail" && init.method === "POST") {
        const status = fake.sendStatuses.shift() ?? 202;
        if (status === 401) {
          fake.issuedAccess.delete(token);
          return json(401, { error: { code: "InvalidAuthenticationToken" } });
        }
        if (status !== 202) return json(status, { error: { code: status === 400 ? "ErrorMimeContentInvalid" : "ErrorAccessDenied" } });
        fake.sent.push({ contentType: init.headers["Content-Type"], body: init.body });
        return new Response(null, { status: 202, headers: { "request-id": crypto.randomUUID() } });
      }
    }
    return json(404, { error: { code: "NotFound" } });
  };
  return fake;
}

function parseMime(base64Body) {
  const mime = Buffer.from(base64Body, "base64").toString("utf8");
  const [head] = mime.split("\r\n\r\n");
  const boundary = /boundary="([^"]+)"/.exec(head)[1];
  const parts = {};
  for (const chunk of mime.split(`--${boundary}`).slice(1, -1)) {
    const [partHead, ...rest] = chunk.trim().split("\r\n\r\n");
    const type = /Content-Type: ([\w/]+)/.exec(partHead)[1];
    parts[type] = Buffer.from(rest.join("").replace(/\s+/g, ""), "base64").toString("utf8");
  }
  const header = (name) => new RegExp(`^${name}: (.*(?:\\r\\n .*)*)`, "m").exec(head)?.[1] || "";
  return { mime, head, header, parts };
}

const decodeWords = (value) =>
  value
    .split(/\r\n /)
    .map((w) => w.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, b64) => Buffer.from(b64, "base64").toString("utf8")))
    .join("");

const cookieNamed = (setCookie, name) => (setCookie || []).find((c) => c.startsWith(`${name}=`));

describe("Outlook sending through Microsoft Graph (PostgreSQL)", () => {
  let server;
  let owner;
  let customer;
  let fake;
  const logs = [];
  const original = { log: console.log, error: console.error, warn: console.warn };

  async function connect(code = "good-code") {
    const start = await request(server, { path: "/api/owner/mail/microsoft/connect", cookies: [owner.cookie] });
    assert.equal(start.status, 302, start.raw);
    const location = new URL(start.headers.location);
    const stateCookie = cookieNamed(start.setCookie, "mbk_ms_oauth").split(";")[0];
    const callback = await request(server, {
      path: `/api/mail/microsoft/callback?code=${encodeURIComponent(code)}&state=${location.searchParams.get("state")}`,
      cookies: [owner.cookie, stateCookie],
    });
    return { start, location, stateCookie, callback };
  }

  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "";
    process.env.PGLITE_DIR = "memory://";
    process.env.EMAIL_PROVIDER = "memory";
    process.env.APP_PUBLIC_URL = "https://made-by-kseniya.example";
    delete process.env.MAIL_PROVIDER;
    await startDb();
    server = http.createServer(createApp());
    await new Promise((r) => server.listen(0, "127.0.0.1", r));

    owner = await registerVerified(server, { firstName: "Ben", lastName: "Example" });
    await db.query(`UPDATE users SET role = 'owner' WHERE id = $1`, [owner.id]);
    customer = await registerVerified(server);

    fake = createFakeMicrosoft();
    setMicrosoftHttpForTests(fake.fetch);
    resetMicrosoftStateForTests();
    process.env.MAIL_PROVIDER = "microsoft";
    process.env.MAIL_FROM_ADDRESS = FROM;
    process.env.MAIL_FROM_NAME = "MadeByKseniya";
    process.env.MICROSOFT_CLIENT_ID = CLIENT_ID;
    process.env.MICROSOFT_CLIENT_SECRET = CLIENT_SECRET;
    process.env.MICROSOFT_TENANT_ID = "consumers";
    for (const level of Object.keys(original)) {
      console[level] = (...args) => logs.push(args.join(" "));
    }
  });

  after(async () => {
    Object.assign(console, original);
    await settleEmailJobs();
    setMicrosoftHttpForTests(null);
    await new Promise((r) => server.close(r));
    await closeDb();
  });

  it("encodes Hebrew headers on whole characters and builds text + HTML parts", () => {
    const subject = "בדיקת מערכת המיילים של MadeByKseniya — ארוך מספיק כדי להתפצל לכמה מילים מקודדות";
    const encoded = encodeHeaderWord(subject);
    assert.ok(encoded.split("\r\n ").length > 1, "long subjects are folded");
    for (const word of encoded.split("\r\n ")) assert.ok(word.length <= 75, "each encoded word fits RFC 2047");
    assert.equal(decodeWords(encoded), subject);
    assert.equal(encodeHeaderWord("Plain ASCII"), "Plain ASCII");

    const raw = buildMimeMessage({
      fromName: "MadeByKseniya",
      fromAddress: FROM,
      to: "someone@example.com",
      subject: "שלום",
      html: "<p dir=\"rtl\">שלום עולם</p>",
      text: "שלום עולם",
    });
    const { header, parts } = parseMime(Buffer.from(raw).toString("base64"));
    assert.equal(header("From"), `MadeByKseniya <${FROM}>`);
    assert.equal(header("To"), "<someone@example.com>");
    assert.equal(decodeWords(header("Subject")), "שלום");
    assert.equal(parts["text/plain"], "שלום עולם");
    assert.equal(parts["text/html"], "<p dir=\"rtl\">שלום עולם</p>");
  });

  it("sealed secrets round-trip and reject tampering", () => {
    const sealed = sealSecret("value-123", "refresh-token");
    assert.match(sealed, /^v1\./);
    assert.ok(!sealed.includes("value-123"));
    assert.equal(openSecret(sealed, "refresh-token"), "value-123");
    assert.equal(openSecret(sealed, "oauth-state"), null, "bound to its purpose");
    const flipped = sealed.slice(0, -2) + (sealed.at(-2) === "A" ? "B" : "A") + sealed.at(-1);
    assert.equal(openSecret(flipped, "refresh-token"), null);
  });

  it("health only says which provider and whether it's configured", async () => {
    const health = await request(server, { path: "/api/health" });
    assert.deepEqual(health.json, { ok: true, database: "connected", ownerAssigned: true, mailProvider: "microsoft", configured: true });
    for (const secret of [CLIENT_SECRET, CLIENT_ID, FROM]) assert.ok(!health.raw.includes(secret));
  });

  it("before the mailbox is connected nothing is sent and nothing falls back to another provider", async () => {
    const to = uniqueEmail("unconnected");
    const result = await sendEmail({ type: "test", to, subject: "s", html: "<p>h</p>", text: "t" });
    assert.deepEqual(result, { ok: false, reason: "not_configured" });
    assert.equal(fake.sent.length, 0);
  });

  it("only the owner can manage the mailbox", async () => {
    assert.equal((await request(server, { path: "/api/owner/mail/status" })).status, 401);
    assert.equal((await request(server, { path: "/api/owner/mail/status", cookies: [customer.cookie] })).status, 403);
    assert.equal((await request(server, { path: "/api/owner/mail/microsoft/connect", cookies: [customer.cookie] })).status, 403);
    assert.equal((await request(server, { method: "POST", path: "/api/owner/mail/test", cookies: [customer.cookie] })).status, 403);
    assert.equal((await request(server, { method: "POST", path: "/api/owner/mail/test" })).status, 401);
    assert.equal((await request(server, { method: "POST", path: "/api/owner/mail/microsoft/disconnect", cookies: [customer.cookie] })).status, 403);

    const callback = await request(server, { path: "/api/mail/microsoft/callback?code=good-code&state=x", cookies: [customer.cookie] });
    assert.equal(callback.status, 303);
    assert.match(callback.headers.location, /\/profile\?mail=signin_required$/);
  });

  it("the connect link asks Microsoft for Mail.Send + offline access with PKCE and a state cookie", async () => {
    const start = await request(server, { path: "/api/owner/mail/microsoft/connect", cookies: [owner.cookie] });
    assert.equal(start.status, 302);
    const url = new URL(start.headers.location);
    assert.equal(url.origin + url.pathname, "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize");
    const q = url.searchParams;
    assert.equal(q.get("client_id"), CLIENT_ID);
    assert.equal(q.get("response_type"), "code");
    assert.equal(q.get("redirect_uri"), "https://made-by-kseniya.example/api/mail/microsoft/callback");
    assert.deepEqual(q.get("scope").split(" ").sort(), ["Mail.Send", "User.Read", "offline_access"]);
    assert.equal(q.get("code_challenge_method"), "S256");
    assert.ok(q.get("state").length >= 32);
    assert.ok(!url.toString().includes(CLIENT_SECRET));
    const cookie = cookieNamed(start.setCookie, "mbk_ms_oauth");
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Path=\/api\/mail\/microsoft/);
    assert.match(cookie, /SameSite=Lax/i);
  });

  it("a forged or missing state is refused", async () => {
    const start = await request(server, { path: "/api/owner/mail/microsoft/connect", cookies: [owner.cookie] });
    const stateCookie = cookieNamed(start.setCookie, "mbk_ms_oauth").split(";")[0];
    const forged = await request(server, { path: "/api/mail/microsoft/callback?code=good-code&state=forged", cookies: [owner.cookie, stateCookie] });
    assert.match(forged.headers.location, /mail=expired$/);
    const state = new URL(start.headers.location).searchParams.get("state");
    const noCookie = await request(server, { path: `/api/mail/microsoft/callback?code=good-code&state=${state}`, cookies: [owner.cookie] });
    assert.match(noCookie.headers.location, /mail=expired$/);
    const denied = await request(server, { path: "/api/mail/microsoft/callback?error=access_denied&state=x", cookies: [owner.cookie] });
    assert.match(denied.headers.location, /mail=denied$/);
    const { rows } = await db.query(`SELECT 1 FROM mail_connections`);
    assert.equal(rows.length, 0);
  });

  it("signing in with a different Microsoft account doesn't connect it", async () => {
    fake.meAddress = "someone.else@outlook.com";
    try {
      const { callback } = await connect();
      assert.match(callback.headers.location, /mail=wrong_account$/);
      const { rows } = await db.query(`SELECT 1 FROM mail_connections`);
      assert.equal(rows.length, 0);
    } finally {
      fake.meAddress = FROM;
    }
  });

  it("connecting stores only an encrypted refresh token and proves PKCE", async () => {
    const { location, callback } = await connect();
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.location, "https://made-by-kseniya.example/profile?mail=connected");
    assert.match(cookieNamed(callback.setCookie, "mbk_ms_oauth"), /Expires=Thu, 01 Jan 1970/, "the state cookie is cleared");

    const challenge = crypto.createHash("sha256").update(fake.lastVerifier).digest("base64url");
    assert.equal(challenge, location.searchParams.get("code_challenge"));
    assert.equal(fake.lastRedirect, "https://made-by-kseniya.example/api/mail/microsoft/callback");

    const { rows } = await db.query(`SELECT * FROM mail_connections`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].account_address, FROM);
    assert.equal(rows[0].display_name, "MadeByKseniya");
    assert.match(rows[0].refresh_token_enc, /^v1\./);
    assert.ok(!JSON.stringify(rows[0]).includes("fake-refresh-token"), "no plain refresh token in the database");
    assert.ok(!JSON.stringify(rows[0]).includes("fake-access-token"), "access tokens are never stored");
    assert.equal(openSecret(rows[0].refresh_token_enc, "refresh-token"), fake.currentRefresh);
  });

  it("the owner's status shows the connection without secrets", async () => {
    const status = await request(server, { path: "/api/owner/mail/status", cookies: [owner.cookie] });
    assert.equal(status.status, 200);
    assert.equal(status.json.mailProvider, "microsoft");
    assert.equal(status.json.ready, true);
    assert.equal(status.json.sender, `MadeByKseniya <${FROM}>`);
    assert.equal(status.json.microsoft.connected, true);
    assert.equal(status.json.microsoft.account, FROM);
    assert.equal(status.json.microsoft.displayName, "MadeByKseniya");
    assert.ok(!/token|secret/i.test(Object.keys(status.json.microsoft).join(",")));
    for (const secret of [CLIENT_SECRET, "fake-refresh-token", "fake-access-token"]) assert.ok(!status.raw.includes(secret));
  });

  it("the test email goes only to the owner's saved address, from MadeByKseniya, in Hebrew with a text version", async () => {
    const before = fake.sent.length;
    const res = await request(server, {
      method: "POST",
      path: "/api/owner/mail/test",
      cookies: [owner.cookie],
      body: { to: "attacker@evil.example", email: "attacker@evil.example" },
    });
    assert.equal(res.status, 200, res.raw);
    assert.equal(res.json.provider, "microsoft");
    assert.equal(res.json.sender, `MadeByKseniya <${FROM}>`);
    assert.match(res.json.sentTo, /^c\*\*\*@example\.com$/);
    assert.ok(!res.raw.includes(owner.email), "the full address isn't returned");
    assert.ok(res.json.providerMessageId);

    assert.equal(fake.sent.length, before + 1, "exactly one message");
    const sent = fake.sent.at(-1);
    assert.equal(sent.contentType, "text/plain", "sent as MIME");
    const { header, parts } = parseMime(sent.body);
    assert.equal(header("From"), `MadeByKseniya <${FROM}>`);
    assert.equal(header("To"), `<${owner.email}>`);
    assert.equal(decodeWords(header("Subject")), TEST_SUBJECT);
    assert.ok(
      parts["text/plain"].startsWith(
        "היי Ben,\n\nזהו מייל בדיקה ממערכת MadeByKseniya.\n\nאם המייל הזה הגיע אליך, החיבור בין האתר, Railway ו־Outlook עובד בהצלחה."
      ),
      parts["text/plain"]
    );
    assert.match(parts["text/html"], /dir="rtl"/);
    assert.match(parts["text/html"], /Secular One/);
    assert.ok(parts["text/html"].includes("זהו מייל בדיקה ממערכת MadeByKseniya."));
    assert.ok(!parts["text/html"].includes("attacker"));

    const { rows } = await db.query(
      `SELECT provider, status, provider_message_id FROM email_deliveries WHERE type = 'mail_test' ORDER BY id DESC LIMIT 1`
    );
    assert.deepEqual(rows[0], { provider: "microsoft", status: "sent", provider_message_id: res.json.providerMessageId });
  });

  it("sign-up emails go out through Outlook too", async () => {
    const email = uniqueEmail("graph");
    const reg = await request(server, {
      method: "POST",
      path: "/api/auth/register",
      body: {
        username: `g_${Date.now().toString(36)}`,
        email,
        password: DEFAULT_PASSWORD,
        confirmPassword: DEFAULT_PASSWORD,
        firstName: "מאיה",
        lastName: "לוי",
      },
    });
    assert.equal(reg.status, 202, reg.raw);
    await settleEmailJobs();
    const message = fake.sent.map((s) => parseMime(s.body)).find((m) => m.header("To") === `<${email}>`);
    assert.ok(message, "verification email sent through Graph");
    assert.equal(decodeWords(message.header("Subject")), "קוד האימות שלך ל־MadeByKseniya");
    assert.match(message.parts["text/plain"], /\b\d{6}\b/);
  });

  it("an expired access token is refreshed once and the rotated refresh token is saved", async () => {
    const tokensBefore = fake.tokenCount;
    fake.sendStatuses.push(401);
    const result = await sendEmail({ type: "test", to: uniqueEmail("refresh"), subject: "s", html: "<p>h</p>", text: "t" });
    assert.equal(result.ok, true);
    assert.equal(fake.tokenCount, tokensBefore + 1);
    const { rows } = await db.query(`SELECT refresh_token_enc FROM mail_connections`);
    assert.equal(openSecret(rows[0].refresh_token_enc, "refresh-token"), fake.currentRefresh);
  });

  it("a rejected MIME message is resent once as HTML", async () => {
    const before = fake.sent.length;
    fake.sendStatuses.push(400);
    const result = await sendEmail({ type: "test", to: uniqueEmail("fallback"), subject: "שלום", html: "<p>שלום</p>", text: "שלום" });
    assert.equal(result.ok, true);
    assert.equal(fake.sent.length, before + 1);
    const payload = JSON.parse(fake.sent.at(-1).body);
    assert.equal(fake.sent.at(-1).contentType, "application/json");
    assert.equal(payload.message.body.contentType, "HTML");
    assert.equal(payload.saveToSentItems, true);
  });

  it("a Microsoft refusal is recorded with its code and never reported as sent", async () => {
    fake.sendStatuses.push(403);
    const to = uniqueEmail("denied");
    const result = await sendEmail({ type: "test", to, subject: "s", html: "<p>h</p>", text: "t" });
    assert.deepEqual(result, { ok: false, reason: "send_failed" });
    const { rows } = await db.query(`SELECT status, error_code FROM email_deliveries WHERE recipient_email = $1`, [to]);
    assert.deepEqual(rows, [{ status: "failed", error_code: "microsoft_mail_send_denied" }]);
  });

  it("a revoked refresh token asks the owner to reconnect, then reconnecting restores sending", async () => {
    fake.refreshError = "invalid_grant";
    fake.sendStatuses.push(401);
    const to = uniqueEmail("revoked");
    const result = await sendEmail({ type: "test", to, subject: "s", html: "<p>h</p>", text: "t" });
    assert.equal(result.ok, false);
    const { rows } = await db.query(`SELECT needs_reconnect, last_error FROM mail_connections`);
    assert.deepEqual(rows[0], { needs_reconnect: true, last_error: "invalid_grant" });

    const status = await request(server, { path: "/api/owner/mail/status", cookies: [owner.cookie] });
    assert.equal(status.json.microsoft.needsReconnect, true);
    assert.equal(status.json.ready, false);
    const later = await sendEmail({ type: "test", to: uniqueEmail("later"), subject: "s", html: "<p>h</p>", text: "t" });
    assert.deepEqual(later, { ok: false, reason: "not_configured" });

    fake.refreshError = null;
    const { callback } = await connect();
    assert.match(callback.headers.location, /mail=connected$/);
    const again = await sendEmail({ type: "test", to: uniqueEmail("again"), subject: "s", html: "<p>h</p>", text: "t" });
    assert.equal(again.ok, true);
  });

  it("the test email is rate limited", async () => {
    let limited = null;
    for (let i = 0; i < 4 && !limited; i += 1) {
      const res = await request(server, { method: "POST", path: "/api/owner/mail/test", cookies: [owner.cookie] });
      if (res.status === 429) limited = res;
    }
    assert.ok(limited, "a 429 within the hourly limit");
  });

  it("disconnecting removes the stored token", async () => {
    const res = await request(server, { method: "POST", path: "/api/owner/mail/microsoft/disconnect", cookies: [owner.cookie] });
    assert.equal(res.status, 200);
    const { rows } = await db.query(`SELECT 1 FROM mail_connections`);
    assert.equal(rows.length, 0);
  });

  it("no token, secret, code or full address reaches the logs", async () => {
    await settleEmailJobs();
    const text = logs.join("\n");
    assert.ok(!text.includes(CLIENT_SECRET));
    assert.ok(!/fake-(refresh|access)-token/.test(text));
    assert.ok(!text.includes("good-code"));
    assert.ok(!text.includes(FROM), "the sender address is masked");
    assert.ok(!/[\w.]+@example\.com/.test(text.replace(/\w\*\*\*@example\.com/g, "")), "recipients are masked");
  });
});
