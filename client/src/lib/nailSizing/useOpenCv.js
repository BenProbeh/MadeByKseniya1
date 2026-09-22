/**
 * Safe OpenCV.js loader — singleton wait for window.cv (script in index.html).
 * Does not inject scripts. Clears poll interval as soon as ready.
 */

import { useEffect, useState } from "react";

const INITIAL = {
  cv: null,
  loading: true,
  ready: false,
  error: null,
};

/** Module-level cache so StrictMode remounts don't re-fight initialization. */
let cachedCv = null;
let cachedError = null;
let resolving = null;

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
          /* ignore */
        }
        if (isCvRuntimeReady(cv)) finish(cv);
        else finish(null, new Error("OpenCV runtime missing Mat/HoughCircles"));
      };
    } catch (error) {
      finish(null, error);
    }

    window.setTimeout(() => {
      if (isCvRuntimeReady(cv)) finish(cv);
    }, 0);
  });
}

async function resolveCvFromWindow() {
  if (cachedCv) return cachedCv;
  if (cachedError) throw cachedError;
  if (typeof window === "undefined" || window.cv == null) return null;

  let loadedCv = window.cv instanceof Promise ? await window.cv : window.cv;
  if (!loadedCv) return null;

  if (!isCvRuntimeReady(loadedCv)) {
    loadedCv = await waitRuntimeInitialized(loadedCv);
  }

  if (!isCvRuntimeReady(loadedCv)) return null;
  cachedCv = loadedCv;
  return loadedCv;
}

function resolveOnce() {
  if (cachedCv) return Promise.resolve(cachedCv);
  if (cachedError) return Promise.reject(cachedError);
  if (resolving) return resolving;
  resolving = (async () => {
    try {
      const cv = await resolveCvFromWindow();
      resolving = null;
      return cv;
    } catch (e) {
      cachedError = e instanceof Error ? e : new Error(String(e));
      resolving = null;
      throw cachedError;
    }
  })();
  return resolving;
}

export function useOpenCv() {
  const [state, setState] = useState(() => {
    if (cachedCv) {
      return { cv: cachedCv, loading: false, ready: true, error: null };
    }
    if (cachedError) {
      return { cv: null, loading: false, ready: false, error: cachedError };
    }
    return INITIAL;
  });

  useEffect(() => {
    if (cachedCv) {
      setState({ cv: cachedCv, loading: false, ready: true, error: null });
      return undefined;
    }

    let cancelled = false;
    let intervalId = 0;
    let timeoutId = 0;

    async function tick() {
      try {
        const loadedCv = await resolveOnce();
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

    void tick();
    intervalId = window.setInterval(() => {
      void tick();
    }, 150);

    timeoutId = window.setTimeout(() => {
      if (cancelled || cachedCv) return;
      const err = new Error("OpenCV load timeout");
      cachedError = err;
      setState({
        cv: null,
        loading: false,
        ready: false,
        error: err,
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

export async function waitForOpenCv({ timeoutMs = 15000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const cv = await resolveOnce();
      if (cv) return cv;
    } catch {
      /* keep waiting until timeout */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw cachedError || new Error("OpenCV not available");
}
