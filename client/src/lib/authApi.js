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
    email: raw.email || "",
    emailVerified: Boolean(raw.emailVerified),
    accountStatus: raw.accountStatus || "active",
    notifyBookingEmails: Boolean(raw.notifyBookingEmails),
    phone: raw.phone || "",
    themeColor: normalizeHex(raw.themeColor),
    createdAt: raw.createdAt,
    lastLoginAt: raw.lastLoginAt,
  };
}

function mapAdminCustomer(raw) {
  if (!raw || raw.id == null) return null;
  return { ...raw, avatarUrl: resolveMediaUrl(raw.avatarUrl) };
}

/** `{ user, emailDeliveryReady }`; user is null when signed out. */
export async function fetchCurrentUser() {
  try {
    const { data } = await api.get("/auth/me");
    return { user: mapUser(data?.user), emailDeliveryReady: data?.emailDeliveryReady !== false };
  } catch (err) {
    if (err?.response?.status === 401) return { user: null, emailDeliveryReady: true };
    throw err;
  }
}

/** `email` may also be a username for accounts that haven't verified an address yet. */
export async function loginRequest({ email, password, rememberMe }) {
  const { data } = await api.post("/auth/login", { email, password, rememberMe: Boolean(rememberMe) });
  return assertUser(mapUser(data?.user));
}

/** Creates the account as pending; resolves `{ email, expiresInSeconds, resendAfterSeconds }` — no session yet. */
export async function registerRequest(payload) {
  const { data } = await api.post("/auth/register", {
    username: payload.username,
    email: payload.email,
    password: payload.password,
    confirmPassword: payload.confirmPassword,
    firstName: payload.firstName,
    lastName: payload.lastName,
  });
  return {
    email: data?.email || payload.email,
    expiresInSeconds: Number(data?.expiresInSeconds) || 600,
    resendAfterSeconds: Number(data?.resendAfterSeconds) || 60,
  };
}

/** Completes sign-up: the account becomes active and a session is created. */
export async function verifyEmailRequest({ email, code, rememberMe }) {
  const { data } = await api.post("/auth/verify-email", { email, code, rememberMe: Boolean(rememberMe) });
  return assertUser(mapUser(data?.user));
}

export async function resendVerificationRequest(email) {
  const { data } = await api.post("/auth/verify-email/resend", { email });
  return { resendAfterSeconds: Number(data?.resendAfterSeconds) || 60 };
}

/** Signed-in: send a code to a new address (accounts from before email sign-in, or a change of address). */
export async function startEmailChangeRequest(email) {
  const { data } = await api.post("/profile/email", { email });
  return { email: data?.email || email, resendAfterSeconds: Number(data?.resendAfterSeconds) || 60 };
}

export async function confirmEmailChangeRequest({ email, code }) {
  const { data } = await api.post("/profile/email/verify", { email, code });
  return mapUser(data?.user);
}

export async function updateBookingEmailsRequest(notifyBookingEmails) {
  const { data } = await api.patch("/profile/notifications", { notifyBookingEmails: Boolean(notifyBookingEmails) });
  return mapUser(data?.user);
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

/** "Forgot password" by email. The reset token lives only in page memory — never in the URL or storage. */
export async function requestPasswordResetCode(email) {
  const { data } = await api.post("/auth/password-reset/request", { email });
  return data;
}

export async function verifyPasswordResetCode(email, code) {
  const { data } = await api.post("/auth/password-reset/verify", { email, code });
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

/** `status`: pending | manager_approved | confirmed | rejected | cancelled | "" (all); `scope`: upcoming | past | all. */
export async function fetchAdminAppointments({ status = "", scope = "upcoming" } = {}) {
  const params = { scope };
  if (status) params.status = status;
  const { data } = await api.get("/admin/appointments", { params });
  return {
    appointments: data.appointments || [],
    counts: {
      pending: Number(data.counts?.pending) || 0,
      approved: Number(data.counts?.approved) || 0,
      confirmed: Number(data.counts?.confirmed) || 0,
    },
  };
}

const APPOINTMENT_ACTIONS = { manager_approved: "approve", rejected: "reject", cancelled: "cancel" };

export async function setAppointmentStatus(id, status) {
  const action = APPOINTMENT_ACTIONS[status];
  if (!action) throw new Error("unknown appointment status");
  const { data } = await api.post(`/admin/appointments/${encodeURIComponent(id)}/${action}`);
  return data.appointment;
}

export async function resendAppointmentEmail(id) {
  const { data } = await api.post(`/admin/appointments/${encodeURIComponent(id)}/resend-email`);
  return data.appointment;
}

/** The "אישור ההזמנה" link from the approval email; works signed out. */
export async function confirmBookingByToken(id, token) {
  const { data } = await api.post("/appointments/confirm-booking", { id, token });
  return { alreadyConfirmed: Boolean(data?.alreadyConfirmed), appointment: data?.appointment || null };
}

export async function confirmMyAppointment(id) {
  const { data } = await api.post(`/appointments/${encodeURIComponent(id)}/confirm`);
  return { alreadyConfirmed: Boolean(data?.alreadyConfirmed), appointment: data?.appointment || null };
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
