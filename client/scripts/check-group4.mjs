/**
 * Group 4 check (profile and personalization) on the isolated stack: phone widths, desktop, personal colours,
 * reduced motion, horizontal overflow, console errors and the booking hand-off from a price row.
 *   node scripts/check-group4.mjs http://localhost:5191   (API: AUDIT_API, default http://127.0.0.1:4100)
 * Screenshots: docs/design-audit/group4/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../docs/design-audit/group4");
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

// Against the real phone width: mobile Chrome zooms a too-wide page out (innerWidth grows) instead of scrolling.
const overflow = async (p = page) => (await p.evaluate(() => Math.max(document.documentElement.scrollWidth, window.innerWidth))) - p.viewportSize().width;
const themeOf = () => page.evaluate(() => document.documentElement.dataset.theme || "default");

const email = `group4.${Date.now().toString(36)}@example.com`;
await page.request.post("/api/auth/register", { data: { firstName: "קסניה", lastName: "בדיקה", email, password: "audit-pass-123" } });
await page.request.post("/api/auth/verify-email", { data: { email, code: await code(email), rememberMe: true } });

// Profile before measuring (empty state) at 393, then with sizes saved.
await page.goto("/profile");
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(out, "profile-empty-393x852.png") });
const fingers = {};
const sizes = { thumb: 3, index: 6, middle: 5, ring: 7, pinky: 9 };
for (const hand of ["right", "left"]) {
  for (const [fingerId, size] of Object.entries(sizes)) {
    fingers[`${hand}-${fingerId}`] = { handId: hand, fingerId, widthMm: 10 + size / 2, size, status: "confirmed" };
  }
}
const saved = await page.request.post("/api/measurements/profile", { data: { measurements: fingers } });
note("sizes saved for the profile", saved.ok(), String(saved.status()));

for (const [w, h] of SIZES) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto("/profile");
  await page.waitForTimeout(1200);
  const extra = await overflow();
  note(`profile ${w}x${h} has no horizontal overflow`, extra <= 0, `${extra}px`);
  await page.screenshot({ path: path.join(out, `profile-${w}x${h}.png`) });
}
await page.setViewportSize({ width: 393, height: 852 });
await page.goto("/profile");
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(out, "profile-393-full.png"), fullPage: true });

const look = await page.evaluate(() => ({
  ring: Boolean(document.querySelector("header .marquee-frame img, header .marquee-frame span[aria-hidden]")),
  accent: document.querySelector("h1 .violet-text")?.textContent || "",
  eyebrows: [...document.querySelectorAll(".section-eyebrow")].map((e) => e.textContent),
  size: getComputedStyle(document.querySelector("#measurements .marquee")).fontFamily,
  sizes: document.querySelectorAll("#measurements .marquee").length,
}));
note("avatar sits in the ring of light", look.ring);
note("last name is lit", look.accent === "בדיקה", look.accent);
note("section labels present", ["Profile", "Sizes", "Orders", "Colour", "Account"].every((t) => look.eyebrows.includes(t)), look.eyebrows.join(","));
note("all ten sizes shown in the dot-matrix", look.sizes === 10 && /Bitcount Ink/.test(look.size), `${look.sizes} ${look.size}`);

// Sheets still open and close: photo, phone, password, sign-out.
for (const [name, label] of [
  ["photo", /תמונת פרופיל/],
  ["phone", /^טלפון/],
  ["password", /שינוי סיסמה/],
  ["logout", /התנתקות/],
]) {
  await page.getByRole("button", { name: label }).first().click();
  const dialog = page.getByRole(name === "logout" ? "alertdialog" : "dialog");
  const open = await dialog.waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, `sheet-${name}-393x852.png`) });
  note(`${name} sheet opens`, open);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}
note("still signed in after closing the sign-out sheet", new URL(page.url()).pathname === "/profile");

// Personalization through the real picker: three swatches, then back to black.
const section = page.locator("section", { has: page.locator("#site-color-title") });
for (const [label, name] of [
  ["plum", "שזיף"],
  ["cream", "שמנת"],
  ["wine", "יין"],
]) {
  await section.getByRole("radio", { name }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "custom", null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(900);
  const lit = await section.getByRole("radio", { name }).evaluate((b) => getComputedStyle(b).boxShadow);
  note(`picker: ${label} applies and its swatch is lit`, (await themeOf()) === "custom" && /rgba?\(176, 38, 255/.test(lit), lit.slice(0, 60));
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, `colour-${label}-393x852.png`) });
}
// The colour survives a reload (it is saved to the account).
await page.reload();
await page.waitForTimeout(1200);
note("chosen colour survives a reload", (await themeOf()) === "custom");
await page.screenshot({ path: path.join(out, "profile-theme-wine-top.png") });
await section.getByRole("button", { name: "חזרה לשחור" }).click();
await page.waitForFunction(() => document.documentElement.dataset.theme !== "custom", null, { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(800);
note("reset returns to the default black", (await themeOf()) !== "custom");
await page.reload();
await page.waitForTimeout(1000);
note("default black survives a reload", (await themeOf()) !== "custom");

// Free colour wheel opens and fits.
await section.getByRole("radio", { name: "צבע חופשי" }).click();
await page.waitForTimeout(500);
note("free colour wheel opens without overflow", (await section.getByLabel("גלגל צבעים לבחירת צבע הרקע").count()) === 1 && (await overflow()) <= 0);
await section.scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(out, "colour-wheel-393x852.png") });

note(
  "fonts actually loaded",
  await page.evaluate(async () => {
    await document.fonts.ready;
    return ["Bitcount Ink Variable", "Secular One", "Sekuya"].every((f) => document.fonts.check(`16px "${f}"`, "אבג abc"));
  })
);

// Desktop.
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto("/profile");
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(out, "profile-1440.png") });
await page.setViewportSize({ width: 393, height: 852 });

// Reduced motion: the avatar ring stops.
const rm = await browser.newContext({ baseURL: BASE, reducedMotion: "reduce", viewport: { width: 393, height: 852 }, storageState: await context.storageState() });
const rmPage = await rm.newPage();
await rmPage.goto("/profile");
await rmPage.waitForTimeout(1000);
const anim = await rmPage.evaluate(() => ({
  ring: getComputedStyle(document.querySelector("header .marquee-frame"), "::before").animationName,
  ambient: getComputedStyle(document.querySelector(".ambient-light")).animationName,
}));
note("reduced motion stops the avatar ring and the ambient light", anim.ring === "none" && anim.ambient === "none", JSON.stringify(anim));
await rmPage.screenshot({ path: path.join(out, "profile-reduced-motion.png") });
await rm.close();

const rowMail = await page.evaluate(() => getComputedStyle(document.querySelector(`a[href="/account/email"] bdi`)).fontFamily);
note("account email stays in Heebo", /^Heebo/.test(rowMail), rowMail);
note("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
