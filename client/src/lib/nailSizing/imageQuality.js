/**
 * OpenCV-based sharpness (Laplacian variance) and lighting checks.
 * Every Mat is deleted in finally.
 */

import { OPEN_CV_SIZING_CONFIG } from "./openCvConfig.js";

export function calculateSharpness(cv, imageData, roi = null) {
  if (!cv || !imageData?.data) return 0;

  const source = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const laplacian = new cv.Mat();
  const mean = new cv.Mat();
  const standardDeviation = new cv.Mat();
  let cropped = null;

  try {
    let work = source;
    if (roi && roi.width > 8 && roi.height > 8) {
      const rect = new cv.Rect(
        Math.max(0, Math.floor(roi.x)),
        Math.max(0, Math.floor(roi.y)),
        Math.min(imageData.width - Math.floor(roi.x), Math.floor(roi.width)),
        Math.min(imageData.height - Math.floor(roi.y), Math.floor(roi.height))
      );
      cropped = source.roi(rect);
      work = cropped;
    }

    cv.cvtColor(work, gray, cv.COLOR_RGBA2GRAY);
    cv.Laplacian(gray, laplacian, cv.CV_64F);
    cv.meanStdDev(laplacian, mean, standardDeviation);
    const deviation = standardDeviation.doubleAt(0, 0);
    return deviation * deviation;
  } catch {
    return 0;
  } finally {
    standardDeviation.delete();
    mean.delete();
    laplacian.delete();
    gray.delete();
    if (cropped) cropped.delete();
    source.delete();
  }
}

export function evaluateLighting(cv, imageData, roi = null, config = OPEN_CV_SIZING_CONFIG.quality) {
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

  const source = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  let cropped = null;

  try {
    let work = source;
    if (roi && roi.width > 8 && roi.height > 8) {
      const rect = new cv.Rect(
        Math.max(0, Math.floor(roi.x)),
        Math.max(0, Math.floor(roi.y)),
        Math.min(imageData.width - Math.floor(roi.x), Math.floor(roi.width)),
        Math.min(imageData.height - Math.floor(roi.y), Math.floor(roi.height))
      );
      cropped = source.roi(rect);
      work = cropped;
    }

    cv.cvtColor(work, gray, cv.COLOR_RGBA2GRAY);
    const meanMat = cv.mean(gray);
    const meanBrightness = meanMat[0];

    // Sample ratios without allocating another full Mat histogram when possible
    let dark = 0;
    let bright = 0;
    let sumSq = 0;
    let n = 0;
    const step = Math.max(1, Math.floor((gray.rows * gray.cols) / 4000));
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

    // Soft gate — do not block solely on mild contrast
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
    if (cropped) cropped.delete();
    gray.delete();
    source.delete();
  }
}

export function evaluateImageQuality(cv, imageData, roi = null, config = OPEN_CV_SIZING_CONFIG) {
  const sharpness = calculateSharpness(cv, imageData, roi);
  const lighting = evaluateLighting(cv, imageData, roi, config.quality);
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
