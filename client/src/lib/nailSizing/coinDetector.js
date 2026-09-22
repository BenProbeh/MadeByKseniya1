/**
 * OpenCV.js coin detector for 10₪ (bimetallic, outer Ø 23mm).
 * Always deletes every cv.Mat — never leave Mats around.
 */

import { OPEN_CV_SIZING_CONFIG } from "./openCvConfig.js";
import { calculatePixelsPerMm } from "./frameCapture.js";

function clampRoi(roi, width, height) {
  const x = Math.max(0, Math.min(width - 2, Math.floor(roi.x)));
  const y = Math.max(0, Math.min(height - 2, Math.floor(roi.y)));
  const right = Math.max(x + 2, Math.min(width, Math.floor(roi.x + roi.width)));
  const bottom = Math.max(y + 2, Math.min(height, Math.floor(roi.y + roi.height)));
  return { x, y, width: right - x, height: bottom - y, guide: roi.guide };
}

function notDetected(reason) {
  return {
    detected: false,
    found: false,
    confidence: 0,
    reason,
    centerX: 0,
    centerY: 0,
    radiusPx: 0,
    diameterPx: 0,
    outerDiameterPx: 0,
    innerDiameterPx: null,
    fullyVisible: false,
    scaleValid: false,
    perspectiveValid: false,
    clipped: true,
    multiCoin: false,
    sizeRatio: 0,
    pixelsPerMm: null,
    score: 0,
  };
}

function edgeContrastScore(grayMat, cx, cy, radius, samples = 36) {
  // Sample grayscale difference across the circle rim (relative to ROI mat)
  let sum = 0;
  let n = 0;
  const cols = grayMat.cols;
  const rows = grayMat.rows;
  for (let i = 0; i < samples; i += 1) {
    const theta = (i / samples) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const xIn = Math.round(cx + cos * (radius - 2));
    const yIn = Math.round(cy + sin * (radius - 2));
    const xOut = Math.round(cx + cos * (radius + 2));
    const yOut = Math.round(cy + sin * (radius + 2));
    if (xIn < 0 || yIn < 0 || xOut < 0 || yOut < 0 || xIn >= cols || yIn >= rows || xOut >= cols || yOut >= rows) {
      continue;
    }
    const gIn = grayMat.ucharAt(yIn, xIn);
    const gOut = grayMat.ucharAt(yOut, xOut);
    sum += Math.abs(gOut - gIn);
    n += 1;
  }
  if (n < samples * 0.55) return { score: 0, coverage: n / samples };
  return { score: Math.min(1, sum / n / 40), coverage: n / samples };
}

function bimetallicHint(grayMat, cx, cy, outerR, expectedInnerRatio) {
  const innerR = outerR * expectedInnerRatio;
  if (innerR < 4) return 0.5;
  const inner = edgeContrastScore(grayMat, cx, cy, innerR, 28);
  return inner.score;
}

function perspectiveHint(grayMat, cx, cy, radius) {
  const cols = grayMat.cols;
  const rows = grayMat.rows;
  const sample = (x, y) => {
    const xi = Math.max(0, Math.min(cols - 1, Math.round(x)));
    const yi = Math.max(0, Math.min(rows - 1, Math.round(y)));
    return grayMat.ucharAt(yi, xi);
  };
  const h =
    Math.abs(sample(cx + radius, cy) - sample(cx - radius, cy)) +
    Math.abs(sample(cx + radius * 0.7, cy) - sample(cx - radius * 0.7, cy));
  const v =
    Math.abs(sample(cx, cy + radius) - sample(cx, cy - radius)) +
    Math.abs(sample(cx, cy + radius * 0.7) - sample(cx, cy - radius * 0.7));
  if (h < 1 || v < 1) return 0.4;
  return Math.min(h, v) / Math.max(h, v);
}

/**
 * Score + select best Hough circle candidate for 10₪.
 */
export function selectBestCoinCandidate(candidates, roi, config, grayRoiMat, prevBest = null) {
  const coinCfg = config.coin;
  const guide = roi.guide || {
    cx: roi.x + roi.width / 2,
    cy: roi.y + roi.height / 2,
    diameterPx: Math.min(roi.width, roi.height) * 0.55,
  };
  const targetD = guide.diameterPx;
  const expectedInner = coinCfg.innerDiameterMm / coinCfg.diameterMm;

  if (!candidates.length) return notDetected("coin-not-detected");

  const scored = candidates.map((c) => {
    const localX = c.centerX - roi.x;
    const localY = c.centerY - roi.y;
    const centerDist = Math.hypot(c.centerX - guide.cx, c.centerY - guide.cy);
    const centerScore = Math.max(0, 1 - centerDist / (guide.radiusPx * (1 + coinCfg.maxCenterOffsetFrac * 2) || 1));
    const sizeRatio = c.diameterPx / targetD;
    const scaleScore =
      sizeRatio >= coinCfg.minScaleRatio && sizeRatio <= coinCfg.maxScaleRatio
        ? Math.max(0, 1 - Math.abs(sizeRatio - 1) * 1.1)
        : 0.15;
    const margin = coinCfg.edgeMarginPx;
    const fullyInRoi =
      localX - c.radiusPx >= margin &&
      localY - c.radiusPx >= margin &&
      localX + c.radiusPx <= roi.width - margin &&
      localY + c.radiusPx <= roi.height - margin;
    const edge = grayRoiMat
      ? edgeContrastScore(grayRoiMat, localX, localY, c.radiusPx)
      : { score: 0.5, coverage: 1 };
    const perspective = grayRoiMat ? perspectiveHint(grayRoiMat, localX, localY, c.radiusPx) : 0.7;
    const bi = grayRoiMat ? bimetallicHint(grayRoiMat, localX, localY, c.radiusPx, expectedInner) : 0.5;
    let temporal = 0.5;
    if (prevBest?.detected) {
      const d = Math.hypot(c.centerX - prevBest.centerX, c.centerY - prevBest.centerY);
      temporal = Math.max(0, 1 - d / Math.max(targetD, 1));
    }
    const confidence = Math.max(
      0,
      Math.min(
        1,
        centerScore * 0.22 +
          scaleScore * 0.22 +
          edge.score * 0.22 +
          perspective * 0.12 +
          bi * 0.12 +
          (fullyInRoi ? 0.1 : 0) +
          temporal * coinCfg.temporalWeight
      )
    );
    return {
      ...c,
      sizeRatio,
      fullyVisible: fullyInRoi && edge.coverage >= 0.7,
      perspectiveRatio: perspective,
      confidence,
      clipped: !fullyInRoi || edge.coverage < 0.7,
      innerDiameterPx: c.radiusPx * 2 * expectedInner,
    };
  });

  scored.sort((a, b) => b.confidence - a.confidence);
  const best = scored[0];
  const second = scored[1];
  let multiCoin = false;
  if (best && second && second.confidence > 0.45 && best.confidence > 0.45) {
    const dist = Math.hypot(best.centerX - second.centerX, best.centerY - second.centerY);
    if (dist > best.diameterPx * 0.85) multiCoin = true;
  }

  if (multiCoin) {
    return { ...notDetected("multi-coin"), multiCoin: true };
  }

  const scaleValid =
    best.sizeRatio >= coinCfg.minScaleRatio && best.sizeRatio <= coinCfg.maxScaleRatio;
  const perspectiveValid = best.perspectiveRatio >= 0.55;
  const detected =
    best.confidence >= coinCfg.minConfidence && best.fullyVisible && scaleValid && !best.clipped;

  const pixelsPerMm = calculatePixelsPerMm(best.diameterPx, coinCfg.diameterMm);

  return {
    detected,
    found: detected,
    confidence: best.confidence,
    reason: detected
      ? null
      : !best.fullyVisible || best.clipped
        ? "coin-clipped"
        : !scaleValid
          ? best.sizeRatio < coinCfg.minScaleRatio
            ? "coin-too-small"
            : "coin-too-large"
          : !perspectiveValid
            ? "coin-angled"
            : "coin-low-confidence",
    centerX: best.centerX,
    centerY: best.centerY,
    radiusPx: best.radiusPx,
    diameterPx: best.diameterPx,
    outerDiameterPx: best.diameterPx,
    innerDiameterPx: best.innerDiameterPx,
    fullyVisible: best.fullyVisible,
    scaleValid,
    perspectiveValid,
    clipped: best.clipped,
    multiCoin: false,
    sizeRatio: best.sizeRatio,
    pixelsPerMm,
    score: best.confidence,
    perspectiveRatio: best.perspectiveRatio,
    center: { x: best.centerX, y: best.centerY },
  };
}

/**
 * Detect 10₪ coin in ImageData using OpenCV HoughCircles within ROI.
 */
export function detectCoin(cv, imageData, roi, config = OPEN_CV_SIZING_CONFIG, prevBest = null) {
  if (!cv || typeof cv.Mat !== "function" || !imageData?.data) {
    return notDetected("opencv-unavailable");
  }

  const width = imageData.width;
  const height = imageData.height;
  const safeRoi = clampRoi(roi || { x: 0, y: 0, width, height }, width, height);
  if (safeRoi.width < 16 || safeRoi.height < 16) {
    return notDetected("roi-too-small");
  }

  const source = cv.matFromImageData(imageData);
  const roiRect = new cv.Rect(safeRoi.x, safeRoi.y, safeRoi.width, safeRoi.height);
  let cropped = null;
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const circles = new cv.Mat();

  try {
    cropped = source.roi(roiRect);
    cv.cvtColor(cropped, gray, cv.COLOR_RGBA2GRAY);
    cv.medianBlur(gray, blurred, 5);

    const minSide = Math.min(safeRoi.width, safeRoi.height);
    const minRadius = Math.max(8, Math.floor(minSide * config.hough.minRadiusRatio));
    const maxRadius = Math.max(minRadius + 4, Math.floor(minSide * config.hough.maxRadiusRatio));
    const minDist = Math.max(minRadius, Math.floor(minSide * config.hough.minDistanceRatio));

    cv.HoughCircles(
      blurred,
      circles,
      cv.HOUGH_GRADIENT,
      config.hough.dp,
      minDist,
      config.hough.cannyThreshold,
      config.hough.accumulatorThreshold,
      minRadius,
      maxRadius
    );

    const candidates = [];
    const count = circles.cols;
    for (let index = 0; index < count; index += 1) {
      const localX = circles.data32F[index * 3];
      const localY = circles.data32F[index * 3 + 1];
      const radius = circles.data32F[index * 3 + 2];
      if (!Number.isFinite(localX) || !Number.isFinite(localY) || !Number.isFinite(radius) || radius < 4) {
        continue;
      }
      candidates.push({
        centerX: safeRoi.x + localX,
        centerY: safeRoi.y + localY,
        radiusPx: radius,
        diameterPx: radius * 2,
      });
    }

    // Also reject if circle extends outside full frame
    const ranked = selectBestCoinCandidate(candidates, safeRoi, config, gray, prevBest);
    if (ranked.detected || ranked.confidence > 0) {
      const margin = config.coin.edgeMarginPx;
      const clippedFrame =
        ranked.centerX - ranked.radiusPx < margin ||
        ranked.centerY - ranked.radiusPx < margin ||
        ranked.centerX + ranked.radiusPx > width - margin ||
        ranked.centerY + ranked.radiusPx > height - margin;
      if (clippedFrame) {
        return {
          ...ranked,
          detected: false,
          found: false,
          fullyVisible: false,
          clipped: true,
          reason: "coin-clipped",
        };
      }
    }
    return ranked;
  } catch {
    return notDetected("coin-detect-error");
  } finally {
    circles.delete();
    blurred.delete();
    gray.delete();
    if (cropped) cropped.delete();
    source.delete();
  }
}

/**
 * Map OpenCV coin result onto measurementEngine-compatible coin object.
 */
export function coinResultToAnalysisCoin(coinResult, targetDiameterPx) {
  if (!coinResult?.detected && !(coinResult?.confidence > 0)) {
    return {
      found: false,
      multiCoin: !!coinResult?.multiCoin,
      diameterPx: targetDiameterPx,
      outerDiameterPx: targetDiameterPx,
      innerDiameterPx: null,
      center: { x: 0, y: 0 },
      score: 0,
      clipped: true,
      sizeRatio: 0,
      perspectiveRatio: 0,
    };
  }
  return {
    found: !!coinResult.detected,
    multiCoin: !!coinResult.multiCoin,
    diameterPx: coinResult.diameterPx,
    outerDiameterPx: coinResult.diameterPx,
    innerDiameterPx: coinResult.innerDiameterPx,
    center: { x: coinResult.centerX, y: coinResult.centerY },
    score: coinResult.confidence,
    confidence: coinResult.confidence,
    clipped: !!coinResult.clipped || !coinResult.fullyVisible,
    sizeRatio: coinResult.sizeRatio,
    perspectiveRatio: coinResult.perspectiveRatio ?? (coinResult.perspectiveValid ? 0.9 : 0.4),
    pixelsPerMm: coinResult.pixelsPerMm,
    fullyVisible: coinResult.fullyVisible,
    scaleValid: coinResult.scaleValid,
    perspectiveValid: coinResult.perspectiveValid,
  };
}
