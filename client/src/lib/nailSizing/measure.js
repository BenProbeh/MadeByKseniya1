/**
 * Nail width from a photo with a 10 ₪ coin beside the finger.
 *
 * The customer marks the coin's outline and the nail's two edges on the same still image, so the
 * pixel scale cancels out: width_mm = nail_px / coin_diameter_px × 23 mm. Nothing depends on the
 * camera resolution, zoom or distance — only on both objects lying flat at the same height.
 */
import { NAIL_SIZE_CHART, widthMmToSize } from "./sizing.js";

/** Bank of Israel: the 10 ₪ coin is bimetallic; its full outer diameter (the ring) is 23 mm. */
export const REFERENCE_COIN = Object.freeze({
  id: "ils-10-shekel",
  labelHe: "מטבע של 10 ₪",
  diameterMm: 23,
  imageSrc: "/assets/coins/ils-10-shekel.svg",
});

/** Typical nail-plate widths per finger (mm). Outside this range the marking is probably off. */
export const PLAUSIBLE_WIDTH_MM = Object.freeze({
  thumb: [11, 21],
  index: [8, 17],
  middle: [8, 17],
  ring: [7, 16],
  pinky: [5.5, 14],
});

export function nailWidthMm(nailPx, coinDiameterPx, coinDiameterMm = REFERENCE_COIN.diameterMm) {
  if (!(nailPx > 0) || !(coinDiameterPx > 0)) return null;
  return Math.round((nailPx / coinDiameterPx) * coinDiameterMm * 10) / 10;
}

/**
 * Full result for one finger. `plausible` is false when the width is far from what that finger can be,
 * so the UI can ask her to check the marks instead of silently saving a wrong size.
 */
export function measureFinger({ fingerId, nailPx, coinDiameterPx }) {
  const widthMm = nailWidthMm(nailPx, coinDiameterPx);
  if (widthMm == null) return { widthMm: null, size: null, plausible: false };
  const [min, max] = PLAUSIBLE_WIDTH_MM[fingerId] || [5, 22];
  return { widthMm, size: widthMmToSize(widthMm), plausible: widthMm >= min && widthMm <= max };
}

/** Smallest and largest sizes in the chart (for copy like "מידות 0–9"). */
export const SIZE_RANGE = Object.freeze({
  smallest: NAIL_SIZE_CHART[NAIL_SIZE_CHART.length - 1].size,
  largest: NAIL_SIZE_CHART[0].size,
});

/**
 * Where the on-screen guides sit, as fractions of a 3:4 portrait frame: the coin above, the finger
 * below it on the same vertical axis. The same numbers place the overlay, the first marks and the
 * regions the photo check looks at, so they always agree.
 */
export const FRAME_ASPECT = 3 / 4;
export const GUIDE = Object.freeze({
  cx: 0.5,
  coinCy: 0.27,
  coinD: 0.3, // of frame width
  fingerTop: 0.47, // of frame height
  fingerW: 0.26, // of frame width
  fingerH: 0.42, // of frame height
  nailW: 0.17, // first guess of the nail width, of frame width
  nailY: 0.55, // of frame height
});

/** Guides in pixels for a frame of `width` × `height`. */
export function guideGeometry(width, height) {
  const coinR = (GUIDE.coinD * width) / 2;
  const fingerW = GUIDE.fingerW * width;
  const fingerH = GUIDE.fingerH * height;
  return {
    coin: { cx: GUIDE.cx * width, cy: GUIDE.coinCy * height, r: coinR },
    finger: { x: GUIDE.cx * width - fingerW / 2, y: GUIDE.fingerTop * height, width: fingerW, height: fingerH },
    nail: {
      x1: GUIDE.cx * width - (GUIDE.nailW * width) / 2,
      x2: GUIDE.cx * width + (GUIDE.nailW * width) / 2,
      y: GUIDE.nailY * height,
    },
  };
}

/** The same guides in the shape the photo check expects. */
export function qualityRegions(width, height) {
  const g = guideGeometry(width, height);
  return {
    coinGuideRegion: {
      x: g.coin.cx - g.coin.r,
      y: g.coin.cy - g.coin.r,
      width: g.coin.r * 2,
      height: g.coin.r * 2,
      cx: g.coin.cx,
      cy: g.coin.cy,
      radius: g.coin.r,
    },
    fingerGuideRegion: { ...g.finger, cx: g.coin.cx, top: g.finger.y },
  };
}

/**
 * Source rectangle that crops a `srcW` × `srcH` camera frame to what an object-fit: cover box of
 * aspect `aspect` (width / height) shows — so the still matches exactly what she lined up.
 */
export function coverCrop(srcW, srcH, aspect = FRAME_ASPECT) {
  if (!(srcW > 0) || !(srcH > 0)) return null;
  const srcAspect = srcW / srcH;
  if (srcAspect > aspect) {
    const w = srcH * aspect;
    return { sx: (srcW - w) / 2, sy: 0, sw: w, sh: srcH };
  }
  const h = srcW / aspect;
  return { sx: 0, sy: (srcH - h) / 2, sw: srcW, sh: h };
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
