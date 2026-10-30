/**
 * Group 7 check (system states) on the isolated stack: the 404 screen, losing and regaining the connection,
 * the error screen (a screen's code failing to download), the boot screen, a content page that fails to load
 * and empty states. Phone widths, desktop, personal colours, reduced motion, overflow and console errors.
 *   node scripts/check-group7.mjs http://localhost:5193   (API: AUDIT_API, default http://127.0.0.1:4100)
 * Screenshots: docs/design-audit/group7/ (GROUP7_OUT=before writes them to group7/before instead)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../docs/design-audit/group7", process.env.GROUP7_OUT || "");
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
// Failed requests are the point of several steps here; only real script errors count.
page.on("console", (m) => m.type() === "error" && !/401|Failed to load resource|net::ERR|Failed to fetch dynamically imported module|AppErrorBoundary|error loading dynamically imported module|The above error occurred|React will try to recreate/.test(m.text()) && consoleErrors.push(m.text()));
page.on("pageerror", (e) => !/dynamically imported module/.test(e.message) && consoleErrors.push(e.message));
const overflow = (p = page) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const themeOf = () => page.evaluate(() => document.documentElement.dataset.theme || "default");

const email = `group7.${Date.now().toString(36)}@example.com`;
await page.request.post("/api/auth/register", { data: { firstName: "קסניה", lastName: "בדיקה", email, password: "audit-pass-123" } });
await page.request.post("/api/auth/verify-email", { data: { email, code: await code(email), rememberMe: true } });

// 404: an unknown single-segment address (content-page route) and a deeper one, at every width.
for (const [w, h] of SIZES) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto("/no-such-page");
  await page.waitForTimeout(1000);
  const extra = await overflow();
  note(`404 ${w}x${h} has no horizontal overflow`, extra <= 0, `${extra}px`);
  await page.screenshot({ path: path.join(out, `404-${w}x${h}.png`) });
}
await page.setViewportSize({ width: 393, height: 852 });
note("unknown address stays put and says so", new URL(page.url()).pathname === "/no-such-page" && (await page.getByRole("heading", { name: /לא נמצא/ }).count()) === 1, new URL(page.url()).pathname);
const nf = await page.evaluate(() => ({
  eyebrow: document.querySelector("#main .section-eyebrow")?.textContent || "",
  accent: document.querySelector("#main h1 .violet-text")?.textContent || "",
  code: getComputedStyle(document.querySelector("#main .marquee") || document.body).fontFamily,
  title: document.title,
}));
note("404 has an eyebrow, a lit word and a dot-matrix 404", nf.eyebrow.length > 0 && nf.accent.length > 0 && /Bitcount Ink/.test(nf.code), JSON.stringify(nf).slice(0, 140));
await page.goto("/deep/unknown/path");
await page.waitForTimeout(900);
note("a deeper unknown address also shows the 404", new URL(page.url()).pathname === "/deep/unknown/path" && (await page.getByRole("heading", { name: /לא נמצא/ }).count()) === 1);
await page.goto("/services/no-such-package");
await page.waitForTimeout(900);
note("an unknown package shows the 404 with a way back to packages", (await page.getByRole("heading", { name: /לא נמצא/ }).count()) === 1 && (await page.getByRole("link", { name: /חבילות|מסלולים|שירותים/ }).count()) > 0);
await page.screenshot({ path: path.join(out, "404-package-393x852.png") });
const homeLink = page.locator("#main").getByRole("link", { name: /לדף הבית|הביתה|דף הבית/ });
if (await homeLink.count()) {
  await homeLink.first().click();
  await page.waitForTimeout(800);
}
note("the 404 leads home", new URL(page.url()).pathname === "/");

// Signed out: the 404 renders without the tab bar.
const anon = await browser.newContext({ baseURL: BASE, locale: "he-IL", viewport: { width: 393, height: 852 } });
const anonPage = await anon.newPage();
await anonPage.goto("/deep/unknown/path");
await anonPage.waitForTimeout(1000);
await anonPage.screenshot({ path: path.join(out, "404-signed-out-393x852.png") });
note("signed-out 404 has no overflow", (await overflow(anonPage)) <= 0);
await anon.close();

// Offline and back online, on Home.
await page.goto("/");
await page.waitForTimeout(1000);
await context.setOffline(true);
await page.waitForTimeout(600);
const offlineBanner = page.getByRole("status").filter({ hasText: /אין חיבור/ });
note("going offline shows a notice", (await offlineBanner.count()) === 1 && (await offlineBanner.isVisible()));
await page.screenshot({ path: path.join(out, "offline-393x852.png") });
for (const [w, h] of [SIZES[0], SIZES[6]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(300);
  note(`offline notice ${w}x${h} has no overflow`, (await overflow()) <= 0);
  await page.screenshot({ path: path.join(out, `offline-${w}x${h}.png`) });
}
await page.setViewportSize({ width: 393, height: 852 });
await context.setOffline(false);
await page.waitForTimeout(500);
const backOnline = page.getByRole("status").filter({ hasText: /החיבור חזר/ });
note("coming back online says so", (await backOnline.count()) === 1);
await page.screenshot({ path: path.join(out, "online-again-393x852.png") });
await page.waitForTimeout(4000);
note("the back-online notice goes away by itself", (await page.getByRole("status").filter({ hasText: /אין חיבור|החיבור חזר/ }).count()) === 0);

// The error screen: a screen's code fails to download (as after a deploy).
await page.route("**/src/pages/Gallery.jsx*", (r) => r.abort());
await page.route("**/assets/Gallery-*.js", (r) => r.abort());
await page.goto("/gallery");
await page.waitForTimeout(1200);
const crashed = (await page.getByRole("alert").filter({ hasText: /לא נטען/ }).count()) === 1;
note("a screen that fails to load shows the error screen", crashed);
note("error screen has no overflow", (await overflow()) <= 0);
const err = await page.evaluate(() => ({
  eyebrow: document.querySelector('[role="alert"] .section-eyebrow')?.textContent || "",
  accent: document.querySelector('[role="alert"] h1 .violet-text')?.textContent || "",
}));
note("error screen has an eyebrow and a lit word", err.eyebrow.length > 0 && err.accent.length > 0, JSON.stringify(err));
await page.screenshot({ path: path.join(out, "error-393x852.png") });
await page.setViewportSize({ width: 320, height: 568 });
await page.waitForTimeout(300);
note("error screen 320x568 has no overflow", (await overflow()) <= 0);
await page.screenshot({ path: path.join(out, "error-320x568.png") });
await page.setViewportSize({ width: 393, height: 852 });
await page.unroute("**/src/pages/Gallery.jsx*");
await page.unroute("**/assets/Gallery-*.js");

// A content page whose request fails.
await page.route("**/api/content/pages/**", (r) => r.fulfill({ status: 500, body: "{}" }));
await page.goto("/policy-test");
await page.waitForTimeout(1000);
note("a content page that fails offers a retry", (await page.getByRole("button", { name: /לנסות שוב|רענון/ }).count()) > 0);
await page.screenshot({ path: path.join(out, "content-error-393x852.png") });
await page.unroute("**/api/content/pages/**");

// Boot screen: hold the session check for a moment.
const boot = await browser.newContext({ baseURL: BASE, locale: "he-IL", viewport: { width: 393, height: 852 }, storageState: await context.storageState() });
const bootPage = await boot.newPage();
await bootPage.route("**/api/auth/me", async (r) => {
  await new Promise((res) => setTimeout(res, 2500));
  await r.continue();
});
await bootPage.goto("/", { waitUntil: "domcontentloaded" });
await bootPage.waitForTimeout(900);
note("boot screen shows while the session is checked", (await bootPage.getByRole("status").filter({ hasText: /טוענת/ }).count()) === 1);
await bootPage.screenshot({ path: path.join(out, "boot-393x852.png") });
await boot.close();

// Empty states (a new account has no appointments).
await page.goto("/appointments");
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(out, "empty-appointments-393x852.png") });
note(
  "empty-state icon is lit",
  await page.evaluate(() => {
    const s = document.querySelector("#main .empty-icon");
    return Boolean(s && /rgba?\(176, 38, 255/.test(getComputedStyle(s).boxShadow));
  })
);

note(
  "fonts actually loaded",
  await page.evaluate(async () => {
    await document.fonts.ready;
    return ["Secular One", "Sekuya"].every((f) => document.fonts.check(`16px "${f}"`, "אבג abc"));
  })
);

// Desktop.
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto("/no-such-page");
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(out, "404-1440.png") });
await context.setOffline(true);
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(out, "offline-1440.png") });
await context.setOffline(false);
await page.setViewportSize({ width: 393, height: 852 });

// Personal colours on the 404 and the offline notice.
for (const [label, hex] of [
  ["plum", "#2a0f3d"],
  ["cream", "#ece7df"],
  ["wine", "#3a0c1f"],
]) {
  const res = await page.request.patch("/api/profile/theme", { data: { color: hex } });
  await page.goto("/no-such-page");
  await page.waitForTimeout(1000);
  await context.setOffline(true);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, `404-theme-${label}.png`) });
  await context.setOffline(false);
  note(`personal colour ${label} applies`, res.ok() && (await themeOf()) === "custom");
}
await page.request.patch("/api/profile/theme", { data: { color: null } });
await page.goto("/no-such-page");
await page.waitForTimeout(800);
note("back to the default black", (await themeOf()) !== "custom");

// Reduced motion: the 404 frame and the ambient light are still, and the notice appears without sliding.
const rm = await browser.newContext({ baseURL: BASE, reducedMotion: "reduce", viewport: { width: 393, height: 852 }, storageState: await context.storageState() });
const rmPage = await rm.newPage();
await rmPage.goto("/no-such-page");
await rmPage.waitForTimeout(1000);
await rm.setOffline(true);
await rmPage.waitForTimeout(500);
const anim = await rmPage.evaluate(() => ({
  frame: document.querySelector(".marquee-frame") ? getComputedStyle(document.querySelector(".marquee-frame"), "::before").animationName : "none",
  ambient: getComputedStyle(document.querySelector(".ambient-light")).animationName,
  banner: document.querySelector(".net-banner") ? getComputedStyle(document.querySelector(".net-banner")).animationName : "missing",
}));
note("reduced motion stops the frame, the light and the notice motion", anim.frame === "none" && anim.ambient === "none" && anim.banner === "none", JSON.stringify(anim));
await rmPage.screenshot({ path: path.join(out, "404-reduced-motion.png") });
await rm.close();

note("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
