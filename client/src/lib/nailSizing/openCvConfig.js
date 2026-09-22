/**
 * Central OpenCV sizing config — single place for thresholds / timing.
 * Values are calibrated against the existing capture gate + 10₪ guide layout.
 */

import { AUTO_CAPTURE_CONFIG, TEN_SHEKEL_COIN } from "./captureConfig.js";

export const OPEN_CV_SIZING_CONFIG = {
  /** Max analysis rate while camera is live */
  processingFps: 10,

  /** Expand guide ROI by this fraction on each side */
  coinRoiPadding: 0.2,

  hough: {
    dp: 1.2,
    minDistanceRatio: 0.45,
    cannyThreshold: 100,
    accumulatorThreshold: 28,
    minRadiusRatio: 0.22,
    maxRadiusRatio: 0.55,
  },

  coin: {
    diameterMm: TEN_SHEKEL_COIN.outerDiameterMm,
    innerDiameterMm: TEN_SHEKEL_COIN.innerDiameterMm,
    minConfidence: 0.72,
    minScaleRatio: 0.65,
    maxScaleRatio: 1.4,
    /** How close to guide center (as fraction of guide radius) */
    maxCenterOffsetFrac: 0.55,
    /** Margin from frame edge before marking clipped */
    edgeMarginPx: 4,
    /** Tolerate bimetallic inner/outer ratio drift */
    innerRatioTolerance: 0.22,
    /** Prefer candidates near previous frame (stability) */
    temporalWeight: 0.15,
  },

  quality: {
    /** Laplacian variance — reject only unusable blur */
    minimumSharpness: 45,
    minimumBrightness: 40,
    maximumBrightness: 225,
    maxDarkPixelRatio: 0.55,
    maxBrightPixelRatio: 0.35,
    minContrast: 18,
  },

  capture: {
    cameraWarmupMs: AUTO_CAPTURE_CONFIG.cameraWarmupMs,
    requiredValidMs: AUTO_CAPTURE_CONFIG.requiredAlignmentMs,
  },
};

export { TEN_SHEKEL_COIN };
