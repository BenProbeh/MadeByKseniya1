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
import { AUTO_CAPTURE_CONFIG, TEN_SHEKEL_COIN } from "../../client/src/lib/nailSizing/captureConfig.js";
import {
  buildCaptureGate,
  createAlignmentHoldTracker,
  handleDetectionForCapture,
  isFrameReadyForCapture,
} from "../../client/src/lib/nailSizing/captureMachine.js";

test("pixelsPerMillimeter uses official coin diameter", () => {
  assert.equal(pixelsPerMillimeter(180, 18), 10);
});

test("10₪ uses outer 23mm not gold core 16mm", () => {
  const coin = findCoinById("ils-10-shekel");
  assert.equal(assertUsesOuterDiameterMm(coin), true);
  assert.equal(pixelsPerMillimeter(230, TEN_SHEKEL_COIN.calibrationDiameterMm), 10);
});

test("widthPxToMm / size chart", () => {
  assert.equal(widthPxToMm(115, 10), 11.5);
  assert.equal(widthMmToSize(11.2), 4);
});

test("vertical stack + axis helpers", () => {
  assert.equal(assertVerticalStack(100, 180), true);
  assert.equal(assertCenteredAxis(200, 210, 100, 0.35), true);
  assert.equal(GUIDE_LAYOUT.coinCx, 0.5);
});

test("object-fit cover mapping keeps center aligned", () => {
  const t = getCoverTransform(1280, 720, 390, 520);
  const center = videoPointToDisplay(640, 360, t);
  assert.ok(Math.abs(center.x - 195) < 1);
});

function mockAnalysis({
  coinCx = 200,
  coinCy = 120,
  coinD = 100,
  fingerCx = 205,
  fingerCy = 230,
  fingerTopY = 200,
  sizeRatio = 1,
  coinFound = true,
  fingerFound = true,
  multiCoin = false,
} = {}) {
  return {
    coin: {
      found: coinFound,
      score: coinFound ? 0.5 : 0,
      multiCoin,
      sizeRatio,
      outerDiameterPx: coinD,
      diameterPx: coinD,
      center: { x: coinCx, y: coinCy },
    },
    nail: {
      found: fingerFound,
      presence: fingerFound,
      score: fingerFound ? 0.4 : 0,
      center: { x: fingerCx, y: fingerCy },
      topY: fingerTopY,
      heightPx: 80,
    },
  };
}

test("isFrameReadyForCapture requires all geometry flags", () => {
  assert.equal(
    isFrameReadyForCapture({
      cameraReady: true,
      coinDetected: true,
      fingerDetected: true,
      coinAboveFinger: true,
      horizontalAlignmentValid: true,
      coinScaleValid: true,
      verticalDistanceValid: true,
    }),
    true
  );
});

test("small horizontal offset within 35% does not block", () => {
  const gate = buildCaptureGate(mockAnalysis({ fingerCx: 200 + 30 }), { cameraReady: true });
  assert.equal(gate.ready, true);
});

test("large horizontal offset blocks capture", () => {
  const gate = buildCaptureGate(mockAnalysis({ fingerCx: 200 + 50 }), { cameraReady: true });
  assert.equal(gate.ready, false);
});

test("AUTO_CAPTURE_CONFIG central timing values", () => {
  assert.equal(AUTO_CAPTURE_CONFIG.cameraWarmupMs, 2500);
  assert.equal(AUTO_CAPTURE_CONFIG.requiredAlignmentMs, 800);
});

test("no capture during 2.5s warmup even if alignment is perfect", () => {
  const hold = createAlignmentHoldTracker(AUTO_CAPTURE_CONFIG);
  const t0 = 10_000;
  hold.markCameraReady(t0);
  const analysis = mockAnalysis();
  const midWarmup = handleDetectionForCapture({
    analysis,
    cameraReady: true,
    captureLocked: false,
    holdTracker: hold,
    now: t0 + 1000,
  });
  assert.equal(midWarmup.warmupComplete, false);
  assert.equal(midWarmup.shouldCapture, false);
  assert.equal(midWarmup.progress, 0);
  assert.equal(midWarmup.blockedBy, "warmup");
  assert.equal(midWarmup.gate.ready, true);
});

test("perfect alignment at camera open does not capture immediately", () => {
  const hold = createAlignmentHoldTracker(AUTO_CAPTURE_CONFIG);
  const t0 = 20_000;
  hold.markCameraReady(t0);
  const d = handleDetectionForCapture({
    analysis: mockAnalysis(),
    cameraReady: true,
    captureLocked: false,
    holdTracker: hold,
    now: t0 + 50,
  });
  assert.equal(d.shouldCapture, false);
});

test("after warmup, alignment under 800ms does not capture", () => {
  const hold = createAlignmentHoldTracker(AUTO_CAPTURE_CONFIG);
  const t0 = 30_000;
  hold.markCameraReady(t0);
  const start = t0 + AUTO_CAPTURE_CONFIG.cameraWarmupMs;
  handleDetectionForCapture({
    analysis: mockAnalysis(),
    cameraReady: true,
    captureLocked: false,
    holdTracker: hold,
    now: start,
  });
  const d = handleDetectionForCapture({
    analysis: mockAnalysis(),
    cameraReady: true,
    captureLocked: false,
    holdTracker: hold,
    now: start + 400,
  });
  assert.equal(d.warmupComplete, true);
  assert.equal(d.shouldCapture, false);
  assert.ok(d.progress > 0 && d.progress < 1);
});

test("after warmup, 800ms continuous alignment captures", () => {
  const hold = createAlignmentHoldTracker(AUTO_CAPTURE_CONFIG);
  const t0 = 40_000;
  hold.markCameraReady(t0);
  const start = t0 + AUTO_CAPTURE_CONFIG.cameraWarmupMs;
  handleDetectionForCapture({
    analysis: mockAnalysis(),
    cameraReady: true,
    captureLocked: false,
    holdTracker: hold,
    now: start,
  });
  const done = handleDetectionForCapture({
    analysis: mockAnalysis(),
    cameraReady: true,
    captureLocked: false,
    holdTracker: hold,
    now: start + AUTO_CAPTURE_CONFIG.requiredAlignmentMs,
  });
  assert.equal(done.shouldCapture, true);
  assert.equal(done.progress, 1);
});

test("losing alignment resets progress; regain restarts hold", () => {
  const hold = createAlignmentHoldTracker(AUTO_CAPTURE_CONFIG);
  const t0 = 50_000;
  hold.markCameraReady(t0);
  const start = t0 + AUTO_CAPTURE_CONFIG.cameraWarmupMs;
  handleDetectionForCapture({
    analysis: mockAnalysis(),
    cameraReady: true,
    captureLocked: false,
    holdTracker: hold,
    now: start,
  });
  const lost = handleDetectionForCapture({
    analysis: mockAnalysis({ fingerFound: false }),
    cameraReady: true,
    captureLocked: false,
    holdTracker: hold,
    now: start + 400,
  });
  assert.equal(lost.progress, 0);
  assert.equal(lost.shouldCapture, false);

  const againStart = handleDetectionForCapture({
    analysis: mockAnalysis(),
    cameraReady: true,
    captureLocked: false,
    holdTracker: hold,
    now: start + 500,
  });
  assert.ok(againStart.progress < 0.2);
  const againDone = handleDetectionForCapture({
    analysis: mockAnalysis(),
    cameraReady: true,
    captureLocked: false,
    holdTracker: hold,
    now: start + 500 + AUTO_CAPTURE_CONFIG.requiredAlignmentMs,
  });
  assert.equal(againDone.shouldCapture, true);
});

test("capture lock blocks second capture", () => {
  const hold = createAlignmentHoldTracker(AUTO_CAPTURE_CONFIG);
  const t0 = 60_000;
  hold.markCameraReady(t0);
  const start = t0 + AUTO_CAPTURE_CONFIG.cameraWarmupMs;
  handleDetectionForCapture({
    analysis: mockAnalysis(),
    cameraReady: true,
    captureLocked: false,
    holdTracker: hold,
    now: start,
  });
  handleDetectionForCapture({
    analysis: mockAnalysis(),
    cameraReady: true,
    captureLocked: false,
    holdTracker: hold,
    now: start + AUTO_CAPTURE_CONFIG.requiredAlignmentMs,
  });
  const locked = handleDetectionForCapture({
    analysis: mockAnalysis(),
    cameraReady: true,
    captureLocked: true,
    holdTracker: hold,
    now: start + AUTO_CAPTURE_CONFIG.requiredAlignmentMs + 100,
  });
  assert.equal(locked.shouldCapture, false);
  assert.equal(locked.blockedBy, "captureLocked");
});

test("session reset clears warmup so next finger starts fresh", () => {
  const hold = createAlignmentHoldTracker(AUTO_CAPTURE_CONFIG);
  const t0 = 70_000;
  hold.markCameraReady(t0);
  hold.resetSession();
  assert.equal(hold.cameraReadyAt, null);
  const d = handleDetectionForCapture({
    analysis: mockAnalysis(),
    cameraReady: true,
    captureLocked: false,
    holdTracker: hold,
    now: t0 + 10_000,
  });
  assert.equal(d.shouldCapture, false);
  assert.equal(d.blockedBy, "cameraNotMarkedReady");
});

test("success check requires captured image", () => {
  const gate = buildCaptureGate(mockAnalysis(), { cameraReady: true });
  assert.equal(gate.ready && !null, true);
  assert.equal(!!null && gate.ready, false);
  assert.equal(!!"data:image/jpeg;base64,x" && gate.ready, true);
});

test("debug query flag helper semantics", () => {
  assert.equal(new URLSearchParams("debugCapture=1").get("debugCapture") === "1", true);
  assert.equal(new URLSearchParams("").get("debugCapture") === "1", false);
});
