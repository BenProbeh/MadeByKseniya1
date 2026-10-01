import api, { resolveMediaUrl } from "./api.js";
import { assertUser } from "./authErrors.js";
import { normalizeHex } from "./theme/color.js";
import { PALETTE_VERSION } from "./theme/palette.js";

function mapUser(raw) {
  if (!raw || raw.id == null) return null;
  return {
    id: raw.id,
    username: raw.username || "",
    firstName: raw.firstName || "",
    lastName: raw.lastName || "",
    avatarUrl: resolveMediaUrl(raw.avatarUrl),
    role: raw.role === "owner" || raw.role === "admin" ? raw.role : "customer",
    phone: raw.phone || "",
    phoneVerified: Boolean(raw.phoneVerified),
    themeColor: normalizeHex(raw.themeColor),
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
    phone: payload.phone,
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

/** "Forgot password" by SMS. The reset token lives only in page memory — never in the URL or storage. */
export async function requestPasswordResetCode(phone) {
  const { data } = await api.post("/auth/password-reset/request", { phone });
  return data;
}

export async function verifyPasswordResetCode(phone, code) {
  const { data } = await api.post("/auth/password-reset/verify", { phone, code });
  return data;
}

export async function completePasswordResetRequest({ resetToken, newPassword, confirmPassword }) {
  const { data } = await api.post("/auth/password-reset/complete", { resetToken, newPassword, confirmPassword });
  return data;
}

export async function updatePhoneRequest(phone) {
  const { data } = await api.patch("/profile/phone", { phone });
  return mapUser(data.user);
}

/** `color` is "#rrggbb" or null (site default). */
export async function updateThemeRequest(color) {
  const body = color ? { color, paletteVersion: PALETTE_VERSION } : { color: null };
  const { data } = await api.patch("/profile/theme", body);
  return mapUser(data.user);
}

export async function fetchAdminCustomers({
  search = "",
  role = "",
  tier = "",
  sort = "score",
  status = "active",
  page = 1,
  pageSize = 20,
} = {}) {
  const params = { sort, page, pageSize };
  if (search) params.search = search;
  if (role) params.role = role;
  if (tier) params.tier = tier;
  if (status !== "active") params.status = status;
  const { data } = await api.get("/admin/customers", { params });
  return { ...data, customers: (data.customers || []).map(mapAdminCustomer) };
}

export async function removeCustomer(id) {
  const { data } = await api.delete(`/admin/customers/${encodeURIComponent(id)}`);
  return { ...data, customer: mapAdminCustomer(data.customer) };
}

export async function restoreCustomer(id) {
  const { data } = await api.post(`/owner/users/${encodeURIComponent(id)}/restore`);
  return { ...data, customer: mapAdminCustomer(data.customer) };
}

export async function fetchNotifications({ status = "" } = {}) {
  const { data } = await api.get("/admin/notifications", { params: status ? { status } : {} });
  return { notifications: data.notifications || [], unread: Number(data.unread) || 0 };
}

export async function fetchUnreadNotificationCount() {
  const { data } = await api.get("/admin/notifications/unread-count");
  return Number(data.unread) || 0;
}

export async function markNotificationRead(id) {
  const { data } = await api.patch(`/admin/notifications/${encodeURIComponent(id)}/read`);
  return { notification: data.notification, unread: Number(data.unread) || 0 };
}

export async function fetchContentPages() {
  const { data } = await api.get("/admin/content/pages");
  return data.pages || [];
}

export async function fetchContentPage(id) {
  const { data } = await api.get(`/admin/content/pages/${encodeURIComponent(id)}`);
  return data.page;
}

export async function createContentPage(page) {
  const { data } = await api.post("/admin/content/pages", page);
  return data.page;
}

export async function updateContentPage(id, page) {
  const { data } = await api.patch(`/admin/content/pages/${encodeURIComponent(id)}`, page);
  return data.page;
}

export async function setContentPagePublished(id, published) {
  const action = published ? "publish" : "unpublish";
  const { data } = await api.post(`/admin/content/pages/${encodeURIComponent(id)}/${action}`);
  return data.page;
}

export async function duplicateContentPage(id) {
  const { data } = await api.post(`/admin/content/pages/${encodeURIComponent(id)}/duplicate`);
  return data.page;
}

export async function deleteContentPage(id) {
  await api.delete(`/admin/content/pages/${encodeURIComponent(id)}`);
}

export async function fetchPublishedPage(slug) {
  const { data } = await api.get(`/content/pages/${encodeURIComponent(slug)}`);
  return data.page;
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
