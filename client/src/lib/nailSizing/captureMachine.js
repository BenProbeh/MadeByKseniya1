import { CAPTURE_CONFIG, CaptureState, isLiveCaptureState } from "./captureConfig.js";

export { CAPTURE_CONFIG, CaptureState, isLiveCaptureState };

/**
 * Single capture gate — geometry only. No sharpness/lighting/nail-precision/stability timers.
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
    framesNeeded: config.REQUIRED_VALID_FRAMES,
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
 * Pure consecutive-frame counter (ref-friendly). No timers.
 */
export function createFrameCounter(required = CAPTURE_CONFIG.REQUIRED_VALID_FRAMES) {
  let count = 0;
  return {
    get count() {
      return count;
    },
    push(ready) {
      if (ready) count += 1;
      else count = 0;
      return count;
    },
    shouldCapture() {
      return count >= required;
    },
    reset() {
      count = 0;
    },
  };
}

/**
 * Drive auto-capture decision from gate + counter + lock.
 * Returns { count, shouldCapture, gate }.
 */
export function handleDetectionForCapture({
  analysis,
  cameraReady,
  captureLocked,
  counter,
  config = CAPTURE_CONFIG,
}) {
  const gate = buildCaptureGate(analysis, { cameraReady }, config);
  if (captureLocked) {
    return { count: counter.count, shouldCapture: false, gate, blockedBy: "captureLocked" };
  }
  const count = counter.push(gate.ready);
  const shouldCapture = count >= config.REQUIRED_VALID_FRAMES;
  if (shouldCapture) counter.reset();
  return {
    count: shouldCapture ? config.REQUIRED_VALID_FRAMES : count,
    shouldCapture,
    gate,
    blockedBy: gate.ready ? null : firstFalseKey(gate),
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

export function deriveLiveState(gate) {
  if (!gate?.cameraReady) return CaptureState.INITIALIZING;
  if (!gate.coinDetected && !gate.fingerDetected) return CaptureState.SEARCHING;
  if (!gate.ready) return CaptureState.ALIGNING;
  return CaptureState.HOLD_STILL;
}

export function hintForState(state, gate, failReason) {
  if (state === CaptureState.INITIALIZING) return "מכינים את המצלמה…";
  if (state === CaptureState.CAPTURING) return "מצלמים…";
  if (state === CaptureState.SUCCESS) return "הצילום בוצע בהצלחה";
  if (state === CaptureState.FAILED) return failReason || "הצילום נכשל — מנסים שוב";
  if (state === CaptureState.HOLD_STILL || state === CaptureState.COUNTING_DOWN) {
    return "מעולה — מצלמים";
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

/** @deprecated — kept so old imports don't crash; always prefer isFrameReadyForCapture */
export function readyForAutoCapture(args) {
  const gate = buildCaptureGate(args.analysis, { cameraReady: args.cameraReady });
  return gate.ready && !args.captureLocked && (args.stability?.stable !== false || args.frameCount >= 3);
}
