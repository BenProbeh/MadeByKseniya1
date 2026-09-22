/**
 * Compose OpenCV coin/quality (on downscaled ROI) + modular nail detector.
 */

import { OPEN_CV_SIZING_CONFIG } from "./openCvConfig.js";
import {
  getCoinRoi,
  readVideoRoiScaled,
  calculatePixelsPerMm,
  calculateNailWidthMm,
} from "./frameCapture.js";
import { detectCoinFromScaledRoi, coinResultToAnalysisCoin } from "./coinDetector.js";
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

function detectNailUnderCoin(video, canvas, coin) {
  if (!video || !coin?.center || !(coin.found || coin.detected)) {
    return emptyNail({ cx: 0, cy: 0, diameterPx: 100 });
  }
  const d = coin.outerDiameterPx || coin.diameterPx || 80;
  const fingerRoi = {
    x: Math.max(0, Math.floor(coin.center.x - d * 0.75)),
    y: Math.max(0, Math.floor(coin.center.y + d * 0.35)),
    width: Math.min(video.videoWidth, Math.ceil(d * 1.5)),
    height: Math.min(video.videoHeight, Math.ceil(d * 2.0)),
  };
  fingerRoi.width = Math.min(fingerRoi.width, video.videoWidth - fingerRoi.x);
  fingerRoi.height = Math.min(fingerRoi.height, video.videoHeight - fingerRoi.y);

  const pack = readVideoRoiScaled(video, canvas, fingerRoi, 280);
  if (!pack) return emptyNail({ cx: coin.center.x, cy: coin.center.y + d, diameterPx: d });

  const inv = 1 / pack.scale;
  const localCoin = {
    found: true,
    detected: true,
    center: {
      x: (coin.center.x - fingerRoi.x) * pack.scale,
      y: (coin.center.y - fingerRoi.y) * pack.scale,
    },
    outerDiameterPx: d * pack.scale,
    diameterPx: d * pack.scale,
  };
  const hit = nailDetector.detect(pack.imageData, localCoin);
  return {
    found: !!hit.found,
    presence: !!hit.presence,
    widthPx: hit.widthPx != null ? hit.widthPx * inv : null,
    score: hit.score || 0,
    left: hit.left != null ? fingerRoi.x + hit.left * inv : null,
    right: hit.right != null ? fingerRoi.x + hit.right * inv : null,
    center: {
      x: fingerRoi.x + hit.center.x * inv,
      y: fingerRoi.y + hit.center.y * inv,
    },
    topY: hit.topY != null ? fingerRoi.y + hit.topY * inv : null,
    heightPx: (hit.heightPx || d) * inv,
    tipVisible: hit.tipVisible !== false,
    reason: hit.reason,
    method: hit.method || "heuristic",
  };
}

/**
 * Live / capture analysis from video element — OpenCV never sees full HD.
 */
export function analyzeVideoWithOpenCv(cv, video, processCanvas, opts = {}) {
  const startedAt = performance.now();
  const { coinDiameterMm = 23, coinMeta = null, prevCoin = null, nailCanvas = null } = opts;
  if (!cv || !video?.videoWidth) return null;

  const width = video.videoWidth;
  const height = video.videoHeight;
  const minSide = Math.min(width, height);
  const targetDiameterPx = minSide * GUIDE_LAYOUT.coinDiameterFrac;
  const guideCoinCx = width * GUIDE_LAYOUT.coinCx;
  const guideCoinCy = height * GUIDE_LAYOUT.coinCy;
  const outerMm = coinMeta?.outerDiameterMm ?? coinDiameterMm ?? OPEN_CV_SIZING_CONFIG.coin.diameterMm;

  const roi = getCoinRoi(width, height, OPEN_CV_SIZING_CONFIG.coinRoiPadding);
  const pack = readVideoRoiScaled(video, processCanvas, roi, OPEN_CV_SIZING_CONFIG.maxProcessingWidth);
  if (!pack) return null;

  const coinResult = detectCoinFromScaledRoi(cv, pack, OPEN_CV_SIZING_CONFIG, prevCoin);
  const quality = evaluateImageQuality(cv, pack.imageData, OPEN_CV_SIZING_CONFIG);

  const coin = coinResultToAnalysisCoin(coinResult, targetDiameterPx);
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
  if (coin.found || coinResult.confidence >= 0.45) {
    nail = detectNailUnderCoin(video, nailCanvas || processCanvas, coin);
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
  if (!quality.sharpnessValid) tips.push({ code: "blur", textHe: "החזיקי את הטלפון יציב" });
  const lightHint = lightingReasonToHint(quality.lighting?.reason);
  if (lightHint) tips.push({ code: quality.lighting.reason, textHe: lightHint });

  if (coinResult.multiCoin) {
    tips.push({ code: "multi-coin", textHe: "השאירי מטבע אחד בלבד בפריים" });
  } else if (!coin.found) {
    if (coinResult.reason === "coin-clipped") tips.push({ code: "coin-clip", textHe: "הכניסי את כל המטבע למסגרת" });
    else if (coinResult.reason === "coin-too-small") tips.push({ code: "too-far", textHe: "קרבי מעט את הטלפון" });
    else if (coinResult.reason === "coin-too-large") tips.push({ code: "too-close", textHe: "הרחיקי מעט את הטלפון" });
    else if (coinResult.reason === "coin-angled") tips.push({ code: "perspective", textHe: "החזיקי את הטלפון במקביל למשטח" });
    else tips.push({ code: "place", textHe: "מקמי את המטבע בתוך העיגול" });
  } else if (!nail.found) {
    tips.push({ code: "finger-miss", textHe: "מקמי את האצבע ישירות מתחת למטבע" });
  } else if (nail.widthPx == null) {
    tips.push({ code: "nail-miss", textHe: "ודאי שכל הציפורן גלויה" });
  }

  const pixelsPerMm = coin.pixelsPerMm ?? calculatePixelsPerMm(coin.outerDiameterPx, outerMm);
  const totalMs = performance.now() - startedAt;

  return {
    ready: false,
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
      widthMmEstimate:
        nail.widthPx != null && pixelsPerMm ? calculateNailWidthMm(nail.widthPx, pixelsPerMm) : null,
      fpsTarget: OPEN_CV_SIZING_CONFIG.processingFps,
      processingMs: totalMs,
      houghMs: coinResult.timings?.hough ?? null,
      processSize: coinResult.timings?.roi || `${pack.outW}×${pack.outH}`,
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
      targetCoin: { cx: guideCoinCx, cy: guideCoinCy, diameterPx: targetDiameterPx },
    },
  };
}

/** Alias kept for capture path that already has ImageData from full freeze — re-read via video preferred. */
export function analyzeFrameWithOpenCv(cv, imageData, opts = {}) {
  // Full-frame ImageData path is intentionally not used for live Hough.
  // Callers should use analyzeVideoWithOpenCv. This stub avoids accidental HD work.
  if (imageData && imageData.width * imageData.height > 320 * 400) {
    return {
      ready: false,
      confidence: 0,
      brightness: 0,
      sharpness: 0,
      tips: [{ code: "engine", textHe: "מנוע המדידה מעבד…" }],
      coin: { found: false, score: 0, center: { x: 0, y: 0 }, outerDiameterPx: 0 },
      nail: emptyNail({ cx: 0, cy: 0, diameterPx: 100 }),
      finger: emptyNail({ cx: 0, cy: 0, diameterPx: 100 }),
      openCv: { ready: true, rejected: "frame-too-large" },
    };
  }
  return null;
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
