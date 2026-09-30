export function formatMoney(agorot, currency = "ILS") {
  const ils = (Number(agorot) || 0) / 100;
  try {
    return new Intl.NumberFormat("he-IL", { style: "currency", currency }).format(ils);
  } catch {
    return `${ils.toFixed(2)} ₪`;
  }
}

export function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatDateTime(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jerusalem",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** "YYYY-MM-DD" calendar date (already in Israel time) → Hebrew weekday + date. */
export function formatCalendarDay(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ""))) return "";
  try {
    return new Intl.DateTimeFormat("he-IL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${ymd}T12:00:00Z`));
  } catch {
    return ymd;
  }
}
