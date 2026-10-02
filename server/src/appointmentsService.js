import crypto from "node:crypto";
import db, { transaction } from "./db.js";
import { resolvePackageKey } from "./packageCatalog.js";
import { displayPhone, toE164OrNull } from "./phone.js";
import { refreshScoresForAppointment } from "./customerScore.js";
import { markAppointmentNotificationsRead, notifyAppointmentRequest } from "./notifications.js";
import { recordAudit } from "./roles.js";
import { hashToken } from "./auth.js";
import { runEmailJob } from "./email/mailer.js";
import {
  customerEmailStatuses,
  queueAppointmentRequestedEmails,
  sendAppointmentApprovedEmail,
  sendAppointmentClosedEmail,
  sendAppointmentRequestedEmail,
} from "./appointmentEmails.js";

// JS getDay(): 0=Sunday ... 6=Saturday
const BUSINESS_HOURS = {
  0: { open: "09:00", close: "20:00" }, // Sunday
  1: { open: "09:00", close: "20:00" }, // Monday
  2: { open: "09:00", close: "20:00" }, // Tuesday
  3: { open: "09:00", close: "20:00" }, // Wednesday
  4: { open: "09:00", close: "20:00" }, // Thursday
  5: { open: "09:00", close: "20:00" }, // Friday
  6: { open: "09:00", close: "20:00" }, // Saturday
};

const SLOT_STEP_MIN = 30;
const STUDIO_TIME_ZONE = "Asia/Jerusalem";
const BOOKING_HORIZON_DAYS = 365;
/** Pending requests hold their slot for everyone, so one account can't hold more than a few at a time. */
export const MAX_PENDING_PER_USER = 3;

/**
 * pending -> manager_approved (owner/admin) -> confirmed (the customer, from the email link or her profile).
 * manager_approved and confirmed both hold the slot ("booked"); rejected and cancelled free it.
 */
export const APPOINTMENT_STATUSES = Object.freeze(["pending", "manager_approved", "confirmed", "rejected", "cancelled"]);

/** Customer-facing wording for each status. */
export const STATUS_LABELS_HE = Object.freeze({
  pending: "ממתין לאישור",
  manager_approved: "אושר — נשאר לאשר את ההזמנה",
  confirmed: "התור אושר",
  rejected: "הבקשה לא אושרה",
  cancelled: "התור בוטל",
});

/** Status changes staff may make; rejected and cancelled are final, and only the customer moves a booking to confirmed. */
const TRANSITIONS = Object.freeze({
  pending: ["manager_approved", "rejected", "cancelled"],
  manager_approved: ["cancelled"],
  confirmed: ["cancelled"],
  rejected: [],
  cancelled: [],
});

const BOOKED_STATUSES = ["manager_approved", "confirmed"];
/** How long the "אישור ההזמנה" link works when the booking has no start time recorded. */
const CONFIRM_LINK_FALLBACK_DAYS = 14;

export const VALIDATION_MESSAGES = Object.freeze({
  date: "התאריך שנבחר אינו תקין.",
  past: "אי אפשר לבחור תאריך או שעה שכבר עברו.",
  horizon: "אפשר לשלוח בקשה לתור עד שנה קדימה.",
  closed: "הסטודיו סגור בתאריך זה.",
  time: "השעה שנבחרה אינה תקינה.",
  service: "השירות שנבחר לא נמצא.",
  name: "נא להזין שם מלא.",
  phone: "מספר הטלפון לא נראה תקין (ספרות בלבד). אפשר גם להשאיר את השדה ריק.",
  notes: "ההערות ארוכות מדי.",
  requestKey: "מזהה הבקשה אינו תקין.",
});

function appointmentError(code, message) {
  const err = new Error(code);
  if (message) err.userMessage = message;
  return err;
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(minutes) {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/** A real calendar date written as YYYY-MM-DD. */
export function isValidDateStr(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Today's date and the minutes since midnight on the studio's clock, whatever the server time zone. */
export function israelNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: STUDIO_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function getBusinessHoursForDate(dateStr) {
  if (!isValidDateStr(dateStr)) return undefined;
  const day = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return BUSINESS_HOURS[day];
}

function slotGrid(hours) {
  const starts = [];
  // close time is the latest bookable start (e.g. 20:00), not appointment end
  for (let start = toMinutes(hours.open); start <= toMinutes(hours.close); start += SLOT_STEP_MIN) starts.push(start);
  return starts;
}

export async function getService(serviceId, executor = db) {
  const id = Number(serviceId);
  if (!Number.isInteger(id)) return undefined;
  const { rows } = await executor.query("SELECT * FROM services WHERE id = $1", [id]);
  return rows[0];
}

export async function listServices() {
  const { rows } = await db.query("SELECT * FROM services ORDER BY category, id");
  return rows;
}

/** Active bookings on a date as minute ranges on the studio clock. */
async function activeRangesForDate(dateStr, executor) {
  const { rows } = await executor.query(
    `SELECT a.time, a.status, COALESCE(a.duration_min, s.duration_min) AS duration_min
       FROM appointments a
       JOIN services s ON s.id = a.service_id
      WHERE a.date = $1 AND a.status IN ('pending', 'manager_approved', 'confirmed') AND a.time ~ '^[0-9]{2}:[0-9]{2}$'`,
    [dateStr]
  );
  return rows.map((row) => {
    const start = toMinutes(row.time);
    return { start, end: start + Number(row.duration_min), status: row.status };
  });
}

/**
 * Every bookable start time on a date with its public state: "free", "pending" (waiting for approval)
 * or "booked" (approved by the studio). The whole length of the chosen service has to fit, not only its first minute.
 * No names, phones, services or notes ever leave this function.
 */
export async function getAvailability(dateStr, serviceId, { now = new Date(), executor = db } = {}) {
  const hours = getBusinessHoursForDate(dateStr);
  if (!hours) return { open: false, slots: [], times: [] };

  const today = israelNow(now);
  if (dateStr < today.date || dateStr > addDays(today.date, BOOKING_HORIZON_DAYS)) {
    return { open: true, slots: [], times: [] };
  }

  const service = await getService(serviceId, executor);
  const duration = service ? service.duration_min : 60;
  const ranges = await activeRangesForDate(dateStr, executor);

  const times = [];
  for (const start of slotGrid(hours)) {
    if (dateStr === today.date && start <= today.minutes) continue;
    const end = start + duration;
    const overlapping = ranges.filter((r) => start < r.end && end > r.start);
    const state = overlapping.some((r) => BOOKED_STATUSES.includes(r.status))
      ? "booked"
      : overlapping.length
        ? "pending"
        : "free";
    times.push({ time: toHHMM(start), state });
  }

  return { open: true, slots: times.filter((t) => t.state === "free").map((t) => t.time), times };
}

function cleanText(value, max) {
  if (value == null) return "";
  return String(value).trim().slice(0, max + 1);
}

/** Validates the request body; returns normalised values or throws INVALID with a Hebrew message. */
function validateRequest(input, now) {
  const clientName = cleanText(input.clientName, 80);
  if (clientName.length < 2 || clientName.length > 80) throw appointmentError("INVALID", VALIDATION_MESSAGES.name);

  // Optional contact number; the booking's email always comes from the verified account.
  const phone = cleanText(input.phone, 32);
  const digits = phone.replace(/\D/g, "");
  if (phone && (phone.length > 32 || /[^\d\s\-+()]/.test(phone) || digits.length < 9 || digits.length > 12)) {
    throw appointmentError("INVALID", VALIDATION_MESSAGES.phone);
  }

  const notes = cleanText(input.notes, 1000);
  if (notes.length > 1000) throw appointmentError("INVALID", VALIDATION_MESSAGES.notes);

  const requestKey = input.requestKey == null || input.requestKey === "" ? null : String(input.requestKey);
  if (requestKey && !/^[A-Za-z0-9-]{8,64}$/.test(requestKey)) {
    throw appointmentError("INVALID", VALIDATION_MESSAGES.requestKey);
  }

  const { date, time } = input;
  if (!isValidDateStr(date)) throw appointmentError("INVALID", VALIDATION_MESSAGES.date);
  if (typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) throw appointmentError("INVALID", VALIDATION_MESSAGES.time);

  const today = israelNow(now);
  if (date < today.date || (date === today.date && toMinutes(time) <= today.minutes)) {
    throw appointmentError("INVALID", VALIDATION_MESSAGES.past);
  }
  if (date > addDays(today.date, BOOKING_HORIZON_DAYS)) throw appointmentError("INVALID", VALIDATION_MESSAGES.horizon);

  const hours = getBusinessHoursForDate(date);
  if (!hours) throw appointmentError("INVALID", VALIDATION_MESSAGES.closed);
  if (!slotGrid(hours).includes(toMinutes(time))) throw appointmentError("INVALID", VALIDATION_MESSAGES.time);

  return { clientName, phone: phone || null, notes: notes || null, requestKey, date, time };
}

const isConflict = (err) => err?.code === "23P01" || (err?.code === "23505" && /one_active_start/.test(err?.constraint || err?.message || ""));

/**
 * Create a booking request (always 'pending'). Inside one transaction: lock the day, re-check that the whole
 * time range is free, insert, and notify staff. The exclusion constraint is the final guard against races.
 * Returns { appointment, duplicate } — duplicate=true when the same form submission arrives twice.
 */
export async function createAppointmentRequest(input, { userId = null, now = new Date() } = {}) {
  const values = validateRequest(input, now);
  const service = await getService(input.serviceId);
  if (!service) throw appointmentError("INVALID", VALIDATION_MESSAGES.service);
  // Kind and price come from the server catalog, never from the request body.
  const pkg = typeof input.packageKey === "string" ? resolvePackageKey(input.packageKey) : null;
  const duration = Number(service.duration_min);

  let result;
  try {
    result = await transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(481516, hashtext($1))", [`appointments:${values.date}`]);

      if (userId && values.requestKey) {
        const existing = await tx.query(`SELECT * FROM appointments WHERE user_id = $1 AND request_key = $2`, [
          userId,
          values.requestKey,
        ]);
        if (existing.rows.length) return { row: existing.rows[0], duplicate: true };
      }

      let account = null;
      if (userId) {
        const user = await tx.query(`SELECT first_name, last_name, email, email_verified FROM users WHERE id = $1`, [userId]);
        account = user.rows[0] || null;
        if (!account?.email_verified || !account.email) throw appointmentError("EMAIL_NOT_VERIFIED");
        const pending = await tx.query(
          `SELECT count(*)::int AS n FROM appointments
            WHERE user_id = $1 AND status = 'pending' AND (starts_at IS NULL OR starts_at > now())`,
          [userId]
        );
        if (pending.rows[0].n >= MAX_PENDING_PER_USER) throw appointmentError("TOO_MANY_PENDING");
      }

      const start = toMinutes(values.time);
      const ranges = await activeRangesForDate(values.date, tx);
      if (ranges.some((r) => start < r.end && start + duration > r.start)) throw appointmentError("SLOT_TAKEN");

      const { rows } = await tx.query(
        `INSERT INTO appointments
           (client_name, phone, email, service_id, date, time, notes, user_id, phone_e164,
            package_key, package_label, service_kind, price_ils,
            status, duration_min, starts_at, ends_at, request_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
            'pending', $14,
            ($5 || ' ' || $6)::timestamp AT TIME ZONE 'Asia/Jerusalem',
            ($5 || ' ' || $6)::timestamp AT TIME ZONE 'Asia/Jerusalem' + make_interval(mins => $14),
            $15)
         RETURNING *`,
        [
          values.clientName,
          values.phone,
          account?.email ?? null,
          service.id,
          values.date,
          values.time,
          values.notes,
          userId || null,
          toE164OrNull(values.phone),
          pkg?.key ?? null,
          pkg?.label ?? null,
          pkg?.kind ?? null,
          pkg?.priceIls ?? null,
          duration,
          userId ? values.requestKey : null,
        ]
      );
      const row = rows[0];

      await notifyAppointmentRequest(tx, {
        appointmentId: row.id,
        userId: userId || null,
        clientName: row.client_name,
        firstName: account?.first_name || "",
        lastName: account?.last_name || "",
        email: row.email,
        phoneDisplay: row.phone ? displayPhone(row.phone) : null,
        phoneE164: row.phone_e164,
        date: row.date,
        time: row.time,
        serviceLabel: row.package_label || service.name_he,
        priceIls: row.price_ils ?? service.price_ils,
        notes: row.notes,
        requestedAt: row.created_at,
      });
      return { row, duplicate: false };
    });
  } catch (err) {
    if (isConflict(err)) throw appointmentError("SLOT_TAKEN");
    if (err?.code === "23505" && userId && values.requestKey && /request_key/.test(err?.constraint || err?.message || "")) {
      const existing = await db.query(`SELECT * FROM appointments WHERE user_id = $1 AND request_key = $2`, [
        userId,
        values.requestKey,
      ]);
      if (existing.rows.length) {
        return { appointment: await getAppointmentForCustomer(existing.rows[0].id), duplicate: true };
      }
    }
    throw err;
  }

  if (!result.duplicate) {
    await refreshScoresForAppointment(db, result.row);
    queueAppointmentRequestedEmails(result.row.id);
  }
  return { appointment: await getAppointmentForCustomer(result.row.id), duplicate: result.duplicate };
}

const APPOINTMENT_SELECT = `
  SELECT a.*, s.name_he AS service_name, s.price_ils AS service_price,
         COALESCE(a.duration_min, s.duration_min) AS effective_duration,
         u.first_name AS user_first_name, u.last_name AS user_last_name, u.username AS user_username,
         u.phone_e164 AS user_phone_e164, u.phone_display AS user_phone_display,
         u.email AS user_email, u.email_verified AS user_email_verified,
         cb.first_name AS changed_by_first_name, cb.last_name AS changed_by_last_name,
         ab.first_name AS approved_by_first_name, ab.last_name AS approved_by_last_name
    FROM appointments a
    JOIN services s ON s.id = a.service_id
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN users cb ON cb.id = a.status_changed_by
    LEFT JOIN users ab ON ab.id = a.approved_by`;

function serviceLabel(row) {
  return row.package_label || row.service_name;
}

function priceOf(row) {
  const value = row.price_ils ?? row.service_price;
  return value == null ? null : Number(value);
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const isFuture = (row, now = Date.now()) => !row.starts_at || new Date(row.starts_at).getTime() > now;

/** What a customer may see about her own booking. */
function mapForCustomer(row) {
  return {
    id: row.id,
    status: row.status,
    statusHe: STATUS_LABELS_HE[row.status] || row.status,
    date: row.date,
    time: row.time,
    durationMin: row.effective_duration == null ? null : Number(row.effective_duration),
    serviceLabel: serviceLabel(row),
    priceIls: priceOf(row),
    createdAt: toIso(row.created_at),
    approvedAt: toIso(row.approved_at),
    customerConfirmedAt: toIso(row.customer_confirmed_at),
    canConfirm: row.status === "manager_approved" && isFuture(row),
  };
}

/** Full details for the owner and admins. */
function mapForStaff(row, emailStatus = {}) {
  const nameFromAccount = `${row.user_first_name || ""} ${row.user_last_name || ""}`.trim();
  const status = row.status;
  const { canConfirm: _customerOnly, ...base } = mapForCustomer(row);
  return {
    ...base,
    startsAt: toIso(row.starts_at),
    endsAt: toIso(row.ends_at),
    clientName: row.client_name,
    firstName: row.user_first_name || "",
    lastName: row.user_last_name || "",
    displayName: nameFromAccount || row.client_name,
    username: row.user_username || null,
    userId: row.user_id || null,
    phone: row.phone ? displayPhone(row.phone) : null,
    phoneE164: row.phone_e164 || null,
    email: (row.user_email_verified && row.user_email) || row.email || null,
    notes: row.notes || "",
    approvedBy: row.approved_by
      ? { id: row.approved_by, name: `${row.approved_by_first_name || ""} ${row.approved_by_last_name || ""}`.trim() }
      : null,
    emailStatus,
    statusChangedAt: toIso(row.status_changed_at),
    statusChangedBy: row.status_changed_by
      ? {
          id: row.status_changed_by,
          name: `${row.changed_by_first_name || ""} ${row.changed_by_last_name || ""}`.trim(),
        }
      : null,
    allowedActions: (TRANSITIONS[status] || []).filter((next) => next !== "manager_approved" || isFuture(row)),
  };
}

async function getAppointmentForCustomer(id, executor = db) {
  const { rows } = await executor.query(`${APPOINTMENT_SELECT} WHERE a.id = $1`, [id]);
  return rows[0] ? mapForCustomer(rows[0]) : null;
}

/** The signed-in customer's own requests and bookings (linked by account only). */
export async function listAppointmentsForUser(userId, { limit = 50 } = {}) {
  const { rows } = await db.query(
    `${APPOINTMENT_SELECT}
      WHERE a.user_id = $1
      ORDER BY (a.starts_at IS NOT NULL AND a.starts_at >= now()) DESC,
               CASE WHEN a.starts_at >= now() THEN a.starts_at END ASC NULLS LAST,
               a.starts_at DESC NULLS LAST, a.id DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows.map(mapForCustomer);
}

export const STAFF_SCOPES = Object.freeze(["upcoming", "past", "all"]);

/** Staff list: optional status filter; "upcoming" also keeps today's earlier bookings visible. */
export async function listAppointmentsForStaff({ status = "", scope = "upcoming", limit = 200, now = new Date() } = {}) {
  const params = [];
  const where = [];
  if (status) {
    params.push(status);
    where.push(`a.status = $${params.length}`);
  }
  const today = israelNow(now).date;
  if (scope === "upcoming") {
    params.push(today);
    where.push(`a.date >= $${params.length}`);
  } else if (scope === "past") {
    params.push(today);
    where.push(`a.date < $${params.length}`);
  }
  params.push(limit);
  const order = scope === "past" ? "a.date DESC, a.time DESC, a.id DESC" : "a.date ASC, a.time ASC, a.id ASC";
  const { rows } = await db.query(
    `${APPOINTMENT_SELECT}
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ${order}
      LIMIT $${params.length}`,
    params
  );

  const counts = await db.query(
    `SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending,
            count(*) FILTER (WHERE status = 'manager_approved')::int AS approved,
            count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed
       FROM appointments WHERE date >= $1`,
    [today]
  );
  const emailStatuses = await customerEmailStatuses(rows.map((r) => r.id));
  return { appointments: rows.map((r) => mapForStaff(r, emailStatuses[r.id])), counts: counts.rows[0] };
}

async function getAppointmentForStaff(id) {
  const { rows } = await db.query(`${APPOINTMENT_SELECT} WHERE a.id = $1`, [id]);
  if (!rows[0]) return null;
  const emailStatuses = await customerEmailStatuses([rows[0].id]);
  return mapForStaff(rows[0], emailStatuses[rows[0].id]);
}

const AUDIT_ACTIONS = Object.freeze({
  manager_approved: "appointment_approved",
  rejected: "appointment_rejected",
  cancelled: "appointment_cancelled",
});

const newConfirmationToken = () => crypto.randomBytes(32).toString("base64url");
const CONFIRMATION_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function confirmationExpiry(appt) {
  if (appt.starts_at) return new Date(appt.starts_at);
  return new Date(Date.now() + CONFIRM_LINK_FALLBACK_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Owner/admin decision on a booking. The row is locked and the update only applies while the status is still
 * what was read, so two staff members clicking at once can't both act on the same request.
 */
export async function changeAppointmentStatus(id, nextStatus, actorUserId, { now = new Date() } = {}) {
  const apptId = Number(id);
  if (!Number.isInteger(apptId) || apptId <= 0) throw appointmentError("NOT_FOUND");
  if (!AUDIT_ACTIONS[nextStatus]) throw appointmentError("INVALID_STATUS");

  let token = null;
  const row = await transaction(async (tx) => {
    const current = await tx.query(`SELECT * FROM appointments WHERE id = $1 FOR UPDATE`, [apptId]);
    const appt = current.rows[0];
    if (!appt) throw appointmentError("NOT_FOUND");
    if (appt.status === nextStatus) throw appointmentError("ALREADY_HANDLED");
    if (!(TRANSITIONS[appt.status] || []).includes(nextStatus)) throw appointmentError("INVALID_TRANSITION");
    if (nextStatus === "manager_approved" && appt.starts_at && new Date(appt.starts_at) <= now) {
      throw appointmentError("IN_PAST");
    }

    let updated;
    if (nextStatus === "manager_approved") {
      token = newConfirmationToken();
      updated = await tx.query(
        `UPDATE appointments
            SET status = 'manager_approved', status_changed_at = now(), status_changed_by = $2,
                approved_by = $2, approved_at = now(),
                confirmation_token_hash = $3, confirmation_token_expires_at = $4
          WHERE id = $1 AND status = $5 RETURNING *`,
        [apptId, actorUserId, hashToken(token), confirmationExpiry(appt), appt.status]
      );
    } else {
      updated = await tx.query(
        `UPDATE appointments SET status = $2, status_changed_at = now(), status_changed_by = $3
          WHERE id = $1 AND status = $4 RETURNING *`,
        [apptId, nextStatus, actorUserId, appt.status]
      );
    }
    if (!updated.rows.length) throw appointmentError("ALREADY_HANDLED");

    await recordAudit(tx, {
      actorUserId,
      action: AUDIT_ACTIONS[nextStatus],
      targetUserId: appt.user_id || null,
      details: { appointmentId: apptId, from: appt.status, to: nextStatus, date: appt.date, time: appt.time },
    });
    await markAppointmentNotificationsRead(tx, apptId, actorUserId);
    return updated.rows[0];
  });

  await refreshScoresForAppointment(db, row);
  if (nextStatus === "manager_approved") {
    runEmailJob(`appointment ${apptId} approved`, () => sendAppointmentApprovedEmail(apptId, token));
  } else {
    runEmailJob(`appointment ${apptId} ${nextStatus}`, () => sendAppointmentClosedEmail(apptId, nextStatus));
  }
  return getAppointmentForStaff(row.id);
}

function sameHash(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

/**
 * The customer's final "אישור ההזמנה": manager_approved -> confirmed. `authorize(row)` decides who may do it
 * (the one-time email link, or the signed-in owner of the booking). Returns
 * { ok: true, alreadyConfirmed, appointment } or { ok: false, reason: "invalid" | "unavailable" | "expired" }.
 */
async function confirmByCustomer(apptId, authorize, via, now) {
  const result = await transaction(async (tx) => {
    const current = await tx.query(`SELECT * FROM appointments WHERE id = $1 FOR UPDATE`, [apptId]);
    const appt = current.rows[0];
    if (!appt || !authorize(appt)) return { ok: false, reason: "invalid" };
    if (appt.status === "confirmed") return { ok: true, alreadyConfirmed: true, id: appt.id };
    if (appt.status !== "manager_approved") return { ok: false, reason: "unavailable" };
    const linkExpired =
      via === "email_link" && appt.confirmation_token_expires_at && new Date(appt.confirmation_token_expires_at) <= now;
    if (linkExpired || (appt.starts_at && new Date(appt.starts_at) <= now)) return { ok: false, reason: "expired" };

    await tx.query(
      `UPDATE appointments
          SET status = 'confirmed', customer_confirmed_at = now(), status_changed_at = now(), status_changed_by = user_id
        WHERE id = $1 AND status = 'manager_approved'`,
      [apptId]
    );
    await recordAudit(tx, {
      actorUserId: appt.user_id || null,
      action: "appointment_confirmed",
      targetUserId: appt.user_id || null,
      details: { appointmentId: apptId, via, date: appt.date, time: appt.time },
    });
    return { ok: true, alreadyConfirmed: false, id: appt.id, row: appt };
  });
  if (!result.ok) return result;
  if (!result.alreadyConfirmed) await refreshScoresForAppointment(db, { ...result.row, status: "confirmed" });
  return { ok: true, alreadyConfirmed: result.alreadyConfirmed, appointment: await getAppointmentForCustomer(result.id) };
}

/** From the email link: the token is single-use, bound to this appointment, and only its hash is stored. */
export async function confirmAppointmentByToken(id, token, { now = new Date() } = {}) {
  const apptId = Number(id);
  if (!Number.isInteger(apptId) || apptId <= 0 || typeof token !== "string" || !CONFIRMATION_TOKEN_RE.test(token)) {
    return { ok: false, reason: "invalid" };
  }
  const tokenHash = hashToken(token);
  return confirmByCustomer(apptId, (appt) => sameHash(appt.confirmation_token_hash, tokenHash), "email_link", now);
}

/** From her profile while signed in: only the customer the booking belongs to. */
export async function confirmAppointmentForUser(id, userId, { now = new Date() } = {}) {
  const apptId = Number(id);
  if (!Number.isInteger(apptId) || apptId <= 0) return { ok: false, reason: "invalid" };
  return confirmByCustomer(apptId, (appt) => appt.user_id === userId, "profile", now);
}

const RESEND_KIND_BY_STATUS = Object.freeze({
  pending: "requested",
  manager_approved: "approved",
  rejected: "rejected",
  cancelled: "cancelled",
});

/**
 * Staff re-send of the customer email for the booking's current status, only when the last attempt failed.
 * A re-sent approval gets a fresh link (the old one stops working).
 */
export async function resendAppointmentEmail(id) {
  const apptId = Number(id);
  if (!Number.isInteger(apptId) || apptId <= 0) throw appointmentError("NOT_FOUND");
  const appt = await getAppointmentForStaff(apptId);
  if (!appt) throw appointmentError("NOT_FOUND");
  const kind = RESEND_KIND_BY_STATUS[appt.status];
  if (!kind) throw appointmentError("NOTHING_TO_RESEND");
  if (!appt.email) throw appointmentError("NO_EMAIL");
  const last = appt.emailStatus?.[kind];
  if (last && last !== "failed") throw appointmentError("ALREADY_SENT");

  let result;
  if (kind === "approved") {
    const token = newConfirmationToken();
    const updated = await db.query(
      `UPDATE appointments SET confirmation_token_hash = $2, confirmation_token_expires_at = $3
        WHERE id = $1 AND status = 'manager_approved' RETURNING id`,
      [apptId, hashToken(token), confirmationExpiry({ starts_at: appt.startsAt })]
    );
    if (!updated.rows.length) throw appointmentError("ALREADY_HANDLED");
    result = await sendAppointmentApprovedEmail(apptId, token, { retry: true });
  } else if (kind === "requested") {
    result = await sendAppointmentRequestedEmail(apptId, { retry: true });
  } else {
    result = await sendAppointmentClosedEmail(apptId, appt.status, { retry: true });
  }
  if (result?.skipped) throw appointmentError("ALREADY_SENT");
  return { sent: Boolean(result?.ok), appointment: await getAppointmentForStaff(apptId) };
}

/** Fill phone_e164 for bookings made before phones were normalised. Rows that can't be parsed stay NULL. */
export async function backfillAppointmentPhones(executor = db) {
  const { rows } = await executor.query(`SELECT id, phone FROM appointments WHERE phone_e164 IS NULL LIMIT 5000`);
  let updated = 0;
  for (const row of rows) {
    const e164 = toE164OrNull(row.phone);
    if (!e164) continue;
    await executor.query(`UPDATE appointments SET phone_e164 = $1 WHERE id = $2 AND phone_e164 IS NULL`, [e164, row.id]);
    updated += 1;
  }
  return updated;
}
