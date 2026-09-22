/**
 * Single source of truth for measurement quality — used for live capture gate,
 * frozen-frame validation, success ✓, and onConfirm.
 */

import { CAPTURE_CONFIG } from "./captureConfig.js";
import { CONFIDENCE_AUTO_OK } from "./sizing.js";

/** Approval thresholds — overallConfidence MUST match CONFIDENCE_AUTO_OK. */
export const QUALITY_THRESHOLDS = {
  overallConfidence: CONFIDENCE_AUTO_OK, // 0.72 — same gate before & after capture
  coinConfidence: 0.2,
  fingerConfidence: 0.15,
  nailConfidence: 0.2,
  alignmentScore: 0.7,
  scaleScore: 0.7,
  sharpnessScore: 0.5,
  lightingScore: 0.5,
};

const BLOCKER_HINTS = {
  "camera-not-ready": "ממתינים למצלמה…",
  "coin-not-detected": "מקמי את כל המטבע בתוך העיגול",
  "finger-not-detected": "מקמי את האצבע מתחת למטבע",
  "nail-not-detected": "ודאי שכל הציפורן גלויה",
  misaligned: "יישרי את האצבע מתחת למרכז המטבע",
  "incorrect-scale": "קרבי או הרחיקי מעט את הטלפון",
  "coin-clipped": "הכניסי את כל המטבע למסגרת",
  "multi-coin": "השאירי מטבע אחד בלבד בפריים",
  "too-blurry": "החזיקי את הטלפון יציב",
  "too-dark": "עברִי למקום מואר יותר",
  glare: "הפחיתי השתקפות ישירה על המטבע",
  "low-confidence": "שפרי את המיקום והחזיקי יציב",
  "coin-confidence": "מקמי את המטבע בבירור בתוך העיגול",
  "finger-confidence": "מקמי את האצבע ישירות מתחת למטבע",
  "nail-confidence": "ודאי שכל הציפורן גלויה וחדה",
  alignment: "יישרי את האצבע מתחת למרכז המטבע",
  scale: "קרבי או הרחיקי מעט את הטלפון",
  sharpness: "החזיקי את הטלפון יציב",
  lighting: "עברִי למקום מואר יותר",
};

function clamp01(n) {
  if (n == null || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeSharpness(sharpness) {
  // Engine uses Laplacian variance; CAPTURE_CONFIG.SHARPNESS_MIN ≈ 12
  const min = CAPTURE_CONFIG.SHARPNESS_MIN;
  const good = min * 3.5;
  return clamp01((sharpness - min * 0.5) / (good - min * 0.5));
}

function normalizeLighting(brightness) {
  const lo = CAPTURE_CONFIG.BRIGHTNESS_MIN;
  const hi = CAPTURE_CONFIG.BRIGHTNESS_MAX;
  if (brightness == null) return 0;
  if (brightness < lo) return clamp01(brightness / lo);
  if (brightness > hi) return clamp01(1 - (brightness - hi) / 60);
  // Peak near mid of acceptable band
  const mid = (lo + hi) / 2;
  const span = (hi - lo) / 2;
  return clamp01(1 - Math.abs(brightness - mid) / span * 0.35);
}

function alignmentMetric(gate) {
  if (!gate.coinAboveFinger) return 0;
  if (!gate.horizontalAlignmentValid) return 0.35;
  if (!gate.verticalDistanceValid) return 0.55;
  return 0.92;
}

function scaleMetric(coin) {
  const r = coin?.sizeRatio;
  if (r == null) return 0;
  if (r < CAPTURE_CONFIG.COIN_SIZE_RATIO_MIN || r > CAPTURE_CONFIG.COIN_SIZE_RATIO_MAX) return 0.25;
  // 1.0 ideal
  return clamp01(1 - Math.abs(r - 1) * 1.2);
}

/**
 * @param {object} analysis — result from analyzeFrame
 * @param {{ cameraReady?: boolean }} opts
 */
export function evaluateMeasurementQuality(analysis, { cameraReady = true } = {}) {
  const blockers = [];
  const empty = {
    ready: false,
    confidence: 0,
    blockers: ["camera-not-ready"],
    metrics: {
      coinConfidence: 0,
      fingerConfidence: 0,
      nailConfidence: 0,
      alignmentScore: 0,
      scaleScore: 0,
      sharpnessScore: 0,
      lightingScore: 0,
    },
    thresholds: QUALITY_THRESHOLDS,
  };

  if (!cameraReady || !analysis) return empty;

  const coin = analysis.coin;
  const nail = analysis.finger || analysis.nail;
  const diameterPx = coin?.outerDiameterPx || coin?.diameterPx || 0;
  const radiusPx = diameterPx / 2;
  const coinCx = coin?.center?.x;
  const coinCy = coin?.center?.y;
  const fingerCx = nail?.center?.x;
  const fingerCy = nail?.center?.y;
  const fingerTopY =
    nail?.topY ?? (fingerCy != null ? fingerCy - (nail?.heightPx || diameterPx * 0.4) / 2 : null);

  const coinDetected =
    !!coin &&
    (coin.found === true || (coin.score ?? 0) >= CAPTURE_CONFIG.COIN_CONFIDENCE_MIN) &&
    diameterPx > 8 &&
    coinCx != null &&
    coinCy != null &&
    !coin.multiCoin;

  const fingerDetected =
    !!nail && (nail.found === true || nail.presence === true) && fingerCx != null && fingerCy != null;

  const nailDetected = fingerDetected && nail.widthPx != null && nail.widthPx > 6;

  const coinAboveFinger = coinDetected && fingerDetected && coinCy < (fingerTopY ?? fingerCy);
  const horizontalDifference =
    coinDetected && fingerDetected ? Math.abs(coinCx - fingerCx) : Infinity;
  const alignmentValid =
    coinDetected &&
    fingerDetected &&
    horizontalDifference <= diameterPx * CAPTURE_CONFIG.ALIGN_X_FRAC &&
    coinAboveFinger;

  const sizeRatio = coin?.sizeRatio;
  const scaleValid =
    coinDetected &&
    (sizeRatio == null ||
      (sizeRatio >= CAPTURE_CONFIG.COIN_SIZE_RATIO_MIN &&
        sizeRatio <= CAPTURE_CONFIG.COIN_SIZE_RATIO_MAX));

  const coinFullyVisible = coinDetected && !coin.clipped;
  const nailFullyVisible = nailDetected && nail.tipVisible !== false;

  const verticalGap =
    coinDetected && fingerDetected && fingerTopY != null
      ? fingerTopY - (coinCy + radiusPx)
      : null;
  const verticalDistanceValid =
    verticalGap != null &&
    verticalGap >= diameterPx * CAPTURE_CONFIG.VERTICAL_GAP_MIN_FRAC &&
    verticalGap <= diameterPx * CAPTURE_CONFIG.VERTICAL_GAP_MAX_FRAC;

  // Soft geometry for gate display (warmup / aligning UX)
  const geometryGate = {
    cameraReady: true,
    coinDetected,
    fingerDetected,
    coinAboveFinger: !!coinAboveFinger,
    horizontalAlignmentValid:
      coinDetected && fingerDetected && horizontalDifference <= diameterPx * CAPTURE_CONFIG.ALIGN_X_FRAC,
    coinScaleValid: !!scaleValid,
    verticalDistanceValid: !!verticalDistanceValid,
  };

  if (!coinDetected) blockers.push(coin?.multiCoin ? "multi-coin" : "coin-not-detected");
  else if (!coinFullyVisible) blockers.push("coin-clipped");
  if (!fingerDetected) blockers.push("finger-not-detected");
  if (fingerDetected && !nailDetected) blockers.push("nail-not-detected");
  if (coinDetected && fingerDetected && !alignmentValid) blockers.push("misaligned");
  if (coinDetected && !scaleValid) blockers.push("incorrect-scale");

  const coinConfidence = coinDetected ? clamp01(Math.max(0.75, coin?.score ?? coin?.confidence ?? 0)) : 0;
  const fingerConfidence = fingerDetected
    ? clamp01(Math.max(0.72, nail?.score ?? 0.5))
    : 0;
  const nailConfidence = nailDetected ? clamp01(Math.max(0.78, nail?.score ?? 0.55)) : 0;
  const alignmentScore = alignmentMetric({
    ...geometryGate,
    coinAboveFinger,
    horizontalAlignmentValid: geometryGate.horizontalAlignmentValid,
    verticalDistanceValid,
  });
  const scaleScore = scaleValid ? clamp01(Math.max(0.78, scaleMetric(coin))) : scaleMetric(coin);
  const sharpnessScore = normalizeSharpness(analysis.sharpness);
  const lightingScore = normalizeLighting(analysis.brightness);

  if (sharpnessScore < QUALITY_THRESHOLDS.sharpnessScore) blockers.push("too-blurry");
  if (analysis.brightness != null && analysis.brightness < CAPTURE_CONFIG.BRIGHTNESS_MIN) {
    blockers.push("too-dark");
  } else if (analysis.brightness != null && analysis.brightness > CAPTURE_CONFIG.BRIGHTNESS_MAX) {
    blockers.push("glare");
  }

  const hardRequirementsPassed =
    coinDetected &&
    fingerDetected &&
    nailDetected &&
    coinAboveFinger &&
    alignmentValid &&
    scaleValid &&
    coinFullyVisible &&
    nailFullyVisible &&
    verticalDistanceValid &&
    sharpnessScore >= QUALITY_THRESHOLDS.sharpnessScore &&
    lightingScore >= QUALITY_THRESHOLDS.lightingScore;

  const overallConfidence = clamp01(
    coinConfidence * 0.2 +
      fingerConfidence * 0.15 +
      nailConfidence * 0.3 +
      alignmentScore * 0.15 +
      sharpnessScore * 0.1 +
      lightingScore * 0.1
  );

  if (hardRequirementsPassed) {
    if (coinConfidence < QUALITY_THRESHOLDS.coinConfidence) blockers.push("coin-confidence");
    if (fingerConfidence < QUALITY_THRESHOLDS.fingerConfidence) blockers.push("finger-confidence");
    if (nailConfidence < QUALITY_THRESHOLDS.nailConfidence) blockers.push("nail-confidence");
    if (alignmentScore < QUALITY_THRESHOLDS.alignmentScore) blockers.push("alignment");
    if (scaleScore < QUALITY_THRESHOLDS.scaleScore) blockers.push("scale");
    if (overallConfidence < QUALITY_THRESHOLDS.overallConfidence) blockers.push("low-confidence");
  }

  const metricsOk =
    coinConfidence >= QUALITY_THRESHOLDS.coinConfidence &&
    fingerConfidence >= QUALITY_THRESHOLDS.fingerConfidence &&
    nailConfidence >= QUALITY_THRESHOLDS.nailConfidence &&
    alignmentScore >= QUALITY_THRESHOLDS.alignmentScore &&
    scaleScore >= QUALITY_THRESHOLDS.scaleScore &&
    overallConfidence >= QUALITY_THRESHOLDS.overallConfidence;

  const ready = hardRequirementsPassed && metricsOk;

  // Deduplicate blockers
  const uniqueBlockers = [...new Set(blockers)];

  return {
    ready,
    confidence: overallConfidence,
    blockers: ready ? [] : uniqueBlockers,
    metrics: {
      coinConfidence,
      fingerConfidence,
      nailConfidence,
      alignmentScore,
      scaleScore,
      sharpnessScore,
      lightingScore,
    },
    thresholds: QUALITY_THRESHOLDS,
    geometryGate: {
      ...geometryGate,
      ready: isGeometryReady(geometryGate),
    },
    hardRequirementsPassed,
  };
}

function isGeometryReady(g) {
  return (
    g.cameraReady &&
    g.coinDetected &&
    g.fingerDetected &&
    g.coinAboveFinger &&
    g.horizontalAlignmentValid &&
    g.coinScaleValid &&
    g.verticalDistanceValid
  );
}

export function getInstructionFromBlockers(blockers) {
  if (!blockers?.length) return "מקמי את המטבע למעלה ואת האצבע ישירות מתחתיו";
  const first = blockers[0];
  return BLOCKER_HINTS[first] || "שפרי את המיקום והחזיקי יציב";
}

export function isQualityReadyForCapture(quality) {
  return !!quality?.ready;
}
