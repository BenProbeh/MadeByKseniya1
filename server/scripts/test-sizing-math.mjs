import assert from "node:assert/strict";
import test from "node:test";
import {
  pixelsPerMillimeter,
  widthPxToMm,
  CONFIDENCE_AUTO_OK,
} from "../../client/src/lib/nailSizing/sizing.js";
import { AUTO_CAPTURE_CONFIG } from "../../client/src/lib/nailSizing/captureConfig.js";
import {
  buildCaptureGate,
  createAlignmentHoldTracker,
  handleDetectionForCapture,
  evaluateMeasurementQuality,
  QUALITY_THRESHOLDS,
} from "../../client/src/lib/nailSizing/captureMachine.js";

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
  nailWidth = 42,
  coinScore = 0.55,
  nailScore = 0.55,
  sharpness = 45,
  brightness = 120,
  clipped = false,
  multiCoin = false,
} = {}) {
  return {
    brightness,
    sharpness,
    confidence: 0.5,
    coin: {
      found: coinFound,
      score: coinFound ? coinScore : 0,
      multiCoin,
      clipped,
      sizeRatio,
      outerDiameterPx: coinD,
      diameterPx: coinD,
      center: { x: coinCx, y: coinCy },
      perspectiveRatio: 0.9,
    },
    nail: {
      found: fingerFound,
      presence: fingerFound,
      score: fingerFound ? nailScore : 0,
      widthPx: fingerFound ? nailWidth : null,
      tipVisible: true,
      center: { x: fingerCx, y: fingerCy },
      topY: fingerTopY,
      heightPx: 80,
    },
  };
}

test("capture and approval share CONFIDENCE_AUTO_OK / QUALITY_THRESHOLDS.overall", () => {
  assert.equal(QUALITY_THRESHOLDS.overallConfidence, CONFIDENCE_AUTO_OK);
  assert.equal(CONFIDENCE_AUTO_OK, 0.72);
});

test("low quality does not mark ready for capture", () => {
  const q = evaluateMeasurementQuality(
    mockAnalysis({ nailWidth: null, fingerFound: true }),
    { cameraReady: true }
  );
  assert.equal(q.ready, false);
  assert.ok(q.blockers.includes("nail-not-detected"));
});

test("hard blocker misaligned prevents ready", () => {
  const q = evaluateMeasurementQuality(mockAnalysis({ fingerCx: 200 + 50 }), { cameraReady: true });
  assert.equal(q.ready, false);
  assert.ok(q.blockers.includes("misaligned"));
});

test("good frame is ready and confidence meets approval threshold", () => {
  const q = evaluateMeasurementQuality(mockAnalysis(), { cameraReady: true });
  assert.equal(q.ready, true);
  assert.ok(q.confidence >= CONFIDENCE_AUTO_OK);
  assert.equal(q.blockers.length, 0);
});

test("buildCaptureGate.ready matches evaluateMeasurementQuality.ready", () => {
  const analysis = mockAnalysis();
  const gate = buildCaptureGate(analysis, { cameraReady: true });
  const q = evaluateMeasurementQuality(analysis, { cameraReady: true });
  assert.equal(gate.ready, q.ready);
  assert.equal(gate.ready, true);
});

test("same quality function used before and after — weak frame stays not ready", () => {
  const weak = mockAnalysis({ sharpness: 5, brightness: 30 });
  const live = evaluateMeasurementQuality(weak, { cameraReady: true });
  const frozen = evaluateMeasurementQuality(weak, { cameraReady: true });
  assert.equal(live.ready, frozen.ready);
  assert.equal(live.ready, false);
});

test("hold tracker only advances when quality.ready", () => {
  const hold = createAlignmentHoldTracker(AUTO_CAPTURE_CONFIG);
  const t0 = 80_000;
  hold.markCameraReady(t0);
  const start = t0 + AUTO_CAPTURE_CONFIG.cameraWarmupMs;

  const weak = handleDetectionForCapture({
    analysis: mockAnalysis({ nailWidth: null }),
    cameraReady: true,
    captureLocked: false,
    holdTracker: hold,
    now: start + 100,
  });
  assert.equal(weak.gate.ready, false);
  assert.equal(weak.shouldCapture, false);
  assert.equal(weak.progress, 0);

  handleDetectionForCapture({
    analysis: mockAnalysis(),
    cameraReady: true,
    captureLocked: false,
    holdTracker: hold,
    now: start + 200,
  });
  const done = handleDetectionForCapture({
    analysis: mockAnalysis(),
    cameraReady: true,
    captureLocked: false,
    holdTracker: hold,
    now: start + 200 + AUTO_CAPTURE_CONFIG.requiredAlignmentMs,
  });
  assert.equal(done.shouldCapture, true);
  assert.equal(done.quality.ready, true);
  assert.ok(done.quality.confidence >= CONFIDENCE_AUTO_OK);
});

test("losing quality resets hold progress", () => {
  const hold = createAlignmentHoldTracker(AUTO_CAPTURE_CONFIG);
  const t0 = 90_000;
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
    analysis: mockAnalysis({ fingerFound: false, nailWidth: null }),
    cameraReady: true,
    captureLocked: false,
    holdTracker: hold,
    now: start + 400,
  });
  assert.equal(lost.progress, 0);
  assert.equal(lost.shouldCapture, false);
});

test("warmup still blocks capture even when quality ready", () => {
  const hold = createAlignmentHoldTracker(AUTO_CAPTURE_CONFIG);
  const t0 = 100_000;
  hold.markCameraReady(t0);
  const d = handleDetectionForCapture({
    analysis: mockAnalysis(),
    cameraReady: true,
    captureLocked: false,
    holdTracker: hold,
    now: t0 + 500,
  });
  assert.equal(d.gate.ready, true);
  assert.equal(d.warmupComplete, false);
  assert.equal(d.shouldCapture, false);
});

test("capture lock prevents double capture", () => {
  const hold = createAlignmentHoldTracker(AUTO_CAPTURE_CONFIG);
  const t0 = 110_000;
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
    now: start + AUTO_CAPTURE_CONFIG.requiredAlignmentMs + 50,
  });
  assert.equal(locked.shouldCapture, false);
});

test("session reset clears prior finger quality timing", () => {
  const hold = createAlignmentHoldTracker(AUTO_CAPTURE_CONFIG);
  hold.markCameraReady(120_000);
  hold.resetSession();
  assert.equal(hold.cameraReadyAt, null);
});

test("pixelsPerMillimeter still works", () => {
  assert.equal(pixelsPerMillimeter(230, 23), 10);
  assert.equal(widthPxToMm(115, 10), 11.5);
});

test("failed final quality must not surface as confirmed status", () => {
  const q = evaluateMeasurementQuality(mockAnalysis({ nailWidth: null }), { cameraReady: true });
  const wouldConfirm = q.ready && q.confidence >= CONFIDENCE_AUTO_OK;
  assert.equal(wouldConfirm, false);
  assert.notEqual(q.ready ? "confirmed" : "rejected", "confirmed");
});

test("failed final quality does not use generic low-confidence review path", () => {
  const q = evaluateMeasurementQuality(mockAnalysis({ nailWidth: null }), { cameraReady: true });
  assert.equal(q.ready, false);
  // Specific blocker — not a blank "low confidence" only path when nail missing
  assert.ok(q.blockers.includes("nail-not-detected"));
  assert.ok(!q.blockers.every((b) => b === "low-confidence"));
});

test("successful quality allows confirmed payload shape", () => {
  const q = evaluateMeasurementQuality(mockAnalysis(), { cameraReady: true });
  assert.equal(q.ready, true);
  const payload = {
    status: q.ready ? "confirmed" : "rejected",
    confidence: q.confidence,
    confidenceLevel: q.confidence >= CONFIDENCE_AUTO_OK ? "high" : "low",
  };
  assert.equal(payload.status, "confirmed");
  assert.equal(payload.confidenceLevel, "high");
});

test("QUALITY_THRESHOLDS.overallConfidence is the single capture+approval threshold", () => {
  assert.equal(QUALITY_THRESHOLDS.overallConfidence, CONFIDENCE_AUTO_OK);
  const good = evaluateMeasurementQuality(mockAnalysis(), { cameraReady: true });
  assert.equal(good.ready, good.confidence >= QUALITY_THRESHOLDS.overallConfidence && good.hardRequirementsPassed);
});
