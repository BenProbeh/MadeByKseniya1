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
    expect(getApiErrorMessage(err)).toBe("שם המשתמש הזה כבר בשימוש, נסי לבחור שם אחר.");
  });

  it("never returns an object for rendering", () => {
    const err = { response: { data: { error: { code: "X" } } } };
    expect(typeof getApiErrorMessage(err)).toBe("string");
  });

  it("hides Vercel plain-text 404 pages", () => {
    const err = {
      response: {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
        data: "The page could not be found\n\nNOT_FOUND\n",
      },
      config: { baseURL: "/api", url: "/auth/register" },
    };
    expect(getApiErrorMessage(err, "לא הצלחנו ליצור את החשבון כרגע. נסי שוב בעוד רגע.")).toBe(
      "לא הצלחנו ליצור את החשבון כרגע. נסי שוב בעוד רגע."
    );
  });

  it("assertUser rejects missing id", () => {
    expect(() => assertUser(null)).toThrow();
    expect(() => assertUser({ username: "a" })).toThrow();
    expect(assertUser({ id: 1, username: "a" }).id).toBe(1);
  });
});
