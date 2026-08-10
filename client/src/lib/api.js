import axios from "axios";

// In dev, Vite proxies "/api" to the local server (see vite.config.js).
// In production there is no such proxy, so the deployed backend's URL must
// be supplied via VITE_API_URL (e.g. https://your-backend.up.railway.app/api).
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });

export const getServices = () => api.get("/services").then((r) => r.data);

export const getAvailability = (date, serviceId) =>
  api.get("/appointments/availability", { params: { date, serviceId } }).then((r) => r.data);

export const createAppointment = (payload) =>
  api.post("/appointments", payload).then((r) => r.data);

export const findAppointmentsByPhone = (phone) =>
  api.get("/appointments", { params: { phone } }).then((r) => r.data);

export const updateAppointment = (id, payload) =>
  api.patch(`/appointments/${id}`, payload).then((r) => r.data);

export const sendChatMessage = (messages) =>
  api.post("/chat", { messages }).then((r) => r.data);

export default api;
