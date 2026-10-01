import {
  clamp01,
  composite,
  contrastRatio,
  hexToRgb,
  hueDistance,
  normalizeHex,
  oklchToRgb,
  relativeLuminance,
  rgbToHex,
  rgbToOklch,
} from "./color.js";

/** Bump when the derivation changes; cached palettes from another version are ignored and recomputed. */
export const PALETTE_VERSION = 1;

export const OLED_LEVELS = Object.freeze([950, 900, 850, 800, 700, 600]);

/**
 * The site's colours as they were before personal colours existed (tailwind `oled` scale, glass/hairline
 * border, browser chrome colour). `:root` in index.css and the fixed text colours in tailwind.config.js must
 * match these exactly — tests enforce it — so "back to default" restores precisely this.
 */
export const DEFAULT_OLED_HEX = Object.freeze({
  950: "#000000",
  900: "#07050c",
  850: "#0f0916",
  800: "#170f22",
  700: "#251536",
  600: "#371d4f",
});
export const DEFAULT_BORDER = "rgba(255, 255, 255, 0.08)";
export const DEFAULT_TINT = "transparent";
export const DEFAULT_META_COLOR = "#000000";

export const THEME_VARS = Object.freeze([...OLED_LEVELS.map((l) => `--oled-${l}`), "--theme-border", "--theme-tint"]);

const channels = (rgb) => rgb.map((c) => Math.round(c)).join(" ");
const rgba = (rgb, alpha) => `rgba(${rgb.map((c) => Math.round(c)).join(", ")}, ${alpha})`;

export const DEFAULT_THEME_VARS = Object.freeze({
  ...Object.fromEntries(OLED_LEVELS.map((l) => [`--oled-${l}`, channels(hexToRgb(DEFAULT_OLED_HEX[l]))])),
  "--theme-border": DEFAULT_BORDER,
  "--theme-tint": DEFAULT_TINT,
});

/** Brand violet (#b026ff, violet-400) — never themed; the palette keeps clear of it. */
export const BRAND_VIOLET = "#b026ff";
const BRAND_HUE = rgbToOklch(hexToRgb(BRAND_VIOLET)).h;

/**
 * OKLCH targets per surface. Lightness stays in the OLED range (page darkest, each surface a step lighter);
 * chroma is a ceiling that the user's own colourfulness scales down from.
 */
export const LIGHTNESS_LADDER = Object.freeze({
  950: { L: 0.115, C: 0.03 },
  900: { L: 0.15, C: 0.034 },
  850: { L: 0.185, C: 0.038 },
  800: { L: 0.225, C: 0.042 },
  700: { L: 0.285, C: 0.048 },
  600: { L: 0.345, C: 0.054 },
});

/** Very dark yellow reads as olive; yellows are warmed toward gold so they land on a deep brown-gold. */
const YELLOW_CENTER = 108;
const YELLOW_WIDTH = 28;
const YELLOW_WARMING = 26;

export function oledHue(h) {
  const warm = Math.max(0, 1 - hueDistance(h, YELLOW_CENTER) / YELLOW_WIDTH);
  return (h - YELLOW_WARMING * warm + 360) % 360;
}

/** Text and UI colours that must stay readable on every derived palette. */
const WHITE = [255, 255, 255];
const CHECKS = Object.freeze({
  primaryText: { min: 7 },
  secondaryText: { min: 4.5 },
  violetText: { min: 4.5, color: hexToRgb("#d17dff") },
  errorText: { min: 4.5, color: hexToRgb("#fca5a5") },
  successText: { min: 4.5, color: hexToRgb("#6ee7b7") },
  warningText: { min: 4.5, color: hexToRgb("#fcd34d") },
  placeholder: { min: 3 },
  brandOnPage: { min: 3, color: hexToRgb(BRAND_VIOLET) },
});

/** Contrast of the important text/UI colours against a palette (card = lightest common surface, oled-800). */
export function paletteContrast(scale) {
  const page = scale[950];
  const card = scale[800];
  const input = composite(WHITE, 0.03, card);
  return {
    primaryText: contrastRatio(WHITE, card),
    secondaryText: contrastRatio(composite(WHITE, 0.6, card), card),
    violetText: contrastRatio(CHECKS.violetText.color, card),
    errorText: contrastRatio(CHECKS.errorText.color, card),
    successText: contrastRatio(CHECKS.successText.color, card),
    warningText: contrastRatio(CHECKS.warningText.color, card),
    placeholder: contrastRatio(composite(WHITE, 0.4, input), input),
    brandOnPage: contrastRatio(CHECKS.brandOnPage.color, page),
  };
}

export function meetsContrast(scale) {
  const ratios = paletteContrast(scale);
  const readable = Object.entries(CHECKS).every(([key, { min }]) => ratios[key] >= min);
  const lum = OLED_LEVELS.map((l) => relativeLuminance(scale[l]));
  const layered = lum.every((v, i) => i === 0 || v > lum[i - 1]);
  return readable && layered;
}

function buildPalette(base, scale, { border, tint, glow }) {
  const vars = {
    ...Object.fromEntries(OLED_LEVELS.map((l) => [`--oled-${l}`, channels(scale[l])])),
    "--theme-border": border,
    "--theme-tint": tint,
  };
  return {
    version: PALETTE_VERSION,
    base,
    vars,
    meta: rgbToHex(scale[950]),
    named: {
      pageBackground: rgbToHex(scale[950]),
      surfaceBackground: rgbToHex(scale[900]),
      inputBackground: rgbToHex(scale[850]),
      elevatedSurface: rgbToHex(scale[800]),
      borderColor: border,
      subtleTint: tint,
      selectedGlow: glow,
    },
    contrast: paletteContrast(scale),
  };
}

export const DEFAULT_PALETTE = Object.freeze(
  buildPalette(
    null,
    Object.fromEntries(OLED_LEVELS.map((l) => [l, hexToRgb(DEFAULT_OLED_HEX[l])])),
    { border: DEFAULT_BORDER, tint: DEFAULT_TINT, glow: BRAND_VIOLET }
  )
);

/**
 * One base colour in, a safe dark OLED palette out (or null for an invalid input → caller uses the default).
 * - hue: the user's hue (yellows warmed slightly toward gold, see oledHue);
 * - lightness: fixed OLED ladder, slightly darker still for very dark picks (black stays ~black);
 * - chroma: scaled by how colourful the pick is (greys/white → neutral), capped per level, toned down next to
 *   the brand hue so violet buttons stay distinct, then gamut-mapped;
 * - if any readability check fails, everything is darkened and desaturated step by step until it passes.
 */
export function derivePalette(input) {
  const base = normalizeHex(input);
  if (!base) return null;
  const { L, C, h: pickedHue } = rgbToOklch(hexToRgb(base));
  const h = oledHue(pickedHue);

  const colourfulness = clamp01((C - 0.02) / 0.1);
  const nearBrand = hueDistance(h, BRAND_HUE) < 25 ? 0.85 : 1;
  const chromaScale = Math.sqrt(colourfulness) * nearBrand;
  let shift = (1 - clamp01(L / 0.45)) * 0.045;
  let chromaMul = 1;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const scale = Object.fromEntries(
      OLED_LEVELS.map((l) => {
        const target = LIGHTNESS_LADDER[l];
        return [l, oklchToRgb(Math.max(0.02, target.L - shift), target.C * chromaScale * chromaMul, h)];
      })
    );
    if (meetsContrast(scale)) {
      const neutral = chromaScale === 0;
      return buildPalette(base, scale, {
        border: neutral ? DEFAULT_BORDER : rgba(oklchToRgb(0.82, 0.09 * chromaScale, h), 0.12),
        tint: neutral ? DEFAULT_TINT : rgba(oklchToRgb(0.5, 0.14 * chromaScale, h), 0.14),
        glow: neutral ? "#ffffff" : rgbToHex(oklchToRgb(0.72, 0.15 * chromaScale, h)),
      });
    }
    shift += 0.01;
    chromaMul *= 0.9;
  }
  return null;
}
