import { describe, it, expect } from "vitest";
import { isOwner, isStaff, roleLabel } from "./roles.js";
import { formatCalendarDay } from "./format.js";

describe("role helpers", () => {
  it("treats only owner and admin as staff", () => {
    expect(isStaff({ role: "owner" })).toBe(true);
    expect(isStaff({ role: "admin" })).toBe(true);
    expect(isStaff({ role: "customer" })).toBe(false);
    expect(isStaff({ role: "superuser" })).toBe(false);
    expect(isStaff(null)).toBe(false);
  });

  it("recognises only the owner as owner", () => {
    expect(isOwner({ role: "owner" })).toBe(true);
    expect(isOwner({ role: "admin" })).toBe(false);
  });

  it("labels roles in Hebrew with a customer fallback", () => {
    expect(roleLabel("owner")).toBe("בעלים");
    expect(roleLabel("admin")).toBe("מנהל");
    expect(roleLabel("unknown")).toBe("לקוח");
  });
});

describe("formatCalendarDay", () => {
  it("keeps the Israel calendar date regardless of the browser time zone", () => {
    expect(formatCalendarDay("2030-01-06")).toContain("ראשון");
    expect(formatCalendarDay("2030-01-06")).toContain("6");
  });

  it("returns empty text for invalid input", () => {
    expect(formatCalendarDay("not-a-date")).toBe("");
  });
});
