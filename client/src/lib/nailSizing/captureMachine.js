import {
  AUTO_CAPTURE_CONFIG,
  CAPTURE_CONFIG,
  CaptureState,
  isLiveCaptureState,
} from "./captureConfig.js";
import {
  evaluateMeasurementQuality,
  getInstructionFromBlockers,
} from "./measurementQuality.js";

export { AUTO_CAPTURE_CONFIG, CAPTURE_CONFIG, CaptureState, isLiveCaptureState };
export { evaluateMeasurementQuality, getInstructionFromBlockers, QUALITY_THRESHOLDS } from "./measurementQuality.js";

/**
 * @deprecated Prefer evaluateMeasurementQuality(...).ready
 * Kept for geometry-only checks in tests / UI nudges.
 */
export function isFrameReadyForCapture(result) {
  if (!result) return false;
  return (
    result.cameraReady === true &&
    result.coinDetected === true &&
    result.fingerDetected === true &&
    result.coinAboveFinger === true &&
    result.horizontalAlignmentValid === true &&
    result.coinScaleValid === true &&
    result.verticalDistanceValid === true
  );
}

/**
 * Build display gate from quality evaluation (geometry + same ready as approval).
 */
export function buildCaptureGate(analysis, { cameraReady = false } = {}) {
  const quality = evaluateMeasurementQuality(analysis, { cameraReady });
  const g = quality.geometryGate || {};
  return {
    cameraReady: !!cameraReady,
    coinDetected: !!g.coinDetected,
    fingerDetected: !!g.fingerDetected,
    coinAboveFinger: !!g.coinAboveFinger,
    horizontalAlignmentValid: !!g.horizontalAlignmentValid,
    coinScaleValid: !!g.coinScaleValid,
    verticalDistanceValid: !!g.verticalDistanceValid,
    /** Capture & approve use the same ready flag */
    ready: !!quality.ready,
    quality,
    debug: {
      ...g,
      confidence: quality.confidence,
      blockers: quality.blockers,
      metrics: quality.metrics,
    },
  };
}

/**
 * Warmup + continuous alignment hold. Geometry gate unchanged.
 */
export function createAlignmentHoldTracker(timing = AUTO_CAPTURE_CONFIG) {
  let cameraReadyAt = null;
  let validSince = null;

  return {
    get cameraReadyAt() {
      return cameraReadyAt;
    },
    markCameraReady(now = performance.now()) {
      cameraReadyAt = now;
      validSince = null;
    },
    resetSession() {
      cameraReadyAt = null;
      validSince = null;
    },
    resetAlignment() {
      validSince = null;
    },
    evaluate({ ready, captureLocked, now = performance.now() }) {
      if (captureLocked) {
        return {
          shouldCapture: false,
          progress: 0,
          warmupComplete: false,
          blockedBy: "captureLocked",
          validDuration: 0,
        };
      }
      if (cameraReadyAt == null) {
        return {
          shouldCapture: false,
          progress: 0,
          warmupComplete: false,
          blockedBy: "cameraNotMarkedReady",
          validDuration: 0,
        };
      }

      const warmupComplete = now - cameraReadyAt >= timing.cameraWarmupMs;
      if (!warmupComplete) {
        validSince = null;
        return {
          shouldCapture: false,
          progress: 0,
          warmupComplete: false,
          blockedBy: "warmup",
          validDuration: 0,
          warmupRemainingMs: Math.max(0, timing.cameraWarmupMs - (now - cameraReadyAt)),
        };
      }

      if (!ready) {
        validSince = null;
        return {
          shouldCapture: false,
          progress: 0,
          warmupComplete: true,
          blockedBy: "alignment",
          validDuration: 0,
        };
      }

      if (validSince == null) validSince = now;
      const validDuration = now - validSince;
      const progress = Math.min(1, validDuration / timing.requiredAlignmentMs);
      if (validDuration >= timing.requiredAlignmentMs) {
        validSince = null;
        return {
          shouldCapture: true,
          progress: 1,
          warmupComplete: true,
          blockedBy: null,
          validDuration,
        };
      }
      return {
        shouldCapture: false,
        progress,
        warmupComplete: true,
        blockedBy: null,
        validDuration,
      };
    },
  };
}

/**
 * Single auto-capture decision path: geometry gate + warmup + alignment hold.
 */
export function handleDetectionForCapture({
  analysis,
  cameraReady,
  captureLocked,
  holdTracker,
  now = performance.now(),
}) {
  const gate = buildCaptureGate(analysis, { cameraReady });
  if (!holdTracker) {
    return {
      gate,
      shouldCapture: false,
      progress: 0,
      warmupComplete: false,
      blockedBy: "missingHoldTracker",
      quality: gate.quality,
    };
  }
  const hold = holdTracker.evaluate({
    ready: gate.ready, // quality.ready — same as post-capture approval
    captureLocked,
    now,
  });
  return {
    gate,
    shouldCapture: hold.shouldCapture,
    progress: hold.progress,
    warmupComplete: hold.warmupComplete,
    blockedBy:
      hold.blockedBy ||
      (gate.ready ? null : gate.quality?.blockers?.[0] || firstFalseKey(gate)),
    validDuration: hold.validDuration || 0,
    quality: gate.quality,
  };
}

function firstFalseKey(gate) {
  const keys = [
    "cameraReady",
    "coinDetected",
    "fingerDetected",
    "coinAboveFinger",
    "horizontalAlignmentValid",
    "coinScaleValid",
    "verticalDistanceValid",
  ];
  for (const k of keys) {
    if (gate[k] !== true) return k;
  }
  return "quality";
}

export function deriveLiveState(gate, { warmupComplete = true } = {}) {
  if (!gate?.cameraReady) return CaptureState.INITIALIZING;
  if (!warmupComplete) return CaptureState.SEARCHING;
  if (!gate.coinDetected && !gate.fingerDetected) return CaptureState.SEARCHING;
  if (!gate.ready) return CaptureState.ALIGNING;
  return CaptureState.HOLD_STILL;
}

export function hintForState(state, gate, failReason, { warmupComplete = true } = {}) {
  if (state === CaptureState.INITIALIZING) return "מכינים את המצלמה…";
  if (state === CaptureState.CAPTURING) return "מצלמים…";
  if (state === CaptureState.SUCCESS) return "הצילום בוצע בהצלחה";
  if (state === CaptureState.FAILED) return failReason || "הצילום נכשל — מנסים שוב";
  if (!warmupComplete) return "מקמי את המטבע ואת האצבע בתוך המסגרות";
  if (state === CaptureState.HOLD_STILL || state === CaptureState.COUNTING_DOWN) {
    return "מעולה — הישארי במקום";
  }
  if (gate?.quality?.blockers?.length) {
    return getInstructionFromBlockers(gate.quality.blockers);
  }
  if (!gate) return "מקמי את המטבע למעלה ואת האצבע ישירות מתחתיו";
  if (!gate.coinDetected) return "מקמי את המטבע באזור העליון";
  if (!gate.fingerDetected) return "מקמי את האצבע ישירות מתחת למטבע";
  if (!gate.coinAboveFinger) return "המטבע צריך להיות מעל האצבע";
  if (!gate.horizontalAlignmentValid) return "יישרי את האצבע מתחת למרכז המטבע";
  if (!gate.verticalDistanceValid) return "קרבי מעט את האצבע אל המטבע";
  if (!gate.coinScaleValid) return "קרבי או הרחיקי מעט את הטלפון";
  return "מקמי את המטבע למעלה ואת האצבע ישירות מתחתיו";
}
