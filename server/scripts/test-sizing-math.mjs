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
import { CAPTURE_CONFIG, CaptureState, TEN_SHEKEL_COIN } from "../../client/src/lib/nailSizing/captureConfig.js";
import {
  createStabilityTracker,
  deriveLiveState,
  readyForAutoCapture,
  toStabilitySample,
} from "../../client/src/lib/nailSizing/captureMachine.js";

test("pixelsPerMillimeter uses official coin diameter", () => {
  assert.equal(pixelsPerMillimeter(180, 18), 10);
  assert.equal(pixelsPerMillimeter(0, 18), null);
});

test("10₪ uses outer 23mm not gold core 16mm", () => {
  const coin = findCoinById("ils-10-shekel");
  assert.equal(coin.diameterMm, 23);
  assert.equal(coin.outerDiameterMm, TEN_SHEKEL_COIN.outerDiameterMm);
  assert.equal(coin.innerDiameterMm, TEN_SHEKEL_COIN.innerDiameterMm);
  assert.equal(assertUsesOuterDiameterMm(coin), true);
  assert.equal(pixelsPerMillimeter(230, TEN_SHEKEL_COIN.calibrationDiameterMm), 10);
  assert.notEqual(pixelsPerMillimeter(230, TEN_SHEKEL_COIN.innerDiameterMm), 10);
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
  const t = getCoverTransform(1280, 720, 390, 520);
  const center = videoPointToDisplay(640, 360, t);
  assert.ok(Math.abs(center.x - 195) < 1);
  assert.ok(Math.abs(center.y - 260) < 1);
});

test("stability tracker does not mark stable from a single ready frame", () => {
  const tracker = createStabilityTracker({
    ...CAPTURE_CONFIG,
    REQUIRED_STABLE_MS: 800,
    MIN_STABLE_FRAMES: 12,
  });
  const base = {
    ready: true,
    confidence: 0.8,
    sharpness: 40,
    coinCx: 100,
    coinCy: 80,
    coinD: 120,
    nailCx: 100,
    nailCy: 200,
    nailW: 40,
  };
  const t0 = 1_000_000;
  const once = tracker.push({ ...base, t: t0 });
  assert.equal(once.stable, false);
  assert.ok(once.progress < 1);
});

test("stability tracker requires motion-consistent ready frames over the window", () => {
  const tracker = createStabilityTracker({
    ...CAPTURE_CONFIG,
    REQUIRED_STABLE_MS: 800,
    MIN_STABLE_FRAMES: 12,
    FRAME_INTERVAL_MS: 60,
  });
  const base = {
    ready: true,
    confidence: 0.8,
    sharpness: 40,
    coinCx: 100,
    coinCy: 80,
    coinD: 120,
    nailCx: 100,
    nailCy: 200,
    nailW: 40,
  };
  const t0 = 2_000_000;
  let last;
  for (let i = 0; i < 15; i += 1) {
    last = tracker.push({ ...base, t: t0 + i * 60 });
  }
  assert.equal(last.stable, true);
  assert.ok(last.progress >= 0.99);

  // Large jump breaks stability immediately
  const broken = tracker.push({
    ...base,
    coinCx: 100 + 40,
    t: t0 + 15 * 60,
  });
  assert.equal(broken.stable, false);
});

test("readyForAutoCapture blocks when captureLocked or not stable", () => {
  const analysis = {
    ready: true,
    confidence: 0.8,
    coin: { clipped: false },
    validation: {
      coinValid: true,
      sizeOk: true,
      perspectiveValid: true,
      fingerValid: true,
      nailValid: true,
      verticalAlignmentValid: true,
      distanceValid: true,
      lightingValid: true,
      sharpnessValid: true,
    },
  };
  assert.equal(
    readyForAutoCapture({
      cameraReady: true,
      analysis,
      stability: { stable: true, motionValid: true },
      captureLocked: true,
    }),
    false
  );
  assert.equal(
    readyForAutoCapture({
      cameraReady: true,
      analysis,
      stability: { stable: false, motionValid: true },
      captureLocked: false,
    }),
    false
  );
  assert.equal(
    readyForAutoCapture({
      cameraReady: true,
      analysis,
      stability: { stable: true, motionValid: true },
      captureLocked: false,
    }),
    true
  );
});

test("deriveLiveState maps analysis into capture machine states", () => {
  assert.equal(deriveLiveState(null, null), CaptureState.SEARCHING);
  assert.equal(
    deriveLiveState({ coin: { found: false }, nail: { found: false }, ready: false }, null),
    CaptureState.SEARCHING
  );
  assert.equal(
    deriveLiveState({ coin: { found: true }, nail: { found: true }, ready: false }, { progress: 0 }),
    CaptureState.ALIGNING
  );
  assert.equal(
    deriveLiveState({ coin: { found: true }, nail: { found: true }, ready: true }, { progress: 0, stable: false }),
    CaptureState.HOLD_STILL
  );
  assert.equal(
    deriveLiveState({ coin: { found: true }, nail: { found: true }, ready: true }, { progress: 0.5, stable: false }),
    CaptureState.COUNTING_DOWN
  );
});

test("toStabilitySample copies detection geometry", () => {
  const sample = toStabilitySample({
    ready: true,
    confidence: 0.7,
    sharpness: 22,
    coin: { center: { x: 1, y: 2 }, outerDiameterPx: 50 },
    nail: { center: { x: 3, y: 4 }, widthPx: 20 },
  }, 123);
  assert.equal(sample.t, 123);
  assert.equal(sample.coinD, 50);
  assert.equal(sample.nailW, 20);
});
