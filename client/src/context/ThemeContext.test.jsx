import { useEffect, useState } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { derivePalette, PALETTE_VERSION, THEME_VARS } from "../lib/theme/palette.js";
import { THEME_CACHE_KEY, applyPalette, resetTheme } from "../lib/theme/runtime.js";

const h = vi.hoisted(() => ({ auth: null, update: null }));
vi.mock("./AuthContext.jsx", () => ({ useAuth: () => h.auth }));
vi.mock("../lib/authApi.js", () => ({ updateThemeRequest: (...args) => h.update(...args) }));

const { ThemeProvider, useTheme, SAVE_DELAY_MS, THEME_MESSAGES } = await import("./ThemeContext.jsx");

let theme;
function Probe() {
  theme = useTheme();
  return null;
}

function Harness({ user, loading = false }) {
  const [current, setCurrent] = useState(user);
  useEffect(() => setCurrent(user), [user]);
  h.auth = { user: current, loading, updateUser: (p) => setCurrent((prev) => (prev ? { ...prev, ...p } : p)) };
  return (
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  );
}

const BLUE = "#1e3a8a";
const RED = "#b91c1c";
const GREEN = "#15803d";
const dana = { id: 1, username: "dana", themeColor: BLUE };
const noa = { id: 2, username: "noa", themeColor: RED };
const ella = { id: 3, username: "ella", themeColor: null };

const rootVar = (name) => document.documentElement.style.getPropertyValue(name);
const noOverrides = () => THEME_VARS.every((name) => rootVar(name) === "");
const showing = (hex) => {
  const vars = derivePalette(hex).vars;
  return THEME_VARS.every((name) => rootVar(name) === vars[name]);
};
const cachedColor = () => JSON.parse(localStorage.getItem(THEME_CACHE_KEY) || "null")?.c ?? null;

beforeEach(() => {
  vi.useFakeTimers();
  h.update = vi.fn(async (color) => ({ themeColor: color }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetTheme();
  localStorage.clear();
});

describe("ThemeProvider", () => {
  it("signed-out visitors get the default and a stale cache is cleared", () => {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ v: PALETTE_VERSION, c: BLUE, m: "#000000", vars: derivePalette(BLUE).vars }));
    applyPalette(derivePalette(BLUE));
    render(<Harness user={null} />);
    expect(noOverrides()).toBe(true);
    expect(localStorage.getItem(THEME_CACHE_KEY)).toBeNull();
  });

  it("keeps the boot-script colours while the session is still loading", () => {
    applyPalette(derivePalette(BLUE));
    render(<Harness user={null} loading />);
    expect(showing(BLUE)).toBe(true);
  });

  it("applies each user's own colour and caches only theirs", () => {
    const { rerender } = render(<Harness user={dana} />);
    expect(showing(BLUE)).toBe(true);
    expect(cachedColor()).toBe(BLUE);

    rerender(<Harness user={noa} />);
    expect(showing(RED)).toBe(true);
    expect(cachedColor()).toBe(RED);

    rerender(<Harness user={ella} />);
    expect(noOverrides()).toBe(true);
    expect(localStorage.getItem(THEME_CACHE_KEY)).toBeNull();

    rerender(<Harness user={null} />);
    expect(noOverrides()).toBe(true);
    expect(localStorage.getItem(THEME_CACHE_KEY)).toBeNull();
  });

  it("an unsaved preview never carries over to the next account", () => {
    const { rerender } = render(<Harness user={dana} />);
    act(() => theme.previewColor(GREEN));
    expect(showing(GREEN)).toBe(true);
    rerender(<Harness user={ella} />);
    expect(noOverrides()).toBe(true);
    rerender(<Harness user={null} />);
    expect(noOverrides()).toBe(true);
  });

  it("a malformed saved colour falls back to the default without crashing", () => {
    render(<Harness user={{ ...ella, themeColor: "url(javascript:alert(1))" }} />);
    expect(noOverrides()).toBe(true);
    expect(theme.isCustom).toBe(false);
  });

  it("dragging previews instantly and saves once, after the pause", async () => {
    render(<Harness user={ella} />);
    act(() => {
      for (const hex of ["#100000", "#200000", "#300000", "#400000", "#500000"]) theme.previewColor(hex);
    });
    expect(showing("#500000")).toBe(true);
    expect(h.update).not.toHaveBeenCalled();

    act(() => theme.commitColor(GREEN));
    expect(showing(GREEN)).toBe(true);
    await act(async () => vi.advanceTimersByTime(SAVE_DELAY_MS - 50));
    expect(h.update).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(50));
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith(GREEN);
    expect(theme.savedColor).toBe(GREEN);
    expect(theme.status).toEqual({ state: "saved", message: THEME_MESSAGES.saved });
    expect(cachedColor()).toBe(GREEN);
  });

  it("quick successive picks are coalesced into one request", async () => {
    render(<Harness user={ella} />);
    act(() => {
      theme.commitColor("#123456");
      theme.commitColor("#234567");
      theme.commitColor(BLUE);
    });
    await act(async () => vi.advanceTimersByTime(SAVE_DELAY_MS));
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith(BLUE);
  });

  it("a failed save goes back to the last saved colour with a clear message", async () => {
    h.update = vi.fn(async () => {
      throw new Error("network");
    });
    render(<Harness user={dana} />);
    act(() => theme.commitColor(GREEN));
    expect(showing(GREEN)).toBe(true);
    await act(async () => vi.advanceTimersByTime(SAVE_DELAY_MS));
    expect(showing(BLUE)).toBe(true);
    expect(theme.savedColor).toBe(BLUE);
    expect(theme.status).toEqual({ state: "error", message: THEME_MESSAGES.saveFailed });
    expect(cachedColor()).toBe(BLUE);
  });

  it("reset shows the exact default at once, stores null and clears the cache", async () => {
    let resolve;
    h.update = vi.fn(() => new Promise((r) => (resolve = r)));
    render(<Harness user={dana} />);
    expect(showing(BLUE)).toBe(true);

    let pending;
    act(() => {
      pending = theme.resetToDefault();
    });
    expect(noOverrides()).toBe(true);
    expect(document.documentElement.getAttribute("style") || "").toBe("");
    expect(h.update).toHaveBeenCalledWith(null);

    await act(async () => {
      resolve({ themeColor: null });
      await pending;
    });
    expect(theme.savedColor).toBe(null);
    expect(theme.isCustom).toBe(false);
    expect(theme.status).toEqual({ state: "saved", message: THEME_MESSAGES.reset });
    expect(localStorage.getItem(THEME_CACHE_KEY)).toBeNull();
    expect(noOverrides()).toBe(true);
  });

  it("a failed reset keeps the saved colour", async () => {
    h.update = vi.fn(async () => {
      throw new Error("down");
    });
    render(<Harness user={dana} />);
    await act(async () => theme.resetToDefault());
    expect(showing(BLUE)).toBe(true);
    expect(theme.status).toEqual({ state: "error", message: THEME_MESSAGES.resetFailed });
  });
});
