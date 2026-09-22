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
import {
  computeCameraScrollTop,
  prefersReducedMotion,
  scrollCameraIntoView,
} from "../../client/src/lib/nailSizing/scrollCameraIntoView.js";

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
  const html = readFileSync(join(root, "client/index.html"), "utf8");
  assert.equal(html.includes("opencv.js"), false);
  const measure = readFileSync(join(root, "client/src/components/nail-sizing/MeasureStep.jsx"), "utf8");
  assert.equal(/useOpenCv|HoughCircles|window\.cv|cv\.Mat|opencv/i.test(measure), false);
  assert.equal(/processingLoop|analyzeVideoWithOpenCv/.test(measure), false);
});

test("measure step does not scroll page to top from NailSizing", () => {
  const page = readFileSync(join(root, "client/src/pages/NailSizing.jsx"), "utf8");
  assert.ok(page.includes('session.step === "measure"'));
  assert.ok(page.includes("window.scrollTo"));
});

test("MeasureStep centers camera section and retake", () => {
  const measure = readFileSync(join(root, "client/src/components/nail-sizing/MeasureStep.jsx"), "utf8");
  assert.ok(measure.includes("cameraSectionRef"));
  assert.ok(measure.includes("camera-measurement-section"));
  assert.ok(measure.includes("scrollCameraIntoView"));
  assert.ok(measure.includes("scheduleCenter"));
  assert.ok(/function retake[\s\S]*scheduleCenter/.test(measure));
  assert.ok(measure.includes("cameraCenteredRef"));
});

test("computeCameraScrollTop centers short sections", () => {
  const top = computeCameraScrollTop({
    absoluteTop: 800,
    elementHeight: 400,
    viewportHeight: 800,
    headerClearance: 88,
  });
  assert.ok(top <= 800 - 88);
  assert.ok(top >= 0);
});

test("computeCameraScrollTop top-aligns tall sections", () => {
  const top = computeCameraScrollTop({
    absoluteTop: 500,
    elementHeight: 900,
    viewportHeight: 700,
    headerClearance: 88,
  });
  assert.ok(top < 500);
  assert.ok(top >= 0);
});

test("prefersReducedMotion reads matchMedia", () => {
  assert.equal(prefersReducedMotion(() => ({ matches: true })), true);
  assert.equal(prefersReducedMotion(() => ({ matches: false })), false);
});

test("scrollCameraIntoView uses auto when reduced motion", () => {
  const calls = [];
  const previous = globalThis.window;
  globalThis.window = {
    scrollY: 0,
    innerHeight: 800,
    matchMedia: () => ({ matches: true }),
    scrollTo: (opts) => calls.push(opts),
  };
  const el = {
    getBoundingClientRect: () => ({ top: 400, height: 360, width: 300, left: 0 }),
  };
  try {
    assert.equal(scrollCameraIntoView(el), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].behavior, "auto");
    assert.equal(calls[0].left, 0);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test("scrollCameraIntoView no-ops without element", () => {
  assert.equal(scrollCameraIntoView(null), false);
});

test("photo quality score is clamped 0–100", () => {
  const dark = calculatePhotoQuality(makeImageData(80, 120, () => [8, 8, 8, 255]));
  assert.ok(dark.score >= 0 && dark.score <= 100);
});

test("dark image lowers brightness check", () => {
  const dark = calculatePhotoQuality(makeImageData(100, 140, () => [12, 12, 12, 255]));
  const mid = calculatePhotoQuality(makeImageData(100, 140, () => [130, 130, 130, 255]));
  assert.ok(dark.checks.brightness < mid.checks.brightness);
});

test("quality level labels", () => {
  assert.equal(getQualityLevel(90).id, "excellent");
  assert.equal(getQualityLevel(20).id, "poor");
});

test("downscale never enlarges", () => {
  const src = makeImageData(640, 480, () => [100, 100, 100, 255]);
  const { imageData, scale } = downscaleImageData(src, 320);
  assert.ok(imageData.width <= 320);
  assert.ok(scale <= 1);
});

test("sizing helpers still work", () => {
  assert.equal(pixelsPerMillimeter(230, 23), 10);
  assert.equal(widthPxToMm(115, 10), 11.5);
});

test("guide regions are vertical coin-above-finger", () => {
  const g = getGuideRegions(720, 1280);
  assert.ok(g.coinGuideRegion.cy < g.fingerGuideRegion.top);
});
