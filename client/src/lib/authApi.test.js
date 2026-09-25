/**
 * Auth-related frontend smoke tests (no full browser).
 */
import { describe, it, expect } from "vitest";
import { resolveMediaUrl } from "./api.js";

describe("auth client helpers", () => {
  it("resolveMediaUrl keeps absolute urls", () => {
    expect(resolveMediaUrl("https://cdn.example/a.jpg")).toBe("https://cdn.example/a.jpg");
  });

  it("resolveMediaUrl returns relative uploads for local api base", () => {
    expect(resolveMediaUrl("/uploads/avatars/x.jpg")).toMatch(/\/uploads\/avatars\/x\.jpg$/);
  });
});
