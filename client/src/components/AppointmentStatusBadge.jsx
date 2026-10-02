export const CUSTOMER_STATUS_TEXT = {
  pending: "ממתין לאישור",
  confirmed: "התור אושר",
  rejected: "הבקשה לא אושרה",
  cancelled: "התור בוטל",
};

export const STAFF_STATUS_TEXT = {
  pending: "ממתין לאישור",
  confirmed: "מאושר",
  rejected: "נדחה",
  cancelled: "בוטל",
};

const STATUS_STYLE = {
  pending: "border-white/25 bg-white/[0.07] text-white/75",
  confirmed: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  rejected: "border-red-400/40 bg-red-500/10 text-red-300",
  cancelled: "border-white/15 text-white/50",
};

const STATUS_ICON = { pending: "⏳", confirmed: "✓", rejected: "✕", cancelled: "—" };

export default function AppointmentStatusBadge({ status, staff = false, className = "" }) {
  const text = (staff ? STAFF_STATUS_TEXT : CUSTOMER_STATUS_TEXT)[status] || status;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap ${
        STATUS_STYLE[status] || STATUS_STYLE.cancelled
      } ${className}`}
    >
      <span aria-hidden="true">{STATUS_ICON[status] || "•"}</span>
      {text}
    </span>
  );
}
