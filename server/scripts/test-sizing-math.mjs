import assert from "node:assert/strict";
import test from "node:test";
import {
  pixelsPerMillimeter,
  widthPxToMm,
  widthMmToSize,
} from "../../client/src/lib/nailSizing/sizing.js";
import { findCoinById } from "../../client/src/lib/nailSizing/coins.js";
import {
  assertUsesOuterDiameterMm,
  assertVerticalStack,
  assertCenteredAxis,
  GUIDE_LAYOUT,
} from "../../client/src/lib/nailSizing/measurementEngine.js";
import { getCoverTransform, videoPointToDisplay } from "../../client/src/lib/nailSizing/videoGeometry.js";

test("pixelsPerMillimeter uses official coin diameter", () => {
  assert.equal(pixelsPerMillimeter(180, 18), 10);
  assert.equal(pixelsPerMillimeter(0, 18), null);
});

test("10₪ uses outer 23mm not gold core 16mm", () => {
  const coin = findCoinById("ils-10-shekel");
  assert.equal(coin.diameterMm, 23);
  assert.equal(coin.outerDiameterMm, 23);
  assert.equal(coin.innerDiameterMm, 16);
  assert.equal(assertUsesOuterDiameterMm(coin), true);
  // Calibration must divide by 23
  assert.equal(pixelsPerMillimeter(230, coin.outerDiameterMm), 10);
  assert.notEqual(pixelsPerMillimeter(230, coin.innerDiameterMm), 10);
});

test("widthPxToMm converts with outer-diameter calibration", () => {
  const pxPerMm = pixelsPerMillimeter(230, 23);
  assert.equal(widthPxToMm(115, pxPerMm), 11.5);
});

test("widthMmToSize maps into chart buckets", () => {
  assert.equal(widthMmToSize(11.2), 4);
  assert.equal(widthMmToSize(9.8), 5);
});

test("vertical stack requires finger below coin", () => {
  assert.equal(assertVerticalStack(100, 180), true);
  assert.equal(assertVerticalStack(180, 100), false);
});

test("centered axis within 20% of coin diameter", () => {
  assert.equal(assertCenteredAxis(200, 210, 100, 0.2), true);
  assert.equal(assertCenteredAxis(200, 250, 100, 0.2), false);
});

test("guide layout is vertical column not side-by-side", () => {
  assert.equal(GUIDE_LAYOUT.coinCx, 0.5);
  assert.ok(GUIDE_LAYOUT.fingerWidthRatio < 1);
  assert.ok(GUIDE_LAYOUT.fingerHeightRatio > 1);
});

test("object-fit cover mapping keeps center aligned", () => {
  // Video 1280x720 into portrait 390x520 container → crop sides
  const t = getCoverTransform(1280, 720, 390, 520);
  const center = videoPointToDisplay(640, 360, t);
  assert.ok(Math.abs(center.x - 195) < 1);
  assert.ok(Math.abs(center.y - 260) < 1);
});
