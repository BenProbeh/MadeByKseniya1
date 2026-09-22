/**
 * Compose OpenCV coin/quality + modular nail detector into analyzeFrame-compatible result.
 * OpenCV is source of truth for coin, sharpness, lighting, pixelsPerMm.
 */

import { OPEN_CV_SIZING_CONFIG } from "./openCvConfig.js";
import { getCoinRoi, calculatePixelsPerMm, calculateNailWidthMm } from "./frameCapture.js";
import { detectCoin, coinResultToAnalysisCoin } from "./coinDetector.js";
import { evaluateImageQuality, lightingReasonToHint } from "./imageQuality.js";
import { nailDetector } from "./nailDetector.js";
import { GUIDE_LAYOUT } from "./measurementEngine.js";
import { CAPTURE_CONFIG } from "./captureConfig.js";

function emptyNail(guide) {
  return {
    found: false,
    presence: false,
    widthPx: null,
    score: 0,
    left: null,
    right: null,
    center: { x: guide.cx, y: guide.cy + guide.diameterPx },
    topY: guide.cy + guide.diameterPx / 2,
    tipVisible: false,
    reason: "nail-not-detected",
    method: "none",
  };
}

/**
 * @param {object} cv — OpenCV runtime
 * @param {ImageData} imageData
 * @param {{ coinDiameterMm?: number, coinMeta?: object, prevCoin?: object|null }} opts
 */
export function analyzeFrameWithOpenCv(cv, imageData, opts = {}) {
  const { coinDiameterMm = 23, coinMeta = null, prevCoin = null } = opts;
  const width = imageData.width;
  const height = imageData.height;
  const minSide = Math.min(width, height);
  const targetDiameterPx = minSide * GUIDE_LAYOUT.coinDiameterFrac;
  const guideCoinCx = width * GUIDE_LAYOUT.coinCx;
  const guideCoinCy = height * GUIDE_LAYOUT.coinCy;
  const outerMm = coinMeta?.outerDiameterMm ?? coinDiameterMm ?? OPEN_CV_SIZING_CONFIG.coin.diameterMm;

  const roi = getCoinRoi(width, height, OPEN_CV_SIZING_CONFIG.coinRoiPadding);
  const coinResult = detectCoin(cv, imageData, roi, OPEN_CV_SIZING_CONFIG, prevCoin);
  const quality = evaluateImageQuality(cv, imageData, roi, OPEN_CV_SIZING_CONFIG);

  const coin = coinResultToAnalysisCoin(coinResult, targetDiameterPx);
  // Prefer OpenCV diameter for calibration even when soft-detected
  if (coinResult.diameterPx > 0) {
    coin.diameterPx = coinResult.diameterPx;
    coin.outerDiameterPx = coinResult.diameterPx;
    coin.sizeRatio = coinResult.sizeRatio || coin.diameterPx / targetDiameterPx;
    coin.pixelsPerMm = coinResult.pixelsPerMm ?? calculatePixelsPerMm(coin.diameterPx, outerMm);
    coin.center = { x: coinResult.centerX, y: coinResult.centerY };
    coin.score = coinResult.confidence;
    coin.confidence = coinResult.confidence;
    coin.found = !!coinResult.detected;
    coin.clipped = !!coinResult.clipped || !coinResult.fullyVisible;
    coin.fullyVisible = !!coinResult.fullyVisible;
    coin.scaleValid = !!coinResult.scaleValid;
    coin.perspectiveValid = !!coinResult.perspectiveValid;
    coin.perspectiveRatio = coinResult.perspectiveRatio ?? coin.perspectiveRatio;
    coin.openCv = true;
  }

  const guide = { cx: guideCoinCx, cy: guideCoinCy, diameterPx: targetDiameterPx };
  let nail = emptyNail(guide);
  if (coin.found || coinResult.confidence >= 0.4) {
    const nailHit = nailDetector.detect(imageData, {
      found: true,
      detected: true,
      center: coin.center,
      outerDiameterPx: coin.outerDiameterPx,
      diameterPx: coin.diameterPx,
    });
    nail = {
      found: !!nailHit.found,
      presence: !!nailHit.presence,
      widthPx: nailHit.widthPx,
      score: nailHit.score || 0,
      left: nailHit.left,
      right: nailHit.right,
      center: nailHit.center,
      topY: nailHit.topY,
      heightPx: nailHit.heightPx,
      tipVisible: nailHit.tipVisible !== false,
      reason: nailHit.reason,
      method: nailHit.method || "heuristic",
    };
  }

  const brightness = quality.lighting?.meanBrightness ?? 0;
  const sharpness = quality.sharpness ?? 0;
  const lightingOk = !!quality.lightingValid;
  const sharpOk = !!quality.sharpnessValid;

  const coinR = (coin.outerDiameterPx || targetDiameterPx) / 2;
  const xAlignLimit = (coin.outerDiameterPx || targetDiameterPx) * CAPTURE_CONFIG.ALIGN_X_FRAC;
  const xDelta = nail.found ? Math.abs(nail.center.x - coin.center.x) : Infinity;
  const coinBottom = coin.center.y + coinR;
  const nailTop = nail.found ? (nail.topY ?? nail.center.y - 10) : null;
  const gap = nailTop != null ? nailTop - coinBottom : null;
  const idealGap = minSide * GUIDE_LAYOUT.gapFrac;
  const gapOk = gap != null && gap >= 4 && gap <= idealGap * 3.5;
  const verticalOk = nail.found && nail.center.y > coin.center.y + coinR * 0.5;
  const xOk = nail.found && xDelta <= xAlignLimit;

  const perspectiveOk =
    coin.found && (coin.perspectiveValid === true || (coin.perspectiveRatio ?? 0) >= CAPTURE_CONFIG.PERSPECTIVE_MIN);
  const sizeOk =
    coin.found &&
    (coin.scaleValid === true ||
      (coin.sizeRatio >= OPEN_CV_SIZING_CONFIG.coin.minScaleRatio &&
        coin.sizeRatio <= OPEN_CV_SIZING_CONFIG.coin.maxScaleRatio));

  const tips = [];
  if (!quality.sharpnessValid) {
    tips.push({ code: "blur", textHe: "החזיקי את הטלפון יציב" });
  }
  const lightHint = lightingReasonToHint(quality.lighting?.reason);
  if (lightHint) tips.push({ code: quality.lighting.reason, textHe: lightHint });

  if (coinResult.multiCoin) {
    tips.push({ code: "multi-coin", textHe: "השאירי מטבע אחד בלבד בפריים" });
  } else if (!coin.found) {
    if (coinResult.reason === "coin-clipped") {
      tips.push({ code: "coin-clip", textHe: "הכניסי את כל המטבע למסגרת" });
    } else if (coinResult.reason === "coin-too-small") {
      tips.push({ code: "too-far", textHe: "קרבי מעט את הטלפון" });
    } else if (coinResult.reason === "coin-too-large") {
      tips.push({ code: "too-close", textHe: "הרחיקי מעט את הטלפון" });
    } else if (coinResult.reason === "coin-angled") {
      tips.push({ code: "perspective", textHe: "החזיקי את הטלפון במקביל למשטח" });
    } else {
      tips.push({ code: "place", textHe: "מקמי את המטבע בתוך העיגול" });
    }
  } else if (!nail.found) {
    tips.push({ code: "finger-miss", textHe: "מקמי את האצבע ישירות מתחת למטבע" });
  } else if (nail.widthPx == null) {
    tips.push({ code: "nail-miss", textHe: "ודאי שכל הציפורן גלויה" });
  }

  const pixelsPerMm = coin.pixelsPerMm ?? calculatePixelsPerMm(coin.outerDiameterPx, outerMm);
  const widthMmEstimate =
    nail.widthPx != null && pixelsPerMm ? calculateNailWidthMm(nail.widthPx, pixelsPerMm) : null;

  return {
    ready: false, // final ready comes from evaluateMeasurementQuality
    confidence: 0,
    brightness,
    sharpness,
    tips: tips.slice(0, 4),
    guideState: coin.found || nail.found ? "warn" : "idle",
    openCv: {
      ready: true,
      coin: coinResult,
      quality,
      roi,
      pixelsPerMm,
      widthMmEstimate,
      fpsTarget: OPEN_CV_SIZING_CONFIG.processingFps,
    },
    validation: {
      coinValid: coin.found && !coin.clipped && sizeOk && perspectiveOk,
      fingerValid: nail.found,
      nailValid: nail.found && nail.widthPx != null,
      verticalAlignmentValid: verticalOk && xOk,
      distanceValid: gapOk,
      lightingValid: lightingOk,
      sharpnessValid: sharpOk,
      perspectiveValid: perspectiveOk,
      sizeOk,
    },
    coin,
    nail,
    finger: nail,
    guides: {
      layout: GUIDE_LAYOUT,
      targetCoin: {
        cx: guideCoinCx,
        cy: guideCoinCy,
        diameterPx: targetDiameterPx,
      },
    },
  };
}

export function openCvHintPriority(analysis, { openCvReady, openCvLoading, openCvError } = {}) {
  if (openCvLoading) return "מנוע המדידה נטען...";
  if (openCvError || !openCvReady) {
    return "מנוע המדידה לא הצליח להיטען. נסי לרענן את העמוד.";
  }
  const tip = analysis?.tips?.[0]?.textHe;
  if (tip) return tip;
  if (analysis?.openCv?.coin?.detected && analysis?.nail?.found) {
    return "מעולה — הישארי במקום";
  }
  return "מקמי את המטבע בתוך העיגול";
}
