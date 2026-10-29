import { describe, expect, it } from "vitest";
import { createSession, normalizeSession, remainingKeys, toPayload } from "./sessionStore.js";

describe("nail sizing session", () => {
  it("starts with all ten fingers selected and the 10 ₪ coin", () => {
    const s = createSession();
    expect(s.selected).toHaveLength(10);
    expect(s.coinId).toBe("ils-10-shekel");
  });

  it("drops old-version sessions and junk safely", () => {
    expect(normalizeSession({ step: "measure", measurements: {} }).step).toBe("intro");
    expect(normalizeSession(null).step).toBe("intro");
    const s = normalizeSession({ v: 2, step: "capture", selected: ["right-thumb", "bogus"], index: 9, results: { "right-thumb": { widthMm: "x" } } });
    expect(s.selected).toEqual(["right-thumb"]);
    expect(s.index).toBe(0);
    expect(s.results).toEqual({});
  });

  it("sends only measured fingers as numbers", () => {
    const s = { ...createSession(), results: { "left-ring": { widthMm: 10.4, size: 5, photoQualityScore: 80, plausible: true } } };
    const { measurements, coinId } = toPayload(s);
    expect(coinId).toBe("ils-10-shekel");
    expect(Object.keys(measurements)).toEqual(["left-ring"]);
    expect(measurements["left-ring"]).toMatchObject({ handId: "left", fingerId: "ring", widthMm: 10.4, size: 5, status: "confirmed" });
    expect(remainingKeys(s)).toHaveLength(9);
  });
});
