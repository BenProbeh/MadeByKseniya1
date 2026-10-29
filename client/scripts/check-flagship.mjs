/**
 * Flagship check (packages + package detail) on the isolated stack: phone widths, desktop, personal colours,
 * reduced motion, horizontal overflow, console errors and the booking hand-off from a price row.
 *   node scripts/check-flagship.mjs http://localhost:5191   (API: AUDIT_API, default http://127.0.0.1:4100)
 * Screenshots: docs/design-audit/flagship/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../docs/design-audit/flagship");
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

const email = `flagship.${Date.now().toString(36)}@example.com`;
await page.request.post("/api/auth/register", { data: { firstName: "קסניה", lastName: "בדיקה", email, password: "audit-pass-123" } });
await page.request.post("/api/auth/verify-email", { data: { email, code: await code(email), rememberMe: true } });

const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const [w, h] of SIZES) {
  await page.setViewportSize({ width: w, height: h });
  for (const [name, route] of [
    ["packages", "/services"],
    ["detail", "/services/bad-bitch"],
  ]) {
    await page.goto(route);
    await page.waitForTimeout(1300);
    const extra = await overflow();
    note(`${name} ${w}x${h} has no horizontal overflow`, extra <= 0, `${extra}px`);
    await page.screenshot({ path: path.join(out, `${name}-${w}x${h}.png`) });
  }
}
await page.setViewportSize({ width: 393, height: 852 });
await page.goto("/services/bad-bitch");
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(out, "detail-393-full.png"), fullPage: true });
await page.goto("/services");
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(out, "packages-393-full.png"), fullPage: true });

// Typography: Hebrew in Secular One, brand names in Bitcount Ink, inputs in Heebo.
const fonts = await page.evaluate(() => ({
  title: getComputedStyle(document.querySelector("h2.marquee")).fontFamily,
  body: getComputedStyle(document.body).fontFamily,
  h1: getComputedStyle(document.querySelector("h1")).fontFamily,
}));
note("brand names use Bitcount Ink", /Bitcount Ink/.test(fonts.title), fonts.title);
note("body stack is the Cursor-era one (Sekuya + Secular One)", /Sekuya/.test(fonts.body) && /Secular One/.test(fonts.body), fonts.body);
note("fonts actually loaded", await page.evaluate(async () => {
  await document.fonts.ready;
  return ["Bitcount Ink Variable", "Secular One", "Sekuya"].every((f) => document.fonts.check(`16px "${f}"`, "אבג abc"));
}));

// Booking hand-off from a price row keeps the package.
await page.goto("/services/bad-bitch");
await page.getByRole("link", { name: /מילוי Bad Bitch, מידה M/ }).click();
await page.waitForURL("**/booking");
const picked = await page
  .getByText("Bad Bitch · M", { exact: false })
  .first()
  .waitFor({ state: "visible", timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
note("price row opens booking with the chosen package and size", picked);

// Personal colours: three swatches, then back to default.
for (const [label, hex] of [
  ["plum", "#2a0f3d"],
  ["cream", "#ece7df"],
  ["wine", "#3a0c1f"],
]) {
  const res = await page.request.patch("/api/profile/theme", { data: { color: hex } });
  await page.goto("/services");
  await page.waitForTimeout(1300);
  await page.screenshot({ path: path.join(out, `packages-theme-${label}.png`) });
  note(`personal colour ${label} applies`, res.ok() && (await page.evaluate(() => document.documentElement.dataset.theme)) === "custom");
}
await page.request.patch("/api/profile/theme", { data: { color: null } });
await page.goto("/services");
await page.waitForTimeout(1000);
note("back to the default black", (await page.evaluate(() => document.documentElement.dataset.theme)) !== "custom");

// Reduced motion: marquee and ambient light stop.
const rm = await browser.newContext({ baseURL: BASE, reducedMotion: "reduce", viewport: { width: 393, height: 852 }, storageState: await context.storageState() });
const rmPage = await rm.newPage();
await rmPage.goto("/services");
await rmPage.waitForTimeout(1000);
const anim = await rmPage.evaluate(() => ({
  frame: getComputedStyle(document.querySelector(".marquee-frame"), "::before").animationName,
  ambient: getComputedStyle(document.querySelector(".ambient-light")).animationName,
}));
note("reduced motion stops the marquee and the ambient light", anim.frame === "none" && anim.ambient === "none", JSON.stringify(anim));
await rmPage.screenshot({ path: path.join(out, "packages-reduced-motion.png") });
await rm.close();

note("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
