/**
 * OpenCV.js coin detector — runs ONLY on a small pre-cropped/downscaled ImageData.
 * Never call with full HD frames.
 */

import { OPEN_CV_SIZING_CONFIG } from "./openCvConfig.js";
import { calculatePixelsPerMm } from "./frameCapture.js";
import { matCreated, trackedDelete } from "./matTracker.js";

function notDetected(reason, timings = null) {
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
    timings,
  };
}

function edgeContrastScore(grayMat, cx, cy, radius, samples = 24) {
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
    sum += Math.abs(grayMat.ucharAt(yOut, xOut) - grayMat.ucharAt(yIn, xIn));
    n += 1;
  }
  if (n < samples * 0.5) return { score: 0, coverage: n / samples };
  return { score: Math.min(1, sum / n / 40), coverage: n / samples };
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
 * @param {object[]} candidates — already in FULL video coordinates
 * @param {object} meta — { roi, guide, grayMat in small space?, scale, fullW, fullH }
 */
export function selectBestCoinCandidate(candidates, meta, config = OPEN_CV_SIZING_CONFIG, prevBest = null) {
  const coinCfg = config.coin;
  const roi = meta.roi;
  const guide = meta.guide || roi.guide || {
    cx: roi.x + roi.width / 2,
    cy: roi.y + roi.height / 2,
    diameterPx: Math.min(roi.width, roi.height) * 0.55,
    radiusPx: Math.min(roi.width, roi.height) * 0.275,
  };
  const targetD = guide.diameterPx;
  const scale = meta.scale || 1;
  const grayMat = meta.grayMat || null;
  const fullW = meta.fullWidth || Infinity;
  const fullH = meta.fullHeight || Infinity;

  if (!candidates.length) return notDetected("coin-not-detected");

  // Cheap pre-rank by distance to guide + size, then deep-score top N
  const pre = candidates
    .map((c) => {
      const centerDist = Math.hypot(c.centerX - guide.cx, c.centerY - guide.cy);
      const sizeRatio = c.diameterPx / targetD;
      const sizeFit = Math.max(0, 1 - Math.abs(sizeRatio - 1));
      const centerFit = Math.max(0, 1 - centerDist / Math.max(guide.radiusPx * 2, 1));
      return { c, sizeRatio, preScore: centerFit * 0.55 + sizeFit * 0.45 };
    })
    .sort((a, b) => b.preScore - a.preScore)
    .slice(0, config.maxCandidatesToScore || 5);

  const scored = pre.map(({ c, sizeRatio }) => {
    const localX = (c.centerX - roi.x) * scale;
    const localY = (c.centerY - roi.y) * scale;
    const localR = c.radiusPx * scale;
    const centerDist = Math.hypot(c.centerX - guide.cx, c.centerY - guide.cy);
    const centerScore = Math.max(
      0,
      1 - centerDist / (guide.radiusPx * (1 + coinCfg.maxCenterOffsetFrac * 2) || 1)
    );
    const scaleScore =
      sizeRatio >= coinCfg.minScaleRatio && sizeRatio <= coinCfg.maxScaleRatio
        ? Math.max(0, 1 - Math.abs(sizeRatio - 1) * 1.1)
        : 0.15;
    const margin = coinCfg.edgeMarginPx;
    const fullyInRoi =
      c.centerX - c.radiusPx >= roi.x + margin &&
      c.centerY - c.radiusPx >= roi.y + margin &&
      c.centerX + c.radiusPx <= roi.x + roi.width - margin &&
      c.centerY + c.radiusPx <= roi.y + roi.height - margin;
    const edge = grayMat
      ? edgeContrastScore(grayMat, localX, localY, localR)
      : { score: 0.55, coverage: 1 };
    const perspective = grayMat ? perspectiveHint(grayMat, localX, localY, localR) : 0.7;
    let temporal = 0.5;
    if (prevBest?.detected || (prevBest?.confidence ?? 0) > 0.4) {
      const d = Math.hypot(c.centerX - prevBest.centerX, c.centerY - prevBest.centerY);
      temporal = Math.max(0, 1 - d / Math.max(targetD, 1));
    }
    const confidence = Math.max(
      0,
      Math.min(
        1,
        centerScore * 0.25 +
          scaleScore * 0.25 +
          edge.score * 0.2 +
          perspective * 0.12 +
          (fullyInRoi ? 0.1 : 0) +
          temporal * coinCfg.temporalWeight
      )
    );
    return {
      ...c,
      sizeRatio,
      fullyVisible: fullyInRoi && edge.coverage >= 0.65,
      perspectiveRatio: perspective,
      confidence,
      clipped: !fullyInRoi || edge.coverage < 0.65,
      innerDiameterPx: c.diameterPx * (coinCfg.innerDiameterMm / coinCfg.diameterMm),
    };
  });

  scored.sort((a, b) => b.confidence - a.confidence);
  const best = scored[0];
  const second = scored[1];
  let multiCoin = false;
  if (best && second && second.confidence > 0.5 && best.confidence > 0.5) {
    const dist = Math.hypot(best.centerX - second.centerX, best.centerY - second.centerY);
    if (dist > best.diameterPx * 0.85) multiCoin = true;
  }
  if (multiCoin) return { ...notDetected("multi-coin"), multiCoin: true };

  const scaleValid =
    best.sizeRatio >= coinCfg.minScaleRatio && best.sizeRatio <= coinCfg.maxScaleRatio;
  const perspectiveValid = best.perspectiveRatio >= 0.55;
  const clippedFrame =
    best.centerX - best.radiusPx < coinCfg.edgeMarginPx ||
    best.centerY - best.radiusPx < coinCfg.edgeMarginPx ||
    best.centerX + best.radiusPx > fullW - coinCfg.edgeMarginPx ||
    best.centerY + best.radiusPx > fullH - coinCfg.edgeMarginPx;

  const detected =
    best.confidence >= coinCfg.minConfidence &&
    best.fullyVisible &&
    scaleValid &&
    !best.clipped &&
    !clippedFrame;

  return {
    detected,
    found: detected,
    confidence: best.confidence,
    reason: detected
      ? null
      : clippedFrame || best.clipped
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
    fullyVisible: best.fullyVisible && !clippedFrame,
    scaleValid,
    perspectiveValid,
    clipped: best.clipped || clippedFrame,
    multiCoin: false,
    sizeRatio: best.sizeRatio,
    pixelsPerMm: calculatePixelsPerMm(best.diameterPx, coinCfg.diameterMm),
    score: best.confidence,
    perspectiveRatio: best.perspectiveRatio,
    center: { x: best.centerX, y: best.centerY },
  };
}

/**
 * Detect coin from a SMALL ImageData (already ROI-cropped + downscaled).
 * @param {object} pack — from readVideoRoiScaled
 */
export function detectCoinFromScaledRoi(cv, pack, config = OPEN_CV_SIZING_CONFIG, prevBest = null) {
  const timings = { total: 0, mat: 0, gray: 0, blur: 0, hough: 0, score: 0 };
  const t0 = performance.now();

  if (!cv || typeof cv.Mat !== "function" || !pack?.imageData?.data) {
    return notDetected("opencv-unavailable", timings);
  }

  const { imageData, roi, scale, fullWidth, fullHeight } = pack;
  if (imageData.width < 16 || imageData.height < 16) {
    return notDetected("roi-too-small", timings);
  }

  let source = null;
  const gray = new cv.Mat();
  matCreated(1);
  const blurred = new cv.Mat();
  matCreated(1);
  const circles = new cv.Mat();
  matCreated(1);

  try {
    let t = performance.now();
    source = cv.matFromImageData(imageData);
    matCreated(1);
    timings.mat = performance.now() - t;

    t = performance.now();
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    timings.gray = performance.now() - t;

    t = performance.now();
    cv.medianBlur(gray, blurred, 5);
    timings.blur = performance.now() - t;

    const expectedRadius = imageData.width * config.hough.expectedRadiusFrac;
    const minRadius = Math.max(6, Math.round(expectedRadius * config.hough.minRadiusFactor));
    const maxRadius = Math.max(minRadius + 2, Math.round(expectedRadius * config.hough.maxRadiusFactor));
    const minDist = Math.max(minRadius, Math.floor(imageData.height * config.hough.minDistanceRatio));

    t = performance.now();
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
    timings.hough = performance.now() - t;

    const inv = 1 / (scale || 1);
    const candidates = [];
    for (let index = 0; index < circles.cols; index += 1) {
      const lx = circles.data32F[index * 3];
      const ly = circles.data32F[index * 3 + 1];
      const lr = circles.data32F[index * 3 + 2];
      if (!Number.isFinite(lx) || !Number.isFinite(ly) || !Number.isFinite(lr) || lr < 3) continue;
      candidates.push({
        centerX: roi.x + lx * inv,
        centerY: roi.y + ly * inv,
        radiusPx: lr * inv,
        diameterPx: lr * 2 * inv,
      });
    }

    t = performance.now();
    const ranked = selectBestCoinCandidate(
      candidates,
      {
        roi,
        guide: roi.guide,
        grayMat: gray,
        scale,
        fullWidth,
        fullHeight,
      },
      config,
      prevBest
    );
    timings.score = performance.now() - t;
    timings.total = performance.now() - t0;
    timings.roi = `${imageData.width}×${imageData.height}`;

    if (typeof console !== "undefined" && timings.total > 50) {
      // eslint-disable-next-line no-console
      console.debug(
        "[NailSizing] OpenCV frame:",
        Math.round(timings.total),
        "ms · Hough",
        Math.round(timings.hough),
        "ms · ROI",
        timings.roi
      );
    }

    return { ...ranked, timings };
  } catch {
    timings.total = performance.now() - t0;
    return notDetected("coin-detect-error", timings);
  } finally {
    trackedDelete(circles);
    trackedDelete(blurred);
    trackedDelete(gray);
    trackedDelete(source);
  }
}

/** @deprecated Prefer detectCoinFromScaledRoi — kept for tests with synthetic small mats */
export function detectCoin(cv, imageData, roi, config = OPEN_CV_SIZING_CONFIG, prevBest = null) {
  if (!cv || !imageData) return notDetected("opencv-unavailable");
  // Treat imageData as already the ROI content at scale 1 when roi matches image size
  const pack = {
    imageData,
    roi: roi || { x: 0, y: 0, width: imageData.width, height: imageData.height },
    scale: 1,
    fullWidth: (roi ? roi.x + roi.width : imageData.width) + 8,
    fullHeight: (roi ? roi.y + roi.height : imageData.height) + 8,
  };
  if (roi && (imageData.width !== roi.width || imageData.height !== roi.height)) {
    // Legacy path accidentally fed full frame — refuse to process huge inputs
    if (imageData.width * imageData.height > 320 * 320 * 2) {
      return notDetected("frame-too-large");
    }
  }
  return detectCoinFromScaledRoi(cv, pack, config, prevBest);
}

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
