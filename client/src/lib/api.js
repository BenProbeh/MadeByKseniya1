import axios from "axios";
import { MOCK_SERVICES } from "./mockData.js";

// Default "/api" is same-origin: Vite proxies it in dev, and on Vercel the
// api/proxy.js function forwards it to the backend (first-party cookies,
// which iPhone Safari requires). VITE_API_URL is an optional override; it may be
// given with or without the trailing "/api".
export function normalizeApiBase(raw, { production = false } = {}) {
  const value = String(raw || "").trim().replace(/\/+$/, "");
  if (!value) return "/api";
  if (production && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value)) return "/api";
  return /\/api$/i.test(value) ? value : `${value}/api`;
}

const apiBase = normalizeApiBase(import.meta.env.VITE_API_URL, { production: import.meta.env.PROD });
const apiOrigin = /^https?:\/\//i.test(apiBase) ? apiBase.replace(/\/api$/i, "") : "";

const api = axios.create({
  baseURL: apiBase,
  withCredentials: true,
  timeout: 20000,
});

/** Full URL of an API path, for links the browser opens itself (e.g. a sign-in redirect). */
export function apiUrl(path) {
  return `${apiBase}/${String(path).replace(/^\/+/, "")}`;
}

/** Resolve server media paths (/api/uploads/...) against the API origin. */
export function resolveMediaUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/api/uploads/")) {
    return `${apiOrigin}${url}`;
  }
  return url;
}


// Read endpoints: any failure (no backend deployed, a dead dev proxy, a
// transient error) falls back to realistic mock data so the UI stays
// fully browsable without a backend attached.
export const getServices = () => api.get("/services").then((r) => r.data).catch(() => MOCK_SERVICES);

// Booking is shared state owned by the server: no mock fallbacks, so nobody
// ever sees a slot as free (or a request as sent) that the server didn't confirm.
export const getAvailability = (date, serviceId) =>
  api
    .get("/appointments/availability", { params: { date, serviceId } })
    .then((r) => r.data);

/** Resolves to `{ appointment, duplicate }`; the appointment is always a pending request. */
export const createAppointmentRequest = (payload) => api.post("/appointments", payload).then((r) => r.data);

export const fetchMyAppointments = () => api.get("/appointments/mine").then((r) => r.data?.appointments || []);

export const sendChatMessage = (messages) =>
  api.post("/chat", { messages }).then((r) => r.data);

/** Saves measured fingers to the signed-in account. Never pretends: any failure reaches the caller. */
export const saveMeasurementProfile = (payload) => api.post("/measurements/profile", payload).then((r) => r.data);

export default api;
