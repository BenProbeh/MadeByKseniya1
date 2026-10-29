/**
 * The end-to-end test stack: an isolated API (in-memory database and email outbox, see
 * server/scripts/e2e-server.mjs), a Vite dev server proxied to it, and a phone-sized Chrome.
 * Never the developer's database and never production.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices, request } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, "..");
export const API_PORT = 4100;
export const WEB_PORT = 5180;
export const BASE_URL = `http://localhost:${WEB_PORT}`;

const children = [];

function start(command, args, env) {
  const child = spawn(command, args, { cwd: clientDir, env: { ...process.env, ...env }, shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => process.env.E2E_VERBOSE && process.stdout.write(d));
  child.stderr.on("data", (d) => process.env.E2E_VERBOSE && process.stderr.write(d));
  children.push(child);
  return child;
}

async function waitFor(url, timeoutMs = 90_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`timed out waiting for ${url}`);
}

let browser;

export async function startStack() {
  start("node", ["../server/scripts/e2e-server.mjs"], { E2E_API_PORT: String(API_PORT) });
  start("npx", ["vite", "--port", String(WEB_PORT), "--strictPort"], { VITE_API_PROXY: `http://127.0.0.1:${API_PORT}` });
  await waitFor(`http://127.0.0.1:${API_PORT}/api/health`);
  await waitFor(BASE_URL);
  browser = await chromium.launch({
    channel: process.env.E2E_BROWSER_CHANNEL || "chrome",
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
}

export async function stopStack() {
  await browser?.close().catch(() => {});
  for (const child of children) {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
}

/** A fresh phone context (Pixel-like, 393×852, Hebrew, Israel time) and its first page. */
export async function phone({ permissions = [], initScript } = {}) {
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    viewport: { width: 393, height: 852 },
    baseURL: BASE_URL,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    permissions,
  });
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  return { context, page };
}

export const apiContext = () => request.newContext({ baseURL: BASE_URL });

/** Waits until the locator is visible (Playwright web-first style) and returns it. */
export async function see(locator) {
  await locator.first().waitFor({ state: "visible" });
  return locator.first();
}

export async function gone(locator) {
  await locator.first().waitFor({ state: "detached" }).catch(async () => locator.first().waitFor({ state: "hidden" }));
}
