/** Shared helpers for the API test files (not a test file itself). */
import http from "node:http";
import assert from "node:assert/strict";
import { SESSION_COOKIE } from "./auth.js";
import { emailTestOutbox, settleEmailJobs } from "./email/mailer.js";

export function request(server, { method = "GET", path = "/", body, cookies = [], headers = {} }) {
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
          resolve({ status: res.statusCode, headers: res.headers, setCookie: res.headers["set-cookie"] || [], json, raw, buffer });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export function cookieFrom(setCookie) {
  const line = (setCookie || []).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return line ? line.split(";")[0] : null;
}

let emailCounter = 0;
export function uniqueEmail(prefix = "user") {
  emailCounter += 1;
  return `${prefix}.${Date.now().toString(36)}.${emailCounter}@example.com`;
}

/** Messages the in-memory provider "sent" to an address (after background jobs finish). */
export async function emailsTo(address) {
  await settleEmailJobs();
  return emailTestOutbox.filter((m) => m.to === String(address).toLowerCase());
}

/** The 6-digit code from the latest email to this address with the given subject. */
export async function latestCode(address, subject = "קוד האימות שלך ל־MadeByKseniya") {
  const messages = (await emailsTo(address)).filter((m) => m.subject === subject);
  const last = messages.at(-1);
  assert.ok(last, `expected an email "${subject}" to ${address}`);
  const match = /\b(\d{6})\b/.exec(last.text);
  assert.ok(match, "the email contains a 6-digit code");
  return match[1];
}

export const DEFAULT_PASSWORD = "strong-pass-1";

/** Sign-up + email code, as a real customer would do it. Returns { id, username, email, cookie, user }. */
export async function registerVerified(server, overrides = {}) {
  emailCounter += 1;
  const body = {
    username: `u_${Date.now().toString(36)}_${emailCounter}`,
    email: uniqueEmail("customer"),
    password: DEFAULT_PASSWORD,
    confirmPassword: overrides.password || DEFAULT_PASSWORD,
    firstName: "קסניה",
    lastName: "כהן",
    ...overrides,
  };
  const reg = await request(server, { method: "POST", path: "/api/auth/register", body });
  assert.equal(reg.status, 202, reg.raw);
  const email = reg.json.email;
  const code = await latestCode(email);
  const verified = await request(server, {
    method: "POST",
    path: "/api/auth/verify-email",
    body: { email, code, rememberMe: Boolean(overrides.rememberMe) },
  });
  assert.equal(verified.status, 200, verified.raw);
  return {
    id: verified.json.user.id,
    username: verified.json.user.username,
    email,
    cookie: cookieFrom(verified.setCookie),
    user: verified.json.user,
    res: verified,
  };
}

export async function loginByEmail(server, email, password = DEFAULT_PASSWORD, extra = {}) {
  const res = await request(server, { method: "POST", path: "/api/auth/login", body: { email, password, ...extra } });
  return { res, cookie: cookieFrom(res.setCookie) };
}
