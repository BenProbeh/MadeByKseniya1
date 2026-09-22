/**
 * Pluggable measurement engine interface.
 * Current implementation: local canvas heuristics (brightness/sharpness +
 * circular Hough-like coin estimate + nail-band width). Not production-certified
 * accuracy — always expose confidence and allow manual correction.
 */

function sampleBrightness(data) {
  let sum = 0;
  const step = 16 * 4;
  for (let i = 0; i < data.length; i += step) {
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  return sum / (data.length / step);
}

function sampleSharpness(data, width, height) {
  // Laplacian-ish variance on grayscale subsample
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

function estimateCoinDiameterPx(data, width, height) {
  // Scan a centered ROI for a bright/dark circular mass via radial edge density.
  const cx = Math.floor(width * 0.32);
  const cy = Math.floor(height * 0.55);
  const maxR = Math.floor(Math.min(width, height) * 0.28);
  const minR = Math.floor(Math.min(width, height) * 0.08);
  let bestR = minR;
  let bestScore = -1;

  for (let r = minR; r <= maxR; r += 2) {
    let edge = 0;
    const samples = 36;
    for (let a = 0; a < samples; a += 1) {
      const theta = (a / samples) * Math.PI * 2;
      const x1 = Math.round(cx + Math.cos(theta) * (r - 2));
      const y1 = Math.round(cy + Math.sin(theta) * (r - 2));
      const x2 = Math.round(cx + Math.cos(theta) * (r + 2));
      const y2 = Math.round(cy + Math.sin(theta) * (r + 2));
      if (x1 < 0 || y1 < 0 || x2 >= width || y2 >= height) continue;
      const i1 = (y1 * width + x1) * 4;
      const i2 = (y2 * width + x2) * 4;
      const g1 = (data[i1] + data[i1 + 1] + data[i1 + 2]) / 3;
      const g2 = (data[i2] + data[i2 + 1] + data[i2 + 2]) / 3;
      edge += Math.abs(g2 - g1);
    }
    if (edge > bestScore) {
      bestScore = edge;
      bestR = r;
    }
  }

  const normalized = bestScore / (36 * 80);
  return {
    diameterPx: bestR * 2,
    center: { x: cx, y: cy },
    score: Math.max(0, Math.min(1, normalized)),
  };
}

function estimateNailWidthPx(data, width, height) {
  // Horizontal band on the right side of frame (finger guide area).
  const x0 = Math.floor(width * 0.48);
  const x1 = Math.floor(width * 0.92);
  const yMid = Math.floor(height * 0.52);
  const band = Math.floor(height * 0.08);
  let left = null;
  let right = null;

  for (let x = x0; x < x1; x += 2) {
    let dark = 0;
    let count = 0;
    for (let y = yMid - band; y < yMid + band; y += 2) {
      const i = (y * width + x) * 4;
      const g = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (g < 140) dark += 1;
      count += 1;
    }
    const ratio = dark / count;
    if (ratio > 0.35) {
      if (left == null) left = x;
      right = x;
    }
  }

  if (left == null || right == null || right - left < 8) {
    return { widthPx: null, score: 0, band: { x0, x1, yMid, band } };
  }

  const widthPx = right - left;
  const expected = width * 0.12;
  const score = Math.max(0, Math.min(1, 1 - Math.abs(widthPx - expected) / expected));
  return { widthPx, score, left, right, band: { x0, x1, yMid, band } };
}

export function analyzeFrame(imageData, { coinDiameterMm }) {
  const { data, width, height } = imageData;
  const brightness = sampleBrightness(data);
  const sharpness = sampleSharpness(data, width, height);
  const coin = estimateCoinDiameterPx(data, width, height);
  const nail = estimateNailWidthPx(data, width, height);

  const lightingOk = brightness > 55 && brightness < 210;
  const sharpOk = sharpness > 18;
  const coinOk = coin.score > 0.22;
  const nailOk = nail.widthPx != null && nail.score > 0.15;

  const tips = [];
  if (brightness < 55) tips.push({ code: "dark", textHe: "התאורה חלשה — קרבי לחלון או הדליקי אור" });
  else if (brightness > 210) tips.push({ code: "glare", textHe: "יש סינוור — הרחיקי מהאור הישיר" });
  else tips.push({ code: "light-ok", textHe: "התאורה טובה", ok: true });

  if (!sharpOk) tips.push({ code: "blur", textHe: "התמונה מטושטשת — החזיקי את הטלפון יציב" });
  else tips.push({ code: "sharp-ok", textHe: "החדות תקינה", ok: true });

  if (!coinOk) tips.push({ code: "coin", textHe: "הכניסי את כל המטבע למסגרת השמאלית" });
  else tips.push({ code: "coin-ok", textHe: "המטבע זוהה", ok: true });

  if (!nailOk) tips.push({ code: "nail", textHe: "מקמי את האצבע והציפורן בתוך קווי המתאר" });
  else tips.push({ code: "nail-ok", textHe: "הציפורן זוהתה", ok: true });

  const ready = lightingOk && sharpOk && coinOk && nailOk;
  const confidence = ready
    ? Math.min(0.92, 0.35 + coin.score * 0.3 + nail.score * 0.25 + (sharpOk ? 0.1 : 0))
    : Math.min(0.4, coin.score * 0.2 + nail.score * 0.15);

  return {
    ready,
    confidence,
    brightness,
    sharpness,
    tips,
    coin: {
      diameterPx: coin.diameterPx,
      center: coin.center,
      diameterMm: coinDiameterMm,
      score: coin.score,
    },
    nail: {
      widthPx: nail.widthPx,
      score: nail.score,
      left: nail.left,
      right: nail.right,
    },
    guides: {
      coinCenter: coin.center,
      coinRadius: coin.diameterPx / 2,
      nailBand: nail.band,
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
