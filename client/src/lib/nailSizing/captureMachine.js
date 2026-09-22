import {
  AUTO_CAPTURE_CONFIG,
  CAPTURE_CONFIG,
  CaptureState,
  isLiveCaptureState,
} from "./captureConfig.js";

export { AUTO_CAPTURE_CONFIG, CAPTURE_CONFIG, CaptureState, isLiveCaptureState };

/**
 * Single capture gate — geometry only. No sharpness/lighting/nail-precision.
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
 * Build gate flags from live analysis (+ camera ready).
 */
export function buildCaptureGate(analysis, { cameraReady = false } = {}, config = CAPTURE_CONFIG) {
  const coin = analysis?.coin;
  const nail = analysis?.finger || analysis?.nail;
  const diameterPx = coin?.outerDiameterPx || coin?.diameterPx || 0;
  const radiusPx = diameterPx / 2;
  const coinCx = coin?.center?.x;
  const coinCy = coin?.center?.y;
  const fingerCx = nail?.center?.x;
  const fingerCy = nail?.center?.y;
  const fingerTopY = nail?.topY ?? (fingerCy != null ? fingerCy - (nail?.heightPx || diameterPx * 0.4) / 2 : null);

  const coinDetected =
    cameraReady &&
    !!coin &&
    (coin.found === true || (coin.score ?? 0) >= config.COIN_CONFIDENCE_MIN) &&
    diameterPx > 8 &&
    coinCx != null &&
    coinCy != null &&
    !coin.multiCoin;

  const fingerDetected =
    cameraReady &&
    !!nail &&
    (nail.found === true || nail.presence === true) &&
    fingerCx != null &&
    fingerCy != null;

  const coinAboveFinger =
    coinDetected && fingerDetected && coinCy < (fingerTopY ?? fingerCy);

  const horizontalDifference =
    coinDetected && fingerDetected ? Math.abs(coinCx - fingerCx) : Infinity;
  const horizontalAlignmentValid =
    coinDetected && fingerDetected && horizontalDifference <= diameterPx * config.ALIGN_X_FRAC;

  const sizeRatio = coin?.sizeRatio;
  const coinScaleValid =
    coinDetected &&
    (sizeRatio == null ||
      (sizeRatio >= config.COIN_SIZE_RATIO_MIN && sizeRatio <= config.COIN_SIZE_RATIO_MAX));

  const verticalGap =
    coinDetected && fingerDetected && fingerTopY != null
      ? fingerTopY - (coinCy + radiusPx)
      : null;
  const verticalDistanceValid =
    verticalGap != null &&
    verticalGap >= diameterPx * config.VERTICAL_GAP_MIN_FRAC &&
    verticalGap <= diameterPx * config.VERTICAL_GAP_MAX_FRAC;

  const gate = {
    cameraReady: !!cameraReady,
    coinDetected: !!coinDetected,
    fingerDetected: !!fingerDetected,
    coinAboveFinger: !!coinAboveFinger,
    horizontalAlignmentValid: !!horizontalAlignmentValid,
    coinScaleValid: !!coinScaleValid,
    verticalDistanceValid: !!verticalDistanceValid,
  };

  return {
    ...gate,
    ready: isFrameReadyForCapture(gate),
    debug: {
      ...gate,
      horizontalDifference: Number.isFinite(horizontalDifference) ? Math.round(horizontalDifference) : null,
      verticalGap: verticalGap != null ? Math.round(verticalGap) : null,
      diameterPx: Math.round(diameterPx),
      sizeRatio: sizeRatio != null ? Math.round(sizeRatio * 100) / 100 : null,
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
  config = CAPTURE_CONFIG,
}) {
  const gate = buildCaptureGate(analysis, { cameraReady }, config);
  if (!holdTracker) {
    return {
      gate,
      shouldCapture: false,
      progress: 0,
      warmupComplete: false,
      blockedBy: "missingHoldTracker",
    };
  }
  const hold = holdTracker.evaluate({
    ready: gate.ready,
    captureLocked,
    now,
  });
  return {
    gate,
    shouldCapture: hold.shouldCapture,
    progress: hold.progress,
    warmupComplete: hold.warmupComplete,
    blockedBy: hold.blockedBy || (gate.ready ? null : firstFalseKey(gate)),
    validDuration: hold.validDuration || 0,
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
  return null;
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
  if (!gate) return "מקמי את המטבע למעלה ואת האצבע ישירות מתחתיו";
  if (!gate.coinDetected) return "מקמי את המטבע באזור העליון";
  if (!gate.fingerDetected) return "מקמי את האצבע ישירות מתחת למטבע";
  if (!gate.coinAboveFinger) return "המטבע צריך להיות מעל האצבע";
  if (!gate.horizontalAlignmentValid) return "יישרי את האצבע מתחת למרכז המטבע";
  if (!gate.verticalDistanceValid) return "קרבי מעט את האצבע אל המטבע";
  if (!gate.coinScaleValid) return "קרבי או הרחיקי מעט את הטלפון";
  return "מקמי את המטבע למעלה ואת האצבע ישירות מתחתיו";
}
