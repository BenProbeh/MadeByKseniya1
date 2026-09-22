/**
 * Central OpenCV sizing config — single place for thresholds / timing.
 */

import { AUTO_CAPTURE_CONFIG, TEN_SHEKEL_COIN } from "./captureConfig.js";

export const OPEN_CV_SIZING_CONFIG = {
  /** Live detection rate — keep low to protect main thread */
  processingFps: 5,
  processingIntervalMs: 200,

  /** Downscale ROI before Hough (never process full HD) */
  maxProcessingWidth: 320,

  /** Expand guide ROI by this fraction on each side */
  coinRoiPadding: 0.2,

  /** Max Hough candidates to score deeply */
  maxCandidatesToScore: 5,

  hough: {
    dp: 1.2,
    minDistanceRatio: 0.4,
    cannyThreshold: 100,
    accumulatorThreshold: 30,
    /** Relative to resized ROI expected radius */
    minRadiusFactor: 0.65,
    maxRadiusFactor: 1.35,
    expectedRadiusFrac: 0.22,
  },

  coin: {
    diameterMm: TEN_SHEKEL_COIN.outerDiameterMm,
    innerDiameterMm: TEN_SHEKEL_COIN.innerDiameterMm,
    minConfidence: 0.72,
    minScaleRatio: 0.65,
    maxScaleRatio: 1.4,
    maxCenterOffsetFrac: 0.55,
    edgeMarginPx: 4,
    innerRatioTolerance: 0.22,
    temporalWeight: 0.15,
  },

  quality: {
    minimumSharpness: 35,
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

  ui: {
    minUpdateIntervalMs: 250,
    debugUpdateIntervalMs: 400,
  },
};

export { TEN_SHEKEL_COIN };
