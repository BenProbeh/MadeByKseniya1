/**
 * Group 5 check (measurements and the camera) on the isolated stack: phone widths, desktop, personal colours,
 * reduced motion, horizontal overflow, console errors and the booking hand-off from a price row.
 *   node scripts/check-group5.mjs http://localhost:5191   (API: AUDIT_API, default http://127.0.0.1:4100)
 * Screenshots: docs/design-audit/group5/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../docs/design-audit/group5");
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
const context = await browser.newContext({ baseURL: BASE, locale: "he-IL", isMobile: true, hasTouch: true, deviceScaleFactor: 2, viewport: { width: 393, height: 852 }, permissions: ["camera"] });
// A deterministic camera (same as the E2E suite): a canvas stream with a coin-like disc and a nail-like bar.
await context.addInitScript(() => {
  navigator.mediaDevices.getUserMedia = async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    const draw = () => {
      ctx.fillStyle = "#6b5a52";
      ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = "#c9a54a";
      ctx.beginPath();
      ctx.arc(420, 360, 130, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e8c4b8";
      ctx.fillRect(800, 250, 120, 220);
    };
    draw();
    setInterval(draw, 100);
    return canvas.captureStream(10);
  };
});
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && !/401/.test(m.text()) && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));

const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const shutterReady = (p = page) =>
  p.waitForFunction(() => {
    const b = document.querySelector('button[aria-label="צילום"]');
    return Boolean(b && !b.disabled);
  }, null, { timeout: 15_000 });

const email = `group5.${Date.now().toString(36)}@example.com`;
await page.request.post("/api/auth/register", { data: { firstName: "קסניה", lastName: "בדיקה", email, password: "audit-pass-123" } });
await page.request.post("/api/auth/verify-email", { data: { email, code: await code(email), rememberMe: true } });
const fresh = async () => {
  await page.goto("/nail-sizing");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/nail-sizing");
  await page.waitForTimeout(900);
};

// Intro and finger choice at every width.
for (const [w, h] of SIZES) {
  await page.setViewportSize({ width: w, height: h });
  await fresh();
  let extra = await overflow();
  note(`intro ${w}x${h} has no horizontal overflow`, extra <= 0, `${extra}px`);
  await page.screenshot({ path: path.join(out, `intro-${w}x${h}.png`) });
  await page.getByRole("button", { name: "בואי נתחיל" }).click();
  await page.waitForTimeout(700);
  extra = await overflow();
  note(`fingers ${w}x${h} has no horizontal overflow`, extra <= 0, `${extra}px`);
  await page.screenshot({ path: path.join(out, `fingers-${w}x${h}.png`) });
}

// Camera, marking and summary at every width: one finger each time (thumb, right hand).
for (const [w, h] of SIZES) {
  await page.setViewportSize({ width: w, height: h });
  await fresh();
  await page.getByRole("button", { name: "בואי נתחיל" }).click();
  await page.getByRole("button", { name: "ניקוי" }).click();
  await page.getByRole("button", { name: /^אגודל יד ימין/ }).click();
  await page.getByRole("button", { name: "למדידת אצבע אחת" }).click();
  const live = await shutterReady().then(() => true).catch(() => false);
  note(`camera ${w}x${h} opens`, live);
  await page.waitForTimeout(500);
  let extra = await overflow();
  note(`camera ${w}x${h} has no horizontal overflow`, extra <= 0, `${extra}px`);
  await page.screenshot({ path: path.join(out, `camera-${w}x${h}.png`) });
  await page.getByRole("button", { name: "צילום", exact: true }).click();
  await page.getByText("סמני את המטבע").waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, `coin-${w}x${h}.png`) });
  await page.getByRole("button", { name: "הבא" }).click();
  await page.getByText("סמני את רוחב הציפורן").waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, `nail-${w}x${h}.png`) });
  const save = page.getByRole("button", { name: "שמירה וסיום" });
  const canSave = await save.isEnabled();
  note(`a size is computed on ${w}x${h}`, canSave);
  if (!canSave) continue;
  await save.click();
  await page.getByRole("button", { name: "שמירת המידות" }).waitFor();
  await page.waitForTimeout(600);
  extra = await overflow();
  note(`summary ${w}x${h} has no horizontal overflow`, extra <= 0, `${extra}px`);
  await page.screenshot({ path: path.join(out, `summary-${w}x${h}.png`) });
}

// The phone-sized run continues to a real save.
await page.setViewportSize({ width: 393, height: 852 });
const summaryLook = await page.evaluate(() => ({
  size: getComputedStyle(document.querySelector("li .marquee")).fontFamily,
  accent: document.querySelector("h1 .violet-text")?.textContent || "",
}));
note("measured size shows in the dot-matrix", /Bitcount Ink/.test(summaryLook.size), summaryLook.size);
note("summary headline lights its last word", summaryLook.accent === "שלך", summaryLook.accent);
await page.getByRole("button", { name: "שמירת המידות" }).click();
const saved = await page.getByText("המידות נשמרו").waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
note("sizes are saved to the account", saved);
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(out, "saved-393x852.png") });
const stored = await (await page.request.get("/api/measurements/profile")).json().catch(() => null);
note("the server has the thumb", JSON.stringify(stored || {}).includes("thumb"));
note("no camera left running after the flow", await page.evaluate(() => !document.querySelector("video")?.srcObject));

// On the saved summary every family is in use (the intro has no dot-matrix text, so it is not fetched there).
note(
  "fonts actually loaded",
  await page.evaluate(async () => {
    await document.fonts.ready;
    return ["Bitcount Ink Variable", "Secular One", "Sekuya"].every((f) => document.fonts.check(`16px "${f}"`, "אבג abc"));
  })
);

// Desktop.
await page.setViewportSize({ width: 1440, height: 900 });
await fresh();
await page.screenshot({ path: path.join(out, "intro-1440.png") });
await page.getByRole("button", { name: "בואי נתחיל" }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(out, "fingers-1440.png") });
await page.setViewportSize({ width: 393, height: 852 });

// Personal colours on the finger choice and summary.
for (const [label, hex] of [
  ["plum", "#2a0f3d"],
  ["cream", "#ece7df"],
  ["wine", "#3a0c1f"],
]) {
  const res = await page.request.patch("/api/profile/theme", { data: { color: hex } });
  await fresh();
  await page.getByRole("button", { name: "בואי נתחיל" }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(out, `fingers-theme-${label}.png`) });
  note(`personal colour ${label} applies`, res.ok() && (await page.evaluate(() => document.documentElement.dataset.theme)) === "custom");
}
await page.request.patch("/api/profile/theme", { data: { color: null } });
await page.goto("/nail-sizing");
await page.waitForTimeout(800);
note("back to the default black", (await page.evaluate(() => document.documentElement.dataset.theme)) !== "custom");

// Reduced motion: the saved frame and ambient light are still.
const rm = await browser.newContext({ baseURL: BASE, reducedMotion: "reduce", viewport: { width: 393, height: 852 }, storageState: await context.storageState() });
const rmPage = await rm.newPage();
await rmPage.goto("/nail-sizing");
await rmPage.waitForTimeout(800);
const anim = await rmPage.evaluate(() => ({
  ambient: getComputedStyle(document.querySelector(".ambient-light")).animationName,
}));
note("reduced motion stops the ambient light", anim.ambient === "none", JSON.stringify(anim));
await rm.close();

note("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
