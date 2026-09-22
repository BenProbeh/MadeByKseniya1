/**
 * Press-on nail size chart (width at widest nail plate point).
 * Ranges are industry-typical; salon may refine later from a central catalog.
 */
export const NAIL_SIZE_CHART = [
  { size: 0, minMm: 14.5, maxMm: 16.0, labelHe: "0" },
  { size: 1, minMm: 13.5, maxMm: 14.49, labelHe: "1" },
  { size: 2, minMm: 12.5, maxMm: 13.49, labelHe: "2" },
  { size: 3, minMm: 11.5, maxMm: 12.49, labelHe: "3" },
  { size: 4, minMm: 10.5, maxMm: 11.49, labelHe: "4" },
  { size: 5, minMm: 9.5, maxMm: 10.49, labelHe: "5" },
  { size: 6, minMm: 8.5, maxMm: 9.49, labelHe: "6" },
  { size: 7, minMm: 7.5, maxMm: 8.49, labelHe: "7" },
  { size: 8, minMm: 6.5, maxMm: 7.49, labelHe: "8" },
  { size: 9, minMm: 5.5, maxMm: 6.49, labelHe: "9" },
];

export const CONFIDENCE_AUTO_OK = 0.72;
export const CONFIDENCE_REVIEW = 0.45;

export function pixelsPerMillimeter(coinDiameterPx, coinDiameterMm) {
  if (!coinDiameterPx || !coinDiameterMm || coinDiameterMm <= 0) return null;
  return coinDiameterPx / coinDiameterMm;
}

export function widthPxToMm(widthPx, pxPerMm) {
  if (!widthPx || !pxPerMm || pxPerMm <= 0) return null;
  return Math.round((widthPx / pxPerMm) * 100) / 100;
}

export function widthMmToSize(widthMm) {
  if (widthMm == null || Number.isNaN(widthMm)) return null;
  const hit = NAIL_SIZE_CHART.find((row) => widthMm >= row.minMm && widthMm <= row.maxMm);
  if (hit) return hit.size;
  if (widthMm > NAIL_SIZE_CHART[0].maxMm) return NAIL_SIZE_CHART[0].size;
  return NAIL_SIZE_CHART[NAIL_SIZE_CHART.length - 1].size;
}

export function confidenceLabelHe(confidence) {
  if (confidence >= CONFIDENCE_AUTO_OK) return "גבוהה";
  if (confidence >= CONFIDENCE_REVIEW) return "בינונית — מומלץ לאשר או לצלם שוב";
  return "נמוכה — יש לצלם שוב או לתקן ידנית";
}
