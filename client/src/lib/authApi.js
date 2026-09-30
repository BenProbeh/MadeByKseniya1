import api, { resolveMediaUrl } from "./api.js";
import { assertUser } from "./authErrors.js";

function mapUser(raw) {
  if (!raw || raw.id == null) return null;
  return {
    id: raw.id,
    username: raw.username || "",
    firstName: raw.firstName || "",
    lastName: raw.lastName || "",
    avatarUrl: resolveMediaUrl(raw.avatarUrl),
    role: raw.role === "owner" || raw.role === "admin" ? raw.role : "customer",
    createdAt: raw.createdAt,
    lastLoginAt: raw.lastLoginAt,
  };
}

function mapAdminCustomer(raw) {
  if (!raw || raw.id == null) return null;
  return { ...raw, avatarUrl: resolveMediaUrl(raw.avatarUrl) };
}

export async function fetchCurrentUser() {
  try {
    const { data } = await api.get("/auth/me");
    return mapUser(data?.user);
  } catch (err) {
    if (err?.response?.status === 401) return null;
    throw err;
  }
}

export async function loginRequest({ username, password, rememberMe }) {
  const { data } = await api.post("/auth/login", { username, password, rememberMe: Boolean(rememberMe) });
  return assertUser(mapUser(data?.user));
}

export async function registerRequest(payload) {
  const { data } = await api.post("/auth/register", {
    username: payload.username,
    password: payload.password,
    confirmPassword: payload.confirmPassword,
    firstName: payload.firstName,
    lastName: payload.lastName,
    rememberMe: Boolean(payload.rememberMe),
  });
  return assertUser(mapUser(data?.user));
}

export async function logoutRequest() {
  await api.post("/auth/logout");
}

export async function fetchProfile() {
  const { data } = await api.get("/profile");
  return mapUser(data.user);
}

export async function fetchProfileMeasurements() {
  const { data } = await api.get("/profile/measurements");
  return data.measurement;
}

export async function fetchProfileOrders() {
  const { data } = await api.get("/profile/orders");
  return data.orders || [];
}

export async function fetchProfileShipments() {
  const { data } = await api.get("/profile/shipments");
  return data.shipments || [];
}

export async function uploadAvatarFile(file) {
  const form = new FormData();
  form.append("avatar", file);
  const { data } = await api.post("/profile/avatar", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return mapUser(data.user);
}

export async function uploadAvatarDataUrl(imageDataUrl) {
  const { data } = await api.post("/profile/avatar", { imageDataUrl });
  return mapUser(data.user);
}

export async function deleteAvatar() {
  const { data } = await api.delete("/profile/avatar");
  return mapUser(data.user);
}

export async function changePasswordRequest({ currentPassword, newPassword, confirmPassword }) {
  const { data } = await api.post("/auth/change-password", { currentPassword, newPassword, confirmPassword });
  return data;
}

export async function fetchAdminCustomers({ search = "", role = "", sort = "newest", page = 1, pageSize = 20 } = {}) {
  const params = { sort, page, pageSize };
  if (search) params.search = search;
  if (role) params.role = role;
  const { data } = await api.get("/admin/customers", { params });
  return { ...data, customers: (data.customers || []).map(mapAdminCustomer) };
}

export async function fetchAdminCustomer(id) {
  const { data } = await api.get(`/admin/customers/${encodeURIComponent(id)}`);
  return { ...data, customer: mapAdminCustomer(data.customer) };
}

export async function fetchCustomerStats() {
  const { data } = await api.get("/admin/customer-stats");
  return data.stats;
}

export async function updateUserRole(id, role) {
  const { data } = await api.patch(`/owner/users/${encodeURIComponent(id)}/role`, { role });
  return { ...data, customer: mapAdminCustomer(data.customer) };
}
