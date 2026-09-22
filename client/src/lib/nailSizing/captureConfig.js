/**
 * Capture config — fast 3-frame auto-capture (bank-check style).
 * Nail precision runs on the frozen frame after capture.
 */

export const TEN_SHEKEL_COIN = {
  outerDiameterMm: 23,
  innerDiameterMm: 16,
  calibrationDiameterMm: 23,
};

export const CAPTURE_CONFIG = {
  /** Consecutive valid frames required before auto-capture. */
  REQUIRED_VALID_FRAMES: 3,
  FRAME_INTERVAL_MS: 80,

  /** Generous geometric tolerances for live capture gate. */
  ALIGN_X_FRAC: 0.35,
  VERTICAL_GAP_MIN_FRAC: -0.1,
  VERTICAL_GAP_MAX_FRAC: 1.25,
  COIN_SIZE_RATIO_MIN: 0.55,
  COIN_SIZE_RATIO_MAX: 1.6,
  COIN_GUIDE_TOLERANCE: 0.35,
  FINGER_GUIDE_TOLERANCE: 0.4,

  /** Soft live detection floors (not post-capture nail precision). */
  COIN_CONFIDENCE_MIN: 0.14,
  FINGER_SCORE_MIN: 0.12,

  /** Kept for post-capture measurement heuristics only. */
  SHARPNESS_MIN: 12,
  BRIGHTNESS_MIN: 40,
  BRIGHTNESS_MAX: 230,
  NAIL_SCORE_MIN: 0.15,
  PERSPECTIVE_MIN: 0.55,
  DETECTION_CONFIDENCE_MIN: 0.3,

  SUCCESS_HOLD_MS: 700,
  FAILED_HOLD_MS: 900,
  CAPTURE_FLASH_MS: 160,
};

export const CaptureState = {
  INITIALIZING: "initializing",
  SEARCHING: "searching",
  ALIGNING: "aligning",
  HOLD_STILL: "hold-still",
  COUNTING_DOWN: "counting-down",
  CAPTURING: "capturing",
  VALIDATING: "validating",
  SUCCESS: "success",
  FAILED: "failed",
  REVIEW: "review",
};

export function isLiveCaptureState(state) {
  return (
    state === CaptureState.SEARCHING ||
    state === CaptureState.ALIGNING ||
    state === CaptureState.HOLD_STILL ||
    state === CaptureState.COUNTING_DOWN
  );
}
