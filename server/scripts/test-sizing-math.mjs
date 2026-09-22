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
import { CAPTURE_CONFIG, TEN_SHEKEL_COIN } from "../../client/src/lib/nailSizing/captureConfig.js";
import {
  buildCaptureGate,
  createFrameCounter,
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
  assert.equal(isFrameReadyForCapture(null), false);
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
  assert.equal(
    isFrameReadyForCapture({
      cameraReady: true,
      coinDetected: true,
      fingerDetected: true,
      coinAboveFinger: true,
      horizontalAlignmentValid: true,
      coinScaleValid: true,
      verticalDistanceValid: false,
    }),
    false
  );
});

test("small horizontal offset within 35% does not block", () => {
  const gate = buildCaptureGate(mockAnalysis({ fingerCx: 200 + 30 }), { cameraReady: true });
  assert.equal(gate.horizontalAlignmentValid, true);
  assert.equal(gate.ready, true);
});

test("large horizontal offset blocks capture", () => {
  const gate = buildCaptureGate(mockAnalysis({ fingerCx: 200 + 50 }), { cameraReady: true });
  assert.equal(gate.horizontalAlignmentValid, false);
  assert.equal(gate.ready, false);
});

test("coin above finger accepted; coin below rejected", () => {
  const ok = buildCaptureGate(mockAnalysis(), { cameraReady: true });
  assert.equal(ok.coinAboveFinger, true);
  const bad = buildCaptureGate(
    mockAnalysis({ coinCy: 300, fingerTopY: 200, fingerCy: 220 }),
    { cameraReady: true }
  );
  assert.equal(bad.coinAboveFinger, false);
});

test("two valid frames do not capture; third does immediately", () => {
  const counter = createFrameCounter(3);
  const analysis = mockAnalysis();
  const calls = [];

  for (let i = 0; i < 3; i += 1) {
    const decision = handleDetectionForCapture({
      analysis,
      cameraReady: true,
      captureLocked: false,
      counter,
    });
    calls.push(decision);
  }

  assert.equal(calls[0].shouldCapture, false);
  assert.equal(calls[0].count, 1);
  assert.equal(calls[1].shouldCapture, false);
  assert.equal(calls[1].count, 2);
  assert.equal(calls[2].shouldCapture, true);
  assert.equal(calls[2].count, 3);
  // No extra timeout after third frame — shouldCapture is synchronous
  assert.equal(CAPTURE_CONFIG.REQUIRED_VALID_FRAMES, 3);
});

test("invalid frame resets consecutive counter", () => {
  const counter = createFrameCounter(3);
  const good = mockAnalysis();
  const bad = mockAnalysis({ fingerFound: false });
  handleDetectionForCapture({ analysis: good, cameraReady: true, captureLocked: false, counter });
  handleDetectionForCapture({ analysis: good, cameraReady: true, captureLocked: false, counter });
  const reset = handleDetectionForCapture({
    analysis: bad,
    cameraReady: true,
    captureLocked: false,
    counter,
  });
  assert.equal(reset.count, 0);
  assert.equal(reset.shouldCapture, false);
  const again = handleDetectionForCapture({
    analysis: good,
    cameraReady: true,
    captureLocked: false,
    counter,
  });
  assert.equal(again.count, 1);
});

test("capture lock blocks second capture", () => {
  const counter = createFrameCounter(3);
  const analysis = mockAnalysis();
  for (let i = 0; i < 3; i += 1) {
    handleDetectionForCapture({ analysis, cameraReady: true, captureLocked: false, counter });
  }
  // After capture, lock true — even with ready frames
  counter.reset();
  const locked = handleDetectionForCapture({
    analysis,
    cameraReady: true,
    captureLocked: true,
    counter,
  });
  assert.equal(locked.shouldCapture, false);
  assert.equal(locked.blockedBy, "captureLocked");
});

test("frame counter survives as ref-like object across pushes (not reset by re-read)", () => {
  const counter = createFrameCounter(3);
  counter.push(true);
  counter.push(true);
  assert.equal(counter.count, 2);
  // Simulates render re-reading same ref
  const same = counter;
  same.push(true);
  assert.equal(same.shouldCapture(), true);
});

test("failed capture path can unlock — counter restart allows retry", () => {
  const counter = createFrameCounter(3);
  const analysis = mockAnalysis();
  // First attempt reaches capture
  for (let i = 0; i < 3; i += 1) {
    handleDetectionForCapture({ analysis, cameraReady: true, captureLocked: false, counter });
  }
  // Simulate failure unlock
  counter.reset();
  let locked = false;
  const d1 = handleDetectionForCapture({
    analysis,
    cameraReady: true,
    captureLocked: locked,
    counter,
  });
  assert.equal(d1.count, 1);
  locked = false;
  handleDetectionForCapture({ analysis, cameraReady: true, captureLocked: locked, counter });
  const d3 = handleDetectionForCapture({
    analysis,
    cameraReady: true,
    captureLocked: locked,
    counter,
  });
  assert.equal(d3.shouldCapture, true);
});

test("success check requires captured image — gate alone is not success", () => {
  const gate = buildCaptureGate(mockAnalysis(), { cameraReady: true });
  assert.equal(gate.ready, true);
  const capturedImage = null;
  const showCheck = gate.ready && !!capturedImage;
  assert.equal(showCheck, false);
  const showCheckAfter = gate.ready && !!"data:image/jpeg;base64,xx";
  assert.equal(showCheckAfter, true);
});

test("debug query flag helper semantics", () => {
  const params = new URLSearchParams("debugCapture=1");
  assert.equal(params.get("debugCapture") === "1", true);
  const off = new URLSearchParams("");
  assert.equal(off.get("debugCapture") === "1", false);
});
