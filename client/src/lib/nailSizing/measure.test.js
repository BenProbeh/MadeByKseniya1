import { describe, expect, it } from "vitest";
import { REFERENCE_COIN, coverCrop, guideGeometry, measureFinger, nailWidthMm, qualityRegions } from "./measure.js";

describe("nail measurement against a 10 ₪ coin", () => {
  it("uses the 10 ₪ coin's full outer diameter (23 mm)", () => {
    expect(REFERENCE_COIN.id).toBe("ils-10-shekel");
    expect(REFERENCE_COIN.diameterMm).toBe(23);
  });

  it("converts pixels to millimetres independent of resolution", () => {
    expect(nailWidthMm(100, 200)).toBe(11.5);
    expect(nailWidthMm(50, 100)).toBe(11.5);
    expect(nailWidthMm(1000, 2000)).toBe(11.5);
  });

  it("returns null for missing or invalid marks", () => {
    expect(nailWidthMm(0, 200)).toBeNull();
    expect(nailWidthMm(100, 0)).toBeNull();
    expect(nailWidthMm(NaN, 100)).toBeNull();
  });

  it("maps width to the size chart and flags implausible widths per finger", () => {
    const thumb = measureFinger({ fingerId: "thumb", nailPx: 130, coinDiameterPx: 200 }); // 14.95 mm
    expect(thumb.widthMm).toBe(15);
    expect(thumb.size).toBe(0);
    expect(thumb.plausible).toBe(true);

    const pinky = measureFinger({ fingerId: "pinky", nailPx: 70, coinDiameterPx: 200 }); // 8.05 mm
    expect(pinky.size).toBe(7);
    expect(pinky.plausible).toBe(true);

    const wrong = measureFinger({ fingerId: "pinky", nailPx: 190, coinDiameterPx: 200 }); // 21.9 mm
    expect(wrong.plausible).toBe(false);
  });

  it("places the coin guide above the finger guide on one axis", () => {
    const g = guideGeometry(300, 400);
    expect(g.coin.cy + g.coin.r).toBeLessThan(g.finger.y);
    expect(g.coin.cx).toBe(150);
    expect(g.finger.x + g.finger.width / 2).toBe(150);
    expect(g.nail.y).toBeGreaterThan(g.finger.y);
    expect(g.nail.x2 - g.nail.x1).toBeLessThan(g.coin.r * 2);
  });

  it("gives the photo check the same regions as the overlay", () => {
    const r = qualityRegions(300, 400);
    const g = guideGeometry(300, 400);
    expect(r.coinGuideRegion.cx).toBe(g.coin.cx);
    expect(r.coinGuideRegion.radius).toBe(g.coin.r);
    expect(r.fingerGuideRegion.y).toBe(g.finger.y);
  });

  it("crops a landscape camera frame to the 3:4 frame she saw", () => {
    const crop = coverCrop(1280, 720);
    expect(crop.sh).toBe(720);
    expect(crop.sw).toBe(540);
    expect(crop.sx).toBe(370);
    const portrait = coverCrop(720, 1280);
    expect(portrait.sw).toBe(720);
    expect(portrait.sh).toBe(960);
    expect(portrait.sy).toBe(160);
  });
});
