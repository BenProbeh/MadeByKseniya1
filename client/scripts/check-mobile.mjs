/**
 * Full mobile sweep on the isolated stack: every route (signed out, customer, staff) at eight sizes, phone to
 * small tablet. Per screen and size it checks page overflow, single elements running off the screen, form
 * fields under 16px (iOS zooms into those on focus), touch targets under 44px and the end of the content
 * being reachable above the tab bar. Prints a findings table; screenshots go to docs/design-audit/mobile/.
 *   node scripts/check-mobile.mjs http://localhost:5193   (API: AUDIT_API, default http://127.0.0.1:4100)
 * MOBILE_OUT=before writes the screenshots to mobile/before instead.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../docs/design-audit/mobile", process.env.MOBILE_OUT || "");
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
  [768, 1024],
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

const guardHealth = await (await fetch(`${BASE}/api/health`)).json().catch(() => ({}));
if (guardHealth.mailProvider !== "memory") {
  console.error(`Refusing to run: ${BASE} is not backed by the isolated test API (mailProvider=${guardHealth.mailProvider}).`);
  process.exit(2);
}

const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || "chrome" });
const consoleErrors = [];
async function phoneContext(storageState) {
  const ctx = await browser.newContext({ baseURL: BASE, locale: "he-IL", isMobile: true, hasTouch: true, deviceScaleFactor: 2, viewport: { width: 393, height: 852 }, storageState });
  return ctx;
}
async function account(request, firstName, lastName) {
  const email = `mobile.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 6)}@example.com`;
  await request.post("/api/auth/register", { data: { firstName, lastName, email, password: "audit-pass-123" } });
  const res = await request.post("/api/auth/verify-email", { data: { email, code: await code(email), rememberMe: true } });
  return { email, user: (await res.json()).user };
}

/** Everything measured on one screen at one size. */
// Measured against the size the phone really has: when a page is too wide, mobile Chrome zooms the whole page
// out to fit instead of scrolling sideways, which makes innerWidth grow and hides the overflow.
async function inspect(page, vw) {
  return page.evaluate((vw) => {
    const visible = (el) => {
      // The body of a closed <details> keeps a box in Chrome but is never drawn.
      const closed = el.closest("details:not([open])");
      if (closed && !el.closest("summary")) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
    };
    const clippedByScroller = (el) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
        // A clipping box narrower than the screen (a card, a frame) is deliberate; the screen-wide shell clip
        // only trims decorative glow, so content running past it still counts.
        if ((ox === "hidden" || ox === "clip") && a.getBoundingClientRect().width < vw - 1) return true;
      }
      return false;
    };
    const offscreen = [];
    for (const el of document.querySelectorAll("#main *, [role=dialog] *, [role=alertdialog] *, .app-topbar *, .app-tabbar *")) {
      if (!visible(el) || clippedByScroller(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) offscreen.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")} [${Math.round(r.left)}..${Math.round(r.right)}]`);
    }
    const smallFields = [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), select, textarea")]
      .filter(visible)
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => `${el.tagName.toLowerCase()}#${el.id || el.name || "?"} ${getComputedStyle(el).fontSize}`);
    const smallTargets = [...document.querySelectorAll("a[href], button, [role=button], [role=tab], [role=radio], [role=option], summary, select")]
      .filter(visible)
      .filter((el) => !el.closest(".sr-only"))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      // A target counts as small only when both the element and its 44px hit area are cramped: under 44px tall
      // or wide AND not text inside running prose (inline links in a paragraph are excluded by WCAG 2.5.8).
      .filter(({ el, r }) => (r.height < 44 || r.width < 44) && getComputedStyle(el).display !== "inline")
      .map(({ el, r }) => `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    const tabbar = document.querySelector(".app-tabbar");
    let hiddenEnd = 0;
    let hiddenBy = "";
    if (tabbar && getComputedStyle(tabbar).display !== "none") {
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, document.documentElement.scrollHeight);
      const main = document.querySelector("#main");
      let last = 0;
      for (const el of main.querySelectorAll("*")) {
        if (!visible(el)) continue;
        const b = el.getBoundingClientRect().bottom;
        if (b > last) {
          last = b;
          hiddenBy = `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")}`;
        }
      }
      hiddenEnd = Math.max(0, Math.round(last - tabbar.getBoundingClientRect().top));
      window.scrollTo(0, 0);
    }
    return {
      overflow: Math.max(document.documentElement.scrollWidth, window.innerWidth) - vw,
      offscreen: offscreen.slice(0, 5),
      smallFields,
      smallTargets,
      hiddenEnd,
      hiddenBy,
    };
  }, vw);
}

const findings = [];
async function sweep(page, label, route, prepare) {
  const agg = { overflow: 0, offscreen: new Set(), smallFields: new Set(), smallTargets: new Set(), hiddenEnd: 0 };
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(route);
    await page.waitForTimeout(900);
    if (prepare) await prepare(page);
    const r = await inspect(page, w);
    agg.overflow = Math.max(agg.overflow, r.overflow);
    r.offscreen.forEach((x) => agg.offscreen.add(`${w}: ${x}`));
    r.smallFields.forEach((x) => agg.smallFields.add(x));
    if (w <= 430) r.smallTargets.forEach((x) => agg.smallTargets.add(x));
    if (r.hiddenEnd > agg.hiddenEnd) agg.hiddenBy = `${w}: ${r.hiddenBy}`;
    agg.hiddenEnd = Math.max(agg.hiddenEnd, r.hiddenEnd);
    if (w === 320 || w === 393 || w === 768) await page.screenshot({ path: path.join(out, `${label}-${w}x${h}.png`) });
    if (w === 393) await page.screenshot({ path: path.join(out, `${label}-393-full.png`), fullPage: true });
  }
  findings.push({ label, ...agg });
  note(`${label}: no page overflow at 8 sizes`, agg.overflow <= 0, `${agg.overflow}px`);
  note(`${label}: nothing runs off the screen`, agg.offscreen.size === 0, [...agg.offscreen].slice(0, 3).join(" | "));
  note(`${label}: form fields are 16px+ (no iOS zoom)`, agg.smallFields.size === 0, [...agg.smallFields].slice(0, 3).join(" | "));
  note(`${label}: touch targets 44px+`, agg.smallTargets.size === 0, [...agg.smallTargets].slice(0, 4).join(" | "));
  note(`${label}: end of content clears the tab bar`, agg.hiddenEnd <= 0, `${agg.hiddenEnd}px ${agg.hiddenBy || ""}`.trim());
}

// Signed out.
const anonCtx = await phoneContext();
const anon = await anonCtx.newPage();
anon.on("console", (m) => m.type() === "error" && !/401|status of 404/.test(m.text()) && consoleErrors.push(m.text()));
for (const [label, route] of [
  ["login", "/login"],
  ["register", "/register"],
  ["forgot", "/forgot-password"],
  ["404-signed-out", "/deep/unknown"],
]) {
  await sweep(anon, label, route);
}
await anonCtx.close();

// Customer, with sizes on file and one request so the lists have content.
const custCtx = await phoneContext();
const cust = await custCtx.newPage();
cust.on("console", (m) => m.type() === "error" && !/401|status of 400|status of 404/.test(m.text()) && consoleErrors.push(m.text()));
await account(cust.request, "נועה", "לוי");
const fingers = {};
for (const hand of ["right", "left"]) {
  for (const [fingerId, size] of Object.entries({ thumb: 3, index: 6, middle: 5, ring: 7, pinky: 9 })) {
    fingers[`${hand}-${fingerId}`] = { handId: hand, fingerId, widthMm: 10 + size / 2, size, status: "confirmed" };
  }
}
await cust.request.post("/api/measurements/profile", { data: { measurements: fingers } });
await cust.request.post("/api/appointments", { data: { clientName: "נועה לוי", serviceId: 1, date: daysAhead(4), time: "12:00", requestKey: `mob-${Date.now()}` } });
for (const [label, route] of [
  ["home", "/"],
  ["services", "/services"],
  ["package", "/services/bad-bitch"],
  ["gallery", "/gallery"],
  ["build", "/build-a-set"],
  ["sizing", "/nail-sizing"],
  ["booking", "/booking"],
  ["appointments", "/appointments"],
  ["profile", "/profile"],
  ["404", "/no-such-page"],
]) {
  await sweep(cust, label, route);
}
// Sheets: the password sheet (a form inside a sheet).
await sweep(cust, "sheet-password", "/profile", async (p) => {
  await p.getByRole("button", { name: /שינוי סיסמה/ }).first().click();
  await p.getByRole("dialog").waitFor({ timeout: 5000 });
  await p.waitForTimeout(400);
});
const custState = await custCtx.storageState();
const customerId = (await (await cust.request.get("/api/auth/me")).json()).user?.id;
await custCtx.close();

// Staff.
const staffCtx = await phoneContext();
const staff = await staffCtx.newPage();
staff.on("console", (m) => m.type() === "error" && !/401|status of 404/.test(m.text()) && consoleErrors.push(m.text()));
const owner = await account(staff.request, "קסניה", "בדיקה");
await fetch(`${API}/__e2e/owner/${owner.user.id}`, { method: "POST" });
await staff.request.post("/api/auth/login", { data: { email: owner.email, password: "audit-pass-123", rememberMe: true } });
for (const [label, route] of [
  ["admin", "/admin"],
  ["admin-appointments", "/admin/appointments"],
  ["admin-customers", "/admin/customers"],
  ["admin-customer", `/admin/customers/${customerId}`],
  ["admin-more", "/admin/more"],
  ["admin-notifications", "/admin/notifications"],
  ["admin-content", "/admin/content"],
  ["admin-editor", "/admin/content/new"],
]) {
  await sweep(staff, label, route);
}
await staffCtx.close();
void custState;

note("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
fs.writeFileSync(path.join(out, "findings.json"), JSON.stringify(findings.map((f) => ({ ...f, offscreen: [...f.offscreen], smallFields: [...f.smallFields], smallTargets: [...f.smallTargets] })), null, 2));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
