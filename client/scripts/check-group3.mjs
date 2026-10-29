/**
 * Group 3 check (booking and appointments) on the isolated stack: phone widths, desktop, personal colours,
 * reduced motion, horizontal overflow, console errors and the booking hand-off from a price row.
 *   node scripts/check-group3.mjs http://localhost:5191   (API: AUDIT_API, default http://127.0.0.1:4100)
 * Screenshots: docs/design-audit/group3/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../docs/design-audit/group3");
fs.mkdirSync(out, { recursive: true });
const BASE = process.argv[2] || "http://localhost:5191";
const API = process.env.AUDIT_API || "http://127.0.0.1:4100";
const SIZES = [
  [320, 568],
  [360, 800],
  [375, 812],
  [390, 844],
  [393, 852],
  [414, 896],
  [430, 932],
];
const results = [];
const note = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

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
const guardHealth = await (await fetch(`${BASE}/api/health`)).json().catch(() => ({}));
if (guardHealth.mailProvider !== "memory") {
  console.error(`Refusing to run: ${BASE} is not backed by the isolated test API (mailProvider=${guardHealth.mailProvider}).`);
  process.exit(2);
}

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || "chrome" });
const context = await browser.newContext({ baseURL: BASE, locale: "he-IL", isMobile: true, hasTouch: true, deviceScaleFactor: 2, viewport: { width: 393, height: 852 } });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && !/401/.test(m.text()) && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));

const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

const email = `group3.${Date.now().toString(36)}@example.com`;
await page.request.post("/api/auth/register", { data: { firstName: "קסניה", lastName: "בדיקה", email, password: "audit-pass-123" } });
await page.request.post("/api/auth/verify-email", { data: { email, code: await code(email), rememberMe: true } });

/** Walks the day strip until a day shows free times; returns true when one was picked. */
async function pickDayWithTimes(p = page) {
  const days = p.getByRole("option");
  const n = await days.count();
  for (let i = 0; i < n; i += 1) {
    await days.nth(i).click();
    await p.waitForTimeout(700);
    if (await p.getByRole("button", { name: /— פנוי$/ }).count()) return true;
  }
  return false;
}

// Booking straight from the tab (service list) at every width.
for (const [w, h] of SIZES) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto("/booking");
  await page.waitForTimeout(1000);
  const extra = await overflow();
  note(`booking ${w}x${h} has no horizontal overflow`, extra <= 0, `${extra}px`);
  await page.screenshot({ path: path.join(out, `booking-${w}x${h}.png`) });
}
await page.setViewportSize({ width: 393, height: 852 });
await page.goto("/booking");
await page.getByRole("radio").first().click();
note("a day with free times exists", await pickDayWithTimes());
await page.getByRole("button", { name: /— פנוי$/ }).first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(out, "booking-picked-393-full.png"), fullPage: true });
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(out, "booking-picked-393x852.png") });
const lit = await page.evaluate(() => ({
  day: getComputedStyle(document.querySelector('[role="option"][aria-selected="true"]')).backgroundImage,
  slot: getComputedStyle(document.querySelector('button[aria-pressed="true"]')).backgroundImage,
  price: getComputedStyle(document.querySelector('[role="radio"] .price')).fontFamily,
}));
note("chosen day and time are lit with the brand gradient", /gradient/.test(lit.day) && /gradient/.test(lit.slot), JSON.stringify(lit).slice(0, 160));
note("service prices use the dot-matrix", /Bitcount Ink/.test(lit.price), lit.price);
note("booking page has no overflow after picking", (await overflow()) <= 0);

// From a package price row: the package sits in the light frame, then the request is sent.
await page.goto("/services/bad-bitch");
await page.getByRole("link", { name: /מילוי Bad Bitch, מידה M/ }).click();
await page.waitForURL("**/booking");
await page.waitForTimeout(900);
note("chosen package shows in the marquee frame", (await page.locator(".marquee-frame .marquee", { hasText: "Bad Bitch · M" }).count()) === 1);
await page.screenshot({ path: path.join(out, "booking-package-393x852.png") });
note("a day with free times exists (package)", await pickDayWithTimes());
await page.getByRole("button", { name: /— פנוי$/ }).first().click();
await page.getByRole("button", { name: "שליחת בקשה לתור" }).click();
const sent = await page
  .getByText("קיבלתי את הפרטים שלך")
  .waitFor({ timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
note("request is sent and confirmed on screen", sent);
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(out, "booking-sent-393x852.png") });

// Appointments list at every width.
for (const [w, h] of SIZES) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto("/appointments");
  await page.waitForTimeout(1100);
  const extra = await overflow();
  note(`appointments ${w}x${h} has no horizontal overflow`, extra <= 0, `${extra}px`);
  await page.screenshot({ path: path.join(out, `appointments-${w}x${h}.png`) });
}
await page.setViewportSize({ width: 393, height: 852 });
note("the sent request is listed as pending", await page.getByText("ממתין לאישור").first().isVisible());
const hdr = await page.evaluate(() => ({
  eyebrow: getComputedStyle(document.querySelector(".section-eyebrow")).fontFamily,
  accent: Boolean(document.querySelector("h1 .violet-text")),
}));
note("appointments header has eyebrow and lit word", /^Sekuya/.test(hdr.eyebrow) && hdr.accent, JSON.stringify(hdr));
note(
  "fonts actually loaded",
  await page.evaluate(async () => {
    await document.fonts.ready;
    return ["Bitcount Ink Variable", "Secular One", "Sekuya"].every((f) => document.fonts.check(`16px "${f}"`, "אבג abc"));
  })
);

// Desktop.
await page.setViewportSize({ width: 1440, height: 900 });
for (const [n, r] of [
  ["booking", "/booking"],
  ["appointments", "/appointments"],
]) {
  await page.goto(r);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(out, `${n}-1440.png`) });
}
await page.setViewportSize({ width: 393, height: 852 });

// Personal colours, with a day and time chosen so the lit states show.
for (const [label, hex] of [
  ["plum", "#2a0f3d"],
  ["cream", "#ece7df"],
  ["wine", "#3a0c1f"],
]) {
  const res = await page.request.patch("/api/profile/theme", { data: { color: hex } });
  await page.goto("/booking");
  await page.getByRole("radio").first().click();
  await pickDayWithTimes();
  await page.getByRole("button", { name: /— פנוי$/ }).first().click();
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, `booking-theme-${label}.png`) });
  note(`personal colour ${label} applies`, res.ok() && (await page.evaluate(() => document.documentElement.dataset.theme)) === "custom");
}
await page.request.patch("/api/profile/theme", { data: { color: null } });
await page.goto("/appointments");
await page.waitForTimeout(1000);
note("back to the default black", (await page.evaluate(() => document.documentElement.dataset.theme)) !== "custom");

// Reduced motion.
const rm = await browser.newContext({ baseURL: BASE, reducedMotion: "reduce", viewport: { width: 393, height: 852 }, storageState: await context.storageState() });
const rmPage = await rm.newPage();
await rmPage.goto("/services/bad-bitch");
await rmPage.getByRole("link", { name: /מילוי Bad Bitch, מידה M/ }).click();
await rmPage.waitForURL("**/booking");
await rmPage.waitForTimeout(1000);
const anim = await rmPage.evaluate(() => ({
  frame: getComputedStyle(document.querySelector(".marquee-frame"), "::before").animationName,
  ambient: getComputedStyle(document.querySelector(".ambient-light")).animationName,
}));
note("reduced motion stops the package frame and the ambient light", anim.frame === "none" && anim.ambient === "none", JSON.stringify(anim));
await rmPage.screenshot({ path: path.join(out, "booking-reduced-motion.png") });
await rm.close();

note("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
