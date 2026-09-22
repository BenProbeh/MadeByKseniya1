/**
 * Frame + ROI helpers for OpenCV coin detection.
 */

import { GUIDE_LAYOUT } from "./measurementEngine.js";
import { getCoverTransform } from "./videoGeometry.js";
import { OPEN_CV_SIZING_CONFIG } from "./openCvConfig.js";

/**
 * Read a camera frame into ImageData. Avoids resizing canvas when resolution unchanged.
 */
export function readVideoFrame(video, canvas) {
  if (
    !video ||
    !canvas ||
    video.readyState < 2 ||
    video.videoWidth <= 0 ||
    video.videoHeight <= 0
  ) {
    return null;
  }

  const w = video.videoWidth;
  const h = video.videoHeight;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(video, 0, 0, w, h);
  return context.getImageData(0, 0, w, h);
}

/**
 * Guide coin rect in video-native pixels (center + diameter from GUIDE_LAYOUT).
 */
export function getGuideCoinInVideo(videoWidth, videoHeight) {
  const minSide = Math.min(videoWidth, videoHeight);
  const diameterPx = minSide * GUIDE_LAYOUT.coinDiameterFrac;
  const cx = videoWidth * GUIDE_LAYOUT.coinCx;
  const cy = videoHeight * GUIDE_LAYOUT.coinCy;
  return { cx, cy, diameterPx, radiusPx: diameterPx / 2 };
}

/**
 * Expand guide coin into a padded ROI clamped to the frame.
 */
export function getCoinRoi(videoWidth, videoHeight, padding = OPEN_CV_SIZING_CONFIG.coinRoiPadding) {
  const guide = getGuideCoinInVideo(videoWidth, videoHeight);
  const pad = guide.radiusPx * (1 + padding * 2);
  const x = Math.max(0, Math.floor(guide.cx - pad));
  const y = Math.max(0, Math.floor(guide.cy - pad));
  const right = Math.min(videoWidth, Math.ceil(guide.cx + pad));
  const bottom = Math.min(videoHeight, Math.ceil(guide.cy + pad));
  const width = Math.max(8, right - x);
  const height = Math.max(8, bottom - y);
  return {
    x,
    y,
    width,
    height,
    guide,
  };
}

/**
 * Map display-space guide circle (if needed) into video ROI via cover transform.
 * Prefer getCoinRoi for the built-in vertical guide.
 */
export function displayRectToVideoRoi(displayRect, videoW, videoH, displayW, displayH, paddingFrac = 0.2) {
  const t = getCoverTransform(videoW, videoH, displayW, displayH);
  const vx0 = (displayRect.x - t.offsetX) / t.scale;
  const vy0 = (displayRect.y - t.offsetY) / t.scale;
  const vx1 = (displayRect.x + displayRect.width - t.offsetX) / t.scale;
  const vy1 = (displayRect.y + displayRect.height - t.offsetY) / t.scale;
  const cx = (vx0 + vx1) / 2;
  const cy = (vy0 + vy1) / 2;
  const halfW = (Math.abs(vx1 - vx0) / 2) * (1 + paddingFrac);
  const halfH = (Math.abs(vy1 - vy0) / 2) * (1 + paddingFrac);
  const x = Math.max(0, Math.floor(cx - halfW));
  const y = Math.max(0, Math.floor(cy - halfH));
  const right = Math.min(videoW, Math.ceil(cx + halfW));
  const bottom = Math.min(videoH, Math.ceil(cy + halfH));
  return {
    x,
    y,
    width: Math.max(8, right - x),
    height: Math.max(8, bottom - y),
  };
}

export function calculatePixelsPerMm(coinDiameterPx, diameterMm = OPEN_CV_SIZING_CONFIG.coin.diameterMm) {
  if (!Number.isFinite(coinDiameterPx) || coinDiameterPx <= 0) return null;
  if (!Number.isFinite(diameterMm) || diameterMm <= 0) return null;
  return coinDiameterPx / diameterMm;
}

export function calculateNailWidthMm(nailWidthPx, pixelsPerMm) {
  if (!Number.isFinite(nailWidthPx) || !Number.isFinite(pixelsPerMm) || pixelsPerMm <= 0) {
    return null;
  }
  return nailWidthPx / pixelsPerMm;
}
