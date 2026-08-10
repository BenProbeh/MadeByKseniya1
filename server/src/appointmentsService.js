import db from "./db.js";

// JS getDay(): 0=Sunday ... 6=Saturday
const BUSINESS_HOURS = {
  0: { open: "09:00", close: "19:00" }, // Sunday
  1: { open: "09:00", close: "19:00" }, // Monday
  2: { open: "09:00", close: "19:00" }, // Tuesday
  3: { open: "09:00", close: "19:00" }, // Wednesday
  4: { open: "09:00", close: "19:00" }, // Thursday
  5: { open: "09:00", close: "14:00" }, // Friday
  6: null, // Saturday - closed
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

export function getService(serviceId) {
  return db.prepare("SELECT * FROM services WHERE id = ?").get(serviceId);
}

export function listServices() {
  return db.prepare("SELECT * FROM services ORDER BY category, id").all();
}

export function getAvailability(dateStr, serviceId) {
  const hours = getBusinessHoursForDate(dateStr);
  if (!hours) return { open: false, slots: [] };

  const service = getService(serviceId);
  const duration = service ? service.duration_min : 60;

  const openMin = toMinutes(hours.open);
  const closeMin = toMinutes(hours.close);

  const existing = db
    .prepare(
      `SELECT a.time, s.duration_min FROM appointments a
       JOIN services s ON s.id = a.service_id
       WHERE a.date = ? AND a.status != 'cancelled'`
    )
    .all(dateStr);

  const busyRanges = existing.map((row) => {
    const start = toMinutes(row.time);
    return [start, start + row.duration_min];
  });

  const now = new Date();
  const isToday = dateStr === now.toISOString().slice(0, 10);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const slots = [];
  for (let start = openMin; start + duration <= closeMin; start += SLOT_STEP_MIN) {
    if (isToday && start <= nowMin) continue;
    const end = start + duration;
    const overlaps = busyRanges.some(([bStart, bEnd]) => start < bEnd && end > bStart);
    if (!overlaps) slots.push(toHHMM(start));
  }

  return { open: true, slots };
}

export function isSlotFree(dateStr, time, serviceId) {
  const { open, slots } = getAvailability(dateStr, serviceId);
  return open && slots.includes(time);
}

export function createAppointment({ clientName, phone, email, serviceId, date, time, notes }) {
  if (!isSlotFree(date, time, serviceId)) {
    throw new Error("SLOT_TAKEN");
  }
  const result = db
    .prepare(
      `INSERT INTO appointments (client_name, phone, email, service_id, date, time, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(clientName, phone, email ?? null, serviceId, date, time, notes ?? null);

  return db.prepare("SELECT * FROM appointments WHERE id = ?").get(result.lastInsertRowid);
}

export function findAppointmentsByPhone(phone) {
  return db
    .prepare(
      `SELECT a.*, s.name_he AS service_name, s.price_ils, s.duration_min
       FROM appointments a JOIN services s ON s.id = a.service_id
       WHERE a.phone = ? AND a.status != 'cancelled'
       ORDER BY a.date, a.time`
    )
    .all(phone);
}

export function updateAppointment(id, { date, time, status }) {
  const appt = db.prepare("SELECT * FROM appointments WHERE id = ?").get(id);
  if (!appt) throw new Error("NOT_FOUND");

  const newDate = date ?? appt.date;
  const newTime = time ?? appt.time;

  if ((date || time) && status !== "cancelled") {
    const slotsCheck = getAvailability(newDate, appt.service_id);
    const isSameSlot = newDate === appt.date && newTime === appt.time;
    if (!isSameSlot && !slotsCheck.slots.includes(newTime)) {
      throw new Error("SLOT_TAKEN");
    }
  }

  db.prepare(
    `UPDATE appointments SET date = ?, time = ?, status = ? WHERE id = ?`
  ).run(newDate, newTime, status ?? appt.status, id);

  return db.prepare("SELECT * FROM appointments WHERE id = ?").get(id);
}
