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

/** Colours that can carry readable text as they are: the page must be exactly the chosen colour. */
const EXACT = {
  white: "#ffffff",
  blue: "#0000ff",
  green: "#00ff00",
  yellow: "#ffff00",
  navy: "#1e3a8a",
  darkRed: "#8b0000",
  purple: "#6a0dad",
  neonGreen: "#39ff14",
  neonPink: "#ff10f0",
  lightBlue: "#87cefa",
  veryLight: "#e8f4ff",
  orange: "#ff8800",
  darkViolet: "#2e1065",
};
/** Mid-tones that need a small lightness nudge; hue and colourfulness must survive. */
const NUDGED = { red: "#ff0000", violet: "#b026ff", gray: "#808080", teal: "#008080", hotPink: "#ff00aa" };
const LIGHT_PICKS = ["white", "yellow", "green", "neonGreen", "lightBlue", "veryLight", "orange"];
const DARK_PICKS = ["blue", "navy", "darkRed", "purple", "darkViolet"];

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

describe("full-colour palette", () => {
  for (const [name, hex] of Object.entries(EXACT)) {
    it(`${name} (${hex}) fills the page with exactly that colour`, () => {
      const palette = derivePalette(hex);
      expectReadable(palette, name);
      expectLayered(palette, name);
      expect(palette.named.pageBackground).toBe(hex);
      expect(palette.meta).toBe(hex);
    });
  }

  for (const [name, hex] of Object.entries(NUDGED)) {
    it(`${name} (${hex}) keeps its hue and colour, only its lightness moves a little`, () => {
      const palette = derivePalette(hex);
      expectReadable(palette, name);
      expectLayered(palette, name);
      const input = oklchOf(hex);
      const page = oklchOf(palette.named.pageBackground);
      expect(Math.abs(page.L - input.L), name).toBeLessThanOrEqual(0.15);
      if (input.C > 0.04) {
        expect(hueDistance(page.h, input.h), name).toBeLessThanOrEqual(3);
        expect(page.C, name).toBeGreaterThanOrEqual(input.C * 0.6);
      }
    });
  }

  it("light colours get dark text (day mode), dark colours get white text (night mode)", () => {
    for (const name of LIGHT_PICKS) {
      const palette = derivePalette(EXACT[name]);
      expect(palette.mode, name).toBe("dark");
      expect(palette.vars["--theme-fg"], name).toBe("17 17 17");
      expect(palette.vars["--theme-scheme"], name).toBe("light");
    }
    for (const name of DARK_PICKS) {
      const palette = derivePalette(EXACT[name]);
      expect(palette.mode, name).toBe("light");
      expect(palette.vars["--theme-fg"], name).toBe("255 255 255");
      expect(palette.vars["--theme-scheme"], name).toBe("dark");
    }
  });

  it("white is a real light mode: white page, near-black text, light grey cards", () => {
    const palette = derivePalette("#ffffff");
    expect(palette.named.pageBackground).toBe("#ffffff");
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
    for (const [name, hex] of Object.entries({ ...EXACT, ...NUDGED })) {
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
    for (const hex of [...Object.values(EXACT), ...Object.values(NUDGED)]) {
      const palette = derivePalette(hex);
      expect(palette.contrast.inks, hex).toBeGreaterThanOrEqual(4.5);
      for (const [name, original] of Object.entries(INK_DEFAULTS)) {
        const ink = oklchOf(channelsToRgb(palette.vars[`--ink-${name}`]));
        const source = oklchOf(original);
        if (ink.C > 0.04 && source.C > 0.04) expect(hueDistance(ink.h, source.h), `${hex} ${name}`).toBeLessThanOrEqual(12);
      }
    }
  });

  it("every colour on the wheel and 3000 random colours give a readable, full-colour palette", () => {
    const inputs = [...randomHexes(3000)];
    for (let h = 0; h < 360; h += 3) {
      for (const [s, v] of [[1, 1], [0.25, 1], [1, 0.4], [0.6, 0.8], [1, 0.7]]) inputs.push(hsvToHex(h, s, v));
    }
    let maxShift = 0;
    for (const hex of inputs) {
      const palette = derivePalette(hex);
      if (palette.mode === "default") continue;
      expectReadable(palette, hex);
      const input = oklchOf(hex);
      const page = oklchOf(palette.named.pageBackground);
      maxShift = Math.max(maxShift, Math.abs(page.L - input.L));
      if (input.C > 0.06 && page.C > 0.04) expect(hueDistance(page.h, input.h), hex).toBeLessThanOrEqual(4);
    }
    expect(maxShift).toBeLessThanOrEqual(0.3);
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
    expect(document.documentElement.style.getPropertyValue("--oled-950")).toBe("255 255 255");
    expect(document.documentElement.style.getPropertyValue("--theme-fg")).toBe("17 17 17");
    expect(document.documentElement.dataset.theme).toBe("custom");
    expect(meta.getAttribute("content")).toBe("#ffffff");

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
