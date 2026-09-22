import assert from "node:assert/strict";
import test from "node:test";
import {
  pixelsPerMillimeter,
  widthPxToMm,
  widthMmToSize,
} from "../../client/src/lib/nailSizing/sizing.js";

test("pixelsPerMillimeter uses official coin diameter", () => {
  assert.equal(pixelsPerMillimeter(180, 18), 10);
  assert.equal(pixelsPerMillimeter(0, 18), null);
});

test("widthPxToMm converts with calibration", () => {
  assert.equal(widthPxToMm(110, 10), 11);
});

test("widthMmToSize maps into chart buckets", () => {
  assert.equal(widthMmToSize(11.2), 4);
  assert.equal(widthMmToSize(9.8), 5);
});
