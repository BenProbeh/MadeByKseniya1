/**
 * Modular nail boundary detector.
 * Current implementation: heuristic width scan under the coin (not a trained model).
 * Swap `detect` later for a segmentation SDK / ONNX model without rewriting MeasureStep.
 */

/**
 * @typedef {object} NailDetection
 * @property {boolean} detected
 * @property {boolean} found
 * @property {number|null} widthPx
 * @property {number} score
 * @property {number|null} left
 * @property {number|null} right
 * @property {{x:number,y:number}} center
 * @property {number|null} topY
 * @property {boolean} tipVisible
 * @property {string|null} reason
 * @property {"heuristic"|"model"|"none"} method
 */

function grayAt(data, width, height, x, y) {
  const xi = Math.max(0, Math.min(width - 1, Math.round(x)));
  const yi = Math.max(0, Math.min(height - 1, Math.round(y)));
  const i = (yi * width + xi) * 4;
  return (data[i] + data[i + 1] + data[i + 2]) / 3;
}

/**
 * Heuristic finger/nail region under a detected coin.
 * Returns explicit failure when width cannot be measured — never fabricates mm.
 */
export function detectNailHeuristic(imageData, coin) {
  if (!imageData?.data || !coin || !(coin.found || coin.detected) || !coin.center) {
    return {
      detected: false,
      found: false,
      presence: false,
      widthPx: null,
      score: 0,
      left: null,
      right: null,
      center: { x: 0, y: 0 },
      topY: null,
      tipVisible: false,
      reason: "coin-required",
      method: "heuristic",
    };
  }

  const { data, width, height } = imageData;
  const diameter = coin.outerDiameterPx || coin.diameterPx || 0;
  const coinR = diameter / 2;
  const cx = coin.center.x ?? coin.centerX;
  const cy = coin.center.y ?? coin.centerY;
  const gap = Math.min(width, height) * 0.028;
  const expectedTop = cy + coinR + gap;
  const fingerW = diameter * 0.8;
  const fingerH = fingerW * 1.45;

  const x0 = Math.max(2, Math.floor(cx - fingerW * 0.85));
  const x1 = Math.min(width - 2, Math.floor(cx + fingerW * 0.85));
  const y0 = Math.max(2, Math.floor(expectedTop - coinR * 0.05));
  const y1 = Math.min(height - 2, Math.floor(expectedTop + fingerH * 1.2));

  if (y0 >= y1 - 8 || x0 >= x1 - 8) {
    return {
      detected: false,
      found: false,
      presence: false,
      widthPx: null,
      score: 0,
      left: null,
      right: null,
      center: { x: cx, y: expectedTop + fingerH / 2 },
      topY: expectedTop,
      tipVisible: false,
      reason: "nail-roi-invalid",
      method: "heuristic",
      heightPx: fingerH,
    };
  }

  let dark = 0;
  let edged = 0;
  let samples = 0;
  for (let y = y0; y < y1; y += 3) {
    for (let x = x0; x < x1; x += 3) {
      const g = grayAt(data, width, height, x, y);
      const edge = Math.abs(g - grayAt(data, width, height, x - 2, y));
      samples += 1;
      if (g < 165) dark += 1;
      if (edge > 10) edged += 1;
    }
  }
  const darkRatio = samples ? dark / samples : 0;
  const edgeRatio = samples ? edged / samples : 0;
  const presence = darkRatio > 0.08 || edgeRatio > 0.05;

  const nailY0 = y0 + Math.floor((y1 - y0) * 0.06);
  const nailY1 = y0 + Math.floor((y1 - y0) * 0.5);
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
      if (g < 160) {
        if (left == null) left = x;
        right = x;
      }
    }
    if (left != null && right != null && right - left > 5) {
      const w = right - left;
      const expected = fingerW * 0.85;
      const fit = 1 - Math.min(1, Math.abs(w - expected) / expected);
      const centered = 1 - Math.min(1, Math.abs((left + right) / 2 - cx) / Math.max(diameter * 0.5, 1));
      const rowScore = fit * 0.55 + centered * 0.45;
      if (rowScore > bestScore) {
        bestScore = rowScore;
        bestWidth = w;
        bestLeft = left;
        bestRight = right;
        bestY = y;
      }
    }
  }

  const centerX = bestLeft != null ? (bestLeft + bestRight) / 2 : cx;
  const centerY = bestLeft != null ? bestY : expectedTop + fingerH * 0.35;
  const score = Math.max(0, Math.min(1, bestScore * 0.7 + darkRatio * 1.2 + edgeRatio * 0.8));
  const belowCoin = centerY > cy + coinR * 0.4;
  const widthOk = bestWidth > 6;
  const found = presence && belowCoin && score >= 0.12;

  return {
    detected: found && widthOk,
    found,
    presence: presence && belowCoin,
    widthPx: widthOk ? bestWidth : null,
    score,
    left: bestLeft,
    right: bestRight,
    center: { x: centerX, y: centerY },
    topY: Math.min(expectedTop, centerY - fingerH * 0.15),
    heightPx: fingerH,
    tipVisible: bestLeft != null && bestLeft > 2 && bestRight < width - 2,
    reason: !found ? "finger-not-detected" : !widthOk ? "nail-not-detected" : null,
    method: "heuristic",
  };
}

export const nailDetector = {
  /**
   * @param {ImageData} imageData
   * @param {object} coin — analysis coin / OpenCV coin result
   * @returns {NailDetection}
   */
  detect(imageData, coin) {
    return detectNailHeuristic(imageData, coin);
  },
};
