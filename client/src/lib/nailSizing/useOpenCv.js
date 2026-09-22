/**
 * Safe OpenCV.js loader — waits for window.cv (script in index.html).
 * Supports builds that expose cv as a Promise or require onRuntimeInitialized.
 */

import { useEffect, useState } from "react";

const INITIAL = {
  cv: null,
  loading: true,
  ready: false,
  error: null,
};

function isCvRuntimeReady(cv) {
  return !!(cv && typeof cv.Mat === "function" && typeof cv.HoughCircles === "function");
}

function waitRuntimeInitialized(cv) {
  return new Promise((resolve, reject) => {
    if (isCvRuntimeReady(cv)) {
      resolve(cv);
      return;
    }

    const prev = cv.onRuntimeInitialized;
    let settled = false;
    const finish = (value, err) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(value);
    };

    try {
      cv.onRuntimeInitialized = () => {
        try {
          if (typeof prev === "function") prev();
        } catch {
          /* ignore prior hook errors */
        }
        if (isCvRuntimeReady(cv)) finish(cv);
        else finish(null, new Error("OpenCV runtime missing Mat/HoughCircles"));
      };
    } catch (error) {
      finish(null, error);
    }

    // Some builds become ready without firing the hook shortly after assign
    window.setTimeout(() => {
      if (isCvRuntimeReady(cv)) finish(cv);
    }, 0);
  });
}

async function resolveCvFromWindow() {
  if (typeof window === "undefined" || window.cv == null) return null;

  let loadedCv = window.cv instanceof Promise ? await window.cv : window.cv;
  if (!loadedCv) return null;

  if (!isCvRuntimeReady(loadedCv)) {
    loadedCv = await waitRuntimeInitialized(loadedCv);
  }

  return isCvRuntimeReady(loadedCv) ? loadedCv : null;
}

export function useOpenCv() {
  const [state, setState] = useState(INITIAL);

  useEffect(() => {
    let cancelled = false;
    let intervalId = 0;
    let timeoutId = 0;

    async function resolveOpenCv() {
      try {
        const loadedCv = await resolveCvFromWindow();
        if (cancelled) return;
        if (!loadedCv) return;

        setState({
          cv: loadedCv,
          loading: false,
          ready: true,
          error: null,
        });
        window.clearInterval(intervalId);
        window.clearTimeout(timeoutId);
      } catch (error) {
        if (cancelled) return;
        setState({
          cv: null,
          loading: false,
          ready: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
        window.clearInterval(intervalId);
        window.clearTimeout(timeoutId);
      }
    }

    void resolveOpenCv();
    intervalId = window.setInterval(() => {
      void resolveOpenCv();
    }, 120);

    timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setState((prev) => {
        if (prev.ready) return prev;
        return {
          cv: null,
          loading: false,
          ready: false,
          error: new Error("OpenCV load timeout"),
        };
      });
      window.clearInterval(intervalId);
    }, 25000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, []);

  return state;
}

/** Imperative one-shot resolver (tests / non-React). */
export async function waitForOpenCv({ timeoutMs = 15000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const cv = await resolveCvFromWindow();
      if (cv) return cv;
    } catch {
      /* keep waiting */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("OpenCV not available");
}
