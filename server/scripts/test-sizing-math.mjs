import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  calculatePhotoQuality,
  getGuideRegions,
  getQualityLevel,
  downscaleImageData,
} from "../../client/src/lib/nailSizing/photoQuality.js";
import { pixelsPerMillimeter, widthPxToMm } from "../../client/src/lib/nailSizing/sizing.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function makeImageData(width, height, fill = (x, y) => [120, 120, 120, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { data, width, height };
}

test("OpenCV assets and imports are removed", () => {
  assert.equal(existsSync(join(root, "client/public/opencv/opencv.js")), false);
  assert.equal(existsSync(join(root, "client/src/lib/nailSizing/useOpenCv.js")), false);
  assert.equal(existsSync(join(root, "client/src/lib/nailSizing/coinDetector.js")), false);
  const html = readFileSync(join(root, "client/index.html"), "utf8");
  assert.equal(html.includes("opencv.js"), false);
  assert.equal(html.includes("window.cv"), false);
  const measure = readFileSync(join(root, "client/src/components/nail-sizing/MeasureStep.jsx"), "utf8");
  assert.equal(/useOpenCv|HoughCircles|window\.cv|cv\.Mat|opencv/i.test(measure), false);
  assert.equal(/requestAnimationFrame|processingLoop|analyzeVideoWithOpenCv/.test(measure), false);
});

test("photo quality score is clamped 0–100", () => {
  const dark = calculatePhotoQuality(makeImageData(80, 120, () => [8, 8, 8, 255]));
  assert.ok(dark.score >= 0 && dark.score <= 100);
  const q = calculatePhotoQuality(
    makeImageData(200, 300, (x, y) => {
      const n = ((x * 17 + y * 13) % 80) + 90;
      return [n, n, n, 255];
    })
  );
  assert.ok(q.score >= 0 && q.score <= 100);
  assert.ok(["excellent", "good", "fair", "poor"].includes(q.level));
});

test("dark image lowers brightness check", () => {
  const dark = calculatePhotoQuality(makeImageData(100, 140, () => [12, 12, 12, 255]));
  const mid = calculatePhotoQuality(makeImageData(100, 140, () => [130, 130, 130, 255]));
  assert.ok(dark.checks.brightness < mid.checks.brightness);
  assert.ok(dark.tips.some((t) => t.includes("מואר")));
});

test("blurry-flat image lowers sharpness", () => {
  const flat = calculatePhotoQuality(makeImageData(100, 140, () => [128, 128, 128, 255]));
  const edged = calculatePhotoQuality(
    makeImageData(100, 140, (x) => (x % 4 < 2 ? [40, 40, 40, 255] : [200, 200, 200, 255]))
  );
  assert.ok(flat.checks.sharpness <= edged.checks.sharpness);
});

test("empty framing regions score lower than active regions", () => {
  const guides = getGuideRegions(200, 300);
  const empty = calculatePhotoQuality(makeImageData(200, 300, () => [128, 128, 128, 255]), guides);
  const filled = calculatePhotoQuality(
    makeImageData(200, 300, (x, y) => {
      const inCoin =
        Math.hypot(x - guides.coinGuideRegion.cx, y - guides.coinGuideRegion.cy) <
        guides.coinGuideRegion.radius * 0.9;
      const inFinger =
        x >= guides.fingerGuideRegion.x &&
        x <= guides.fingerGuideRegion.x + guides.fingerGuideRegion.width &&
        y >= guides.fingerGuideRegion.y &&
        y <= guides.fingerGuideRegion.y + guides.fingerGuideRegion.height;
      if (inCoin || inFinger) {
        const n = ((x + y) % 50) + 40;
        return [n, n + 10, n, 255];
      }
      return [180, 180, 180, 255];
    }),
    guides
  );
  assert.ok(filled.checks.framing >= empty.checks.framing);
});

test("quality level labels", () => {
  assert.equal(getQualityLevel(90).id, "excellent");
  assert.equal(getQualityLevel(75).id, "good");
  assert.equal(getQualityLevel(55).id, "fair");
  assert.equal(getQualityLevel(20).id, "poor");
});

test("downscale never enlarges", () => {
  const src = makeImageData(640, 480, () => [100, 100, 100, 255]);
  const { imageData, scale } = downscaleImageData(src, 320);
  assert.ok(imageData.width <= 320);
  assert.ok(scale <= 1);
});

test("low score does not invent confidence", () => {
  const q = calculatePhotoQuality(makeImageData(40, 60, () => [5, 5, 5, 255]));
  assert.equal("confidence" in q, false);
  assert.ok(q.score < 50);
});

test("sizing helpers still work", () => {
  assert.equal(pixelsPerMillimeter(230, 23), 10);
  assert.equal(widthPxToMm(115, 10), 11.5);
});

test("guide regions are vertical coin-above-finger", () => {
  const g = getGuideRegions(720, 1280);
  assert.ok(g.coinGuideRegion.cy < g.fingerGuideRegion.top);
  assert.ok(Math.abs(g.coinGuideRegion.cx - g.fingerGuideRegion.cx) < 1);
});
