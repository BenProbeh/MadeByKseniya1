import db from "./db.js";
import { runEmailJob, sendEmail } from "./email/mailer.js";
import {
  appointmentApprovedMessage,
  appointmentCancelledMessage,
  appointmentRejectedMessage,
  appointmentRequestedMessage,
  staffNewRequestMessage,
} from "./email/messages.js";
import { publicUrl } from "./email/template.js";

/**
 * Booking emails. Each one has a fixed idempotency key per appointment (and per staff recipient), so a double
 * click, a retry or two staff acting at once never send the same email twice. Sending happens after the database
 * change is committed and never fails the request that caused it.
 */

export const APPOINTMENT_EMAIL_TYPES = Object.freeze({
  requested: "appointment_requested",
  approved: "appointment_approved",
  rejected: "appointment_rejected",
  cancelled: "appointment_cancelled",
  staff: "appointment_staff_request",
});

export const appointmentEmailKey = (id, kind) => `appt:${id}:${kind}`;

async function loadForEmail(id, executor = db) {
  const { rows } = await executor.query(
    `SELECT a.id, a.user_id, a.client_name, a.date, a.time, a.email, a.package_label, a.price_ils,
            s.name_he AS service_name, s.price_ils AS service_price,
            u.first_name, u.email AS user_email, u.email_verified AS user_email_verified
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       LEFT JOIN users u ON u.id = a.user_id AND u.deleted_at IS NULL
      WHERE a.id = $1`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  const price = row.price_ils ?? row.service_price;
  return {
    id: row.id,
    userId: row.user_id,
    firstName: row.first_name || String(row.client_name || "").split(/\s+/)[0] || "",
    clientName: row.client_name,
    // The account's verified address wins; the address saved on the booking covers removed accounts.
    email: (row.user_email_verified && row.user_email) || row.email || null,
    date: row.date,
    time: row.time,
    serviceLabel: row.package_label || row.service_name,
    priceIls: price == null ? null : Number(price),
  };
}

function sendToCustomer(appt, kind, message, { retry = false } = {}) {
  if (!appt?.email) return Promise.resolve({ ok: false, reason: "no_recipient" });
  return sendEmail({
    type: APPOINTMENT_EMAIL_TYPES[kind],
    to: appt.email,
    userId: appt.userId,
    appointmentId: appt.id,
    idempotencyKey: appointmentEmailKey(appt.id, kind),
    retry,
    ...message,
  });
}

export async function sendAppointmentRequestedEmail(appointmentId, { retry = false } = {}) {
  const appt = await loadForEmail(appointmentId);
  if (!appt) return { ok: false, reason: "not_found" };
  return sendToCustomer(appt, "requested", appointmentRequestedMessage({ firstName: appt.firstName, appointment: appt }), { retry });
}

/** The customer's "request received" email plus one email to each owner/admin who opted in. */
export function queueAppointmentRequestedEmails(appointmentId) {
  return runEmailJob(`appointment ${appointmentId} requested`, async () => {
    const appt = await loadForEmail(appointmentId);
    if (!appt) return;
    await sendToCustomer(appt, "requested", appointmentRequestedMessage({ firstName: appt.firstName, appointment: appt }));

    const staff = await db.query(
      `SELECT id, first_name, email FROM users
        WHERE role IN ('owner', 'admin') AND deleted_at IS NULL AND account_status = 'active'
          AND email_verified AND notify_booking_emails`
    );
    for (const member of staff.rows) {
      await sendEmail({
        type: APPOINTMENT_EMAIL_TYPES.staff,
        to: member.email,
        userId: member.id,
        appointmentId: appt.id,
        idempotencyKey: appointmentEmailKey(appt.id, `staff:${member.id}`),
        ...staffNewRequestMessage({ staffFirstName: member.first_name, appointment: appt }),
      });
    }
  });
}

export const confirmationUrl = (appointmentId, token) =>
  publicUrl(`/appointments/confirm?id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}`);

/** Sends (or, with retry, re-sends) the approval email with the one-time "אישור ההזמנה" link. */
export async function sendAppointmentApprovedEmail(appointmentId, token, { retry = false } = {}) {
  const appt = await loadForEmail(appointmentId);
  if (!appt) return { ok: false, reason: "not_found" };
  return sendToCustomer(appt, "approved", appointmentApprovedMessage({ appointment: appt, confirmUrl: confirmationUrl(appt.id, token) }), { retry });
}

export async function sendAppointmentClosedEmail(appointmentId, status, { retry = false } = {}) {
  const appt = await loadForEmail(appointmentId);
  if (!appt) return { ok: false, reason: "not_found" };
  if (status === "rejected") {
    return sendToCustomer(appt, "rejected", appointmentRejectedMessage({ firstName: appt.firstName }), { retry });
  }
  return sendToCustomer(appt, "cancelled", appointmentCancelledMessage({ firstName: appt.firstName, appointment: appt }), { retry });
}

/** The latest delivery of each customer email kind for these appointments: { [id]: { [kind]: status } }. */
export async function customerEmailStatuses(appointmentIds) {
  if (!appointmentIds.length) return {};
  const kinds = ["requested", "approved", "rejected", "cancelled"];
  const { rows } = await db.query(
    `SELECT appointment_id, type, status FROM email_deliveries
      WHERE appointment_id = ANY($1::int[]) AND type = ANY($2::text[])`,
    [appointmentIds, kinds.map((k) => APPOINTMENT_EMAIL_TYPES[k])]
  );
  const byType = Object.fromEntries(kinds.map((k) => [APPOINTMENT_EMAIL_TYPES[k], k]));
  const out = {};
  for (const row of rows) {
    out[row.appointment_id] ??= {};
    out[row.appointment_id][byType[row.type]] = row.status;
  }
  return out;
}
