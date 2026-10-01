import {
  composite,
  contrastRatio,
  hexToRgb,
  normalizeHex,
  oklchToRgb,
  relativeLuminance,
  rgbToHex,
  rgbToOklch,
} from "./color.js";

/** Bump when the derivation changes; cached palettes from another version are ignored and recomputed. */
export const PALETTE_VERSION = 2;

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
export const DEFAULT_META_COLOR = "#000000";

/** Brand violet (#b026ff, violet-400) — never themed: buttons, glow, logo and --brand-violet stay exactly as designed. */
export const BRAND_VIOLET = "#b026ff";

/**
 * Light text colours used on the dark default (violet accents and status messages). On a personal colour they
 * keep their hue and only move lighter/darker until they are readable; the defaults are the original values.
 */
export const INK_DEFAULTS = Object.freeze({
  "violet-100": "#f5e0ff",
  "violet-200": "#e6b8ff",
  "violet-300": "#d17dff",
  "red-300": "#fca5a5",
  "rose-300": "#fda4af",
  "amber-200": "#fde68a",
  "amber-300": "#fcd34d",
  "emerald-200": "#a7f3d0",
  "emerald-300": "#6ee7b7",
  "emerald-400": "#34d399",
});
export const INK_NAMES = Object.freeze(Object.keys(INK_DEFAULTS));

/** Stops of the `violet-text` gradient (same as tailwind `bg-violet-gradient`). */
export const VIOLET_GRADIENT_STOPS = Object.freeze([
  ["#f5e0ff", 0],
  ["#d17dff", 40],
  ["#b026ff", 70],
  ["#7a00bf", 100],
]);
const gradientCss = (stops) => `linear-gradient(135deg, ${stops.map(([c, p]) => `${c} ${p}%`).join(", ")})`;
export const DEFAULT_VIOLET_GRADIENT = gradientCss(VIOLET_GRADIENT_STOPS);

export const THEME_VARS = Object.freeze([
  ...OLED_LEVELS.map((l) => `--oled-${l}`),
  "--theme-fg",
  "--theme-fg-soft",
  "--theme-line",
  "--theme-border",
  "--theme-scheme",
  ...INK_NAMES.map((n) => `--ink-${n}`),
  "--theme-violet-gradient",
]);

const channels = (rgb) => rgb.map((c) => Math.round(c)).join(" ");
const rgba = (rgb, alpha) => `rgba(${rgb.map((c) => Math.round(c)).join(", ")}, ${alpha})`;
const num = (x) => String(Math.round(x * 1000) / 1000);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export const LIGHT_TEXT = Object.freeze([255, 255, 255]);
export const DARK_TEXT = Object.freeze([17, 17, 17]);

/** How much lighter (dark pages) or darker (very light pages) each surface is than the page, in OKLCH lightness. */
export const SURFACE_STEPS = Object.freeze({ 950: 0, 900: 0.05, 850: 0.075, 800: 0.1, 700: 0.14, 600: 0.19 });
/** `.glass-panel` paints oled-900 at 70% over the page. */
const GLASS_ALPHA = 0.7;
/**
 * Text uses white/xx classes; on a personal colour `--theme-fg-soft` (0.3–1) pulls translucent text toward solid
 * so it stays readable: effective alpha = 1 - (1 - alpha) * soft. 1 = the original look; 0.3 keeps a clear hierarchy.
 */
const MIN_SOFT = 0.3;
const effectiveAlpha = (alpha, soft) => 1 - (1 - alpha) * soft;

/** Minimum WCAG ratios checked for every personal palette. */
export const CONTRAST_TARGETS = Object.freeze({
  primaryText: 4.5,
  secondaryText: 4.5,
  mutedText: 4.5,
  placeholder: 3,
  inks: 4.5,
  violetText: 3,
});

function surfacesOf(scale) {
  const glass = composite(scale[900], GLASS_ALPHA, scale[950]);
  return { page: scale[950], glass, input: scale[850], card: scale[800] };
}

const minContrast = (fg, bgs) => Math.min(...bgs.map((bg) => contrastRatio(fg, bg)));
const minTextContrast = (fg, alpha, bgs) => Math.min(...bgs.map((bg) => contrastRatio(composite(fg, alpha, bg), bg)));

/** Text checks for a surface scale, text colour and softness. */
function textContrast(scale, fg, soft) {
  const s = surfacesOf(scale);
  const textBgs = [s.page, s.glass, s.card];
  const inputBg = composite(fg, 0.05, s.input);
  return {
    primaryText: minContrast(fg, [s.page, s.glass, s.input, s.card]),
    secondaryText: minTextContrast(fg, effectiveAlpha(0.6, soft), textBgs),
    mutedText: minTextContrast(fg, effectiveAlpha(0.4, soft), textBgs),
    placeholder: minTextContrast(fg, effectiveAlpha(0.35, soft), [inputBg]),
  };
}

const textPasses = (c) =>
  c.primaryText >= CONTRAST_TARGETS.primaryText &&
  c.secondaryText >= CONTRAST_TARGETS.secondaryText &&
  c.mutedText >= CONTRAST_TARGETS.mutedText &&
  c.placeholder >= CONTRAST_TARGETS.placeholder;

/** Largest softness (closest to the original translucent look) that still passes, or null. */
function bestSoftness(scale, fg) {
  if (!textPasses(textContrast(scale, fg, MIN_SOFT))) return null;
  if (textPasses(textContrast(scale, fg, 1))) return 1;
  let lo = MIN_SOFT;
  let hi = 1;
  for (let i = 0; i < 12; i += 1) {
    const mid = (lo + hi) / 2;
    if (textPasses(textContrast(scale, fg, mid))) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo * 1000) / 1000;
}

/**
 * Same hue and chroma, lightness moved toward the text colour only until it reads on every surface;
 * falls back to the text colour itself if no shade of that hue can.
 */
function adaptInk(rgb, bgs, min, towardDark, fallback) {
  if (minContrast(rgb, bgs) >= min) return rgb;
  const { L, C, h } = rgbToOklch(rgb);
  for (let step = 1; step <= 100; step += 1) {
    const next = clamp(towardDark ? L - step * 0.01 : L + step * 0.01, 0, 1);
    const candidate = oklchToRgb(next, C, h);
    if (minContrast(candidate, bgs) >= min) return candidate;
    if (next === 0 || next === 1) break;
  }
  return [...fallback];
}

function buildScale(pick, pageL, C, h, dir, exactPage) {
  return Object.fromEntries(
    OLED_LEVELS.map((l) => [
      l,
      l === 950 && exactPage ? [...pick] : oklchToRgb(clamp(pageL + dir * SURFACE_STEPS[l], 0, 1), C, h),
    ])
  );
}

/** A candidate page for one text mode, `shift` = how far the page had to move away from the text colour. */
function candidate(pick, oklch, mode, shift) {
  const fg = mode === "dark" ? DARK_TEXT : LIGHT_TEXT;
  const pageL = clamp(oklch.L + (mode === "dark" ? shift : -shift), 0, 1);
  // Cards step toward more contrast with the text where there is room: lighter under dark text (darker on very
  // light pages), lighter under white text on deep colours, darker on vivid mid-tones so the page keeps its colour.
  const dir = mode === "dark" ? (pageL > 0.8 ? -1 : 1) : pageL > 0.35 ? -1 : 1;
  const scale = buildScale(pick, pageL, oklch.C, oklch.h, dir, shift === 0);
  const soft = bestSoftness(scale, fg);
  return soft === null ? null : { mode, fg, scale, soft, shift };
}

function buildPalette(base, { mode, fg, scale, soft, line, border, scheme, inks, gradient }) {
  const vars = {
    ...Object.fromEntries(OLED_LEVELS.map((l) => [`--oled-${l}`, channels(scale[l])])),
    "--theme-fg": channels(fg),
    "--theme-fg-soft": num(soft),
    "--theme-line": num(line),
    "--theme-border": border,
    "--theme-scheme": scheme,
    ...Object.fromEntries(INK_NAMES.map((n) => [`--ink-${n}`, channels(inks[n])])),
    "--theme-violet-gradient": gradientCss(gradient),
  };
  const page = scale[950];
  return {
    version: PALETTE_VERSION,
    base,
    mode,
    vars,
    meta: rgbToHex(page),
    named: {
      pageBackground: rgbToHex(page),
      surfaceBackground: rgbToHex(scale[900]),
      inputBackground: rgbToHex(scale[850]),
      elevatedSurface: rgbToHex(scale[800]),
      textPrimary: rgbToHex(fg),
      textSecondary: rgbToHex(composite(fg, effectiveAlpha(0.6, soft), page)),
      icon: rgbToHex(composite(fg, effectiveAlpha(0.7, soft), page)),
      borderColor: border,
      selectedGlow: BRAND_VIOLET,
    },
    contrast: paletteContrast({ scale, fg, soft, inks, gradient }),
  };
}

/** Contrast of every checked text/UI colour against the palette's surfaces (minimum over the surfaces). */
export function paletteContrast({ scale, fg, soft, inks, gradient }) {
  const s = surfacesOf(scale);
  const inkBgs = [s.page, s.glass, s.input, s.card];
  return {
    ...textContrast(scale, fg, soft),
    inks: Math.min(...INK_NAMES.map((n) => minContrast(inks[n], inkBgs))),
    violetText: Math.min(...gradient.map(([hex]) => minContrast(hexToRgb(hex), [s.page, s.glass]))),
  };
}

export function meetsContrast(contrast) {
  return Object.entries(CONTRAST_TARGETS).every(([key, min]) => contrast[key] >= min);
}

const DEFAULT_SCALE = Object.freeze(Object.fromEntries(OLED_LEVELS.map((l) => [l, hexToRgb(DEFAULT_OLED_HEX[l])])));
const DEFAULT_INKS = Object.freeze(Object.fromEntries(INK_NAMES.map((n) => [n, hexToRgb(INK_DEFAULTS[n])])));
const DEFAULT_PARTS = Object.freeze({
  mode: "default",
  fg: LIGHT_TEXT,
  scale: DEFAULT_SCALE,
  soft: 1,
  line: 1,
  border: DEFAULT_BORDER,
  scheme: "normal",
  inks: DEFAULT_INKS,
  gradient: VIOLET_GRADIENT_STOPS,
});

export const DEFAULT_PALETTE = Object.freeze(buildPalette(null, DEFAULT_PARTS));
export const DEFAULT_THEME_VARS = DEFAULT_PALETTE.vars;

/** Black (and colours indistinguishable from it) means the original OLED look. */
const isBlackish = (rgb, C) => relativeLuminance(rgb) < 0.002 && C < 0.03;

/**
 * One base colour in, a full-colour site palette out (or null for an invalid input → caller uses the default).
 * - page: the chosen colour itself; surfaces are lighter/darker steps of the same hue and chroma;
 * - text: dark on light colours, white on dark ones (whichever needs the page to move least);
 * - if a colour can't carry readable text as is, only its lightness moves (hue and chroma kept, gamut-mapped)
 *   by the smallest amount that passes;
 * - translucent text is made more solid, accents and status colours change lightness, until all checks pass;
 * - brand violet (buttons, glow, logo) is never touched.
 */
export function derivePalette(input) {
  const base = normalizeHex(input);
  if (!base) return null;
  const pick = hexToRgb(base);
  const oklch = rgbToOklch(pick);
  if (isBlackish(pick, oklch.C)) return buildPalette(base, DEFAULT_PARTS);

  const prefer = contrastRatio(DARK_TEXT, pick) > contrastRatio(LIGHT_TEXT, pick) ? "dark" : "light";
  const modes = prefer === "dark" ? ["dark", "light"] : ["light", "dark"];
  let chosen = null;
  for (let step = 0; step <= 100 && !chosen; step += 1) {
    for (const mode of modes) {
      chosen = candidate(pick, oklch, mode, step * 0.01);
      if (chosen) break;
    }
  }
  if (!chosen) return null;

  const { mode, fg, scale, soft } = chosen;
  const s = surfacesOf(scale);
  const inkBgs = [s.page, s.glass, s.input, s.card];
  const towardDark = mode === "dark";
  const inks = Object.fromEntries(
    INK_NAMES.map((n) => [n, adaptInk(DEFAULT_INKS[n], inkBgs, CONTRAST_TARGETS.inks, towardDark, fg)])
  );
  const gradient = VIOLET_GRADIENT_STOPS.map(([hex, pos]) => [
    rgbToHex(adaptInk(hexToRgb(hex), [s.page, s.glass], CONTRAST_TARGETS.violetText, towardDark, fg)),
    pos,
  ]);

  return buildPalette(base, {
    mode,
    fg,
    scale,
    soft,
    line: 1.6,
    border: rgba(fg, 0.14),
    // `mode` names the text colour; CSS color-scheme names the background.
    scheme: mode === "dark" ? "light" : "dark",
    inks,
    gradient,
  });
}
