import { normalizeHex } from "./color.js";
import { DEFAULT_META_COLOR, PALETTE_VERSION, THEME_VARS } from "./palette.js";

/** Device cache so the personal colour paints before React loads. Holds only derived colours — no user data. */
export const THEME_CACHE_KEY = "mbk-theme";

const CHANNELS = /^\d{1,3} \d{1,3} \d{1,3}$/;
const RGBA = /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, (0(\.\d{1,3})?|1)\)$/;
const HEX = /^#[0-9a-f]{6}$/;

/** Must stay in sync with the inline script in index.html (tests run both against the same inputs). */
export function isSafeThemeValue(name, value) {
  if (typeof value !== "string") return false;
  if (name.startsWith("--oled-")) return CHANNELS.test(value);
  if (name === "--theme-border") return RGBA.test(value);
  if (name === "--theme-tint") return value === "transparent" || RGBA.test(value);
  return false;
}

function metaThemeColor() {
  return typeof document === "undefined" ? null : document.querySelector('meta[name="theme-color"]');
}

export function applyPalette(palette) {
  const root = document.documentElement;
  for (const name of THEME_VARS) {
    const value = palette.vars[name];
    if (!isSafeThemeValue(name, value)) throw new Error(`unsafe theme value for ${name}`);
  }
  for (const name of THEME_VARS) root.style.setProperty(name, palette.vars[name]);
  root.dataset.theme = "custom";
  metaThemeColor()?.setAttribute("content", palette.meta);
}

/** Removes every override so `:root` in index.css (the original values) applies again. */
export function resetTheme() {
  const root = document.documentElement;
  for (const name of THEME_VARS) root.style.removeProperty(name);
  delete root.dataset.theme;
  metaThemeColor()?.setAttribute("content", DEFAULT_META_COLOR);
}

export function clearThemeCache() {
  try {
    localStorage.removeItem(THEME_CACHE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function writeThemeCache(palette) {
  try {
    localStorage.setItem(
      THEME_CACHE_KEY,
      JSON.stringify({ v: PALETTE_VERSION, c: palette.base, m: palette.meta, vars: palette.vars })
    );
  } catch {
    /* storage unavailable or full — the server value still applies after load */
  }
}

/** Returns a validated cache entry or null; a malformed or outdated entry is removed. */
export function readThemeCache() {
  let raw = null;
  try {
    raw = localStorage.getItem(THEME_CACHE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const valid =
      data &&
      data.v === PALETTE_VERSION &&
      normalizeHex(data.c) === data.c &&
      HEX.test(data.m) &&
      data.vars &&
      THEME_VARS.every((name) => isSafeThemeValue(name, data.vars[name]));
    if (valid) return data;
  } catch {
    /* fall through */
  }
  clearThemeCache();
  return null;
}
