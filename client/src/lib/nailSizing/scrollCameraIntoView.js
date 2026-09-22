/**
 * Center (or safely top-align) the camera measurement section in the viewport.
 * Pure DOM helper — no React, easy to unit-test.
 */

const SAFE_TOP_OFFSET = 16;
const HEADER_CLEARANCE = 88; // fixed navbar + safe area cushion

export function computeCameraScrollTop({
  absoluteTop,
  elementHeight,
  viewportHeight,
  headerClearance = HEADER_CLEARANCE,
}) {
  if (elementHeight >= viewportHeight - 32) {
    return Math.max(0, absoluteTop - SAFE_TOP_OFFSET - headerClearance * 0.35);
  }

  // Prefer visual center, but keep the section clear of the fixed header.
  const offset = Math.max(
    SAFE_TOP_OFFSET,
    (viewportHeight - elementHeight) / 2,
    headerClearance
  );
  return Math.max(0, absoluteTop - offset);
}

export function prefersReducedMotion(matchMediaFn) {
  const mm =
    matchMediaFn ||
    (typeof window !== "undefined" ? window.matchMedia?.bind(window) : globalThis.matchMedia);
  try {
    return !!mm?.("(prefers-reduced-motion: reduce)")?.matches;
  } catch {
    return false;
  }
}

/**
 * @param {HTMLElement | null} element
 * @param {{ immediate?: boolean }} [opts]
 */
export function scrollCameraIntoView(element, { immediate = false } = {}) {
  if (!element || typeof window === "undefined") return false;

  const rect = element.getBoundingClientRect();
  const absoluteTop = window.scrollY + rect.top;
  const viewportHeight = window.innerHeight;
  const targetTop = computeCameraScrollTop({
    absoluteTop,
    elementHeight: rect.height,
    viewportHeight,
  });

  const reduceMotion = prefersReducedMotion();
  window.scrollTo({
    top: targetTop,
    left: 0,
    behavior: immediate || reduceMotion ? "auto" : "smooth",
  });
  return true;
}

/** Double-rAF helper so layout settles before scroll. Returns cancel fn. */
export function scheduleAfterPaint(fn) {
  let secondId = 0;
  const firstId = window.requestAnimationFrame(() => {
    secondId = window.requestAnimationFrame(() => {
      fn();
    });
  });
  return () => {
    window.cancelAnimationFrame(firstId);
    if (secondId) window.cancelAnimationFrame(secondId);
  };
}
