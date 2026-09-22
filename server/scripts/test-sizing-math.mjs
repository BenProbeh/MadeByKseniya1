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
import {
  calculatePixelsPerMm,
  calculateNailWidthMm,
  getCoinRoi,
  ensureCanvasSize,
} from "../../client/src/lib/nailSizing/frameCapture.js";
import { selectBestCoinCandidate, detectCoin } from "../../client/src/lib/nailSizing/coinDetector.js";
import { OPEN_CV_SIZING_CONFIG } from "../../client/src/lib/nailSizing/openCvConfig.js";
import { lightingReasonToHint } from "../../client/src/lib/nailSizing/imageQuality.js";
import { nailDetector } from "../../client/src/lib/nailSizing/nailDetector.js";

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

test("capture and approval share CONFIDENCE_AUTO_OK", () => {
  assert.equal(QUALITY_THRESHOLDS.overallConfidence, CONFIDENCE_AUTO_OK);
});

test("low quality does not mark ready for capture", () => {
  const q = evaluateMeasurementQuality(mockAnalysis({ nailWidth: null }), { cameraReady: true });
  assert.equal(q.ready, false);
});

test("good frame is ready", () => {
  const q = evaluateMeasurementQuality(mockAnalysis(), { cameraReady: true });
  assert.equal(q.ready, true);
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
  assert.equal(weak.shouldCapture, false);
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
});

test("warmup still blocks capture", () => {
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
  assert.equal(d.shouldCapture, false);
  assert.equal(d.warmupComplete, false);
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
  const locked = handleDetectionForCapture({
    analysis: mockAnalysis(),
    cameraReady: true,
    captureLocked: true,
    holdTracker: hold,
    now: start + AUTO_CAPTURE_CONFIG.requiredAlignmentMs,
  });
  assert.equal(locked.shouldCapture, false);
});

test("pixelsPerMm uses outer 23mm only", () => {
  assert.equal(calculatePixelsPerMm(230, 23), 10);
  assert.equal(OPEN_CV_SIZING_CONFIG.coin.diameterMm, 23);
  assert.equal(calculateNailWidthMm(115, 10), 11.5);
  assert.equal(pixelsPerMillimeter(230, 23), 10);
  assert.equal(widthPxToMm(115, 10), 11.5);
});

test("processing rate is capped at 5 FPS with 320px ROI", () => {
  assert.equal(OPEN_CV_SIZING_CONFIG.processingFps, 5);
  assert.equal(OPEN_CV_SIZING_CONFIG.processingIntervalMs, 200);
  assert.equal(OPEN_CV_SIZING_CONFIG.maxProcessingWidth, 320);
  assert.equal(OPEN_CV_SIZING_CONFIG.capture.cameraWarmupMs, 2500);
});

test("coin ROI stays in frame", () => {
  const roi = getCoinRoi(720, 1280, 0.2);
  assert.ok(roi.x >= 0 && roi.y >= 0);
  assert.ok(roi.x + roi.width <= 720);
  assert.ok(roi.y + roi.height <= 1280);
});

test("ensureCanvasSize only changes when needed", () => {
  const canvas = { width: 100, height: 80 };
  assert.equal(ensureCanvasSize(canvas, 100, 80), false);
  assert.equal(ensureCanvasSize(canvas, 320, 240), true);
  assert.equal(canvas.width, 320);
  assert.equal(canvas.height, 240);
});

test("selectBestCoinCandidate rejects empty list", () => {
  const roi = {
    x: 100,
    y: 80,
    width: 200,
    height: 200,
    guide: { cx: 200, cy: 180, diameterPx: 100, radiusPx: 50 },
  };
  const result = selectBestCoinCandidate([], { roi, guide: roi.guide, scale: 1, fullWidth: 720, fullHeight: 1280 });
  assert.equal(result.detected, false);
  assert.equal(result.reason, "coin-not-detected");
});

test("selectBestCoinCandidate scores centered circle", () => {
  const roi = {
    x: 100,
    y: 80,
    width: 200,
    height: 200,
    guide: { cx: 200, cy: 180, diameterPx: 100, radiusPx: 50 },
  };
  const result = selectBestCoinCandidate(
    [{ centerX: 200, centerY: 180, radiusPx: 50, diameterPx: 100 }],
    { roi, guide: roi.guide, scale: 1, fullWidth: 720, fullHeight: 1280 }
  );
  assert.ok(result.confidence > 0.3);
  assert.equal(result.scaleValid, true);
  assert.ok(Math.abs(result.pixelsPerMm - 100 / 23) < 1e-9);
});

test("detectCoin refuses huge frames without scaled ROI path", () => {
  const huge = { data: new Uint8ClampedArray(640 * 640 * 4), width: 640, height: 640 };
  const result = detectCoin(null, huge, { x: 0, y: 0, width: 640, height: 640 });
  assert.equal(result.detected, false);
  assert.equal(result.reason, "opencv-unavailable");
});

test("detectCoin rejects oversized imageData when cv missing already", () => {
  const huge = { data: new Uint8ClampedArray(4), width: 640, height: 640 };
  const fakeCv = { Mat: function Mat() {} };
  // without HoughCircles — unavailable
  const result = detectCoin(fakeCv, huge, { x: 0, y: 0, width: 640, height: 640 });
  assert.equal(result.detected, false);
});

test("lighting hints are specific", () => {
  assert.equal(lightingReasonToHint("too-dark"), "עברִי למקום מואר יותר");
});

test("nail detector does not fabricate width", () => {
  const miss = nailDetector.detect(null, null);
  assert.equal(miss.detected, false);
  assert.equal(miss.widthPx, null);
});

test("buildCaptureGate.ready matches evaluateMeasurementQuality", () => {
  const analysis = mockAnalysis();
  assert.equal(
    buildCaptureGate(analysis, { cameraReady: true }).ready,
    evaluateMeasurementQuality(analysis, { cameraReady: true }).ready
  );
});

test("no processing before camera ready in gate", () => {
  const q = evaluateMeasurementQuality(mockAnalysis(), { cameraReady: false });
  assert.equal(q.ready, false);
  assert.ok(q.blockers.includes("camera-not-ready"));
});
