/**
 * Group 6 check (the admin screens) on the isolated stack: phone widths, desktop, personal colours,
 * reduced motion, horizontal overflow, console errors and a real approval from the appointments list.
 *   node scripts/check-group6.mjs http://localhost:5193   (API: AUDIT_API, default http://127.0.0.1:4100)
 * Screenshots: docs/design-audit/group6/ (GROUP6_OUT=before writes them to group6/before instead)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../docs/design-audit/group6", process.env.GROUP6_OUT || "");
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
const SCREENS = [
  ["dashboard", "/admin"],
  ["appointments", "/admin/appointments"],
  ["customers", "/admin/customers"],
  ["more", "/admin/more"],
  ["notifications", "/admin/notifications"],
  ["content", "/admin/content"],
  ["editor", "/admin/content/new"],
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
page.on("console", (m) => m.type() === "error" && !/401/.test(m.text()) && consoleErrors.push(m.text()));
// Against the real phone width: mobile Chrome zooms a too-wide page out (innerWidth grows) instead of scrolling.
const overflow = async (p = page) => (await p.evaluate(() => Math.max(document.documentElement.scrollWidth, window.innerWidth))) - p.viewportSize().width;
const themeOf = () => page.evaluate(() => document.documentElement.dataset.theme || "default");

async function account(request, firstName, lastName) {
  const email = `group6.${firstName.length}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 6)}@example.com`;
  await request.post("/api/auth/register", { data: { firstName, lastName, email, password: "audit-pass-123" } });
  const res = await request.post("/api/auth/verify-email", { data: { email, code: await code(email), rememberMe: true } });
  return { email, user: (await res.json()).user };
}

// Three customers with requests on the coming days, so the lists have something to show.
const customers = [];
for (const [i, [first, last]] of [
  ["נועה", "לוי"],
  ["מאיה", "כהן"],
  ["שירה", "אברהם"],
].entries()) {
  const ctx = await browser.newContext({ baseURL: BASE });
  const c = await account(ctx.request, first, last);
  const booked = await ctx.request.post("/api/appointments", {
    data: { clientName: `${first} ${last}`, serviceId: 1, date: daysAhead(4 + i), time: "12:00", requestKey: `g6-${Date.now()}-${i}` },
  });
  customers.push({ ...c, booked: booked.status() === 201 });
  await ctx.close();
}
note("three customer requests seeded", customers.every((c) => c.booked));

// The owner (the isolated API's helper; the real database is never touched).
const owner = await account(page.request, "קסניה", "בדיקה");
await fetch(`${API}/__e2e/owner/${owner.user.id}`, { method: "POST" });
await page.request.post("/api/auth/login", { data: { email: owner.email, password: "audit-pass-123", rememberMe: true } });

// Every admin screen at every phone width.
for (const [name, route] of SCREENS) {
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(route);
    await page.waitForTimeout(1000);
    const extra = await overflow();
    note(`${name} ${w}x${h} has no horizontal overflow`, extra <= 0, `${extra}px`);
    if (w === 320 || w === 393 || w === 430) await page.screenshot({ path: path.join(out, `${name}-${w}x${h}.png`) });
  }
}
await page.setViewportSize({ width: 393, height: 852 });

// Customer card (with sizes on file would need the camera; the empty sections are enough here).
const target = customers[0].user.id;
for (const [w, h] of SIZES) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`/admin/customers/${target}`);
  await page.waitForTimeout(1000);
  const extra = await overflow();
  note(`customer card ${w}x${h} has no horizontal overflow`, extra <= 0, `${extra}px`);
  if (w === 320 || w === 393 || w === 430) await page.screenshot({ path: path.join(out, `customer-${w}x${h}.png`) });
}
await page.setViewportSize({ width: 393, height: 852 });
await page.screenshot({ path: path.join(out, "customer-393-full.png"), fullPage: true });

// The look: eyebrows, lit words, dot-matrix numbers and the glowing pending card.
await page.goto("/admin");
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(out, "dashboard-393-full.png"), fullPage: true });
const dash = await page.evaluate(() => ({
  eyebrow: document.querySelector(".section-eyebrow")?.textContent || "",
  accent: document.querySelector("h1 .violet-text")?.textContent || "",
  stat: getComputedStyle(document.querySelector("a .marquee") || document.body).fontFamily,
  lit: Boolean(document.querySelector("a.shadow-glow-soft .marquee, a.marquee-frame .marquee")),
}));
note("dashboard header has an eyebrow and the name lit", dash.eyebrow.length > 0 && dash.accent === "קסניה", JSON.stringify(dash).slice(0, 120));
note("dashboard numbers use the dot-matrix", /Bitcount Ink/.test(dash.stat), dash.stat);
note("pending requests stat is lit", dash.lit);

await page.goto("/admin/appointments");
await page.waitForTimeout(1200);
const appts = await page.evaluate(() => ({
  eyebrow: document.querySelector(".section-eyebrow")?.textContent || "",
  accent: document.querySelector("h1 .violet-text")?.textContent || "",
  segment: getComputedStyle(document.querySelector('.segmented > button[aria-pressed="true"]')).boxShadow,
  chip: getComputedStyle(document.querySelector('.chip[aria-pressed="true"]')).backgroundImage,
}));
note("appointments header has an eyebrow and a lit word", appts.eyebrow.length > 0 && appts.accent.length > 0, `${appts.eyebrow} ${appts.accent}`);
note("chosen filter chip carries the gradient", /gradient/.test(appts.chip));
note("chosen date range glows", /rgba?\(176, 38, 255/.test(appts.segment), appts.segment.slice(0, 60));

// A real approval through the UI.
const card = page.getByRole("listitem").filter({ hasText: "נועה לוי" });
await card.getByRole("button", { name: "אישור התור" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(out, "approve-dialog-393x852.png") });
await page.getByRole("alertdialog").getByRole("button", { name: "כן, לאשר" }).click();
const approved = await page.getByText(/התור אושר/).waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
note("approving a request works", approved);
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(out, "approved-393x852.png") });

await page.goto("/admin/customers");
await page.waitForTimeout(1200);
note(
  "customers header has an eyebrow and a lit word",
  await page.evaluate(() => Boolean(document.querySelector(".section-eyebrow") && document.querySelector("h1 .violet-text")))
);
await page.goto(`/admin/customers/${target}`);
await page.waitForTimeout(1200);
const cust = await page.evaluate(() => ({
  ring: Boolean(document.querySelector("header .marquee-frame")),
  accent: document.querySelector("h1 .violet-text")?.textContent || "",
  eyebrows: [...document.querySelectorAll(".section-eyebrow")].map((e) => e.textContent),
}));
note("customer avatar sits in the ring of light", cust.ring);
note("customer last name is lit", cust.accent === "לוי", cust.accent);
note("customer card sections are labelled", cust.eyebrows.length >= 3, cust.eyebrows.join(","));

await page.goto("/admin/notifications");
await page.waitForTimeout(1200);
note(
  "running text on notifications uses Heebo digits",
  await page.evaluate(() => !/MBK Space/.test(getComputedStyle(document.querySelector("h1 + p")).fontFamily))
);
note(
  "fonts actually loaded",
  await page.evaluate(async () => {
    await document.fonts.ready;
    return ["Bitcount Ink Variable", "Secular One", "Sekuya"].every((f) => document.fonts.check(`16px "${f}"`, "אבג abc"));
  })
);

// Desktop.
await page.setViewportSize({ width: 1440, height: 900 });
for (const [name, route] of [...SCREENS.slice(0, 3), ["customer", `/admin/customers/${target}`]]) {
  await page.goto(route);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(out, `${name}-1440.png`) });
}
await page.setViewportSize({ width: 393, height: 852 });

// Personal colours on the dashboard, then back to black.
for (const [label, hex] of [
  ["plum", "#2a0f3d"],
  ["cream", "#ece7df"],
  ["wine", "#3a0c1f"],
]) {
  const res = await page.request.patch("/api/profile/theme", { data: { color: hex } });
  await page.goto("/admin");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(out, `dashboard-theme-${label}.png`) });
  note(`personal colour ${label} applies`, res.ok() && (await themeOf()) === "custom");
}
await page.request.patch("/api/profile/theme", { data: { color: null } });
await page.goto("/admin");
await page.waitForTimeout(800);
note("back to the default black", (await themeOf()) !== "custom");

// Reduced motion: the customer ring and the ambient light are still.
const rm = await browser.newContext({ baseURL: BASE, reducedMotion: "reduce", viewport: { width: 393, height: 852 }, storageState: await context.storageState() });
const rmPage = await rm.newPage();
await rmPage.goto(`/admin/customers/${target}`);
await rmPage.waitForTimeout(1000);
const anim = await rmPage.evaluate(() => ({
  ring: document.querySelector(".marquee-frame") ? getComputedStyle(document.querySelector(".marquee-frame"), "::before").animationName : "none",
  ambient: getComputedStyle(document.querySelector(".ambient-light")).animationName,
}));
note("reduced motion stops the ring and the ambient light", anim.ring === "none" && anim.ambient === "none", JSON.stringify(anim));
await rm.close();

note("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
