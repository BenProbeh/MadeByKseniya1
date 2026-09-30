/**
 * Auth-related frontend smoke tests (no full browser).
 */
import { describe, it, expect } from "vitest";
import { normalizeApiBase, resolveMediaUrl } from "./api.js";

describe("auth client helpers", () => {
  it("resolveMediaUrl keeps absolute urls", () => {
    expect(resolveMediaUrl("https://cdn.example/a.jpg")).toBe("https://cdn.example/a.jpg");
  });

  it("resolveMediaUrl returns relative uploads for local api base", () => {
    expect(resolveMediaUrl("/api/uploads/avatars/x.jpg")).toBe("/api/uploads/avatars/x.jpg");
  });

  it("normalizeApiBase defaults to same-origin /api", () => {
    expect(normalizeApiBase(undefined)).toBe("/api");
    expect(normalizeApiBase("")).toBe("/api");
    expect(normalizeApiBase("/api/")).toBe("/api");
  });

  it("normalizeApiBase never produces /api/api", () => {
    expect(normalizeApiBase("https://x.up.railway.app")).toBe("https://x.up.railway.app/api");
    expect(normalizeApiBase("https://x.up.railway.app/")).toBe("https://x.up.railway.app/api");
    expect(normalizeApiBase("https://x.up.railway.app/api")).toBe("https://x.up.railway.app/api");
    expect(normalizeApiBase("https://x.up.railway.app/api/")).toBe("https://x.up.railway.app/api");
  });

  it("normalizeApiBase ignores localhost in production builds", () => {
    expect(normalizeApiBase("http://localhost:4000/api", { production: true })).toBe("/api");
    expect(normalizeApiBase("http://localhost:4000/api")).toBe("http://localhost:4000/api");
  });
});
