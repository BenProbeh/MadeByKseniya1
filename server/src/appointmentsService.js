import db from "./db.js";

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

export function getBusinessHoursForDate(dateStr) {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  return BUSINESS_HOURS[day];
}

export async function getService(serviceId) {
  const id = Number(serviceId);
  if (!Number.isInteger(id)) return undefined;
  const { rows } = await db.query("SELECT * FROM services WHERE id = $1", [id]);
  return rows[0];
}

export async function listServices() {
  const { rows } = await db.query("SELECT * FROM services ORDER BY category, id");
  return rows;
}

export async function getAvailability(dateStr, serviceId) {
  const hours = getBusinessHoursForDate(dateStr);
  if (!hours) return { open: false, slots: [] };

  const service = await getService(serviceId);
  const duration = service ? service.duration_min : 60;

  const openMin = toMinutes(hours.open);
  const closeMin = toMinutes(hours.close);

  const { rows: existing } = await db.query(
    `SELECT a.time, s.duration_min FROM appointments a
     JOIN services s ON s.id = a.service_id
     WHERE a.date = $1 AND a.status != 'cancelled'`,
    [dateStr]
  );

  const busyRanges = existing.map((row) => {
    const start = toMinutes(row.time);
    return [start, start + row.duration_min];
  });

  const now = new Date();
  const isToday = dateStr === now.toISOString().slice(0, 10);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const slots = [];
  // close time is the latest bookable start (e.g. 20:00), not appointment end
  for (let start = openMin; start <= closeMin; start += SLOT_STEP_MIN) {
    if (isToday && start <= nowMin) continue;
    const end = start + duration;
    const overlaps = busyRanges.some(([bStart, bEnd]) => start < bEnd && end > bStart);
    if (!overlaps) slots.push(toHHMM(start));
  }

  return { open: true, slots };
}

export async function isSlotFree(dateStr, time, serviceId) {
  const { open, slots } = await getAvailability(dateStr, serviceId);
  return open && slots.includes(time);
}

export async function createAppointment({ clientName, phone, email, serviceId, date, time, notes }) {
  if (!(await isSlotFree(date, time, serviceId))) {
    throw new Error("SLOT_TAKEN");
  }
  const { rows } = await db.query(
    `INSERT INTO appointments (client_name, phone, email, service_id, date, time, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [clientName, phone, email ?? null, Number(serviceId), date, time, notes ?? null]
  );
  return rows[0];
}

export async function findAppointmentsByPhone(phone) {
  const { rows } = await db.query(
    `SELECT a.*, s.name_he AS service_name, s.price_ils, s.duration_min
     FROM appointments a JOIN services s ON s.id = a.service_id
     WHERE a.phone = $1 AND a.status != 'cancelled'
     ORDER BY a.date, a.time`,
    [phone]
  );
  return rows;
}

export async function updateAppointment(id, { date, time, status }) {
  const apptId = Number(id);
  if (!Number.isInteger(apptId)) throw new Error("NOT_FOUND");
  const { rows } = await db.query("SELECT * FROM appointments WHERE id = $1", [apptId]);
  const appt = rows[0];
  if (!appt) throw new Error("NOT_FOUND");

  const newDate = date ?? appt.date;
  const newTime = time ?? appt.time;

  if ((date || time) && status !== "cancelled") {
    const slotsCheck = await getAvailability(newDate, appt.service_id);
    const isSameSlot = newDate === appt.date && newTime === appt.time;
    if (!isSameSlot && !slotsCheck.slots.includes(newTime)) {
      throw new Error("SLOT_TAKEN");
    }
  }

  const updated = await db.query(
    `UPDATE appointments SET date = $1, time = $2, status = $3 WHERE id = $4 RETURNING *`,
    [newDate, newTime, status ?? appt.status, apptId]
  );
  return updated.rows[0];
}
