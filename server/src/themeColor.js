/** A user's personal site colour is stored as a normalised "#rrggbb" base colour; the dark palette is derived client-side. */
const HEX_INPUT = /^#?([0-9a-fA-F]{6})$/;
const HEX_STORED = /^#[0-9a-f]{6}$/;

export const MAX_PALETTE_VERSION = 100;

/** Accepts "#RRGGBB" / "RRGGBB" only. Anything else (names, rgb(), url(), CSS fragments) is rejected. */
export function normalizeThemeColor(value) {
  if (typeof value !== "string" || value.length > 7) return null;
  const m = value.trim().match(HEX_INPUT);
  return m ? `#${m[1].toLowerCase()}` : null;
}

/** Defensive read: a value that somehow isn't a valid stored colour falls back to the default (null). */
export function storedThemeColor(value) {
  return typeof value === "string" && HEX_STORED.test(value) ? value : null;
}

export function validPaletteVersion(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_PALETTE_VERSION;
}
