/**
 * Central capture / quality config for nail-sizing auto-capture.
 * Tune here — do not scatter magic numbers across the UI.
 */

export const TEN_SHEKEL_COIN = {
  outerDiameterMm: 23,
  innerDiameterMm: 16,
  calibrationDiameterMm: 23,
};

export const CAPTURE_CONFIG = {
  /** Live stability window before auto-capture (ms). */
  REQUIRED_STABLE_MS: 800,
  /** Minimum consecutive quality+stable frames inside the window. */
  MIN_STABLE_FRAMES: 12,
  /** Max analysis loop interval (ms). Keep ≤ REQUIRED_STABLE_MS / MIN_STABLE_FRAMES. */
  FRAME_INTERVAL_MS: 60,

  /** Motion tolerances as fraction of coin outer diameter (or absolute for sharpness). */
  MAX_COIN_CENTER_DELTA_FRAC: 0.045,
  MAX_COIN_DIAMETER_DELTA_FRAC: 0.06,
  MAX_FINGER_CENTER_DELTA_FRAC: 0.06,
  MAX_NAIL_WIDTH_DELTA_FRAC: 0.08,
  MAX_SHARPNESS_DELTA_RATIO: 0.35,

  /** Quality thresholds (device-tunable). */
  SHARPNESS_MIN: 18,
  BRIGHTNESS_MIN: 55,
  BRIGHTNESS_MAX: 210,
  COIN_CONFIDENCE_MIN: 0.28,
  NAIL_SCORE_MIN: 0.25,
  PERSPECTIVE_MIN: 0.72,
  COIN_SIZE_RATIO_MIN: 0.78,
  COIN_SIZE_RATIO_MAX: 1.28,
  ALIGN_X_FRAC: 0.18,
  DETECTION_CONFIDENCE_MIN: 0.45,

  /** Post-capture UX timing. */
  SUCCESS_HOLD_MS: 1100,
  FAILED_HOLD_MS: 1600,
  CAPTURE_FLASH_MS: 180,
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
