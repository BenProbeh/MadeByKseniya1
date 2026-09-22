import { CAPTURE_CONFIG, CaptureState, isLiveCaptureState } from "./captureConfig.js";

export { CAPTURE_CONFIG, CaptureState, isLiveCaptureState };

/**
 * Snapshot used for multi-frame stability (not a fake timer).
 */
export function toStabilitySample(analysis, now = performance.now()) {
  if (!analysis) return null;
  return {
    t: now,
    ready: !!analysis.ready,
    confidence: analysis.confidence ?? 0,
    sharpness: analysis.sharpness ?? 0,
    coinCx: analysis.coin?.center?.x ?? 0,
    coinCy: analysis.coin?.center?.y ?? 0,
    coinD: analysis.coin?.outerDiameterPx || analysis.coin?.diameterPx || 0,
    nailCx: analysis.nail?.center?.x ?? 0,
    nailCy: analysis.nail?.center?.y ?? 0,
    nailW: analysis.nail?.widthPx ?? 0,
  };
}

export function createStabilityTracker(config = CAPTURE_CONFIG) {
  const samples = [];

  function reset() {
    samples.length = 0;
  }

  function motionOk(a, b) {
    const d = Math.max(a.coinD, b.coinD, 1);
    const coinCenterDelta = Math.hypot(a.coinCx - b.coinCx, a.coinCy - b.coinCy);
    const coinDDelta = Math.abs(a.coinD - b.coinD);
    const fingerDelta = Math.hypot(a.nailCx - b.nailCx, a.nailCy - b.nailCy);
    const nailWDelta = Math.abs(a.nailW - b.nailW);
    const sharpBase = Math.max(a.sharpness, b.sharpness, 1);
    const sharpDelta = Math.abs(a.sharpness - b.sharpness) / sharpBase;

    return (
      coinCenterDelta <= d * config.MAX_COIN_CENTER_DELTA_FRAC &&
      coinDDelta <= d * config.MAX_COIN_DIAMETER_DELTA_FRAC &&
      fingerDelta <= d * config.MAX_FINGER_CENTER_DELTA_FRAC &&
      nailWDelta <= Math.max(d * config.MAX_NAIL_WIDTH_DELTA_FRAC, 2) &&
      sharpDelta <= config.MAX_SHARPNESS_DELTA_RATIO
    );
  }

  function push(sample) {
    if (!sample) return { stable: false, progress: 0, stableMs: 0, frameCount: 0, motionValid: false };
    samples.push(sample);
    const cutoff = sample.t - config.REQUIRED_STABLE_MS * 2.5;
    while (samples.length && samples[0].t < cutoff) samples.shift();
    return evaluate(sample.t);
  }

  function evaluate(now = performance.now()) {
    if (!samples.length) {
      return { stable: false, progress: 0, stableMs: 0, frameCount: 0, motionValid: false };
    }

    // Trailing contiguous streak of ready + motion-consistent frames (not a fake timer).
    let start = samples.length - 1;
    const last = samples[start];
    if (!last.ready || last.confidence < config.DETECTION_CONFIDENCE_MIN) {
      return { stable: false, progress: 0, stableMs: 0, frameCount: 0, motionValid: false };
    }

    while (start > 0) {
      const cur = samples[start];
      const prev = samples[start - 1];
      if (!prev.ready || prev.confidence < config.DETECTION_CONFIDENCE_MIN) break;
      if (!motionOk(prev, cur)) break;
      start -= 1;
    }

    const streak = samples.slice(start);
    const stableMs = Math.max(0, now - streak[0].t);
    const motionValid = streak.length >= 2;
    const timeProgress = Math.max(0, Math.min(1, stableMs / config.REQUIRED_STABLE_MS));
    const progress = timeProgress;
    const stable =
      motionValid &&
      stableMs >= config.REQUIRED_STABLE_MS &&
      streak.length >= config.MIN_STABLE_FRAMES;

    return {
      stable,
      progress: streak.length >= 2 ? progress : 0,
      stableMs,
      frameCount: streak.length,
      motionValid: streak.length >= 2,
    };
  }

  return {
    push,
    reset,
    evaluate,
    get samples() {
      return samples;
    },
  };
}

/**
 * Gate for auto-capture — every flag must be true (detection-based, not timer).
 */
export function readyForAutoCapture({
  cameraReady,
  analysis,
  stability,
  captureLocked,
  config = CAPTURE_CONFIG,
}) {
  if (!cameraReady || captureLocked || !analysis || !stability) return false;
  const v = analysis.validation || {};
  return (
    !!analysis.ready &&
    !!v.coinValid &&
    !analysis.coin?.clipped &&
    !!v.sizeOk &&
    !!v.perspectiveValid &&
    !!v.fingerValid &&
    !!v.nailValid &&
    !!v.verticalAlignmentValid &&
    !!v.distanceValid &&
    !!v.lightingValid &&
    !!v.sharpnessValid &&
    !!stability.motionValid &&
    (analysis.confidence ?? 0) >= config.DETECTION_CONFIDENCE_MIN &&
    !!stability.stable &&
    !captureLocked
  );
}

export function deriveLiveState(analysis, stability) {
  if (!analysis) return CaptureState.SEARCHING;
  const foundSomething = analysis.coin?.found || analysis.nail?.found;
  if (!foundSomething) return CaptureState.SEARCHING;
  if (!analysis.ready) return CaptureState.ALIGNING;
  if (stability?.stable) return CaptureState.COUNTING_DOWN;
  if ((stability?.progress || 0) > 0.08) return CaptureState.COUNTING_DOWN;
  return CaptureState.HOLD_STILL;
}

export function hintForState(state, analysis, failReason) {
  if (state === CaptureState.INITIALIZING) return "מכינים את המצלמה…";
  if (state === CaptureState.CAPTURING) return "מצלמים…";
  if (state === CaptureState.VALIDATING) return "בודקים את הצילום…";
  if (state === CaptureState.SUCCESS) return "הצילום בוצע בהצלחה";
  if (state === CaptureState.FAILED) return failReason || "הצילום לא עבר בדיקה — מנסים שוב";
  if (state === CaptureState.HOLD_STILL || state === CaptureState.COUNTING_DOWN) {
    return "מעולה — הישארי במקום";
  }
  return analysis?.tips?.[0]?.textHe || "מקמי את המטבע למעלה ואת האצבע ישירות מתחתיו";
}
