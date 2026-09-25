import { describe, it, expect } from "vitest";
import { getApiErrorMessage, assertUser } from "./authErrors.js";

describe("authErrors", () => {
  it("reads nested error.message from API", () => {
    const err = {
      response: {
        data: {
          success: false,
          error: { code: "USERNAME_TAKEN", message: "שם המשתמש הזה כבר תפוס" },
        },
      },
    };
    expect(getApiErrorMessage(err)).toBe("שם המשתמש הזה כבר תפוס");
  });

  it("never returns an object for rendering", () => {
    const err = { response: { data: { error: { code: "X" } } } };
    expect(typeof getApiErrorMessage(err)).toBe("string");
  });

  it("assertUser rejects missing id", () => {
    expect(() => assertUser(null)).toThrow();
    expect(() => assertUser({ username: "a" })).toThrow();
    expect(assertUser({ id: 1, username: "a" }).id).toBe(1);
  });
});
