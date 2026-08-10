import axios from "axios";
import { MOCK_SERVICES, mockAvailability, mockCreateAppointment, mockUpdateAppointment } from "./mockData.js";

// In dev, Vite proxies "/api" to the local server (see vite.config.js).
// In production there is no such proxy, so the deployed backend's URL must
// be supplied via VITE_API_URL (e.g. https://your-backend.up.railway.app/api).
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });

// Only for the write endpoints: fall back to a mock result solely when
// there's genuinely no backend to talk to (network failure, or a 404 because
// no API route exists at all) — never for a real backend error like 409
// "slot taken" or 400 validation, which callers must still see and handle.
const isNoBackend = (err) => !err.response || err.response.status === 404;

// Read endpoints: any failure (no backend deployed, a dead dev proxy, a
// transient error) falls back to realistic mock data so the UI stays
// fully browsable without a backend attached.
export const getServices = () => api.get("/services").then((r) => r.data).catch(() => MOCK_SERVICES);

export const getAvailability = (date, serviceId) =>
  api
    .get("/appointments/availability", { params: { date, serviceId } })
    .then((r) => r.data)
    .catch(() => mockAvailability(date));

export const createAppointment = (payload) =>
  api
    .post("/appointments", payload)
    .then((r) => r.data)
    .catch((err) => {
      if (isNoBackend(err)) return mockCreateAppointment(payload);
      throw err;
    });

export const findAppointmentsByPhone = (phone) =>
  api.get("/appointments", { params: { phone } }).then((r) => r.data).catch(() => []);

export const updateAppointment = (id, payload) =>
  api
    .patch(`/appointments/${id}`, payload)
    .then((r) => r.data)
    .catch((err) => {
      if (isNoBackend(err)) return mockUpdateAppointment(id, payload);
      throw err;
    });

export const sendChatMessage = (messages) =>
  api.post("/chat", { messages }).then((r) => r.data);

export default api;
