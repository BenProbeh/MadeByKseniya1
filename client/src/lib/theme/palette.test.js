import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import tailwindConfig from "../../../tailwind.config.js";
import { contrastRatio, hexToRgb, hsvToHex, hueDistance, relativeLuminance, rgbToOklch } from "./color.js";
import {
  BRAND_VIOLET,
  DEFAULT_BORDER,
  DEFAULT_OLED_HEX,
  DEFAULT_PALETTE,
  DEFAULT_THEME_VARS,
  OLED_LEVELS,
  PALETTE_VERSION,
  THEME_VARS,
  derivePalette,
  meetsContrast,
  oledHue,
} from "./palette.js";
import {
  THEME_CACHE_KEY,
  applyPalette,
  isSafeThemeValue,
  readThemeCache,
  resetTheme,
  writeThemeCache,
} from "./runtime.js";

const SAMPLES = {
  blue: "#0000ff",
  red: "#ff0000",
  green: "#00ff00",
  yellow: "#ffff00",
  violet: "#b026ff",
  white: "#ffffff",
  black: "#000000",
  neonGreen: "#39ff14",
  neonPink: "#ff10f0",
  veryLight: "#e8f4ff",
  lightBlue: "#87cefa",
  highSaturation: "#ff00aa",
  gray: "#bbbbbb",
};
const NEUTRAL = ["white", "black", "gray"];

const channelsToRgb = (value) => value.split(" ").map(Number);
const scaleOf = (palette) => Object.fromEntries(OLED_LEVELS.map((l) => [l, channelsToRgb(palette.vars[`--oled-${l}`])]));
const read = (rel) => readFileSync(resolve(process.cwd(), rel), "utf8");

/** Deterministic pseudo-random colours so the sweep is reproducible. */
function* randomHexes(count, seed = 1234567) {
  let x = seed;
  for (let i = 0; i < count; i += 1) {
    x = (x * 1103515245 + 12345) % 2147483648;
    yield `#${(x % 16777216).toString(16).padStart(6, "0")}`;
  }
}

describe("derived OLED palette", () => {
  for (const [name, hex] of Object.entries(SAMPLES)) {
    it(`${name} (${hex}) becomes a dark, readable, layered palette`, () => {
      const palette = derivePalette(hex);
      expect(palette).not.toBeNull();
      const scale = scaleOf(palette);

      expect(rgbToOklch(scale[950]).L).toBeLessThanOrEqual(0.12);
      for (const l of OLED_LEVELS) expect(rgbToOklch(scale[l]).L).toBeLessThanOrEqual(0.35);
      expect(relativeLuminance(scale[950])).toBeLessThan(0.012);
      if (name !== "black") expect(palette.named.pageBackground).not.toBe(hex);

      expect(meetsContrast(scale)).toBe(true);
      expect(palette.contrast.primaryText).toBeGreaterThanOrEqual(7);
      expect(palette.contrast.secondaryText).toBeGreaterThanOrEqual(4.5);
      expect(palette.contrast.violetText).toBeGreaterThanOrEqual(4.5);
      expect(palette.contrast.errorText).toBeGreaterThanOrEqual(4.5);
      expect(palette.contrast.successText).toBeGreaterThanOrEqual(4.5);
      expect(palette.contrast.warningText).toBeGreaterThanOrEqual(4.5);
      expect(palette.contrast.placeholder).toBeGreaterThanOrEqual(3);
      expect(palette.contrast.brandOnPage).toBeGreaterThanOrEqual(3);

      const lum = OLED_LEVELS.map((l) => relativeLuminance(scale[l]));
      lum.forEach((v, i) => i && expect(v).toBeGreaterThan(lum[i - 1]));
      const defaultCardStep = contrastRatio(hexToRgb(DEFAULT_OLED_HEX[800]), hexToRgb(DEFAULT_OLED_HEX[950]));
      expect(contrastRatio(scale[800], scale[950])).toBeGreaterThanOrEqual(defaultCardStep * 0.98);

      for (const name of THEME_VARS) expect(isSafeThemeValue(name, palette.vars[name])).toBe(true);
    });
  }

  it("keeps the user's hue", () => {
    for (const [name, hex] of Object.entries(SAMPLES)) {
      const input = rgbToOklch(hexToRgb(hex));
      if (NEUTRAL.includes(name) || input.C < 0.04) continue;
      const out = rgbToOklch(scaleOf(derivePalette(hex))[600]);
      expect(hueDistance(oledHue(input.h), out.h), name).toBeLessThanOrEqual(12);
      expect(out.C, name).toBeGreaterThan(0.015);
      if (hueDistance(input.h, 108) >= 28) expect(oledHue(input.h)).toBeCloseTo(input.h, 6);
    }
  });

  it("yellow becomes a deep brown-gold rather than olive", () => {
    const yellow = rgbToOklch(hexToRgb("#ffff00"));
    const out = rgbToOklch(scaleOf(derivePalette("#ffff00"))[700]);
    expect(out.h).toBeGreaterThanOrEqual(75);
    expect(out.h).toBeLessThanOrEqual(95);
    expect(hueDistance(yellow.h, out.h)).toBeLessThanOrEqual(30);
    const [r, g, b] = scaleOf(derivePalette("#ffff00"))[700];
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it("turns white, grey and black into neutral OLED greys", () => {
    for (const name of NEUTRAL) {
      const palette = derivePalette(SAMPLES[name]);
      for (const [r, g, b] of Object.values(scaleOf(palette))) {
        expect(Math.max(r, g, b) - Math.min(r, g, b), name).toBeLessThanOrEqual(1);
      }
      expect(palette.vars["--theme-border"]).toBe(DEFAULT_BORDER);
      expect(palette.vars["--theme-tint"]).toBe("transparent");
    }
  });

  it("black stays close to the site default", () => {
    const scale = scaleOf(derivePalette("#000000"));
    for (const l of [950, 900]) {
      const def = hexToRgb(DEFAULT_OLED_HEX[l]);
      scale[l].forEach((c, i) => expect(Math.abs(c - def[i])).toBeLessThanOrEqual(8));
    }
  });

  it("a violet pick stays clearly apart from the brand violet", () => {
    const scale = scaleOf(derivePalette(BRAND_VIOLET));
    expect(contrastRatio(hexToRgb(BRAND_VIOLET), scale[950])).toBeGreaterThanOrEqual(3);
    expect(rgbToOklch(scale[950]).C).toBeLessThan(rgbToOklch(hexToRgb(BRAND_VIOLET)).C / 4);
  });

  it("every colour on the wheel and 3000 random colours give a safe palette", () => {
    const inputs = [...randomHexes(3000)];
    for (let h = 0; h < 360; h += 3) {
      for (const [s, v] of [[1, 1], [0.25, 1], [1, 0.4], [0.6, 0.8]]) inputs.push(hsvToHex(h, s, v));
    }
    for (const hex of inputs) {
      const palette = derivePalette(hex);
      expect(palette, hex).not.toBeNull();
      const scale = scaleOf(palette);
      expect(meetsContrast(scale), hex).toBe(true);
      expect(relativeLuminance(scale[950]), hex).toBeLessThan(0.012);
    }
  });

  it("rejects anything that isn't a hex colour", () => {
    for (const bad of [null, undefined, "", "red", "#12", "#1234567", "<script>", "url(x)", "#fff;x", 123, {}, []]) {
      expect(derivePalette(bad)).toBeNull();
    }
    expect(derivePalette("#ABCDEF").base).toBe("#abcdef");
  });

  it("is deterministic", () => {
    expect(derivePalette("#1e3a8a")).toEqual(derivePalette("#1E3A8A"));
  });
});

describe("site default is preserved exactly", () => {
  it("index.css :root holds the original values", () => {
    const css = read("src/index.css");
    for (const [name, value] of Object.entries(DEFAULT_THEME_VARS)) {
      expect(css).toContain(`${name}: ${value};`);
    }
    expect(DEFAULT_THEME_VARS["--oled-950"]).toBe("0 0 0");
    expect(DEFAULT_THEME_VARS["--oled-900"]).toBe("7 5 12");
    expect(DEFAULT_BORDER).toBe("rgba(255, 255, 255, 0.08)");
  });

  it("tailwind keeps the original ink colours and reads surfaces from the variables", () => {
    const { colors, textColor } = tailwindConfig.theme.extend;
    expect(textColor.oled).toEqual(DEFAULT_OLED_HEX);
    for (const l of OLED_LEVELS) expect(colors.oled[l]).toBe(`rgb(var(--oled-${l}) / <alpha-value>)`);
    expect(colors.violet[400]).toBe(BRAND_VIOLET);
  });

  it("the default palette is the original one", () => {
    expect(DEFAULT_PALETTE.vars).toEqual(DEFAULT_THEME_VARS);
    expect(DEFAULT_PALETTE.meta).toBe("#000000");
    expect(read("index.html")).toContain('<meta name="theme-color" content="#000000" />');
  });
});

describe("applying, resetting and caching", () => {
  function addMeta() {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", "#000000");
    document.head.appendChild(meta);
    return meta;
  }

  afterEach(() => {
    resetTheme();
    localStorage.clear();
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  });

  it("reset removes every override so the CSS defaults apply again", () => {
    const meta = addMeta();
    const palette = derivePalette("#0000ff");
    applyPalette(palette);
    expect(document.documentElement.style.getPropertyValue("--oled-950")).toBe(palette.vars["--oled-950"]);
    expect(document.documentElement.dataset.theme).toBe("custom");
    expect(meta.getAttribute("content")).toBe(palette.meta);

    resetTheme();
    for (const name of THEME_VARS) expect(document.documentElement.style.getPropertyValue(name)).toBe("");
    expect(document.documentElement.getAttribute("style") || "").toBe("");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(meta.getAttribute("content")).toBe("#000000");
  });

  it("refuses to apply an unsafe value", () => {
    const palette = derivePalette("#0000ff");
    const bad = { ...palette, vars: { ...palette.vars, "--theme-tint": "url(https://evil.example/x.png)" } };
    expect(() => applyPalette(bad)).toThrow();
    expect(document.documentElement.style.getPropertyValue("--theme-tint")).toBe("");
  });

  it("caches only derived colours and reads them back", () => {
    const palette = derivePalette("#7f1d1d");
    writeThemeCache(palette);
    const stored = JSON.parse(localStorage.getItem(THEME_CACHE_KEY));
    expect(Object.keys(stored).sort()).toEqual(["c", "m", "v", "vars"]);
    expect(readThemeCache()).toEqual(stored);
  });

  it("drops a corrupted, outdated or tampered cache", () => {
    const good = { v: PALETTE_VERSION, c: "#7f1d1d", m: "#000000", vars: derivePalette("#7f1d1d").vars };
    const cases = [
      "{not json",
      JSON.stringify({ ...good, v: PALETTE_VERSION + 1 }),
      JSON.stringify({ ...good, c: "red" }),
      JSON.stringify({ ...good, vars: { ...good.vars, "--oled-950": "0 0 0; background: url(x)" } }),
      JSON.stringify({ ...good, vars: { ...good.vars, "--theme-border": "expression(alert(1))" } }),
      JSON.stringify(null),
    ];
    for (const raw of cases) {
      localStorage.setItem(THEME_CACHE_KEY, raw);
      expect(readThemeCache(), raw).toBeNull();
      expect(localStorage.getItem(THEME_CACHE_KEY)).toBeNull();
    }
  });

  describe("boot script in index.html", () => {
    const html = read("index.html");
    const code = html.match(/<script id="mbk-theme-boot">([\s\S]*?)<\/script>/)[1];
    const runBoot = () => new Function(code)();

    it("paints the cached colours before the app loads", () => {
      const meta = addMeta();
      const palette = derivePalette("#0000ff");
      writeThemeCache(palette);
      runBoot();
      for (const name of THEME_VARS) {
        expect(document.documentElement.style.getPropertyValue(name)).toBe(palette.vars[name]);
      }
      expect(meta.getAttribute("content")).toBe(palette.meta);
    });

    it("ignores and removes a bad cache without throwing", () => {
      const vars = derivePalette("#0000ff").vars;
      const cases = [
        "{oops",
        JSON.stringify({ v: 1, c: "#0000ff", m: "#000000", vars: { ...vars, "--oled-900": "1 2 3;}body{display:none" } }),
        JSON.stringify({ v: 99, c: "#0000ff", m: "#000000", vars }),
        JSON.stringify({ v: 1, c: "#0000ff", m: "javascript:1", vars }),
      ];
      for (const raw of cases) {
        localStorage.setItem(THEME_CACHE_KEY, raw);
        expect(runBoot).not.toThrow();
        expect(document.documentElement.getAttribute("style") || "", raw).toBe("");
        expect(localStorage.getItem(THEME_CACHE_KEY)).toBeNull();
      }
    });

    it("does nothing without a cache", () => {
      runBoot();
      expect(document.documentElement.getAttribute("style") || "").toBe("");
    });
  });
});
