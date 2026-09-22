/**
 * OpenCV sharpness / lighting on SMALL ImageData only.
 */

import { OPEN_CV_SIZING_CONFIG } from "./openCvConfig.js";
import { matCreated, trackedDelete } from "./matTracker.js";

export function calculateSharpness(cv, imageData) {
  if (!cv || !imageData?.data) return 0;
  if (imageData.width * imageData.height > 400 * 400) {
    // Refuse oversized inputs — caller must downscale
    return 0;
  }

  let source = null;
  const gray = new cv.Mat();
  matCreated(1);
  const laplacian = new cv.Mat();
  matCreated(1);
  const mean = new cv.Mat();
  matCreated(1);
  const standardDeviation = new cv.Mat();
  matCreated(1);

  try {
    source = cv.matFromImageData(imageData);
    matCreated(1);
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    cv.Laplacian(gray, laplacian, cv.CV_64F);
    cv.meanStdDev(laplacian, mean, standardDeviation);
    const deviation = standardDeviation.doubleAt(0, 0);
    return deviation * deviation;
  } catch {
    return 0;
  } finally {
    trackedDelete(standardDeviation);
    trackedDelete(mean);
    trackedDelete(laplacian);
    trackedDelete(gray);
    trackedDelete(source);
  }
}

export function evaluateLighting(cv, imageData, config = OPEN_CV_SIZING_CONFIG.quality) {
  if (!cv || !imageData?.data) {
    return {
      valid: false,
      meanBrightness: 0,
      darkPixelRatio: 1,
      brightPixelRatio: 0,
      contrast: 0,
      reason: "opencv-unavailable",
    };
  }
  if (imageData.width * imageData.height > 400 * 400) {
    return {
      valid: false,
      meanBrightness: 0,
      darkPixelRatio: 1,
      brightPixelRatio: 0,
      contrast: 0,
      reason: "frame-too-large",
    };
  }

  let source = null;
  const gray = new cv.Mat();
  matCreated(1);

  try {
    source = cv.matFromImageData(imageData);
    matCreated(1);
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    const meanMat = cv.mean(gray);
    const meanBrightness = meanMat[0];

    let dark = 0;
    let bright = 0;
    let sumSq = 0;
    let n = 0;
    const step = Math.max(2, Math.floor((gray.rows * gray.cols) / 1500));
    for (let i = 0; i < gray.rows * gray.cols; i += step) {
      const y = Math.floor(i / gray.cols);
      const x = i % gray.cols;
      const v = gray.ucharAt(y, x);
      if (v < 35) dark += 1;
      if (v > 245) bright += 1;
      sumSq += (v - meanBrightness) * (v - meanBrightness);
      n += 1;
    }
    const darkPixelRatio = n ? dark / n : 1;
    const brightPixelRatio = n ? bright / n : 0;
    const contrast = n ? Math.sqrt(sumSq / n) : 0;

    let reason = null;
    if (meanBrightness < config.minimumBrightness || darkPixelRatio > config.maxDarkPixelRatio) {
      reason = "too-dark";
    } else if (brightPixelRatio > config.maxBrightPixelRatio && meanBrightness > config.maximumBrightness - 30) {
      reason = "glare";
    } else if (meanBrightness > config.maximumBrightness) {
      reason = "too-bright";
    }

    const valid =
      meanBrightness >= config.minimumBrightness &&
      meanBrightness <= config.maximumBrightness &&
      darkPixelRatio <= config.maxDarkPixelRatio &&
      brightPixelRatio <= config.maxBrightPixelRatio;

    return {
      valid,
      meanBrightness,
      darkPixelRatio,
      brightPixelRatio,
      contrast,
      reason,
    };
  } catch {
    return {
      valid: false,
      meanBrightness: 0,
      darkPixelRatio: 1,
      brightPixelRatio: 0,
      contrast: 0,
      reason: "lighting-error",
    };
  } finally {
    trackedDelete(gray);
    trackedDelete(source);
  }
}

export function evaluateImageQuality(cv, imageData, config = OPEN_CV_SIZING_CONFIG) {
  const sharpness = calculateSharpness(cv, imageData);
  const lighting = evaluateLighting(cv, imageData, config.quality);
  const sharpnessValid = sharpness >= config.quality.minimumSharpness;
  return {
    sharpness,
    sharpnessValid,
    lighting,
    lightingValid: lighting.valid,
    reason: !sharpnessValid ? "too-blurry" : lighting.reason,
  };
}

export function lightingReasonToHint(reason) {
  if (reason === "too-dark") return "עברִי למקום מואר יותר";
  if (reason === "too-bright") return "הפחיתי תאורה ישירה";
  if (reason === "glare") return "שני מעט את זווית התאורה";
  return null;
}
