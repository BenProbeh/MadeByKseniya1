import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizePhone, telHref } from "./phone.js";
import { PACKAGE_DETAILS } from "./packageData.js";
import { RESERVED_SLUGS, safeHref, safeImageUrl, slugProblem } from "./contentPages.js";
import { PACKAGE_CATALOG, resolvePackageKey } from "../../../server/src/packageCatalog.js";

describe("phone helper (mirrors the server)", () => {
  it("normalises every common Israeli format to the same E.164 number and display", () => {
    for (const raw of ["050-1234567", "050 123 4567", "0501234567", "+972501234567", "972501234567", "+972-50-123-4567"]) {
      expect(normalizePhone(raw)).toEqual({ ok: true, e164: "+972501234567", display: "050-123-4567" });
    }
  });

  it("gives friendly errors for empty, invalid, landline and foreign numbers", () => {
    expect(normalizePhone("").error).toMatch(/יש להזין/);
    expect(normalizePhone("abc").error).toMatch(/לא נראה תקין/);
    expect(normalizePhone("03-1234567").error).toMatch(/נייד ישראלי/);
    expect(normalizePhone("+14155552671").error).toMatch(/נייד ישראלי/);
  });

  it("builds tel: links only from E.164 numbers", () => {
    expect(telHref("+972501234567")).toBe("tel:+972501234567");
    expect(telHref("050-1234567")).toBeNull();
    expect(telHref("javascript:alert(1)")).toBeNull();
    expect(telHref(null)).toBeNull();
  });
});

describe("package catalog stays in sync with the server", () => {
  it("every bookable option has a key the server resolves to the same price", () => {
    for (const [slug, pkg] of Object.entries(PACKAGE_DETAILS)) {
      for (const option of pkg.options) {
        expect(option.id, `${slug} / ${option.name}`).toBeTruthy();
        const serverOption = PACKAGE_CATALOG[slug]?.options[option.id];
        expect(serverOption, `${slug}:${option.id}`).toBeTruthy();
        if (option.sizes) {
          for (const s of option.sizes) {
            expect(resolvePackageKey(`${slug}:${option.id}:${s.label}`)?.priceIls).toBe(s.price);
          }
        } else {
          expect(resolvePackageKey(`${slug}:${option.id}`)?.priceIls).toBe(option.price);
        }
      }
    }
  });

  it("only full builds are classified as builds", () => {
    expect(resolvePackageKey("bad-bitch:build:M").kind).toBe("build");
    expect(resolvePackageKey("basic-bitch:fill:S").kind).toBe("fill");
    expect(resolvePackageKey("stay-high:design").kind).toBe("design");
  });
});

describe("content page rules", () => {
  it("reserved slugs match the server list", () => {
    const source = readFileSync(resolve(process.cwd(), "../server/src/contentPages.js"), "utf8");
    const block = source.match(/RESERVED_SLUGS = Object\.freeze\(\[([\s\S]*?)\]\)/)[1];
    const serverSlugs = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect([...RESERVED_SLUGS].sort()).toEqual([...serverSlugs].sort());
  });

  it("reserves every active route", () => {
    for (const slug of ["api", "login", "register", "profile", "admin", "booking", "services", "nail-sizing", "gallery", "build-a-set", "about"]) {
      expect(slugProblem(slug)).toMatch(/שמורה/);
    }
    expect(slugProblem("courses")).toBe("");
    expect(slugProblem("Bad Slug!")).toMatch(/אותיות באנגלית/);
  });

  it("allows only safe links and images", () => {
    expect(safeHref("/booking")).toBe("/booking");
    expect(safeHref("tel:+972501234567")).toBe("tel:+972501234567");
    expect(safeHref("https://example.com/x")).toBe("https://example.com/x");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeHref("http://example.com")).toBeNull();
    expect(safeImageUrl("tel:+972501234567")).toBeNull();
    expect(safeImageUrl("/logo.png")).toBe("/logo.png");
  });
});
