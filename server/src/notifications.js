import db from "./db.js";

export const NOTIFICATION_TYPES = Object.freeze({
  DUPLICATE_PHONE: "duplicate_phone_signup",
  APPOINTMENT_REQUEST: "appointment_request",
});

export const DUPLICATE_PHONE_REASON = "ניסיון הרשמה עם מספר טלפון שכבר קיים";

/** Repeated attempts with the same phone within this window update one notification instead of adding more. */
const DEDUPE_WINDOW = "1 hour";
/** Hard cap on new notifications of one type per hour, so a flood of sign-ups can't bury real events. */
const MAX_NEW_PER_HOUR = 30;

const clip = (value, max = 60) => String(value ?? "").trim().slice(0, max);

/**
 * Record a sign-up attempt that used a phone already on another account.
 * Stores only what was typed into non-secret fields (never passwords, headers or the raw body).
 */
export async function notifyDuplicatePhoneSignup(
  executor,
  { firstName, lastName, username, phoneE164, phoneDisplay, existingUserId }
) {
  const dedupeKey = `${NOTIFICATION_TYPES.DUPLICATE_PHONE}:${phoneE164}`;
  const attemptedAt = new Date().toISOString();

  const recent = await executor.query(
    `SELECT id FROM admin_notifications
      WHERE dedupe_key = $1 AND status = 'new' AND created_at > now() - interval '${DEDUPE_WINDOW}'
      ORDER BY created_at DESC LIMIT 1`,
    [dedupeKey]
  );
  if (recent.rows.length) {
    await executor.query(
      `UPDATE admin_notifications
          SET metadata = metadata
                || jsonb_build_object('attempts', COALESCE((metadata->>'attempts')::int, 1) + 1, 'lastAttemptAt', $2::text),
              updated_at = now()
        WHERE id = $1`,
      [recent.rows[0].id, attemptedAt]
    );
    return { status: "merged", id: recent.rows[0].id };
  }

  const volume = await executor.query(
    `SELECT count(*)::int AS n FROM admin_notifications WHERE type = $1 AND created_at > now() - interval '1 hour'`,
    [NOTIFICATION_TYPES.DUPLICATE_PHONE]
  );
  if (volume.rows[0].n >= MAX_NEW_PER_HOUR) return { status: "throttled" };

  const metadata = {
    reason: DUPLICATE_PHONE_REASON,
    firstName: clip(firstName),
    lastName: clip(lastName),
    username: clip(username, 40),
    phoneE164,
    phoneDisplay,
    attemptedAt,
    lastAttemptAt: attemptedAt,
    attempts: 1,
  };
  const { rows } = await executor.query(
    `INSERT INTO admin_notifications (type, related_user_id, dedupe_key, metadata)
     VALUES ($1, $2, $3, $4::jsonb) RETURNING id`,
    [NOTIFICATION_TYPES.DUPLICATE_PHONE, existingUserId || null, dedupeKey, JSON.stringify(metadata)]
  );
  return { status: "created", id: rows[0].id };
}

const appointmentDedupeKey = (appointmentId) => `${NOTIFICATION_TYPES.APPOINTMENT_REQUEST}:${appointmentId}`;

/** A new booking request waiting for a decision. Only what staff need to handle it — no passwords or tokens. */
export async function notifyAppointmentRequest(executor, request) {
  const metadata = {
    appointmentId: request.appointmentId,
    clientName: clip(request.clientName, 80),
    firstName: clip(request.firstName),
    lastName: clip(request.lastName),
    phoneDisplay: request.phoneDisplay || null,
    phoneE164: request.phoneE164 || null,
    date: request.date,
    time: request.time,
    serviceLabel: clip(request.serviceLabel, 80),
    priceIls: request.priceIls == null ? null : Number(request.priceIls),
    notes: clip(request.notes, 300),
    requestedAt: request.requestedAt instanceof Date ? request.requestedAt.toISOString() : request.requestedAt,
  };
  const { rows } = await executor.query(
    `INSERT INTO admin_notifications (type, related_user_id, dedupe_key, metadata)
     VALUES ($1, $2, $3, $4::jsonb) RETURNING id`,
    [NOTIFICATION_TYPES.APPOINTMENT_REQUEST, request.userId || null, appointmentDedupeKey(request.appointmentId), JSON.stringify(metadata)]
  );
  return { status: "created", id: rows[0].id };
}

/** Once a request is confirmed, rejected or cancelled its notification no longer needs attention. */
export async function markAppointmentNotificationsRead(executor, appointmentId, userId) {
  await executor.query(
    `UPDATE admin_notifications
        SET status = 'read', read_at = COALESCE(read_at, now()), read_by = COALESCE(read_by, $2), updated_at = now()
      WHERE dedupe_key = $1 AND status = 'new'`,
    [appointmentDedupeKey(appointmentId), userId]
  );
}

function mapAppointmentMetadata(m, row) {
  return {
    appointmentId: Number(m.appointmentId) || null,
    clientName: m.clientName || "",
    firstName: m.firstName || "",
    lastName: m.lastName || "",
    phoneDisplay: m.phoneDisplay || null,
    phoneE164: m.phoneE164 || null,
    date: m.date || "",
    time: m.time || "",
    serviceLabel: m.serviceLabel || "",
    priceIls: m.priceIls == null ? null : Number(m.priceIls),
    notes: m.notes || "",
    requestedAt: m.requestedAt || row.created_at,
  };
}

function mapNotification(row) {
  const m = row.metadata || {};
  if (row.type === NOTIFICATION_TYPES.APPOINTMENT_REQUEST) {
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      readAt: row.read_at || null,
      metadata: mapAppointmentMetadata(m, row),
      relatedUser: row.related_user_id
        ? {
            id: row.related_user_id,
            firstName: row.ru_first_name,
            lastName: row.ru_last_name,
            username: row.ru_username,
            removed: Boolean(row.ru_deleted_at),
          }
        : null,
    };
  }
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    readAt: row.read_at || null,
    metadata: {
      reason: m.reason || null,
      firstName: m.firstName || "",
      lastName: m.lastName || "",
      username: m.username || "",
      phoneE164: m.phoneE164 || null,
      phoneDisplay: m.phoneDisplay || null,
      attemptedAt: m.attemptedAt || row.created_at,
      lastAttemptAt: m.lastAttemptAt || m.attemptedAt || row.created_at,
      attempts: Number(m.attempts) || 1,
    },
    relatedUser: row.related_user_id
      ? {
          id: row.related_user_id,
          firstName: row.ru_first_name,
          lastName: row.ru_last_name,
          username: row.ru_username,
          removed: Boolean(row.ru_deleted_at),
        }
      : null,
  };
}

export async function listNotifications({ status = "", limit = 50 } = {}, executor = db) {
  const params = [];
  let where = "";
  if (status) {
    params.push(status);
    where = `WHERE n.status = $1`;
  }
  params.push(limit);
  const { rows } = await executor.query(
    `SELECT n.*, u.first_name AS ru_first_name, u.last_name AS ru_last_name, u.username AS ru_username,
            u.deleted_at AS ru_deleted_at
       FROM admin_notifications n
       LEFT JOIN users u ON u.id = n.related_user_id
       ${where}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT $${params.length}`,
    params
  );
  return rows.map(mapNotification);
}

export async function countUnreadNotifications(executor = db) {
  const { rows } = await executor.query(`SELECT count(*)::int AS n FROM admin_notifications WHERE status = 'new'`);
  return rows[0].n;
}

/** Returns the updated notification, or null when it does not exist. */
export async function markNotificationRead(id, userId, executor = db) {
  const { rows } = await executor.query(
    `UPDATE admin_notifications
        SET status = 'read', read_at = COALESCE(read_at, now()), read_by = COALESCE(read_by, $2), updated_at = now()
      WHERE id = $1
      RETURNING id`,
    [id, userId]
  );
  if (!rows.length) return null;
  const [item] = await listNotificationsByIds([id], executor);
  return item;
}

async function listNotificationsByIds(ids, executor) {
  const { rows } = await executor.query(
    `SELECT n.*, u.first_name AS ru_first_name, u.last_name AS ru_last_name, u.username AS ru_username,
            u.deleted_at AS ru_deleted_at
       FROM admin_notifications n
       LEFT JOIN users u ON u.id = n.related_user_id
      WHERE n.id = ANY($1::int[])`,
    [ids]
  );
  return rows.map(mapNotification);
}
