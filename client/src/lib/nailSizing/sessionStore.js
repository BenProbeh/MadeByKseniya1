/**
 * The in-progress measurement, kept in sessionStorage so a reload or a trip to Settings doesn't lose it.
 * Only numbers are stored — never photos — and storage failures (private mode, full quota) are ignored.
 */
import { ALL_FINGERS, SESSION_STORAGE_KEY } from "./constants.js";
import { REFERENCE_COIN } from "./measure.js";

const STEPS = new Set(["intro", "fingers", "capture", "summary"]);
const KEYS = new Set(ALL_FINGERS.map((f) => f.key));

export function createSession() {
  return {
    v: 2,
    step: "intro",
    selected: ALL_FINGERS.map((f) => f.key),
    index: 0,
    results: {},
    coinId: REFERENCE_COIN.id,
    current: null, // finger being measured
    returnTo: null, // "summary" when re-measuring one finger from the summary
    savedAt: null,
  };
}

function cleanResult(r) {
  if (!r || typeof r !== "object") return null;
  const width = Number(r.widthMm);
  if (!Number.isFinite(width) || width <= 0) return null;
  return {
    widthMm: width,
    size: Number.isInteger(r.size) ? r.size : null,
    plausible: r.plausible !== false,
    photoQualityScore: Number.isFinite(r.photoQualityScore) ? r.photoQualityScore : null,
    measuredAt: typeof r.measuredAt === "string" ? r.measuredAt : null,
  };
}

/** Accepts anything (old versions, hand-edited storage) and returns a valid session. */
export function normalizeSession(raw) {
  const base = createSession();
  if (!raw || typeof raw !== "object" || raw.v !== 2) return base;
  const selected = Array.isArray(raw.selected) ? raw.selected.filter((k) => KEYS.has(k)) : base.selected;
  const results = {};
  for (const [key, value] of Object.entries(raw.results || {})) {
    const clean = KEYS.has(key) ? cleanResult(value) : null;
    if (clean) results[key] = clean;
  }
  const step = STEPS.has(raw.step) ? raw.step : "intro";
  return {
    ...base,
    step: step === "capture" && (!selected.length || !KEYS.has(raw.current)) ? "fingers" : step,
    selected,
    index: Number.isInteger(raw.index) ? Math.min(Math.max(raw.index, 0), Math.max(selected.length - 1, 0)) : 0,
    results,
    current: KEYS.has(raw.current) ? raw.current : null,
    returnTo: raw.returnTo === "summary" ? "summary" : null,
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : null,
  };
}

export function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? normalizeSession(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable: the flow still works for this visit */
  }
  return session;
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Fingers still to measure, in the order she chose. */
export function remainingKeys(session) {
  return session.selected.filter((k) => !session.results[k]);
}

/** API payload: only measured fingers, numbers only. */
export function toPayload(session) {
  const measurements = {};
  for (const finger of ALL_FINGERS) {
    const r = session.results[finger.key];
    if (!r) continue;
    measurements[finger.key] = {
      handId: finger.handId,
      fingerId: finger.fingerId,
      widthMm: r.widthMm,
      size: r.size,
      photoQualityScore: r.photoQualityScore,
      coinId: session.coinId,
      manualOverride: true,
      status: "confirmed",
    };
  }
  return { coinId: session.coinId, measurements };
}
