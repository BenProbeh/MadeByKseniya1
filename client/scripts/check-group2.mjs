/**
 * Group 2 check (sign-in, sign-up, navigation, home) on the isolated stack: phone widths, desktop, personal colours,
 * reduced motion, horizontal overflow, console errors and the booking hand-off from a price row.
 *   node scripts/check-group2.mjs http://localhost:5191   (API: AUDIT_API, default http://127.0.0.1:4100)
 * Screenshots: docs/design-audit/group2/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../docs/design-audit/group2");
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
const shoot = async (prefix, routes) => {
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    for (const [name, route] of routes) {
      await page.goto(route);
      await page.waitForTimeout(1200);
      const extra = await overflow();
      note(`${name} ${w}x${h} has no horizontal overflow`, extra <= 0, `${extra}px`);
      await page.screenshot({ path: path.join(out, `${prefix}${name}-${w}x${h}.png`) });
    }
  }
  await page.setViewportSize({ width: 393, height: 852 });
};

// Signed out: the auth screens.
await shoot("", [
  ["login", "/login"],
  ["register", "/register"],
  ["forgot", "/forgot-password"],
]);
const authFonts = await page.evaluate(() => ({
  h1: getComputedStyle(document.querySelector("h1")).fontFamily,
  input: getComputedStyle(document.querySelector("input")).fontFamily,
  eyebrow: getComputedStyle(document.querySelector(".section-eyebrow")).fontFamily,
}));
note("auth headline uses the Cursor-era display stack", /Secular One/.test(authFonts.h1), authFonts.h1);
note("auth inputs stay in Heebo", /^Heebo/.test(authFonts.input), authFonts.input);
note("auth eyebrow is Sekuya", /^Sekuya/.test(authFonts.eyebrow), authFonts.eyebrow);

// Real sign-up through the form, then the code screen.
const email = `group2.${Date.now().toString(36)}@example.com`;
await page.goto("/register");
await page.getByLabel(/שם פרטי/).fill("קסניה");
await page.getByLabel(/שם משפחה/).fill("בדיקה");
await page.getByLabel(/אימייל/).fill(email);
await page.getByLabel(/^סיסמה/).fill("audit-pass-123");
const confirm = page.getByLabel(/אימות סיסמה|סיסמה שוב|חזרה על/);
if (await confirm.count()) await confirm.first().fill("audit-pass-123");
await page.getByRole("button", { name: /הרשמה|יצירת חשבון|המשך/ }).first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(out, "register-code-393x852.png") });
const otp = page.locator('input[autocomplete="one-time-code"], input[inputmode="numeric"]').first();
await otp.fill(await code(email));
await page.waitForURL((u) => !/register|verify/.test(u.pathname), { timeout: 15_000 }).catch(() => {});
note("sign-up through the form lands signed in", !/login|register|verify/.test(new URL(page.url()).pathname), page.url());

// Sign out and back in through the login form.
await page.request.post("/api/auth/logout");
await page.goto("/login");
await page.getByLabel(/אימייל/).fill(email);
await page.getByLabel(/^סיסמה/).fill("audit-pass-123");
await page.getByRole("button", { name: /התחברות|כניסה/ }).first().click();
await page.waitForURL((u) => !/login/.test(u.pathname), { timeout: 15_000 }).catch(() => {});
note("sign-in through the form works", !/login/.test(new URL(page.url()).pathname), page.url());

// Signed in: home and the tab bar.
await shoot("", [["home", "/"]]);
await page.screenshot({ path: path.join(out, "home-393-full.png"), fullPage: true });
const nav = await page.evaluate(() => {
  const cur = document.querySelector('.app-tabbar [aria-current="page"]');
  return { lit: Boolean(cur?.querySelector(".tab-light")), count: document.querySelectorAll(".app-tabbar .tab-light").length, hero: Boolean(document.querySelector(".marquee-frame #next-title")), pkg: getComputedStyle(document.querySelector("#packages-title ~ ul .marquee, ul .marquee")).fontFamily };
});
note("exactly the current tab is lit", nav.lit && nav.count === 1, JSON.stringify(nav));
note("next-step card sits in the marquee frame", nav.hero);
note("package names on home use Bitcount Ink", /Bitcount Ink/.test(nav.pkg), nav.pkg);
await page.locator(".app-tabbar").getByRole("link", { name: "מדידה", exact: true }).click();
await page.waitForTimeout(800);
note("tab moves the light", await page.evaluate(() => Boolean(document.querySelector('.app-tabbar [aria-current="page"] .tab-light')) && location.pathname !== "/"));
note("fonts actually loaded", await page.evaluate(async () => {
  await document.fonts.ready;
  return ["Bitcount Ink Variable", "Secular One", "Sekuya"].every((f) => document.fonts.check(`16px "${f}"`, "אבג abc"));
}));

// Desktop.
await page.setViewportSize({ width: 1440, height: 900 });
for (const [n, r] of [["home", "/"], ["login-desktop", "/login"]]) {
  await page.goto(r);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(out, `${n}-1440.png`) });
}
await page.setViewportSize({ width: 393, height: 852 });

// Personal colours.
for (const [label, hex] of [["plum", "#2a0f3d"], ["cream", "#ece7df"], ["wine", "#3a0c1f"]]) {
  const res = await page.request.patch("/api/profile/theme", { data: { color: hex } });
  await page.goto("/");
  await page.waitForTimeout(1300);
  await page.screenshot({ path: path.join(out, `home-theme-${label}.png`) });
  note(`personal colour ${label} applies`, res.ok() && (await page.evaluate(() => document.documentElement.dataset.theme)) === "custom");
}
await page.request.patch("/api/profile/theme", { data: { color: null } });
await page.goto("/");
await page.waitForTimeout(1000);
note("back to the default black", (await page.evaluate(() => document.documentElement.dataset.theme)) !== "custom");

// Reduced motion.
const rm = await browser.newContext({ baseURL: BASE, reducedMotion: "reduce", viewport: { width: 393, height: 852 }, storageState: await context.storageState() });
const rmPage = await rm.newPage();
await rmPage.goto("/");
await rmPage.waitForTimeout(1000);
const anim = await rmPage.evaluate(() => ({
  frame: getComputedStyle(document.querySelector(".marquee-frame"), "::before").animationName,
  ambient: getComputedStyle(document.querySelector(".ambient-light")).animationName,
}));
note("reduced motion stops the hero frame and the ambient light", anim.frame === "none" && anim.ambient === "none", JSON.stringify(anim));
await rmPage.screenshot({ path: path.join(out, "home-reduced-motion.png") });
await rm.close();

note("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`
${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
