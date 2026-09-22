/**
 * Photo quality score (0–100) after a manual capture.
 * Not AI confidence — helps the customer see if the shot looks usable.
 */

/** Fixed guide layout fractions (video / image native pixels). */
export const GUIDE_LAYOUT = {
  coinCx: 0.5,
  coinCy: 0.28,
  coinDiameterFrac: 0.26,
  gapFrac: 0.028,
  fingerWidthRatio: 0.8,
  fingerHeightRatio: 1.45,
};

export function getQualityLevel(score) {
  if (score >= 85) return { id: "excellent", label: "צילום מצוין" };
  if (score >= 70) return { id: "good", label: "צילום טוב" };
  if (score >= 50) return { id: "fair", label: "כדאי לשפר את הצילום" };
  return { id: "poor", label: "מומלץ לצלם שוב" };
}

export function getGuideRegions(width, height) {
  const minSide = Math.min(width, height);
  const coinD = minSide * GUIDE_LAYOUT.coinDiameterFrac;
  const coinCx = width * GUIDE_LAYOUT.coinCx;
  const coinCy = height * GUIDE_LAYOUT.coinCy;
  const coinR = coinD / 2;
  const gap = minSide * GUIDE_LAYOUT.gapFrac;
  const fingerW = coinD * GUIDE_LAYOUT.fingerWidthRatio;
  const fingerH = fingerW * GUIDE_LAYOUT.fingerHeightRatio;
  const fingerTop = coinCy + coinR + gap;

  return {
    coinGuideRegion: {
      x: Math.max(0, coinCx - coinR),
      y: Math.max(0, coinCy - coinR),
      width: Math.min(width, coinD),
      height: Math.min(height, coinD),
      cx: coinCx,
      cy: coinCy,
      radius: coinR,
    },
    fingerGuideRegion: {
      x: Math.max(0, coinCx - fingerW / 2),
      y: Math.max(0, fingerTop),
      width: Math.min(width, fingerW),
      height: Math.min(height - fingerTop, fingerH),
      cx: coinCx,
      top: fingerTop,
    },
  };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function clampScore(n) {
  return Math.round(clamp(n, 0, 100));
}

/** Downscale ImageData to maxWidth for cheap analysis. */
export function downscaleImageData(imageData, maxWidth = 320) {
  if (!imageData?.data || imageData.width <= maxWidth) {
    return { imageData, scale: 1 };
  }
  const scale = maxWidth / imageData.width;
  const w = Math.max(1, Math.round(imageData.width * scale));
  const h = Math.max(1, Math.round(imageData.height * scale));
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (!canvas) {
    // Node / tests — nearest-neighbor sample
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const sx = Math.min(imageData.width - 1, Math.floor(x / scale));
        const sy = Math.min(imageData.height - 1, Math.floor(y / scale));
        const si = (sy * imageData.width + sx) * 4;
        const di = (y * w + x) * 4;
        out[di] = imageData.data[si];
        out[di + 1] = imageData.data[si + 1];
        out[di + 2] = imageData.data[si + 2];
        out[di + 3] = 255;
      }
    }
    return { imageData: { data: out, width: w, height: h }, scale };
  }
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(imageData, 0, 0);
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const sctx = small.getContext("2d");
  sctx.drawImage(canvas, 0, 0, w, h);
  return { imageData: sctx.getImageData(0, 0, w, h), scale };
}

function grayAt(data, width, height, x, y) {
  const xi = Math.max(0, Math.min(width - 1, Math.round(x)));
  const yi = Math.max(0, Math.min(height - 1, Math.round(y)));
  const i = (yi * width + xi) * 4;
  return (data[i] + data[i + 1] + data[i + 2]) / 3;
}

function regionStats(imageData, region) {
  const { data, width, height } = imageData;
  const x0 = Math.max(0, Math.floor(region.x));
  const y0 = Math.max(0, Math.floor(region.y));
  const x1 = Math.min(width, Math.ceil(region.x + region.width));
  const y1 = Math.min(height, Math.ceil(region.y + region.height));
  let sum = 0;
  let sumSq = 0;
  let edge = 0;
  let n = 0;
  let bright = 0;
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 40));
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const g = grayAt(data, width, height, x, y);
      const g2 = grayAt(data, width, height, x + 1, y);
      sum += g;
      sumSq += g * g;
      edge += Math.abs(g - g2);
      if (g > 245) bright += 1;
      n += 1;
    }
  }
  if (!n) return { mean: 0, variance: 0, edgeMean: 0, brightRatio: 1 };
  const mean = sum / n;
  return {
    mean,
    variance: Math.max(0, sumSq / n - mean * mean),
    edgeMean: edge / n,
    brightRatio: bright / n,
  };
}

function scoreBrightness(mean) {
  // Peak around 110–150
  if (mean < 25) return { points: 4, tip: "עברִי למקום מואר יותר" };
  if (mean < 45) return { points: 12, tip: "עברִי למקום מואר יותר" };
  if (mean > 230) return { points: 6, tip: "הפחיתי תאורה ישירה" };
  if (mean > 200) return { points: 14, tip: "הפחיתי תאורה ישירה" };
  if (mean >= 80 && mean <= 170) return { points: 25, tip: null };
  return { points: 20, tip: null };
}

function scoreSharpness(variance, edgeMean) {
  // Laplacian-ish variance on downscaled image
  const combined = variance * 0.35 + edgeMean * 8;
  if (combined < 8) return { points: 6, tip: "התמונה מעט מטושטשת — החזיקי את הטלפון יציב" };
  if (combined < 18) return { points: 16, tip: "התמונה מעט מטושטשת — החזיקי את הטלפון יציב" };
  if (combined < 30) return { points: 24, tip: null };
  return { points: 30, tip: null };
}

function scoreFraming(coinStats, fingerStats, fullVariance) {
  const tips = [];
  // Empty-ish region: very low variance/edge vs full frame
  const coinActivity = coinStats.variance + coinStats.edgeMean * 10;
  const fingerActivity = fingerStats.variance + fingerStats.edgeMean * 10;
  const baseline = Math.max(fullVariance * 0.15, 4);

  let coinPts = 15;
  let fingerPts = 15;

  if (coinActivity < baseline * 0.55) {
    coinPts = 4;
    tips.push("מקמי את המטבע בתוך העיגול העליון");
  } else if (coinActivity < baseline) {
    coinPts = 10;
    tips.push("מקמי את המטבע בתוך העיגול העליון");
  }

  if (fingerActivity < baseline * 0.55) {
    fingerPts = 4;
    tips.push("מקמי את קצה האצבע בתוך המסגרת התחתונה");
  } else if (fingerActivity < baseline) {
    fingerPts = 10;
    tips.push("מקמי את קצה האצבע בתוך המסגרת התחתונה");
  } else if (fingerActivity >= baseline && coinActivity >= baseline) {
    tips.push("מיקום האצבע נראה טוב");
  }

  // Nail detail hint (soft) — low edge in upper half of finger region
  if (fingerPts >= 10 && fingerStats.edgeMean < 4) {
    tips.push("ודאי שכל הציפורן גלויה ואינה מוסתרת");
  }

  return { points: coinPts + fingerPts, tips, coinPts, fingerPts };
}

function scoreContrastGlare(fullStats, coinStats) {
  const tips = [];
  let points = 15;
  if (fullStats.variance < 200) {
    points -= 6;
    tips.push("נסי להשתמש ברקע אחיד שמבדיל בין האצבע למשטח");
  }
  if (coinStats.brightRatio > 0.22 || fullStats.brightRatio > 0.18) {
    points -= 7;
    tips.push("שני מעט את זווית התאורה כדי להפחית השתקפות");
  }
  return { points: clamp(points, 0, 15), tips };
}

/**
 * @param {ImageData} imageData — full captured frame
 * @param {{ coinGuideRegion, fingerGuideRegion }} [guides]
 */
export function calculatePhotoQuality(imageData, guides) {
  if (!imageData?.data || !imageData.width) {
    return {
      score: 0,
      level: "poor",
      levelLabel: "מומלץ לצלם שוב",
      checks: { brightness: 0, sharpness: 0, contrast: 0, framing: 0 },
      tips: ["לא הצלחנו לנתח את התמונה — צלמי שוב"],
    };
  }

  const { imageData: small, scale } = downscaleImageData(imageData, 320);
  const regions = guides || getGuideRegions(imageData.width, imageData.height);
  const scaledGuides = {
    coinGuideRegion: scaleRegion(regions.coinGuideRegion, scale),
    fingerGuideRegion: scaleRegion(regions.fingerGuideRegion, scale),
  };

  const full = regionStats(small, {
    x: 0,
    y: 0,
    width: small.width,
    height: small.height,
  });
  const coin = regionStats(small, scaledGuides.coinGuideRegion);
  const finger = regionStats(small, scaledGuides.fingerGuideRegion);

  const brightness = scoreBrightness(full.mean);
  const sharpness = scoreSharpness(full.variance, full.edgeMean);
  const framing = scoreFraming(coin, finger, full.variance);
  const contrast = scoreContrastGlare(full, coin);

  const score = clampScore(
    brightness.points + sharpness.points + framing.points + contrast.points
  );
  const levelInfo = getQualityLevel(score);

  const tips = [];
  const always =
    "כדי לקבל תמונה טובה, מקמי את האצבע ישירות מתחת למטבע, כשהציפורן פונה כלפי מעלה וגלויה במלואה.";
  tips.push(always);
  for (const t of [brightness.tip, sharpness.tip, ...framing.tips, ...contrast.tips]) {
    if (t && !tips.includes(t)) tips.push(t);
  }

  // Keep at most 3 actionable tips after the always reminder (reminder + 3)
  const compact = [tips[0], ...tips.slice(1).filter((t) => t !== always)].slice(0, 4);

  return {
    score,
    level: levelInfo.id,
    levelLabel: levelInfo.label,
    checks: {
      brightness: brightness.points,
      sharpness: sharpness.points,
      framing: framing.points,
      contrast: contrast.points,
    },
    tips: compact,
  };
}

function scaleRegion(region, scale) {
  if (scale === 1) return region;
  return {
    ...region,
    x: region.x * scale,
    y: region.y * scale,
    width: region.width * scale,
    height: region.height * scale,
    cx: region.cx != null ? region.cx * scale : undefined,
    cy: region.cy != null ? region.cy * scale : undefined,
    radius: region.radius != null ? region.radius * scale : undefined,
    top: region.top != null ? region.top * scale : undefined,
  };
}
