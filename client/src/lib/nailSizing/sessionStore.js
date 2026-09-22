import { SESSION_STORAGE_KEY, PROFILE_STORAGE_KEY, ALL_FINGERS } from "./constants.js";

export function createEmptyMeasurements() {
  return Object.fromEntries(
    ALL_FINGERS.map((f) => [
      f.key,
      {
        key: f.key,
        handId: f.handId,
        fingerId: f.fingerId,
        handLabelHe: f.handLabelHe,
        fingerLabelHe: f.fingerLabelHe,
        widthMm: null,
        size: null,
        confidence: null,
        coinId: null,
        captureQuality: null,
        previewDataUrl: null,
        manualOverride: false,
        status: "pending", // pending | captured | needs_retake | confirmed
        updatedAt: null,
      },
    ])
  );
}

export function createSession({ phone = "", coinId = null } = {}) {
  return {
    id: crypto.randomUUID?.() ?? `local-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phone: phone.trim(),
    coinId,
    step: "prep",
    fingerIndex: 0,
    selectedFingerKeys: [],
    measurements: createEmptyMeasurements(),
    consentCamera: false,
    consentStoreImages: false,
  };
}

export function normalizeSession(session) {
  if (!session || typeof session !== "object") return createSession();
  return {
    ...createSession(),
    ...session,
    selectedFingerKeys: Array.isArray(session.selectedFingerKeys) ? session.selectedFingerKeys : [],
    measurements: { ...createEmptyMeasurements(), ...(session.measurements || {}) },
  };
}

export function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return normalizeSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveSession(session) {
  const next = { ...session, updatedAt: new Date().toISOString() };
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

export function loadProfiles() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveProfile(phone, profile) {
  const key = String(phone || "").replace(/\D/g, "");
  if (!key) return;
  const all = loadProfiles();
  all[key] = {
    ...profile,
    phone: key,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(all));
  return all[key];
}

export function getProfile(phone) {
  const key = String(phone || "").replace(/\D/g, "");
  const all = loadProfiles();
  return all[key] ?? null;
}
