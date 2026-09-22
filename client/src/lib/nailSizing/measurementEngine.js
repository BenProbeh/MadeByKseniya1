/**
 * Measurement engine — vertical coin-above-finger layout.
 * Heuristic CV (not production-certified). Always expose confidence + manual fix.
 *
 * Primary scale: outer coin diameter in px / known outer diameter mm (10₪ = 23mm).
 * Never use the bimetallic gold core (16mm) as the full diameter.
 */

import { CAPTURE_CONFIG, TEN_SHEKEL_COIN } from "./captureConfig.js";

/** Normalized target layout inside the video frame (vertical axis, centered). */
export const GUIDE_LAYOUT = {
  coinCx: 0.5,
  coinCy: 0.28,
  /** Target outer coin diameter as fraction of min(frameW, frameH). */
  coinDiameterFrac: 0.26,
  /** Gap between coin bottom and finger top, as fraction of min side. */
  gapFrac: 0.028,
  /** Finger outline width relative to coin diameter. */
  fingerWidthRatio: 0.8,
  /** Finger outline height relative to its width. */
  fingerHeightRatio: 1.45,
};

const INNER_OUTER_RATIO_10 = TEN_SHEKEL_COIN.innerDiameterMm / TEN_SHEKEL_COIN.outerDiameterMm;

function sampleBrightness(data) {
  let sum = 0;
  const step = 16 * 4;
  for (let i = 0; i < data.length; i += step) {
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  return sum / (data.length / step);
}

function sampleSharpness(data, width, height) {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 2; y < height - 2; y += 4) {
    for (let x = 2; x < width - 2; x += 4) {
      const i = (y * width + x) * 4;
      const g = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const iUp = ((y - 1) * width + x) * 4;
      const iDn = ((y + 1) * width + x) * 4;
      const iLf = (y * width + (x - 1)) * 4;
      const iRt = (y * width + (x + 1)) * 4;
      const up = (data[iUp] + data[iUp + 1] + data[iUp + 2]) / 3;
      const dn = (data[iDn] + data[iDn + 1] + data[iDn + 2]) / 3;
      const lf = (data[iLf] + data[iLf + 1] + data[iLf + 2]) / 3;
      const rt = (data[iRt] + data[iRt + 1] + data[iRt + 2]) / 3;
      const lap = Math.abs(4 * g - up - dn - lf - rt);
      sum += lap;
      sumSq += lap * lap;
      n += 1;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function grayAt(data, width, height, x, y) {
  const xi = Math.max(0, Math.min(width - 1, Math.round(x)));
  const yi = Math.max(0, Math.min(height - 1, Math.round(y)));
  const i = (yi * width + xi) * 4;
  return (data[i] + data[i + 1] + data[i + 2]) / 3;
}

function edgeAtRadius(data, width, height, cx, cy, r, samples = 48) {
  let edge = 0;
  let valid = 0;
  for (let a = 0; a < samples; a += 1) {
    const theta = (a / samples) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const x1 = cx + cos * (r - 2);
    const y1 = cy + sin * (r - 2);
    const x2 = cx + cos * (r + 2);
    const y2 = cy + sin * (r + 2);
    if (x1 < 1 || y1 < 1 || x2 >= width - 1 || y2 >= height - 1) continue;
    edge += Math.abs(grayAt(data, width, height, x2, y2) - grayAt(data, width, height, x1, y1));
    valid += 1;
  }
  if (valid < samples * 0.7) return { score: 0, coverage: valid / samples };
  return { score: edge / valid, coverage: valid / samples };
}

function scoreCircleCandidate(data, width, height, cx, cy, minR, maxR) {
  let bestR = minR;
  let bestScore = -1;
  let bestCoverage = 0;
  for (let r = minR; r <= maxR; r += 2) {
    const { score, coverage } = edgeAtRadius(data, width, height, cx, cy, r);
    if (score > bestScore) {
      bestScore = score;
      bestR = r;
      bestCoverage = coverage;
    }
  }
  // Rough circularity / perspective: compare horizontal vs vertical edge strength
  const hEdge =
    Math.abs(grayAt(data, width, height, cx + bestR, cy) - grayAt(data, width, height, cx - bestR, cy)) +
    Math.abs(grayAt(data, width, height, cx + bestR * 0.7, cy) - grayAt(data, width, height, cx - bestR * 0.7, cy));
  const vEdge =
    Math.abs(grayAt(data, width, height, cx, cy + bestR) - grayAt(data, width, height, cx, cy - bestR)) +
    Math.abs(grayAt(data, width, height, cx, cy + bestR * 0.7) - grayAt(data, width, height, cx, cy - bestR * 0.7));
  const perspectiveRatio = hEdge > 1 && vEdge > 1 ? Math.min(hEdge, vEdge) / Math.max(hEdge, vEdge) : 0;

  // Inner ring probe (bimetallic gold core ≈ 16/23 of outer)
  const innerR = bestR * INNER_OUTER_RATIO_10;
  const inner = edgeAtRadius(data, width, height, cx, cy, innerR, 36);

  const normalized = Math.max(0, Math.min(1, bestScore / 55));
  const clipped = bestCoverage < 0.85;
  return {
    centerX: cx,
    centerY: cy,
    outerDiameterPx: bestR * 2,
    innerDiameterPx: innerR * 2,
    circularity: perspectiveRatio,
    perspectiveRatio,
    coverage: bestCoverage,
    clipped,
    innerScore: Math.max(0, Math.min(1, inner.score / 45)),
    confidence: normalized * (clipped ? 0.4 : 1) * (0.55 + 0.45 * perspectiveRatio),
    rawEdge: bestScore,
  };
}

function detectCoin(data, width, height, targetDiameterPx) {
  const minSide = Math.min(width, height);
  const searchCx0 = width * GUIDE_LAYOUT.coinCx;
  const searchCy0 = height * GUIDE_LAYOUT.coinCy;
  const minR = Math.floor(targetDiameterPx * 0.35);
  const maxR = Math.floor(targetDiameterPx * 0.75);

  const candidates = [];
  const step = Math.max(6, Math.floor(minSide * 0.03));
  for (let dy = -Math.floor(minSide * 0.1); dy <= Math.floor(minSide * 0.12); dy += step) {
    for (let dx = -Math.floor(minSide * 0.12); dx <= Math.floor(minSide * 0.12); dx += step) {
      const cx = searchCx0 + dx;
      const cy = searchCy0 + dy;
      if (cx < maxR + 4 || cy < maxR + 4 || cx > width - maxR - 4 || cy > height - maxR - 4) continue;
      candidates.push(scoreCircleCandidate(data, width, height, cx, cy, minR, maxR));
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  const best = candidates[0] || null;
  const second = candidates[1] || null;

  // Two strong distant circles → reject (multiple coins)
  let multiCoin = false;
  if (best && second && second.confidence > 0.35 && best.confidence > 0.35) {
    const dist = Math.hypot(best.centerX - second.centerX, best.centerY - second.centerY);
    if (dist > best.outerDiameterPx * 0.9) multiCoin = true;
  }

  if (!best) {
    return {
      found: false,
      multiCoin: false,
      centerX: searchCx0,
      centerY: searchCy0,
      outerDiameterPx: targetDiameterPx,
      innerDiameterPx: targetDiameterPx * INNER_OUTER_RATIO_10,
      circularity: 0,
      perspectiveRatio: 0,
      confidence: 0,
      clipped: true,
      score: 0,
    };
  }

  const sizeRatio = best.outerDiameterPx / targetDiameterPx;
  const inUpperZone = best.centerY < height * 0.48;
  const score =
    best.confidence *
    (multiCoin ? 0.15 : 1) *
    (inUpperZone ? 1 : 0.45) *
    (sizeRatio > 0.55 && sizeRatio < 1.55 ? 1 : 0.5);

  return {
    found: score > 0.18 && !multiCoin,
    multiCoin,
    centerX: best.centerX,
    centerY: best.centerY,
    outerDiameterPx: best.outerDiameterPx,
    innerDiameterPx: best.innerDiameterPx,
    circularity: best.circularity,
    perspectiveRatio: best.perspectiveRatio,
    confidence: Math.max(0, Math.min(1, score)),
    clipped: best.clipped,
    sizeRatio,
    score,
    innerScore: best.innerScore,
  };
}

function detectNailBelowCoin(data, width, height, coin) {
  const coinR = coin.outerDiameterPx / 2;
  const gap = Math.min(width, height) * GUIDE_LAYOUT.gapFrac;
  const expectedTop = coin.centerY + coinR + gap;
  const fingerW = coin.outerDiameterPx * GUIDE_LAYOUT.fingerWidthRatio;
  const fingerH = fingerW * GUIDE_LAYOUT.fingerHeightRatio;

  const x0 = Math.floor(coin.centerX - fingerW * 0.75);
  const x1 = Math.floor(coin.centerX + fingerW * 0.75);
  const y0 = Math.floor(expectedTop);
  const y1 = Math.floor(Math.min(height - 2, expectedTop + fingerH * 1.15));

  if (y0 >= y1 - 8 || x0 >= x1 - 8) {
    return { found: false, widthPx: null, score: 0, centerX: coin.centerX, centerY: expectedTop + fingerH / 2 };
  }

  // Scan horizontal rows in upper third of finger ROI (nail plate zone)
  const nailY0 = y0 + Math.floor((y1 - y0) * 0.08);
  const nailY1 = y0 + Math.floor((y1 - y0) * 0.42);
  let bestWidth = 0;
  let bestLeft = null;
  let bestRight = null;
  let bestY = nailY0;
  let bestScore = 0;

  for (let y = nailY0; y < nailY1; y += 2) {
    let left = null;
    let right = null;
    for (let x = x0; x < x1; x += 1) {
      const g = grayAt(data, width, height, x, y);
      const gL = grayAt(data, width, height, x - 2, y);
      const edge = Math.abs(g - gL);
      // Finger/nail tends darker than background sheet
      if (g < 155 && edge > 8) {
        if (left == null) left = x;
        right = x;
      } else if (g < 130) {
        if (left == null) left = x;
        right = x;
      }
    }
    if (left != null && right != null && right - left > 6) {
      const w = right - left;
      // Prefer widths in plausible nail range vs coin
      const expected = fingerW * 0.85;
      const fit = 1 - Math.min(1, Math.abs(w - expected) / expected);
      const centered = 1 - Math.min(1, Math.abs((left + right) / 2 - coin.centerX) / (coin.outerDiameterPx * 0.5));
      const rowScore = fit * 0.6 + centered * 0.4;
      if (rowScore > bestScore) {
        bestScore = rowScore;
        bestWidth = w;
        bestLeft = left;
        bestRight = right;
        bestY = y;
      }
    }
  }

  if (!bestWidth || bestLeft == null) {
    return {
      found: false,
      widthPx: null,
      score: 0,
      centerX: coin.centerX,
      centerY: expectedTop + fingerH / 2,
      topY: expectedTop,
      tipVisible: false,
    };
  }

  const centerX = (bestLeft + bestRight) / 2;
  const tipVisible = bestY < height - 8 && bestLeft > 4 && bestRight < width - 4;
  const belowCoin = bestY > coin.centerY + coinR;
  const score = bestScore * (tipVisible ? 1 : 0.4) * (belowCoin ? 1 : 0.3);

  return {
    found: score > 0.22 && tipVisible && belowCoin,
    widthPx: bestWidth,
    score: Math.max(0, Math.min(1, score)),
    left: bestLeft,
    right: bestRight,
    centerX,
    centerY: bestY,
    topY: expectedTop,
    tipVisible,
    fingerBox: { x0, x1, y0, y1, fingerW, fingerH },
  };
}

function directionalTips(coin, nail, guideCoinCx, guideCoinCy, coinTargetD, align) {
  const tips = [];
  const tol = coinTargetD * 0.12;

  if (coin.found) {
    const dx = coin.centerX - guideCoinCx;
    const dy = coin.centerY - guideCoinCy;
    if (Math.abs(dx) > tol) {
      tips.push({
        code: "coin-x",
        textHe: dx < 0 ? "הזיזי את המטבע מעט ימינה" : "הזיזי את המטבע מעט שמאלה",
      });
    }
    if (dy < -tol * 1.2) {
      tips.push({ code: "coin-y-up", textHe: "הורידי מעט את המטבע באזור העליון של המסגרת" });
    } else if (dy > tol * 1.4) {
      tips.push({ code: "coin-y-down", textHe: "העלי את המטבע מעט למעלה" });
    }
  }

  if (coin.found && nail.found) {
    if (!align.verticalOk) {
      tips.push({ code: "stack", textHe: "מקמי את האצבע ישירות מתחת למטבע" });
    } else if (!align.xOk) {
      const ndx = nail.centerX - coin.centerX;
      tips.push({
        code: "finger-x",
        textHe: ndx < 0 ? "הזיזי את האצבע ימינה" : "הזיזי את האצבע שמאלה",
      });
    }
    if (!align.gapOk && align.overlap) {
      tips.push({ code: "overlap", textHe: "השאירי רווח קטן בין המטבע לאצבע — בלי חפיפה" });
    } else if (!align.gapOk && align.gapTooLarge) {
      tips.push({ code: "gap-large", textHe: "קרבי את האצבע מעט מתחת למטבע" });
    }
    if (!align.samePlaneHint) {
      tips.push({ code: "plane", textHe: "המטבע והאצבע צריכים להיות על אותו משטח" });
    }
  } else if (coin.found && !nail.found) {
    tips.push({ code: "finger-miss", textHe: "מקמי את האצבע ישירות מתחת למטבע" });
  }

  return tips;
}

export function analyzeFrame(imageData, { coinDiameterMm = 23, coinMeta = null } = {}) {
  const { data, width, height } = imageData;
  const minSide = Math.min(width, height);
  const targetDiameterPx = minSide * GUIDE_LAYOUT.coinDiameterFrac;
  const guideCoinCx = width * GUIDE_LAYOUT.coinCx;
  const guideCoinCy = height * GUIDE_LAYOUT.coinCy;
  const outerMm = coinMeta?.outerDiameterMm ?? coinDiameterMm ?? 23;
  const innerMm = coinMeta?.innerDiameterMm ?? null;

  const brightness = sampleBrightness(data);
  const sharpness = sampleSharpness(data, width, height);
  const lightingOk =
    brightness > CAPTURE_CONFIG.BRIGHTNESS_MIN && brightness < CAPTURE_CONFIG.BRIGHTNESS_MAX;
  const sharpOk = sharpness > CAPTURE_CONFIG.SHARPNESS_MIN;

  const coin = detectCoin(data, width, height, targetDiameterPx);
  const nail = coin.found
    ? detectNailBelowCoin(data, width, height, coin)
    : { found: false, widthPx: null, score: 0, centerX: guideCoinCx, centerY: guideCoinCy + targetDiameterPx };

  const coinR = coin.outerDiameterPx / 2;
  const xAlignLimit = coin.outerDiameterPx * CAPTURE_CONFIG.ALIGN_X_FRAC;
  const xDelta = nail.found ? Math.abs(nail.centerX - coin.centerX) : Infinity;
  const coinBottom = coin.centerY + coinR;
  const nailTop = nail.found ? (nail.topY ?? nail.centerY - 10) : null;
  const gap = nailTop != null ? nailTop - coinBottom : null;
  const idealGap = minSide * GUIDE_LAYOUT.gapFrac;
  const overlap = gap != null && gap < 2;
  const gapTooLarge = gap != null && gap > idealGap * 4;
  const gapOk = gap != null && gap >= 4 && gap <= idealGap * 3.5;
  const verticalOk = nail.found && nail.centerY > coin.centerY + coinR * 0.5;
  const xOk = nail.found && xDelta <= xAlignLimit;
  const samePlaneHint = true;

  const perspectiveOk = coin.found && coin.perspectiveRatio >= CAPTURE_CONFIG.PERSPECTIVE_MIN;
  const sizeOk =
    coin.found &&
    coin.sizeRatio >= CAPTURE_CONFIG.COIN_SIZE_RATIO_MIN &&
    coin.sizeRatio <= CAPTURE_CONFIG.COIN_SIZE_RATIO_MAX;
  const coinValid =
    coin.found &&
    !coin.multiCoin &&
    !coin.clipped &&
    coin.confidence >= CAPTURE_CONFIG.COIN_CONFIDENCE_MIN &&
    perspectiveOk &&
    sizeOk;
  const fingerValid = nail.found && nail.score >= CAPTURE_CONFIG.NAIL_SCORE_MIN && nail.tipVisible;
  const nailValid = fingerValid && nail.widthPx != null && nail.widthPx > 6;

  // Optional bimetallic inner/outer sanity for 10₪
  let bimetallicOk = true;
  if (innerMm && outerMm && coin.found && coin.innerDiameterPx && coin.outerDiameterPx) {
    const ratio = coin.innerDiameterPx / coin.outerDiameterPx;
    const expected = innerMm / outerMm;
    bimetallicOk = Math.abs(ratio - expected) < 0.22;
  }

  const align = {
    verticalOk,
    xOk,
    gapOk,
    overlap,
    gapTooLarge,
    samePlaneHint,
    xDelta,
    gap,
  };

  const verticalAlignmentValid = verticalOk && xOk;
  const distanceValid = gapOk;
  const lightingValid = lightingOk;
  const sharpnessValid = sharpOk;
  const perspectiveValid = perspectiveOk;

  const ready =
    coinValid &&
    fingerValid &&
    nailValid &&
    verticalAlignmentValid &&
    distanceValid &&
    lightingValid &&
    sharpnessValid &&
    perspectiveValid &&
    bimetallicOk &&
    sizeOk;

  const tips = [];
  if (!lightingOk) {
    tips.push({
      code: brightness < CAPTURE_CONFIG.BRIGHTNESS_MIN ? "dark" : "glare",
      textHe:
        brightness < CAPTURE_CONFIG.BRIGHTNESS_MIN
          ? "עברִי למקום מואר יותר"
          : "הפחיתי תאורה ישירה",
    });
  }
  if (!sharpOk) tips.push({ code: "blur", textHe: "התמונה מטושטשת — החזיקי את הטלפון יציב" });
  if (coin.multiCoin) tips.push({ code: "multi-coin", textHe: "נמצא יותר ממטבע אחד — השאירי מטבע אחד בלבד" });
  else if (coin.clipped) tips.push({ code: "coin-clip", textHe: "הכניסי את כל המטבע למסגרת" });
  else if (!coin.found) {
    tips.push({ code: "place", textHe: "מקמי את המטבע למעלה ואת האצבע ישירות מתחתיו" });
  } else {
    if (!perspectiveOk) tips.push({ code: "perspective", textHe: "החזיקי את הטלפון במקביל למשטח" });
    if (coin.sizeRatio < CAPTURE_CONFIG.COIN_SIZE_RATIO_MIN) {
      tips.push({ code: "too-far", textHe: "קרבי מעט את הטלפון" });
    } else if (coin.sizeRatio > CAPTURE_CONFIG.COIN_SIZE_RATIO_MAX) {
      tips.push({ code: "too-close", textHe: "הרחיקי מעט את הטלפון" });
    }
  }

  tips.push(...directionalTips(coin, nail, guideCoinCx, guideCoinCy, targetDiameterPx, align));

  if (ready) {
    tips.length = 0;
    tips.push({ code: "hold", textHe: "מעולה — הישארי במקום", ok: true });
  }

  // Deduplicate by code
  const seen = new Set();
  const uniqueTips = tips.filter((t) => {
    if (seen.has(t.code)) return false;
    seen.add(t.code);
    return true;
  });

  const confidence = ready
    ? Math.min(
        0.93,
        0.4 + coin.confidence * 0.25 + nail.score * 0.2 + (sharpOk ? 0.08 : 0) + (perspectiveOk ? 0.07 : 0)
      )
    : Math.min(0.42, coin.confidence * 0.25 + (nail.score || 0) * 0.15);

  const guideState = ready ? "ok" : coin.found || nail.found ? "warn" : "idle";

  return {
    ready,
    confidence,
    brightness,
    sharpness,
    tips: uniqueTips.slice(0, 4),
    guideState,
    validation: {
      coinValid,
      fingerValid,
      nailValid,
      verticalAlignmentValid,
      distanceValid,
      lightingValid,
      sharpnessValid,
      perspectiveValid,
      bimetallicOk,
      sizeOk,
    },
    coin: {
      diameterPx: coin.outerDiameterPx,
      outerDiameterPx: coin.outerDiameterPx,
      innerDiameterPx: coin.innerDiameterPx,
      center: { x: coin.centerX, y: coin.centerY },
      diameterMm: outerMm,
      score: coin.confidence,
      found: coin.found,
      clipped: coin.clipped,
      multiCoin: coin.multiCoin,
      perspectiveRatio: coin.perspectiveRatio,
      sizeRatio: coin.sizeRatio,
    },
    nail: {
      widthPx: nail.widthPx,
      score: nail.score || 0,
      left: nail.left,
      right: nail.right,
      center: { x: nail.centerX, y: nail.centerY },
      found: nail.found,
    },
    guides: {
      layout: GUIDE_LAYOUT,
      targetCoin: {
        cx: guideCoinCx,
        cy: guideCoinCy,
        diameterPx: targetDiameterPx,
      },
      targetFinger: {
        cx: guideCoinCx,
        top: guideCoinCy + targetDiameterPx / 2 + minSide * GUIDE_LAYOUT.gapFrac,
        width: targetDiameterPx * GUIDE_LAYOUT.fingerWidthRatio,
        height: targetDiameterPx * GUIDE_LAYOUT.fingerWidthRatio * GUIDE_LAYOUT.fingerHeightRatio,
      },
    },
  };
}

export function captureCanvasFrame(video, canvas) {
  if (!video || !canvas || !video.videoWidth) return null;
  const w = video.videoWidth;
  const h = video.videoHeight;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** Pure helpers for automated tests */
export function assertUsesOuterDiameterMm(coinMeta) {
  const outer = coinMeta?.outerDiameterMm ?? coinMeta?.diameterMm;
  const inner = coinMeta?.innerDiameterMm;
  return outer === 23 && (inner == null || inner === 16) && outer !== 16;
}

export function assertVerticalStack(coinCenterY, nailCenterY) {
  return nailCenterY > coinCenterY;
}

export function assertCenteredAxis(coinCx, nailCx, coinDiameterPx, maxFrac = 0.2) {
  return Math.abs(coinCx - nailCx) <= coinDiameterPx * maxFrac;
}
