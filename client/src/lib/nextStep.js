/**
 * The single most useful next action for a customer, from her appointments and saved measurements.
 * Pure so it can be tested: `today` is a "YYYY-MM-DD" date in Israel time.
 */
export function upcoming(appointments, today) {
  return (appointments || [])
    .filter((a) => a.date >= today && ["pending", "manager_approved", "confirmed"].includes(a.status))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

export function nextStep({ appointments, hasMeasurements, today }) {
  const list = upcoming(appointments, today);
  const toConfirm = list.find((a) => a.status === "manager_approved" && a.canConfirm);
  if (toConfirm) return { kind: "confirm", appointment: toConfirm };
  const confirmed = list.find((a) => a.status === "confirmed");
  const pending = list.find((a) => a.status === "pending");
  if (confirmed && (!pending || `${confirmed.date}${confirmed.time}` <= `${pending.date}${pending.time}`)) {
    return { kind: "visit", appointment: confirmed };
  }
  if (pending) return { kind: "pending", appointment: pending };
  if (!hasMeasurements) return { kind: "measure" };
  return { kind: "book" };
}

/** Today's date in Israel ("YYYY-MM-DD"), matching how appointment dates are stored. */
export function israelToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
