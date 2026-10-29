import { CalendarCheck2, CircleCheck, CircleDashed, CircleSlash, CircleX } from "lucide-react";

export const CUSTOMER_STATUS_TEXT = {
  pending: "ממתין לאישור",
  manager_approved: "אושר — נשאר לאשר את ההזמנה",
  confirmed: "התור אושר",
  rejected: "הבקשה לא אושרה",
  cancelled: "התור בוטל",
};

export const STAFF_STATUS_TEXT = {
  pending: "ממתין לאישור",
  manager_approved: "אושר · ממתין ללקוחה",
  confirmed: "מאושר סופית",
  rejected: "נדחה",
  cancelled: "בוטל",
};

// Calendar meaning is kept: pending reads neutral grey, a held slot reads as taken.
const STATUS_STYLE = {
  pending: "bg-white/[0.08] text-white/75",
  manager_approved: "bg-violet-400/15 text-violet-100",
  confirmed: "bg-emerald-400/10 text-emerald-300",
  rejected: "bg-red-500/10 text-red-300",
  cancelled: "bg-white/[0.05] text-white/50",
};

const STATUS_ICON = {
  pending: CircleDashed,
  manager_approved: CalendarCheck2,
  confirmed: CircleCheck,
  rejected: CircleX,
  cancelled: CircleSlash,
};

export default function AppointmentStatusBadge({ status, staff = false, className = "" }) {
  const text = (staff ? STAFF_STATUS_TEXT : CUSTOMER_STATUS_TEXT)[status] || status;
  const Icon = STATUS_ICON[status] || CircleDashed;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-foot font-medium whitespace-nowrap ${
        STATUS_STYLE[status] || STATUS_STYLE.cancelled
      } ${className}`}
    >
      <Icon size={14} strokeWidth={2.2} aria-hidden="true" />
      {text}
    </span>
  );
}
