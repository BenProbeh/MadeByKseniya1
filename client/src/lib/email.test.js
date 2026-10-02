import { describe, expect, it } from "vitest";
import { cleanCode, normalizeEmail } from "./email.js";
import { apiErrorCode, getApiErrorMessage } from "./authErrors.js";
import { safeInternalPath } from "./authPaths.js";

describe("email helpers", () => {
  it("normalizes like the server: trimmed and lower-cased", () => {
    expect(normalizeEmail("  Dana.Levi@Gmail.COM ")).toEqual({ ok: true, email: "dana.levi@gmail.com" });
    expect(normalizeEmail("").ok).toBe(false);
    expect(normalizeEmail("dana@").ok).toBe(false);
    expect(normalizeEmail("dana@gmail").ok).toBe(false);
    expect(normalizeEmail("דנה@gmail.com").ok).toBe(false);
  });

  it("keeps only six digits from a pasted code", () => {
    expect(cleanCode(" 123 456 ")).toBe("123456");
    expect(cleanCode("123-4567")).toBe("123456");
    expect(cleanCode("abc")).toBe("");
  });
});

describe("server-worded errors", () => {
  const axiosError = (status, data) => ({ response: { status, data, headers: { "content-type": "application/json" } } });

  it("reads the code from either response shape", () => {
    expect(apiErrorCode(axiosError(403, { error: { code: "EMAIL_NOT_VERIFIED", message: "x" } }))).toBe("EMAIL_NOT_VERIFIED");
    expect(apiErrorCode(axiosError(410, { code: "CONFIRM_EXPIRED", error: "x" }))).toBe("CONFIRM_EXPIRED");
    expect(apiErrorCode(new Error("network"))).toBe("");
  });

  it("shows the server's text for email-unavailable instead of the generic 503 text", () => {
    const err = axiosError(503, { error: { code: "EMAIL_UNAVAILABLE", message: "שליחת המיילים לא זמינה כרגע." } });
    expect(getApiErrorMessage(err, "fallback")).toBe("שליחת המיילים לא זמינה כרגע.");
  });
});

describe("post-auth redirects", () => {
  it("only allows same-site paths that aren't auth screens", () => {
    expect(safeInternalPath("/booking")).toBe("/booking");
    expect(safeInternalPath("//evil.example")).toBe("/services");
    expect(safeInternalPath("https://evil.example")).toBe("/services");
    expect(safeInternalPath("/verify-email")).toBe("/services");
    expect(safeInternalPath(undefined)).toBe("/services");
  });
});
