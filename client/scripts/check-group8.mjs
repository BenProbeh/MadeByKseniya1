/**
 * Group 8 check (final polish) on the isolated stack: a sweep of every screen at every phone width for
 * horizontal overflow and console errors, plus the pieces the earlier groups did not reach: the gallery,
 * the colour gallery and set builder, the booking-confirmation page from the approval email, sheets and
 * dialogs, and the chat. Personal colours and reduced motion included.
 *   node scripts/check-group8.mjs http://localhost:5193   (API: AUDIT_API, default http://127.0.0.1:4100)
 * Screenshots: docs/design-audit/group8/ (GROUP8_OUT=before writes them to group8/before instead)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../docs/design-audit/group8", process.env.GROUP8_OUT || "");
fs.mkdirSync(out, { recursive: true });
const BASE = process.argv[2] || "http://localhost:5193";
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
const CUSTOMER_SCREENS = [
  ["home", "/"],
  ["services", "/services"],
  ["package", "/services/bad-bitch"],
  ["gallery", "/gallery"],
  ["build", "/build-a-set"],
  ["sizing", "/nail-sizing"],
  ["booking", "/booking"],
  ["appointments", "/appointments"],
  ["profile", "/profile"],
];
const results = [];
const note = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

async function outbox(email) {
  return (await fetch(`${API}/__e2e/outbox?to=${encodeURIComponent(email)}`)).json();
}
async function code(email) {
  for (let i = 0; i < 30; i += 1) {
    const m = (await outbox(email)).map((x) => /\b(\d{6})\b/.exec(x.text)).filter(Boolean).at(-1);
    if (m) return m[1];
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("no code");
}
const daysAhead = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(Date.now() + n * 86_400_000));

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
page.on("console", (m) => m.type() === "error" && !/401|status of 400/.test(m.text()) && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(e.message));
const overflow = (p = page) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const themeOf = () => page.evaluate(() => document.documentElement.dataset.theme || "default");

async function account(request, firstName, lastName) {
  const email = `group8.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 6)}@example.com`;
  await request.post("/api/auth/register", { data: { firstName, lastName, email, password: "audit-pass-123" } });
  const res = await request.post("/api/auth/verify-email", { data: { email, code: await code(email), rememberMe: true } });
  return { email, user: (await res.json()).user };
}

const me = await account(page.request, "קסניה", "בדיקה");

// Sweep: every customer screen at every width.
for (const [name, route] of CUSTOMER_SCREENS) {
  let worst = 0;
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(route);
    await page.waitForTimeout(900);
    worst = Math.max(worst, await overflow());
    if (w === 320 || w === 393) await page.screenshot({ path: path.join(out, `${name}-${w}x${h}.png`) });
  }
  note(`${name}: no horizontal overflow at any of the 7 widths`, worst <= 0, `${worst}px`);
}
await page.setViewportSize({ width: 393, height: 852 });

// The gallery is never a blank screen.
await page.goto("/gallery");
await page.waitForTimeout(900);
const galleryText = (await page.locator("#main").innerText()).trim();
note("gallery shows something (not a blank screen)", galleryText.length > 10 && (await page.locator("#main h1").count()) === 1, galleryText.slice(0, 60));

// Colour gallery: lit headline, price in the price style.
await page.goto("/build-a-set");
await page.waitForTimeout(1200);
const build = await page.evaluate(() => ({
  accent: document.querySelector("#main h1 .violet-text")?.textContent || "",
  price: document.querySelector("#main .price") ? getComputedStyle(document.querySelector("#main .price")).fontFamily : "",
}));
note("colour gallery headline lights a word", build.accent.length > 0, build.accent);
note("set builder price uses the price style", /Bitcount Ink/.test(build.price), build.price);
await page.screenshot({ path: path.join(out, "build-393-full.png"), fullPage: true });

// Sheets and dialogs: the sign-out dialog on the profile.
await page.goto("/profile");
await page.waitForTimeout(1000);
await page.getByRole("button", { name: /התנתקות/ }).first().click();
const dialog = page.getByRole("alertdialog");
await dialog.waitFor({ timeout: 5000 });
await page.waitForTimeout(400);
const sheet = await dialog.evaluate((d) => ({ border: getComputedStyle(d).borderTopColor, shadow: getComputedStyle(d).boxShadow }));
note("sheets carry the violet edge", /176, 38, 255/.test(sheet.border + sheet.shadow), JSON.stringify(sheet).slice(0, 120));
await page.screenshot({ path: path.join(out, "sheet-signout-393x852.png") });
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
note("closing the dialog keeps you signed in", new URL(page.url()).pathname === "/profile");

// Booking confirmation from the approval email. The isolated API has no public site address, so its email
// carries no link; the confirm call is answered here with the shape the real endpoint returns.
await page.route("**/api/appointments/confirm-booking", (r) =>
  r.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ alreadyConfirmed: false, appointment: { id: 1, serviceLabel: "מניקור ג'ל", date: daysAhead(5), time: "12:00", priceIls: 120 } }),
  })
);
const confirmPath = "/appointments/confirm?id=1&token=audit";
for (const [w, h] of [SIZES[0], SIZES[4], SIZES[6]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(confirmPath);
  await page.waitForTimeout(1300);
  note(`confirm page ${w}x${h} has no overflow`, (await overflow()) <= 0);
  await page.screenshot({ path: path.join(out, `confirm-done-${w}x${h}.png`) });
}
await page.setViewportSize({ width: 393, height: 852 });
const confirmLook = await page.evaluate(() => ({
  heading: document.querySelector("h1")?.textContent || "",
  eyebrow: document.querySelector(".section-eyebrow")?.textContent || "",
  accent: document.querySelector("h1 .violet-text")?.textContent || "",
  stage: Boolean(document.querySelector(".auth-stage img")),
}));
note("confirm page: stage-lit logo, eyebrow and a lit word", confirmLook.stage && confirmLook.eyebrow.length > 0 && confirmLook.accent.length > 0, JSON.stringify(confirmLook));
await page.unroute("**/api/appointments/confirm-booking");
await page.goto("/appointments/confirm?id=1&token=nope");
await page.waitForTimeout(1300);
note("a bad confirm link explains itself", (await page.getByRole("alert").count()) > 0 && (await overflow()) <= 0);
await page.screenshot({ path: path.join(out, "confirm-error-393x852.png") });

// Chat (desktop button and panel).
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto("/");
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(out, "home-1440.png") });
for (const [name, route] of [
  ["gallery", "/gallery"],
  ["build", "/build-a-set"],
]) {
  await page.goto(route);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(out, `${name}-1440.png`) });
}
await page.setViewportSize({ width: 393, height: 852 });

note(
  "fonts actually loaded",
  await page.evaluate(async () => {
    await document.fonts.ready;
    return ["Bitcount Ink Variable", "Secular One", "Sekuya"].every((f) => document.fonts.check(`16px "${f}"`, "אבג abc"));
  })
);

// Personal colours on the gallery and the set builder.
for (const [label, hex] of [
  ["plum", "#2a0f3d"],
  ["cream", "#ece7df"],
  ["wine", "#3a0c1f"],
]) {
  const res = await page.request.patch("/api/profile/theme", { data: { color: hex } });
  await page.goto("/build-a-set");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(out, `build-theme-${label}.png`) });
  note(`personal colour ${label} applies`, res.ok() && (await themeOf()) === "custom");
}
await page.request.patch("/api/profile/theme", { data: { color: null } });
await page.goto("/");
await page.waitForTimeout(800);
note("back to the default black", (await themeOf()) !== "custom");

// Reduced motion: the set builder header does not slide in, the ambient light is still.
const rm = await browser.newContext({ baseURL: BASE, reducedMotion: "reduce", viewport: { width: 393, height: 852 }, storageState: await context.storageState() });
const rmPage = await rm.newPage();
await rmPage.goto("/build-a-set");
await rmPage.waitForTimeout(80);
const rmLook = await rmPage.evaluate(() => ({
  header: getComputedStyle(document.querySelector("#main h1").closest("div")).opacity,
  ambient: getComputedStyle(document.querySelector(".ambient-light")).animationName,
}));
note("reduced motion: set builder header appears at once, light is still", rmLook.header === "1" && rmLook.ambient === "none", JSON.stringify(rmLook));
await rm.close();

note("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
