import assert from "node:assert/strict";
import { API_PORT } from "./stack.mjs";

const API = `http://127.0.0.1:${API_PORT}`;
export const PASSWORD = "e2e-pass-123";

let counter = 0;
export function uniqueEmail(prefix) {
  counter += 1;
  return `${prefix}.${Date.now().toString(36)}.${counter}@example.com`;
}

/** The latest 6-digit code emailed to `email` (in-memory outbox of the e2e API). */
export async function latestCode(email) {
  for (let i = 0; i < 30; i += 1) {
    const messages = await (await fetch(`${API}/__e2e/outbox?to=${encodeURIComponent(email)}`)).json();
    const match = messages
      .map((m) => /\b(\d{6})\b/.exec(m.text))
      .filter(Boolean)
      .at(-1);
    if (match) return match[1];
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`no code emailed to ${email}`);
}

/** Sign-up + email code through the API; `api` (a page's request or a standalone context) ends up signed in. */
export async function createAccount(api, { firstName, lastName = "בדיקה", email }) {
  const reg = await api.post("/api/auth/register", { data: { firstName, lastName, email, password: PASSWORD } });
  assert.equal(reg.status(), 202);
  const code = await latestCode(email);
  const verified = await api.post("/api/auth/verify-email", { data: { email, code, rememberMe: true } });
  assert.equal(verified.status(), 200);
  return (await verified.json()).user;
}

export async function makeOwner(userId) {
  const res = await fetch(`${API}/__e2e/owner/${userId}`, { method: "POST" });
  assert.ok(res.ok);
}

export async function login(api, email) {
  const res = await api.post("/api/auth/login", { data: { email, password: PASSWORD, rememberMe: true } });
  assert.equal(res.status(), 200);
}

/** A date a few days ahead (Israel), "YYYY-MM-DD". */
export function daysAhead(n) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(Date.now() + n * 86_400_000));
}

/**
 * Feeds a synthetic photo with known geometry into the capture step's gallery input:
 * a 23 mm coin drawn 270 px wide and a nail 150 px wide → 12.8 mm when marked exactly.
 */
export async function uploadSyntheticHandPhoto(page) {
  await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 900;
    c.height = 1200;
    const x = c.getContext("2d");
    x.fillStyle = "#d9d2c8";
    x.fillRect(0, 0, 900, 1200);
    x.fillStyle = "#9a958c";
    x.beginPath();
    x.arc(450, 324, 135, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#e0a98f";
    x.fillRect(360, 560, 180, 600);
    x.fillStyle = "#f3c6cf";
    x.fillRect(375, 600, 150, 140);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.92));
    const input = document.querySelector('input[type="file"]');
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "hand.jpg", { type: "image/jpeg" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
