import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import tailwindConfig from "../../../tailwind.config.js";
import { hexToRgb, hsvToHex, hueDistance, rgbToOklch } from "./color.js";
import {
  BRAND_VIOLET,
  CONTRAST_TARGETS,
  DEFAULT_BORDER,
  DEFAULT_OLED_HEX,
  DEFAULT_PALETTE,
  DEFAULT_THEME_VARS,
  DEFAULT_VIOLET_GRADIENT,
  INK_DEFAULTS,
  OLED_LEVELS,
  PALETTE_VERSION,
  THEME_VARS,
  derivePalette,
  meetsContrast,
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
  white: "#ffffff",
  blue: "#0000ff",
  red: "#ff0000",
  green: "#00ff00",
  yellow: "#ffff00",
  orange: "#ff8000",
  pink: "#ff0080",
  hotPink: "#ff69b4",
  purple: "#8000ff",
  violet: "#b026ff",
  turquoise: "#40e0d0",
  cyan: "#00ffff",
  neonGreen: "#39ff14",
  neonPink: "#ff10f0",
  navy: "#1e3a8a",
  darkRed: "#8b0000",
  darkGreen: "#008000",
  teal: "#008080",
  gray: "#808080",
  lightBlue: "#87cefa",
  veryLight: "#e8f4ff",
  darkViolet: "#2e1065",
};
/** Light picks become calm light pages with dark text; the rest become deep pages with white text. */
const LIGHT_PICKS = ["white", "green", "yellow", "orange", "pink", "hotPink", "turquoise", "cyan", "neonGreen", "lightBlue", "veryLight"];
const DEEP_PICKS = ["blue", "red", "purple", "violet", "navy", "darkRed", "darkGreen", "teal", "darkViolet"];
/** The highest page chroma any personal colour may reach (deep reds); vivid picks get far less than they asked. */
const MAX_PAGE_CHROMA = 0.135;

const channelsToRgb = (value) => value.split(" ").map(Number);
const scaleOf = (palette) => Object.fromEntries(OLED_LEVELS.map((l) => [l, channelsToRgb(palette.vars[`--oled-${l}`])]));
const oklchOf = (rgbOrHex) => rgbToOklch(typeof rgbOrHex === "string" ? hexToRgb(rgbOrHex) : rgbOrHex);
const read = (rel) => readFileSync(resolve(process.cwd(), rel), "utf8");

/** Deterministic pseudo-random colours so the sweep is reproducible. */
function* randomHexes(count, seed = 1234567) {
  let x = seed;
  for (let i = 0; i < count; i += 1) {
    x = (x * 1103515245 + 12345) % 2147483648;
    yield `#${(x % 16777216).toString(16).padStart(6, "0")}`;
  }
}

function expectReadable(palette, label) {
  expect(palette, label).not.toBeNull();
  for (const [key, min] of Object.entries(CONTRAST_TARGETS)) {
    expect(palette.contrast[key], `${label} ${key}`).toBeGreaterThanOrEqual(min);
  }
  expect(meetsContrast(palette.contrast), label).toBe(true);
  for (const name of THEME_VARS) expect(isSafeThemeValue(name, palette.vars[name]), `${label} ${name}`).toBe(true);
}

/** Surfaces are visibly apart from the page and ordered (one direction, growing steps). */
function expectLayered(palette, label) {
  const L = Object.fromEntries(OLED_LEVELS.map((l) => [l, oklchOf(scaleOf(palette)[l]).L]));
  expect(Math.abs(L[800] - L[950]), label).toBeGreaterThanOrEqual(0.07);
  const steps = OLED_LEVELS.map((l) => L[l] - L[950]);
  const sign = Math.sign(steps[steps.length - 1]);
  steps.forEach((d, i) => i && expect(d * sign, `${label} ${OLED_LEVELS[i]}`).toBeGreaterThanOrEqual(steps[i - 1] * sign));
}

/** Page lightness sits in one of the two calm bands (with a little room for contrast nudges). */
function expectCalmLightness(palette, label) {
  const { L } = oklchOf(palette.named.pageBackground);
  const deep = L >= 0.2 && L <= 0.52;
  const light = L >= 0.75 && L <= 0.98;
  expect(deep || light, `${label} L=${L.toFixed(3)}`).toBe(true);
}

describe("refined full-colour palette", () => {
  for (const [name, hex] of Object.entries(SAMPLES)) {
    it(`${name} (${hex}) gives a clear but calm page: readable, layered, same hue, softened chroma`, () => {
      const palette = derivePalette(hex);
      expectReadable(palette, name);
      expectLayered(palette, name);
      expectCalmLightness(palette, name);
      const input = oklchOf(hex);
      const page = oklchOf(palette.named.pageBackground);
      expect(page.C, name).toBeLessThanOrEqual(MAX_PAGE_CHROMA);
      if (input.C > 0.2) expect(page.C, name).toBeLessThanOrEqual(input.C * 0.6);
      if (input.C > 0.06 && page.C > 0.03) expect(hueDistance(page.h, input.h), name).toBeLessThanOrEqual(14);
      expect(palette.named.pageBackground, name).not.toBe(hex);
    });
  }

  it("the colour stays clearly visible: chromatic picks keep real colour, nothing collapses to black", () => {
    for (const [name, hex] of Object.entries(SAMPLES)) {
      const input = oklchOf(hex);
      const page = oklchOf(derivePalette(hex).named.pageBackground);
      expect(page.L, name).toBeGreaterThanOrEqual(0.24);
      if (input.C >= 0.08 && !["purple", "violet"].includes(name)) expect(page.C, name).toBeGreaterThanOrEqual(0.05);
    }
  });

  it("each family lands where it should: deep blue, bordeaux, soft green, cream/gold, apricot, soft pink", () => {
    const at = (hex) => oklchOf(derivePalette(hex).named.pageBackground);
    const blue = at("#0000ff");
    expect(blue.L).toBeLessThan(0.45);
    expect(hueDistance(blue.h, 264)).toBeLessThanOrEqual(4);
    const red = at("#ff0000");
    expect(red.L).toBeLessThan(0.46);
    expect(red.h).toBeGreaterThanOrEqual(15);
    expect(red.h).toBeLessThanOrEqual(28);
    const green = at("#00ff00");
    expect(green.L).toBeGreaterThan(0.8);
    expect(green.C).toBeLessThanOrEqual(0.105);
    const yellow = at("#ffff00");
    expect(yellow.L).toBeGreaterThan(0.85);
    expect(yellow.h).toBeGreaterThanOrEqual(85);
    expect(yellow.h).toBeLessThanOrEqual(104);
    expect(yellow.C).toBeGreaterThanOrEqual(0.06);
    const orange = at("#ff8000");
    expect(orange.L).toBeGreaterThan(0.75);
    expect(hueDistance(orange.h, 53)).toBeLessThanOrEqual(6);
    const pink = at("#ff0080");
    expect(pink.L).toBeGreaterThan(0.75);
    expect(pink.C).toBeLessThanOrEqual(0.1);
  });

  it("colours next to brand violet stay quiet so violet buttons and glow keep standing out", () => {
    for (const hex of ["#b026ff", "#8000ff", "#9d4edd"]) {
      expect(oklchOf(derivePalette(hex).named.pageBackground).C, hex).toBeLessThanOrEqual(0.075);
    }
  });

  it("light picks get dark text (day mode), deep picks get white text (night mode)", () => {
    for (const name of LIGHT_PICKS) {
      const palette = derivePalette(SAMPLES[name]);
      expect(palette.mode, name).toBe("dark");
      expect(palette.vars["--theme-fg"], name).toBe("17 17 17");
      expect(palette.vars["--theme-scheme"], name).toBe("light");
    }
    for (const name of DEEP_PICKS) {
      const palette = derivePalette(SAMPLES[name]);
      expect(palette.mode, name).toBe("light");
      expect(palette.vars["--theme-fg"], name).toBe("255 255 255");
      expect(palette.vars["--theme-scheme"], name).toBe("dark");
    }
  });

  it("white is a real light mode on soft off-white: near-black text, light grey cards", () => {
    const palette = derivePalette("#ffffff");
    const page = oklchOf(palette.named.pageBackground);
    expect(page.L).toBeGreaterThanOrEqual(0.96);
    expect(page.L).toBeLessThan(0.99);
    expect(page.C).toBeLessThan(0.005);
    expect(palette.named.textPrimary).toBe("#111111");
    const card = oklchOf(palette.named.elevatedSurface);
    expect(card.L).toBeGreaterThan(0.85);
    expect(card.C).toBeLessThan(0.005);
    expect(palette.contrast.primaryText).toBeGreaterThanOrEqual(12);
  });

  it("black brings back the original OLED look", () => {
    const palette = derivePalette("#000000");
    expect(palette.vars).toEqual(DEFAULT_THEME_VARS);
    expect(palette.meta).toBe("#000000");
  });

  it("surfaces share the page's hue", () => {
    for (const [name, hex] of Object.entries(SAMPLES)) {
      const page = oklchOf(derivePalette(hex).named.pageBackground);
      if (page.C < 0.05) continue;
      for (const [level, rgb] of Object.entries(scaleOf(derivePalette(hex)))) {
        const surface = oklchOf(rgb);
        if (surface.C < 0.04) continue;
        expect(hueDistance(surface.h, page.h), `${name} ${level}`).toBeLessThanOrEqual(8);
      }
    }
  });

  it("accent and status colours keep their hue and are readable on every surface", () => {
    for (const hex of Object.values(SAMPLES)) {
      const palette = derivePalette(hex);
      expect(palette.contrast.inks, hex).toBeGreaterThanOrEqual(4.5);
      for (const [name, original] of Object.entries(INK_DEFAULTS)) {
        const ink = oklchOf(channelsToRgb(palette.vars[`--ink-${name}`]));
        const source = oklchOf(original);
        if (ink.C > 0.04 && source.C > 0.04) expect(hueDistance(ink.h, source.h), `${hex} ${name}`).toBeLessThanOrEqual(12);
      }
    }
  });

  it("every colour on the wheel and 3000 random colours give a readable, calm, same-hue palette", () => {
    const inputs = [...randomHexes(3000)];
    for (let h = 0; h < 360; h += 3) {
      for (const [s, v] of [[1, 1], [0.25, 1], [1, 0.4], [0.6, 0.8], [1, 0.7]]) inputs.push(hsvToHex(h, s, v));
    }
    for (const hex of inputs) {
      const palette = derivePalette(hex);
      if (palette.mode === "default") continue;
      expectReadable(palette, hex);
      expectCalmLightness(palette, hex);
      const input = oklchOf(hex);
      const page = oklchOf(palette.named.pageBackground);
      expect(page.C, hex).toBeLessThanOrEqual(MAX_PAGE_CHROMA);
      if (input.C > 0.06 && page.C > 0.03) expect(hueDistance(page.h, input.h), hex).toBeLessThanOrEqual(14);
    }
  }, 60_000);

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

describe("brand violet never changes", () => {
  it("no personal palette sets the brand variables or touches violet backgrounds", () => {
    for (const hex of ["#ffffff", "#0000ff", "#ff0000", "#00ff00", "#ffff00", BRAND_VIOLET]) {
      const vars = derivePalette(hex).vars;
      expect(Object.keys(vars).some((name) => name.startsWith("--brand"))).toBe(false);
    }
    const css = read("src/index.css");
    expect(css).toContain("--brand-violet: #b026ff;");
    expect(css).toContain("--brand-violet-glow: rgba(176, 38, 255, 0.5);");
    const { colors, backgroundImage, boxShadow } = tailwindConfig.theme.extend;
    expect(colors.violet[400]).toBe(BRAND_VIOLET);
    expect(backgroundImage["violet-gradient"]).toBe(DEFAULT_VIOLET_GRADIENT);
    expect(boxShadow.glow).toContain("rgba(176, 38, 255, 0.5)");
    expect(css).toMatch(/\.btn-violet \{\s*@apply[^;]*bg-violet-gradient text-oled-950/);
  });

  it("dark ink on violet buttons stays black", () => {
    expect(tailwindConfig.theme.extend.textColor.oled[950]).toBe("#000000");
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
    expect(DEFAULT_THEME_VARS["--theme-fg"]).toBe("255 255 255");
    expect(DEFAULT_THEME_VARS["--theme-fg-soft"]).toBe("1");
    expect(DEFAULT_THEME_VARS["--theme-line"]).toBe("1");
    expect(DEFAULT_THEME_VARS["--ink-violet-300"]).toBe("209 125 255");
    expect(DEFAULT_THEME_VARS["--ink-red-300"]).toBe("252 165 165");
    expect(DEFAULT_THEME_VARS["--theme-violet-gradient"]).toBe(DEFAULT_VIOLET_GRADIENT);
    expect(DEFAULT_BORDER).toBe("rgba(255, 255, 255, 0.08)");
  });

  it("tailwind reads surfaces, text and accents from the variables", () => {
    const { colors, textColor, borderColor, placeholderColor } = tailwindConfig.theme.extend;
    expect(textColor.oled).toEqual(DEFAULT_OLED_HEX);
    for (const l of OLED_LEVELS) expect(colors.oled[l]).toBe(`rgb(var(--oled-${l}) / <alpha-value>)`);
    expect(colors.white).toBe("rgb(var(--theme-fg) / <alpha-value>)");
    expect(textColor.white).toContain("var(--theme-fg-soft)");
    expect(placeholderColor.white).toBe(textColor.white);
    expect(borderColor.white).toContain("var(--theme-line)");
    for (const name of Object.keys(INK_DEFAULTS)) {
      const [hue, shade] = name.split("-");
      expect(textColor[hue][shade]).toBe(`rgb(var(--ink-${name}) / <alpha-value>)`);
    }
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
    const palette = derivePalette("#ffffff");
    applyPalette(palette);
    expect(document.documentElement.style.getPropertyValue("--oled-950")).toBe(palette.vars["--oled-950"]);
    expect(document.documentElement.style.getPropertyValue("--theme-fg")).toBe("17 17 17");
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
    const cases = {
      "--theme-violet-gradient": "url(https://evil.example/x.png)",
      "--theme-scheme": "dark; background: red",
      "--theme-fg-soft": "calc(1)",
      "--ink-red-300": "255 0 0;}",
    };
    for (const [name, value] of Object.entries(cases)) {
      expect(() => applyPalette({ ...palette, vars: { ...palette.vars, [name]: value } }), name).toThrow();
      expect(document.documentElement.style.getPropertyValue(name)).toBe("");
    }
  });

  it("caches only derived colours and reads them back", () => {
    const palette = derivePalette("#7f1d1d");
    writeThemeCache(palette);
    const stored = JSON.parse(localStorage.getItem(THEME_CACHE_KEY));
    expect(Object.keys(stored).sort()).toEqual(["c", "m", "v", "vars"]);
    expect(stored.v).toBe(PALETTE_VERSION);
    expect(readThemeCache()).toEqual(stored);
  });

  it("drops a corrupted, outdated or tampered cache", () => {
    const good = { v: PALETTE_VERSION, c: "#7f1d1d", m: "#7f1d1d", vars: derivePalette("#7f1d1d").vars };
    const cases = [
      "{not json",
      JSON.stringify({ ...good, v: 1 }),
      JSON.stringify({ ...good, v: PALETTE_VERSION + 1 }),
      JSON.stringify({ ...good, c: "red" }),
      JSON.stringify({ ...good, vars: { ...good.vars, "--oled-950": "0 0 0; background: url(x)" } }),
      JSON.stringify({ ...good, vars: { ...good.vars, "--theme-border": "expression(alert(1))" } }),
      JSON.stringify({ ...good, vars: { ...good.vars, "--theme-violet-gradient": "linear-gradient(url(x))" } }),
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

    it("knows exactly the variables the app sets", () => {
      const names = JSON.parse(code.match(/var NAMES = (\[[^\]]*\])/)[1]);
      expect(names).toEqual([...THEME_VARS]);
    });

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
      const v = PALETTE_VERSION;
      const cases = [
        "{oops",
        JSON.stringify({ v, c: "#0000ff", m: "#0000ff", vars: { ...vars, "--oled-900": "1 2 3;}body{display:none" } }),
        JSON.stringify({ v, c: "#0000ff", m: "#0000ff", vars: { ...vars, "--theme-scheme": "url(x)" } }),
        JSON.stringify({ v: 1, c: "#0000ff", m: "#0000ff", vars }),
        JSON.stringify({ v: 99, c: "#0000ff", m: "#0000ff", vars }),
        JSON.stringify({ v, c: "#0000ff", m: "javascript:1", vars }),
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
