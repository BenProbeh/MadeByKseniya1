/**
 * Design audit screenshots: the same screens, same phone size, in two builds of the client, both talking to the
 * isolated in-memory API (server/scripts/e2e-server.mjs on port 4000). Never touches real data.
 *
 *   node scripts/capture-design-audit.mjs <label>=<baseUrl> [<label>=<baseUrl> ...]
 *   e.g. cursor-era=http://localhost:5190 current=http://localhost:5191
 * Output: docs/design-audit/<label>/<screen>.png
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const outRoot = path.resolve(here, "../../docs/design-audit");
const API = process.env.AUDIT_API || "http://127.0.0.1:4000";
const targets = process.argv.slice(2).map((a) => a.split("="));
const SCREENS = [
  ["01-login", "/login", false],
  ["02-register", "/register", false],
  ["03-landing", "/", true],
  ["04-services", "/services", true],
  ["05-package", "/services/bad-bitch", true],
  ["06-booking", "/booking", true],
  ["07-nail-sizing", "/nail-sizing", true],
  ["08-profile", "/profile", true],
  ["09-admin-customers", "/admin/customers", true],
  ["10-admin-appointments", "/admin/appointments", true],
];

async function code(email) {
  for (let i = 0; i < 30; i += 1) {
    const list = await (await fetch(`${API}/__e2e/outbox?to=${encodeURIComponent(email)}`)).json();
    const m = list.map((x) => /\b(\d{6})\b/.exec(x.text)).filter(Boolean).at(-1);
    if (m) return m[1];
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("no code");
}

// Safety: only ever run against the isolated test API (its mail mode is "memory"; dev and production never are).
for (const [, base] of targets) {
  const h = await (await fetch(`${base}/api/health`)).json().catch(() => ({}));
  if (h.mailProvider !== "memory") {
    console.error(`Refusing to run: ${base} is not backed by the isolated test API (mailProvider=${h.mailProvider}).`);
    process.exit(2);
  }
}

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || "chrome" });
let ownerMade = false;
for (const [label, base] of targets) {
  const dir = path.join(outRoot, label);
  fs.mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ ...devices["Pixel 7"], viewport: { width: 393, height: 852 }, baseURL: base, locale: "he-IL" });
  const page = await context.newPage();
  for (const [name, route, signedIn] of SCREENS.filter((s) => !s[2])) {
    await page.goto(route);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(dir, `${name}.png`) });
  }
  const email = `audit.${label}.${Date.now().toString(36)}@example.com`;
  await page.request.post("/api/auth/register", {
    data: { firstName: "קסניה", lastName: "בדיקה", username: `audit_${label.replace(/\W/g, "")}_${Date.now().toString(36)}`, email, password: "audit-pass-123", confirmPassword: "audit-pass-123" },
  });
  const verified = await page.request.post("/api/auth/verify-email", { data: { email, code: await code(email), rememberMe: true } });
  const user = (await verified.json()).user;
  if (!ownerMade) {
    await fetch(`${API}/__e2e/owner/${user.id}`, { method: "POST" });
    ownerMade = true;
  } else {
    // Only one owner can exist; later builds sign in as the first audit owner instead.
    await page.request.post("/api/auth/login", { data: { email: process.env.AUDIT_OWNER_EMAIL || email, password: "audit-pass-123" } });
  }
  process.env.AUDIT_OWNER_EMAIL ??= email;
  for (const [name, route] of SCREENS.filter((s) => s[2])) {
    await page.goto(route);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(dir, `${name}.png`) });
  }
  await context.close();
  console.log(`captured ${label}`);
}
await browser.close();
